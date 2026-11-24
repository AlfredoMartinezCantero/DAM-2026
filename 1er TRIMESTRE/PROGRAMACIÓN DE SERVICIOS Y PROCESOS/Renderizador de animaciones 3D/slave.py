#!/usr/bin/env python3
"""Trabajador: ejecuta Blender en segundo plano y devuelve fotogramas PNG."""

import argparse
import asyncio
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time

from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed, InvalidHandshake

from protocolo import (BASE, MAX_MESSAGE, MAX_PNG, MAX_SCENE, atomic_write,
                       decode, digest, encode, message, send, validate_png, validate_spec)


async def stop_process(process):
    if process is None or process.returncode is not None:
        return
    try:
        process.terminate()
        await asyncio.wait_for(process.wait(), 5)
    except TimeoutError:
        process.kill()
        await process.wait()
    except ProcessLookupError:
        pass


async def render(job, args):
    spec = validate_spec(job["spec"])
    frame = job["frame"]
    if type(frame) is not int or not spec["start"] <= frame <= spec["end"]:
        raise ValueError("Fotograma fuera del intervalo")
    if not isinstance(job.get("assignment"), str) or not re.fullmatch(r"[0-9a-f]{32}", job["assignment"]):
        raise ValueError("Identificador de asignación inválido")
    args.cache.mkdir(parents=True, exist_ok=True)
    jobs_folder = args.cache / "trabajos"
    jobs_folder.mkdir(exist_ok=True)
    logs = args.cache / "logs"
    logs.mkdir(exist_ok=True)
    started = time.perf_counter()
    process = None
    with tempfile.TemporaryDirectory(prefix="frame-", dir=jobs_folder) as directory:
        output = Path(directory) / "output.png"
        command = [str(args.blender), "--background", "--factory-startup",
                   "--disable-autoexec", "--threads", str(args.threads),
                   "--python-exit-code", "1", "--python", str(BASE / "renderizar.py"), "--",
                   "--frame", str(frame), "--output", str(output)]
        for key in ("start", "end", "fps", "width", "height", "samples"):
            command.extend(["--" + key, str(spec[key])])
        if spec["source"] == "blend":
            scene = args.cache / "escenas" / (spec["scene_sha"] + ".blend")
            if not scene.is_file() or digest(scene.read_bytes()) != spec["scene_sha"]:
                raise ValueError("Falta la escena .blend o su copia está dañada")
            command.extend(["--scene", str(scene.resolve())])
        log_path = logs / (job["assignment"] + ".log")
        try:
            with log_path.open("wb") as log:
                process = await asyncio.create_subprocess_exec(
                    *command, stdout=log, stderr=asyncio.subprocess.STDOUT,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
                )
                await asyncio.wait_for(process.wait(), args.timeout)
            if process.returncode != 0 or not output.is_file():
                raise RuntimeError(f"Blender no produjo el fotograma (código {process.returncode}). "
                                   f"Consulta {log_path}")
            if output.stat().st_size > MAX_PNG:
                raise ValueError("El PNG supera 16 MiB; reduce resolución o complejidad")
            data = output.read_bytes()
            checksum = validate_png(data, spec)
            return {"image": encode(data), "sha256": checksum,
                    "render_s": round(time.perf_counter() - started, 4)}
        except TimeoutError as exc:
            raise RuntimeError(f"Fotograma {frame}: superó {args.timeout} segundos") from exc
        finally:
            await stop_process(process)


async def work_session(ws, args):
    await send(ws, {"role": "slave", "token": args.token, "name": args.name,
                    "capacity": args.slots, "blender_version": args.blender_version})
    hello = message(await asyncio.wait_for(ws.recv(), 10))
    if hello.get("type") != "registered":
        raise ValueError(hello.get("error", "Registro rechazado"))
    print(f"Conectado: {args.name} | {args.slots} renders simultáneos | "
          f"{args.blender_version}", flush=True)
    active = {}

    async def process(job):
        response = {"id": job["id"], "assignment": job["assignment"]}
        try:
            result = await render(job, args)
        except Exception as exc:
            response.update(type="failed", error=str(exc)[:1000])
            print(f"Error en fotograma {job['frame']}: {exc}", flush=True)
        else:
            response.update(type="result", **result)
            print(f"Fotograma {job['frame']} renderizado en {result['render_s']:.2f} s", flush=True)
        await send(ws, response)

    async def heartbeat():
        while True:
            await asyncio.sleep(hello["heartbeat_s"])
            await send(ws, {"type": "heartbeat", "assignments": list(active)})

    heartbeat_task = asyncio.create_task(heartbeat())
    receive_task = asyncio.create_task(ws.recv())
    try:
        while True:
            finished, _ = await asyncio.wait(
                [receive_task, heartbeat_task, *active.values()],
                return_when=asyncio.FIRST_COMPLETED
            )
            if heartbeat_task in finished:
                await heartbeat_task
            for assignment, task in list(active.items()):
                if task in finished:
                    del active[assignment]
                    await task
            if receive_task in finished:
                payload = message(receive_task.result())
                if payload.get("type") == "error":
                    raise ValueError(payload.get("error", "Petición rechazada"))
                if payload.get("type") == "scene":
                    data = decode(payload.get("data"), MAX_SCENE)
                    checksum = digest(data)
                    if checksum != payload.get("sha256"):
                        raise ValueError("La escena recibida no supera la verificación SHA256")
                    atomic_write(args.cache / "escenas" / (checksum + ".blend"), data)
                elif payload.get("type") == "job":
                    if len(active) >= args.slots:
                        raise ValueError("El servidor excede la capacidad del trabajador")
                    active[payload["assignment"]] = asyncio.create_task(process(payload))
                receive_task = asyncio.create_task(ws.recv())
    finally:
        tasks = [receive_task, heartbeat_task, *active.values()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


async def run(args):
    while True:
        try:
            async with connect(args.server, proxy=None, max_size=MAX_MESSAGE,
                               open_timeout=15, ping_timeout=60, close_timeout=5) as ws:
                await work_session(ws, args)
        except (OSError, ConnectionClosed, InvalidHandshake, TimeoutError) as exc:
            if isinstance(exc, ConnectionClosed) and exc.rcvd and exc.rcvd.code == 1008:
                raise ValueError(f"Registro rechazado: {exc}") from exc
            print(f"Conexión interrumpida ({exc}). Reintento en 3 s.", flush=True)
            await asyncio.sleep(3)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="ws://127.0.0.1:8775")
    parser.add_argument("--token", default=os.environ.get("RENDER_TOKEN", ""))
    parser.add_argument("--name", default=f"{socket.gethostname()}-{os.getpid()}")
    parser.add_argument("--blender", type=Path, default=os.environ.get("BLENDER_PATH") or shutil.which("blender"))
    parser.add_argument("--slots", type=int, default=1, help="Renders simultáneos (1 a 8)")
    parser.add_argument("--threads", type=int, default=2, help="Hilos CPU de cada Blender (1 a 64)")
    parser.add_argument("--timeout", type=int, default=600, help="Límite real por fotograma")
    parser.add_argument("--cache", type=Path, default=BASE / "cache")
    parser.add_argument("--check", action="store_true", help="Comprobar Blender y salir")
    args = parser.parse_args()
    if not args.blender or not args.blender.is_file():
        parser.error('Indica Blender con --blender "C:\\ruta\\blender.exe" o configura BLENDER_PATH')
    args.blender = args.blender.resolve()
    if not 1 <= args.slots <= 8 or not 1 <= args.threads <= 64 or args.timeout < 10:
        parser.error("--slots: 1 a 8; --threads: 1 a 64; --timeout: mínimo 10")
    if not args.name or len(args.name) > 80:
        parser.error("--name debe contener entre 1 y 80 caracteres")
    try:
        result = subprocess.run([str(args.blender), "--version"], capture_output=True,
                                text=True, errors="replace", timeout=30,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        args.blender_version = result.stdout.splitlines()[0]
        if result.returncode or not args.blender_version.startswith("Blender "):
            raise ValueError("El ejecutable indicado no responde como Blender")
        version = re.match(r"Blender (\d+)\.(\d+)", args.blender_version)
        if version is None or tuple(map(int, version.groups())) < (4, 5):
            raise ValueError("Se necesita Blender 4.5 o posterior")
    except (OSError, TimeoutError, subprocess.TimeoutExpired, IndexError, ValueError) as exc:
        parser.error(str(exc))
    return args


if __name__ == "__main__":
    try:
        options = parse_args()
        if options.check:
            print(f"Disponible: {options.blender_version}\n{options.blender}")
        else:
            asyncio.run(run(options))
    except KeyboardInterrupt:
        print("Trabajador detenido; los renders activos se cancelan.")
    except ValueError as error:
        raise SystemExit(str(error)) from error
