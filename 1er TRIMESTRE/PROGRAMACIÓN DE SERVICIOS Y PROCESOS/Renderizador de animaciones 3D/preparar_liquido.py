#!/usr/bin/env python3
"""Crea el recipiente, hornea el líquido y prepara un ZIP portable sin usar la GUI."""

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

from paquetes import create_package, inspect_package


BASE = Path(__file__).resolve().parent


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--blender", type=Path, default=os.environ.get("BLENDER_PATH") or shutil.which("blender"))
    parser.add_argument("--output", type=Path, default=BASE / "escenas" / "liquido")
    parser.add_argument("--frames", type=int, default=120)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--resolution", type=int, default=64)
    parser.add_argument("--radius", type=float, default=.10, help="Radio del emisor en metros")
    parser.add_argument("--velocity", type=float, default=1.2, help="Velocidad inicial hacia abajo, m/s")
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--package-only", action="store_true", help="Empaquetar una escena ya horneada")
    args = parser.parse_args()
    args.output = args.output.resolve()
    if not args.package_only and (not args.blender or not args.blender.is_file()):
        parser.error('Indica --blender "C:\\ruta\\blender.exe" o configura BLENDER_PATH')
    if not (24 <= args.frames <= 480 and 1 <= args.fps <= 60 and 32 <= args.resolution <= 160
            and .08 <= args.radius <= .2 and .1 <= args.velocity <= 5 and 1 <= args.threads <= 32):
        parser.error("--frames: 24–480; --fps: 1–60; --resolution: 32–160; "
                     "--radius: .08–.2; --velocity: .1–5; --threads: 1–32")
    if not args.package_only and args.output.exists() and any(args.output.iterdir()):
        parser.error("La carpeta ya contiene una escena; utiliza --output con otro nombre "
                     "o --package-only para conservar su simulación")
    return args


def main(args):
    if not args.package_only:
        command = [str(args.blender.resolve()), "--background", "--factory-startup", "--disable-autoexec",
                   "--threads", str(args.threads), "--python-exit-code", "1", "--python",
                   str(BASE / "crear_liquido.py"), "--", "--output", str(args.output)]
        for name in ("frames", "fps", "resolution", "radius", "velocity"):
            command.extend(["--" + name, str(getattr(args, name))])
        args.output.parent.mkdir(parents=True, exist_ok=True)
        log_path = args.output.parent / (args.output.name + "-horneado.log")
        environment = {**os.environ, "OMP_NUM_THREADS": str(args.threads)}
        started = time.monotonic()
        print("Creando escena y calculando la simulación física…", flush=True)
        process = None
        try:
            with log_path.open("wb") as log:
                process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, env=environment,
                                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                while process.poll() is None:
                    meshes = len(list((args.output / "cache" / "mesh").glob("fluid_mesh_*.bobj.gz")))
                    print(f"Mallas horneadas: {meshes}/{args.frames} | "
                          f"{time.monotonic() - started:.0f} s", flush=True)
                    time.sleep(5)
            if process.returncode:
                raise RuntimeError(f"Blender no completó la simulación; consulta {log_path}")
        finally:
            if process is not None and process.poll() is None:
                process.terminate()
                process.wait(timeout=15)
    manifest_path = args.output / "manifest.json"
    if not manifest_path.is_file():
        raise ValueError("No hay una simulación terminada en la carpeta indicada")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    meshes = list((args.output / "cache" / "mesh").glob("fluid_mesh_*.bobj.gz"))
    if len(meshes) < manifest["end"] - manifest["start"] + 1:
        raise ValueError("La caché de mallas está incompleta; no se empaqueta")
    target = args.output.parent / (args.output.name + ".render.zip")
    print("Empaquetando escena y caché…", flush=True)
    # El render lee mallas y configuración; las rejillas de cálculo quedan en el origen.
    create_package(args.output, target, render_only=True)
    inspect_package(target)
    print(f"\nLISTO: {target}\nTamaño: {target.stat().st_size / 1024**2:.1f} MiB", flush=True)
    print("Para renderizar, con servidor y trabajadores actualizados y arrancados:\n"
          f'.\\.venv\\Scripts\\python.exe master.py --run-id liquido-1 --package "{target}" '
          f"--start {manifest['start']} --end {manifest['end']} --fps {manifest['fps']} "
          "--width 320 --height 180 --samples 16 --format gif")


if __name__ == "__main__":
    try:
        main(parse_args())
    except KeyboardInterrupt:
        print("Preparación interrumpida. Utiliza otra carpeta para una simulación nueva.")
        raise SystemExit(130)
    except (OSError, ValueError, RuntimeError) as error:
        raise SystemExit(str(error)) from error
