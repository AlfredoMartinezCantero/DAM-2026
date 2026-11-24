"""Validación y utilidades comunes del renderizador distribuido."""

import base64
import hashlib
from io import BytesIO
import json
from pathlib import Path
import re
import tempfile

from PIL import Image


BASE = Path(__file__).resolve().parent
MAX_SCENE = 32 * 1024 * 1024
MAX_PNG = 16 * 1024 * 1024
MAX_MESSAGE = 48 * 1024 * 1024
VERSION = 1


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def validate_name(name):
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", name):
        raise ValueError("El nombre admite letras ASCII, números, guiones y guiones bajos (1 a 64)")
    return name


def validate_spec(spec):
    fields = {"version", "source", "scene_sha", "start", "end", "fps", "width", "height", "samples"}
    if not isinstance(spec, dict) or set(spec) != fields:
        raise ValueError("Especificación de render incompleta o desconocida")
    limits = {"version": (VERSION, VERSION), "start": (1, 1000000),
              "end": (1, 1000000), "fps": (1, 60), "width": (64, 3840),
              "height": (64, 2160), "samples": (1, 512)}
    for key, (low, high) in limits.items():
        if type(spec[key]) is not int or not low <= spec[key] <= high:
            raise ValueError(f"{key} debe estar entre {low} y {high}")
    if not 1 <= spec["end"] - spec["start"] + 1 <= 1000:
        raise ValueError("Una animación admite de 1 a 1000 fotogramas consecutivos")
    if spec["source"] not in ("demo", "blend"):
        raise ValueError("Origen de escena desconocido")
    if not isinstance(spec["scene_sha"], str):
        raise ValueError("Huella de escena inválida")
    if spec["source"] == "blend":
        if not re.fullmatch(r"[0-9a-f]{64}", spec["scene_sha"]):
            raise ValueError("Falta la huella SHA256 de la escena")
    elif spec["scene_sha"]:
        raise ValueError("La demostración no necesita archivo .blend")
    return spec


def job_id(run_id, spec, frame):
    return digest(f"{run_id}|{canonical(spec)}|{frame}".encode())


def encode(data):
    return base64.b64encode(data).decode("ascii")


def decode(data, limit):
    if not isinstance(data, str) or len(data) > 4 * ((limit + 2) // 3):
        raise ValueError("Archivo ausente o demasiado grande")
    try:
        raw = base64.b64decode(data, validate=True)
    except (ValueError, TypeError) as exc:
        raise ValueError("Archivo Base64 inválido") from exc
    if not raw or len(raw) > limit:
        raise ValueError("Tamaño de archivo inválido")
    return raw


def validate_png(data, spec, expected_sha=None):
    if not 0 < len(data) <= MAX_PNG or not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("El fotograma debe ser un PNG de hasta 16 MiB")
    checksum = digest(data)
    if expected_sha and checksum != expected_sha:
        raise ValueError("La huella SHA256 del fotograma no coincide")
    try:
        with Image.open(BytesIO(data)) as image:
            if image.format != "PNG" or image.size != (spec["width"], spec["height"]):
                raise ValueError("La resolución recibida no coincide con el experimento")
            image.verify()
    except (OSError, SyntaxError) as exc:
        raise ValueError("El fotograma PNG está dañado") from exc
    return checksum


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, suffix=".part", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(data)
        temporary.replace(path)
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)


def frame_path(folder, frame):
    return folder / f"frame_{frame:06d}.png"


async def send(ws, message):
    await ws.send(json.dumps(message, ensure_ascii=False, allow_nan=False))


def message(raw):
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("El mensaje debe ser un objeto JSON")
    return value
