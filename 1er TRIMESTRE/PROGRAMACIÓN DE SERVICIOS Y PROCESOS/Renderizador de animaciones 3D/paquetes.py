"""Paquetes portables de escena y caché; transferencias con memoria acotada."""

import base64
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tempfile
import zipfile


CHUNK_SIZE = 1024 * 1024
MAX_PACKAGE = 512 * 1024 * 1024
MAX_UNPACKED = 2 * 1024 * 1024 * 1024
MAX_FILES = 20000


def file_digest(path):
    checksum = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(CHUNK_SIZE), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def inspect_package(path):
    """Valida nombres, tamaños y manifiesto antes de extraer cualquier archivo."""
    try:
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            if not 1 <= len(entries) <= MAX_FILES:
                raise ValueError("El paquete supera el límite de archivos")
            total, names = 0, set()
            reserved = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)),
                        *(f"LPT{i}" for i in range(1, 10))}
            for entry in entries:
                name = entry.filename.rstrip("/")
                parts = name.split("/")
                if (not name or "\\" in name or ":" in name
                        or PurePosixPath(name).is_absolute()
                        or any(part in ("", ".", "..") or part.endswith((" ", "."))
                               or part.split(".")[0].upper() in reserved for part in parts)
                        or not (name in ("scene.blend", "manifest.json", "cache") or name.startswith("cache/"))
                        or stat.S_ISLNK(entry.external_attr >> 16)
                        or entry.flag_bits & 1):
                    raise ValueError(f"Ruta o entrada no permitida en el paquete: {entry.filename}")
                if name.casefold() in names:
                    raise ValueError("El paquete contiene nombres de archivo duplicados")
                names.add(name.casefold())
                total += entry.file_size
                if entry.file_size > 128 * 1024 * 1024 or total > MAX_UNPACKED:
                    raise ValueError("El paquete supera el límite de tamaño descomprimido")
            if not {"scene.blend", "manifest.json"} <= names:
                raise ValueError("Faltan scene.blend o manifest.json")
            if archive.getinfo("scene.blend").file_size > 32 * 1024 * 1024:
                raise ValueError("La escena del paquete supera 32 MiB")
            if archive.getinfo("manifest.json").file_size > 65536:
                raise ValueError("Manifiesto demasiado grande")
            manifest = json.loads(archive.read("manifest.json"))
            if (not isinstance(manifest, dict) or type(manifest.get("version")) is not int or manifest["version"] != 1
                    or manifest.get("scene") != "scene.blend" or manifest.get("cache") != "cache"):
                raise ValueError("Manifiesto de paquete incompatible")
            for key, low, high in (("start", 1, 1000000), ("end", 1, 1000000), ("fps", 1, 60)):
                if type(manifest.get(key)) is not int or not low <= manifest[key] <= high:
                    raise ValueError(f"Valor de manifiesto inválido: {key}")
            if not 1 <= manifest["end"] - manifest["start"] + 1 <= 1000:
                raise ValueError("Intervalo de fotogramas inválido en el paquete")
            if manifest.get("kind") == "liquid" and not any(name.startswith("cache/mesh/") for name in names):
                raise ValueError("El paquete de líquido no contiene mallas horneadas")
            return manifest
    except (zipfile.BadZipFile, KeyError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError("Paquete ZIP o manifiesto dañado") from exc


def validate_package_render(path, spec):
    manifest = inspect_package(path)
    if not manifest["start"] <= spec["start"] <= spec["end"] <= manifest["end"]:
        raise ValueError("El intervalo solicitado queda fuera de la simulación horneada")
    if spec["fps"] != manifest["fps"]:
        raise ValueError(f"La simulación está horneada a {manifest['fps']} FPS; utiliza ese --fps")
    return manifest


def create_package(folder, target, render_only=False):
    temporary = target.with_suffix(".tmp.zip")
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
            for name in ("scene.blend", "manifest.json"):
                archive.write(folder / name, name)
            for path in sorted((folder / "cache").rglob("*")):
                if render_only and path.relative_to(folder).parts[1] not in ("mesh", "config"):
                    continue
                if path.is_symlink():
                    raise ValueError("La caché no debe contener enlaces simbólicos")
                if path.is_file():
                    archive.write(path, path.relative_to(folder).as_posix())
        if temporary.stat().st_size > MAX_PACKAGE:
            raise ValueError("El paquete supera 512 MiB; reduce resolución o duración")
        inspect_package(temporary)
        temporary.replace(target)
        return target
    finally:
        temporary.unlink(missing_ok=True)


def extract_package(path, root):
    manifest = inspect_package(path)
    checksum = file_digest(path)
    root.mkdir(parents=True, exist_ok=True)
    root = root.resolve()
    destination = root / checksum

    def complete():
        marker = destination / ".complete"
        return marker.is_file() and marker.read_text(encoding="ascii") == checksum

    if complete():
        return destination, manifest
    if destination.exists():
        raise ValueError(f"La caché extraída está incompleta: {destination}")
    # El directorio temporal y el destino se verifican dentro de la caché indicada.
    with tempfile.TemporaryDirectory(prefix="extract-", dir=root) as directory:
        staging = Path(directory).resolve()
        if not staging.is_relative_to(root) or not destination.resolve().is_relative_to(root):
            raise ValueError("Destino de extracción fuera de la caché")
        with zipfile.ZipFile(path) as archive:
            for entry in archive.infolist():
                target = staging / entry.filename
                if not target.resolve().is_relative_to(staging):
                    raise ValueError("Ruta de extracción fuera del paquete")
                if entry.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with archive.open(entry) as source, target.open("wb") as output:
                        shutil.copyfileobj(source, output, CHUNK_SIZE)
        (staging / ".complete").write_text(checksum, encoding="ascii")
        try:
            staging.rename(destination)
        except FileExistsError:
            if not complete():
                raise
    return destination, manifest


async def send_package(ws, path, checksum, send):
    await send(ws, {"type": "asset_begin", "sha256": checksum, "size": path.stat().st_size})
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(CHUNK_SIZE), b""):
            await send(ws, {"type": "asset_chunk", "data": base64.b64encode(chunk).decode("ascii")})
    await send(ws, {"type": "asset_end"})


class PackageReceiver:
    def __init__(self, root):
        self.root = root
        self.stream = None
        self.path = None
        self.size = self.received = 0
        self.checksum = None
        self.hasher = None

    def begin(self, payload, expected=None):
        if self.stream is not None:
            raise ValueError("Ya hay un paquete en curso")
        checksum, size = payload.get("sha256"), payload.get("size")
        if (not isinstance(checksum, str) or not re.fullmatch(r"[0-9a-f]{64}", checksum)
                or type(size) is not int or not 1 <= size <= MAX_PACKAGE
                or expected is not None and checksum != expected):
            raise ValueError("Cabecera de paquete inválida")
        self.root.mkdir(parents=True, exist_ok=True)
        self.stream = tempfile.NamedTemporaryFile(dir=self.root, suffix=".part", delete=False)
        self.path = Path(self.stream.name)
        self.size, self.received, self.checksum = size, 0, checksum
        self.hasher = hashlib.sha256()

    def chunk(self, payload):
        data = payload.get("data")
        if self.stream is None or not isinstance(data, str) or len(data) > 4 * ((CHUNK_SIZE + 2) // 3):
            raise ValueError("Fragmento de paquete inválido")
        try:
            raw = base64.b64decode(data, validate=True)
        except ValueError as exc:
            raise ValueError("Fragmento Base64 dañado") from exc
        if not raw or len(raw) > CHUNK_SIZE or self.received + len(raw) > self.size:
            raise ValueError("Fragmento fuera del tamaño anunciado")
        self.stream.write(raw)
        self.hasher.update(raw)
        self.received += len(raw)

    def finish(self):
        if self.stream is None:
            raise ValueError("No hay transferencia de paquete en curso")
        self.stream.close()
        self.stream = None
        try:
            if self.received != self.size or self.hasher.hexdigest() != self.checksum:
                raise ValueError("Paquete incompleto o huella SHA256 incorrecta")
            inspect_package(self.path)
            destination = self.root / (self.checksum + ".zip")
            self.path.replace(destination)
            return destination
        finally:
            self.abort()

    def abort(self):
        if self.stream is not None:
            self.stream.close()
            self.stream = None
        if self.path is not None:
            self.path.unlink(missing_ok=True)
            self.path = None
