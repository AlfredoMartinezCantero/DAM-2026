#!/usr/bin/env python3
"""Genera experimentos de tráfico, los distribuye y compara sus resultados."""

import argparse
import asyncio
import csv
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import time

from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed, InvalidHandshake

from slave import SIMULATION_VERSION, send, summarize, validate_config


BASE = Path(__file__).resolve().parent


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def build_experiment(args):
    configs = []
    for green in args.green_ns:
        for replica in range(args.repetitions):
            config = {
                "version": SIMULATION_VERSION,
                "duration_s": args.duration,
                "green_ns_s": green,
                "green_ew_s": args.green_ew,
                "amber_s": args.amber,
                "headway_s": args.headway,
                "arrival_ns_vpm": args.arrival_ns,
                "arrival_ew_vpm": args.arrival_ew,
                "seed": args.seed + replica,
            }
            validate_config(config)
            configs.append(config)
    spec = canonical(configs)
    run_id = args.run_id or "exp-" + hashlib.sha256(spec.encode()).hexdigest()[:12]
    jobs = {}
    for config in configs:
        job_id = hashlib.sha256(f"{run_id}|{canonical(config)}".encode()).hexdigest()
        jobs[job_id] = {"id": job_id, "config": config}
    return run_id, spec, jobs


def open_database(path, run_id, spec):
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    try:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA busy_timeout=5000")
        db.execute("""CREATE TABLE IF NOT EXISTS experiments (
            run_id TEXT PRIMARY KEY, specification TEXT NOT NULL, created TEXT NOT NULL
        )""")
        db.execute("""CREATE TABLE IF NOT EXISTS results (
            id TEXT PRIMARY KEY, run_id TEXT NOT NULL, config TEXT NOT NULL,
            status TEXT NOT NULL, result TEXT, error TEXT, worker TEXT, updated TEXT NOT NULL
        )""")
        previous = db.execute(
            "SELECT specification FROM experiments WHERE run_id=?", (run_id,)
        ).fetchone()
        if previous and previous[0] != spec:
            raise ValueError("Ese --run-id ya corresponde a otros parámetros; utiliza otro nombre")
        with db:
            db.execute("INSERT OR IGNORE INTO experiments VALUES (?,?,?)",
                       (run_id, spec, datetime.now(timezone.utc).isoformat()))
        return db
    except BaseException:
        db.close()
        raise


def store_result(db, run_id, job, message):
    status = "done" if message["type"] == "result" else "failed"
    result = message.get("result")
    if status == "done":
        required = ("arrived", "departed", "remaining", "mean_wait_s", "compute_s",
                    "completion_pct", "p95_wait_s", "mean_queue", "max_queue_per_lane")
        if not isinstance(result, dict) or any(key not in result for key in required):
            raise ValueError("El servidor ha enviado un resultado incompleto")
    with db:
        db.execute("""INSERT INTO results VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET status=excluded.status,
            result=excluded.result, error=excluded.error, worker=excluded.worker,
            updated=excluded.updated""",
                   (job["id"], run_id, canonical(job["config"]), status,
                    canonical(result) if status == "done" else None,
                    message.get("error"), message.get("worker"),
                    datetime.now(timezone.utc).isoformat()))


async def distribute(args, db, run_id, jobs):
    terminal = {row[0] for row in db.execute(
        "SELECT id FROM results WHERE run_id=?", (run_id,)
    )} & jobs.keys()
    last_progress = time.monotonic()
    print(f"Experimento: {run_id} | Simulaciones: {len(jobs)} | "
          f"Guardadas: {len(terminal)}", flush=True)
    while len(terminal) < len(jobs):
        if time.monotonic() - last_progress > args.timeout:
            raise RuntimeError("Se agotó el tiempo sin resultados. Comprueba los trabajadores "
                               "y repite el mismo comando para continuar")
        try:
            async with connect(args.server, proxy=None, max_size=1024 * 1024,
                               open_timeout=10, close_timeout=5) as ws:
                fingerprint = hashlib.sha256(canonical(
                    [job["config"] for job in jobs.values()]
                ).encode()).hexdigest()
                await send(ws, {"role": "master", "run_id": run_id,
                                "spec_hash": fingerprint, "token": args.token})
                hello = json.loads(await asyncio.wait_for(ws.recv(), 10))
                if hello.get("type") != "registered":
                    raise ValueError(hello.get("error", "Registro rechazado"))
                print("Maestro conectado al broker", flush=True)
                submitted = set()
                pending = iter(jobs)
                next_id = next(pending, None)
                while len(terminal) < len(jobs):
                    if time.monotonic() - last_progress > args.timeout:
                        raise RuntimeError("Sin resultados durante el tiempo configurado. "
                                           "Puedes reanudar repitiendo el comando")
                    while next_id is not None and len(submitted) < args.window:
                        batch = []
                        while (next_id is not None and len(batch) < args.batch
                               and len(submitted) + len(batch) < args.window):
                            if next_id not in terminal:
                                batch.append(jobs[next_id])
                            next_id = next(pending, None)
                        if batch:
                            await send(ws, {"type": "enqueue", "jobs": batch})
                            submitted.update(job["id"] for job in batch)
                    try:
                        message = json.loads(await asyncio.wait_for(ws.recv(), 5))
                    except TimeoutError:
                        await send(ws, {"type": "replay_results"})
                        continue
                    kind = message.get("type")
                    if kind == "error":
                        raise ValueError(message.get("error", "Petición rechazada"))
                    if kind not in ("result", "failed"):
                        continue
                    job_id = message.get("id")
                    # No confirmar resultados de otro experimento o configuración.
                    if message.get("run_id") != run_id or job_id not in jobs:
                        continue
                    if job_id not in terminal:
                        store_result(db, run_id, jobs[job_id], message)
                        terminal.add(job_id)
                        last_progress = time.monotonic()
                        print(f"Resueltas: {len(terminal)}/{len(jobs)} "
                              f"| {kind} | {message.get('worker') or '-'}", flush=True)
                    submitted.discard(job_id)
                    # SQLite se confirma antes de enviar el acuse de recibo.
                    await send(ws, {"type": "ack", "id": job_id})
        except (OSError, ConnectionClosed, InvalidHandshake, TimeoutError) as exc:
            if isinstance(exc, ConnectionClosed) and exc.code == 1008:
                raise ValueError(f"Registro rechazado: {exc}") from exc
            print(f"Conexión interrumpida ({exc}). Reintento en 3 s.", flush=True)
            await asyncio.sleep(3)


def export_results(db, run_id, output, wall_s):
    rows = db.execute("SELECT * FROM results WHERE run_id=? ORDER BY id", (run_id,)).fetchall()
    records = [(json.loads(row["config"]), json.loads(row["result"]))
               for row in rows if row["status"] == "done"]
    summary = summarize(records)
    folder = output / run_id
    folder.mkdir(parents=True, exist_ok=True)
    details = []
    for row in rows:
        config = json.loads(row["config"])
        result = json.loads(row["result"]) if row["result"] else {}
        details.append({"id": row["id"], "seed": config["seed"],
                        "green_ns_s": config["green_ns_s"],
                        "green_ew_s": config["green_ew_s"], "status": row["status"],
                        "worker": row["worker"], "error": row["error"],
                        **{key: result.get(key) for key in (
                            "arrived", "departed", "remaining", "mean_wait_s",
                            "p95_wait_s", "mean_queue", "max_queue_per_lane",
                            "completion_pct", "compute_s")}})
    for filename, data in (("simulaciones.csv", details), ("comparacion.csv", summary)):
        with (folder / filename).open("w", newline="", encoding="utf-8-sig") as stream:
            if data:
                writer = csv.DictWriter(stream, fieldnames=list(data[0]))
                writer.writeheader()
                writer.writerows(data)
    report = {"run_id": run_id, "completed": len(records), "failed": len(rows) - len(records),
              "invocation_wall_s": round(wall_s, 4), "ranking": summary,
              "criterion": "Menor espera media acumulada por vehículo llegado; "
                           "incluye la espera de vehículos pendientes al finalizar"}
    (folder / "resumen.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8"
    )
    print("\nCOMPARACIÓN (verde N/S | verde E/O | espera media | completados)")
    for group in summary:
        print(f"{group['green_ns_s']:>6} s | {group['green_ew_s']:>6} s | "
              f"{group['mean_wait_s']:>10.2f} s | {group['completion_pct']:>7.2f}%")
    print(f"\nResultados: {folder}\nCorrectas: {report['completed']} | "
          f"Fallidas: {report['failed']}")
    return report["failed"]


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="ws://127.0.0.1:8765")
    parser.add_argument("--token", default=os.environ.get("LAB_TOKEN", ""))
    parser.add_argument("--run-id", help="Nombre del experimento; por defecto se deriva de los parámetros")
    parser.add_argument("--green-ns", default="15,30,45,60", help="Segundos de verde N/S separados por comas")
    parser.add_argument("--green-ew", type=int, default=30)
    parser.add_argument("--arrival-ns", type=float, default=18, help="Vehículos/minuto por acceso N/S")
    parser.add_argument("--arrival-ew", type=float, default=8, help="Vehículos/minuto por acceso E/O")
    parser.add_argument("--duration", type=int, default=3600, help="Segundos virtuales por simulación")
    parser.add_argument("--repetitions", type=int, default=25)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--amber", type=int, default=2, help="Segundos de despeje entre verdes")
    parser.add_argument("--headway", type=int, default=2, help="Separación entre pasos de vehículos")
    parser.add_argument("--window", type=int, default=100)
    parser.add_argument("--batch", type=int, default=10)
    parser.add_argument("--timeout", type=int, default=120, help="Límite de segundos sin resultados")
    parser.add_argument("--db", type=Path, default=BASE / "datos" / "resultados.sqlite3")
    parser.add_argument("--output", type=Path, default=BASE / "resultados")
    args = parser.parse_args()
    try:
        args.green_ns = list(dict.fromkeys(int(value) for value in args.green_ns.split(",")))
        if not 1 <= args.repetitions <= 1000 or len(args.green_ns) * args.repetitions > 5000:
            raise ValueError("Utiliza de 1 a 1000 réplicas y como máximo 5000 simulaciones")
        if not 1 <= args.batch <= 10 or not 1 <= args.window <= 1000 or args.timeout < 10:
            raise ValueError("--batch: 1 a 10; --window: 1 a 1000; --timeout: mínimo 10")
        if args.run_id and not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", args.run_id):
            raise ValueError("--run-id admite letras ASCII, números, guiones y guiones bajos (1 a 64)")
        build_experiment(args)
    except ValueError as exc:
        parser.error(str(exc))
    return args


async def main(args):
    started = time.perf_counter()
    run_id, specification, jobs = build_experiment(args)
    db = open_database(args.db, run_id, specification)
    try:
        await distribute(args, db, run_id, jobs)
        return export_results(db, run_id, args.output, time.perf_counter() - started)
    finally:
        db.close()


if __name__ == "__main__":
    try:
        raise SystemExit(1 if asyncio.run(main(parse_args())) else 0)
    except KeyboardInterrupt:
        print("Maestro detenido. Repite el comando para reanudar.")
        raise SystemExit(130)
    except (ValueError, RuntimeError, sqlite3.Error) as error:
        raise SystemExit(str(error)) from error
