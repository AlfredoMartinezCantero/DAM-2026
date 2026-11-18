#!/usr/bin/env python3
"""Maestro: distribuye fotogramas y construye una animación GIF o MP4."""

import argparse
import asyncio
import csv
import json
import math
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import time

from PIL import Image
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed, InvalidHandshake

from protocolo import (BASE, MAX_MESSAGE, MAX_PNG, MAX_SCENE, VERSION, atomic_write,
                       canonical, decode, digest, encode, frame_path, job_id, message,
                       send, validate_name, validate_png, validate_spec)
from paquetes import MAX_PACKAGE, file_digest, send_package, validate_package_render


def build_spec(args):
    checksum = ""
    package = getattr(args, "package", None)
    if package:
        if not package.is_file() or not 0 < package.stat().st_size <= MAX_PACKAGE:
            raise ValueError("--package debe indicar un paquete ZIP de hasta 512 MiB")
        checksum = file_digest(package)
    elif args.scene:
        if not args.scene.is_file() or args.scene.suffix.lower() != ".blend":
            raise ValueError("--scene debe indicar un archivo .blend existente")
        if not 0 < args.scene.stat().st_size <= MAX_SCENE:
            raise ValueError("La escena .blend debe ocupar entre 1 byte y 32 MiB")
        checksum = digest(args.scene.read_bytes())
    spec = validate_spec({"version": VERSION, "source": "package" if package else "blend" if args.scene else "demo",
                         "scene_sha": checksum, "start": args.start, "end": args.end,
                         "fps": args.fps, "width": args.width, "height": args.height,
                         "samples": args.samples})
    if package:
        validate_package_render(package, spec)
    return spec


def open_database(path, run_id, spec):
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    try:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA busy_timeout=5000")
        db.execute("CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,spec TEXT NOT NULL)")
        db.execute("""CREATE TABLE IF NOT EXISTS results (
            id TEXT PRIMARY KEY,run_id TEXT NOT NULL,frame INTEGER NOT NULL,
            status TEXT NOT NULL,result TEXT,error TEXT,worker TEXT,
            UNIQUE(run_id,frame)
        )""")
        old = db.execute("SELECT spec FROM runs WHERE id=?", (run_id,)).fetchone()
        if old and old[0] != canonical(spec):
            raise ValueError("Ese --run-id ya utiliza otros parámetros; elige otro nombre")
        with db:
            db.execute("INSERT OR IGNORE INTO runs VALUES (?,?)", (run_id, canonical(spec)))
        return db
    except BaseException:
        db.close()
        raise


def cached_frames(db, run_id, folder, spec):
    terminal = set()
    for row in db.execute("SELECT * FROM results WHERE run_id=?", (run_id,)):
        if row["status"] == "failed":
            terminal.add(row["frame"])
        else:
            try:
                data = frame_path(folder, row["frame"]).read_bytes()
                validate_png(data, spec, json.loads(row["result"])["sha256"])
                terminal.add(row["frame"])
            except (OSError, ValueError):
                pass  # Recuperar el PNG del broker antes de considerar el trabajo terminado.
    return terminal


def save_result(db, run_id, spec, folder, payload):
    success = payload["type"] == "result"
    metadata = None
    if success:
        data = decode(payload.get("image"), MAX_PNG)
        checksum = validate_png(data, spec, payload.get("sha256"))
        render_s = payload.get("render_s")
        if type(render_s) not in (int, float) or not math.isfinite(render_s) or render_s < 0:
            raise ValueError("Tiempo de render inválido")
        metadata = {"sha256": checksum, "render_s": render_s}
        atomic_write(frame_path(folder, payload["frame"]), data)
    with db:
        db.execute("""INSERT INTO results VALUES (?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET status=excluded.status,result=excluded.result,
            error=excluded.error,worker=excluded.worker""",
                   (payload["id"], run_id, payload["frame"], "done" if success else "failed",
                    canonical(metadata) if metadata else None,
                    payload.get("error"), payload.get("worker")))


async def distribute(args, db, run_id, spec, folder):
    frames = list(range(spec["start"], spec["end"] + 1))
    terminal = cached_frames(db, run_id, folder, spec)
    last_progress = time.monotonic()
    print(f"Animación: {run_id} | Fotogramas: {len(frames)} | Guardados: {len(terminal)}\n"
          f"Resolución: {spec['width']}×{spec['height']} | {spec['fps']} FPS | "
          f"{spec['samples']} muestras", flush=True)
    while len(terminal) < len(frames):
        if time.monotonic() - last_progress > args.timeout:
            raise RuntimeError("Tiempo sin resultados agotado; comprueba los trabajadores "
                               "y repite el comando para continuar")
        try:
            async with connect(args.server, proxy=None, max_size=MAX_MESSAGE,
                               open_timeout=15, ping_timeout=60, close_timeout=5) as ws:
                await send(ws, {"role": "master", "token": args.token, "run_id": run_id, "spec": spec})
                hello = message(await asyncio.wait_for(ws.recv(), 15))
                if hello.get("type") != "registered":
                    raise ValueError(hello.get("error", "Registro rechazado"))
                if hello.get("needs_scene"):
                    if spec["source"] == "package":
                        if file_digest(args.package) != spec["scene_sha"]:
                            raise ValueError("El paquete cambió desde el inicio")
                        await send_package(ws, args.package, spec["scene_sha"], send)
                        print("Escena y caché enviadas al servidor", flush=True)
                    else:
                        data = args.scene.read_bytes()
                        if digest(data) != spec["scene_sha"]:
                            raise ValueError("La escena cambió desde el inicio; crea otra ejecución")
                        await send(ws, {"type": "scene", "data": encode(data)})
                        print("Escena enviada al servidor", flush=True)
                submitted = set()
                pending = iter(frames)
                next_frame = next(pending, None)
                while len(terminal) < len(frames):
                    if time.monotonic() - last_progress > args.timeout:
                        raise RuntimeError("No llegan resultados; repite el mismo comando para reanudar")
                    while next_frame is not None and len(submitted) < args.window:
                        batch = []
                        while (next_frame is not None and len(batch) < 10
                               and len(submitted) + len(batch) < args.window):
                            if next_frame not in terminal:
                                batch.append(next_frame)
                            next_frame = next(pending, None)
                        if batch:
                            await send(ws, {"type": "enqueue", "frames": batch})
                            submitted.update(batch)
                    try:
                        payload = message(await asyncio.wait_for(ws.recv(), 10))
                    except TimeoutError:
                        await send(ws, {"type": "replay_results"})
                        continue
                    kind, frame = payload.get("type"), payload.get("frame")
                    if kind == "error":
                        raise ValueError(payload.get("error", "Petición rechazada"))
                    if kind not in ("result", "failed"):
                        continue
                    if (payload.get("run_id") != run_id or type(frame) is not int
                            or not spec["start"] <= frame <= spec["end"]
                            or payload.get("id") != job_id(run_id, spec, frame)):
                        continue
                    if frame not in terminal:
                        try:
                            save_result(db, run_id, spec, folder, payload)
                        except OSError as exc:
                            raise RuntimeError(f"No se pudo guardar el fotograma {frame}: {exc}") from exc
                        terminal.add(frame)
                        last_progress = time.monotonic()
                        print(f"Resueltos: {len(terminal)}/{len(frames)} | Fotograma {frame} | "
                              f"{kind} | {payload.get('worker') or '-'}", flush=True)
                    submitted.discard(frame)
                    await send(ws, {"type": "ack", "id": payload["id"]})
        except (OSError, ConnectionClosed, InvalidHandshake, TimeoutError) as exc:
            if isinstance(exc, ConnectionClosed) and exc.rcvd and exc.rcvd.code == 1008:
                raise ValueError(f"Registro rechazado: {exc}") from exc
            print(f"Conexión interrumpida ({exc}). Reintento en 3 s.", flush=True)
            await asyncio.sleep(3)


def assemble(args, spec, folder):
    if args.format == "frames":
        return None
    paths = [frame_path(folder / "fotogramas", frame)
             for frame in range(spec["start"], spec["end"] + 1)]
    target = folder / ("animacion." + args.format)
    temporary = folder / ("animacion.tmp." + args.format)
    try:
        if args.format == "gif":
            images = []
            for path in paths:
                with Image.open(path) as image:
                    rgb = image.convert("RGB")
                    images.append(rgb.quantize(colors=256, dither=Image.Dither.FLOYDSTEINBERG))
            # GIF representa tiempos en centésimas; alternar duraciones aproxima los FPS.
            durations = [10 * (round((i + 1) * 100 / spec["fps"]) - round(i * 100 / spec["fps"]))
                         for i in range(len(images))]
            images[0].save(temporary, format="GIF", save_all=True, append_images=images[1:],
                           duration=durations, loop=0, disposal=2, optimize=False)
        else:
            command = [str(args.ffmpeg), "-y", "-framerate", str(spec["fps"]),
                       "-start_number", str(spec["start"]), "-i",
                       str(folder / "fotogramas" / "frame_%06d.png"),
                       "-frames:v", str(len(paths)), "-c:v", "libx264", "-pix_fmt", "yuv420p",
                       "-movflags", "+faststart", str(temporary)]
            with (folder / "ffmpeg.log").open("wb") as log:
                result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=1800,
                                        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            if result.returncode or not temporary.is_file():
                raise RuntimeError("FFmpeg no pudo crear el MP4; consulta ffmpeg.log")
        temporary.replace(target)
        return str(target)
    finally:
        temporary.unlink(missing_ok=True)


def export_report(db, run_id, spec, folder, wall_s):
    rows = db.execute("SELECT * FROM results WHERE run_id=? ORDER BY frame", (run_id,)).fetchall()
    details, workers = [], {}
    for row in rows:
        result = json.loads(row["result"]) if row["result"] else {}
        details.append({"frame": row["frame"], "status": row["status"], "worker": row["worker"],
                        "render_s": result.get("render_s"), "sha256": result.get("sha256"),
                        "error": row["error"]})
        if row["status"] == "done":
            workers[row["worker"]] = workers.get(row["worker"], 0) + 1
    with (folder / "fotogramas.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(details[0]))
        writer.writeheader()
        writer.writerows(details)
    report = {"run_id": run_id, "spec": spec,
              "completed": sum(row["status"] == "done" for row in rows),
              "failed": sum(row["status"] == "failed" for row in rows),
              "duration_s": round((spec["end"] - spec["start"] + 1) / spec["fps"], 3),
              "invocation_wall_s": round(wall_s, 4),
              "render_s_sum": round(sum(row["render_s"] or 0 for row in details), 4),
              "workers": workers, "animation": None}
    (folder / "resumen.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="ws://127.0.0.1:8775")
    parser.add_argument("--token", default=os.environ.get("RENDER_TOKEN", ""))
    parser.add_argument("--run-id")
    sources = parser.add_mutually_exclusive_group()
    sources.add_argument("--scene", type=Path, help="Escena .blend; por defecto, demo orbital")
    sources.add_argument("--package", type=Path, help="Paquete ZIP con escena y caché horneada")
    parser.add_argument("--start", type=int, default=1)
    parser.add_argument("--end", type=int, default=48)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--width", type=int, default=640)
    parser.add_argument("--height", type=int, default=360)
    parser.add_argument("--samples", type=int, default=16)
    parser.add_argument("--format", choices=("gif", "mp4", "frames"), default="gif")
    parser.add_argument("--ffmpeg", type=Path, default=shutil.which("ffmpeg"))
    parser.add_argument("--window", type=int, default=20)
    parser.add_argument("--timeout", type=int, default=900, help="Límite real sin recibir resultados")
    parser.add_argument("--db", type=Path, default=BASE / "datos" / "maestro.sqlite3")
    parser.add_argument("--output", type=Path, default=BASE / "resultados")
    args = parser.parse_args()
    try:
        spec = build_spec(args)
        if args.run_id:
            validate_name(args.run_id)
        if not 1 <= args.window <= 100 or args.timeout < 10:
            raise ValueError("--window: 1 a 100; --timeout: mínimo 10")
        if args.format == "gif" and args.width * args.height * (args.end - args.start + 1) * 4 > 128 * 1024 * 1024:
            raise ValueError("La animación supera el presupuesto de memoria GIF; usa --format mp4 o frames")
        if args.format == "mp4":
            if not args.ffmpeg or not args.ffmpeg.is_file():
                raise ValueError("Para MP4 indica --ffmpeg o añade FFmpeg al PATH")
            if args.width % 2 or args.height % 2:
                raise ValueError("Para MP4, la anchura y la altura deben ser pares")
        args.spec = spec
    except (ValueError, OSError) as exc:
        parser.error(str(exc))
    return args


async def main(args):
    started = time.perf_counter()
    spec = args.spec
    run_id = args.run_id or "render-" + digest(canonical(spec).encode())[:12]
    folder = args.output.resolve() / run_id
    folder.mkdir(parents=True, exist_ok=True)
    db = open_database(args.db, run_id, spec)
    try:
        await distribute(args, db, run_id, spec, folder / "fotogramas")
        report = export_report(db, run_id, spec, folder, time.perf_counter() - started)
        if not report["failed"]:
            try:
                report["animation"] = assemble(args, spec, folder)
            except (OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
                report["assembly_error"] = str(exc)
                raise RuntimeError(f"Los PNG están guardados, pero falló el montaje: {exc}. "
                                   "Repite el comando para intentar solo el montaje") from exc
            finally:
                (folder / "resumen.json").write_text(
                    json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nFINALIZADO: {report['completed']} fotogramas correctos; {report['failed']} fallidos.\n"
              f"Resultados: {folder}", flush=True)
        if report["animation"]:
            print(f"Abre la animación: {report['animation']}", flush=True)
        return 1 if report["failed"] else 0
    finally:
        db.close()


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main(parse_args())))
    except KeyboardInterrupt:
        print("Maestro detenido. Repite el comando para continuar.")
        raise SystemExit(130)
    except (ValueError, RuntimeError, sqlite3.Error, OSError) as error:
        raise SystemExit(str(error)) from error
