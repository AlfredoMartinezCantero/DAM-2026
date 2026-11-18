#!/usr/bin/env python3
"""Trabajador del laboratorio y motor reproducible de un cruce con semáforos."""

import argparse
import asyncio
from collections import deque
from concurrent.futures import ProcessPoolExecutor
import json
import math
import os
import random
import socket
import time

from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed, InvalidHandshake


SIMULATION_VERSION = 1
DIRECTIONS = ("norte", "sur", "este", "oeste")
CONFIG_LIMITS = {
    "duration_s": (1, 86400),
    "green_ns_s": (1, 300),
    "green_ew_s": (1, 300),
    "amber_s": (1, 30),
    "headway_s": (1, 30),
    "seed": (0, 2**31 - 1),
}


def validate_config(config):
    """Una misma validación para el maestro, el broker y los trabajadores."""
    if not isinstance(config, dict) or set(config) != {
        *CONFIG_LIMITS, "arrival_ns_vpm", "arrival_ew_vpm", "version"
    }:
        raise ValueError("Configuración de simulación incompleta o desconocida")
    if type(config["version"]) is not int or config["version"] != SIMULATION_VERSION:
        raise ValueError("Versión del motor incompatible")
    for key, (minimum, maximum) in CONFIG_LIMITS.items():
        value = config[key]
        if type(value) is not int or not minimum <= value <= maximum:
            raise ValueError(f"{key} debe estar entre {minimum} y {maximum}")
    for key in ("arrival_ns_vpm", "arrival_ew_vpm"):
        value = config[key]
        if (type(value) not in (int, float) or not math.isfinite(value)
                or not 0 <= value <= 60):
            raise ValueError(f"{key} debe estar entre 0 y 60 vehículos/minuto")
    return config


def simulate(config):
    """Simula segundos virtuales; no duerme ni necesita una GPU o un modelo IA.

    Hay un carril por acceso y movimientos rectos. Los accesos opuestos tienen
    verde simultáneo, separados por fases de despeje sin circulación. Cada
    segundo puede llegar un vehículo a cada acceso (ensayo de Bernoulli).
    """
    validate_config(config)
    started = time.perf_counter()
    rng = random.Random(config["seed"])
    queues = [deque() for _ in DIRECTIONS]
    arrivals = [0] * 4
    departures = [0] * 4
    waits = []
    max_queue = 0
    queue_area = 0
    ns = config["green_ns_s"]
    ew = config["green_ew_s"]
    amber = config["amber_s"]
    cycle = ns + ew + 2 * amber
    probabilities = [config["arrival_ns_vpm"] / 60] * 2 + [
        config["arrival_ew_vpm"] / 60
    ] * 2

    for second in range(config["duration_s"]):
        # Siempre se consumen cuatro números: distintas fases comparten llegadas.
        for lane, probability in enumerate(probabilities):
            if rng.random() < probability:
                queues[lane].append(second)
                arrivals[lane] += 1
        max_queue = max(max_queue, *(len(queue) for queue in queues))
        phase = second % cycle
        green_lanes = ()
        phase_elapsed = 0
        if phase < ns:
            green_lanes = (0, 1)
            phase_elapsed = phase
        elif ns + amber <= phase < ns + amber + ew:
            green_lanes = (2, 3)
            phase_elapsed = phase - ns - amber
        if phase_elapsed % config["headway_s"] == 0:
            for lane in green_lanes:
                if queues[lane]:
                    waits.append(second - queues[lane].popleft())
                    departures[lane] += 1
        queue_area += sum(map(len, queues))

    # También contamos la espera acumulada de quienes aún no han cruzado.
    unfinished_waits = [config["duration_s"] - arrival
                        for queue in queues for arrival in queue]
    all_waits = sorted(waits + unfinished_waits)
    arrived = sum(arrivals)
    departed = sum(departures)
    return {
        "arrived": arrived,
        "departed": departed,
        "remaining": arrived - departed,
        "mean_wait_s": round(sum(all_waits) / arrived, 4) if arrived else 0.0,
        "p95_wait_s": all_waits[max(0, math.ceil(len(all_waits) * .95) - 1)]
        if all_waits else 0,
        "mean_queue": round(queue_area / config["duration_s"], 4),
        "max_queue_per_lane": max_queue,
        "completion_pct": round(100 * departed / arrived, 2) if arrived else 100.0,
        "by_direction": {
            direction: {"arrived": arrivals[i], "departed": departures[i],
                        "remaining": len(queues[i])}
            for i, direction in enumerate(DIRECTIONS)
        },
        "compute_s": round(time.perf_counter() - started, 6),
    }


def summarize(records):
    """Agrupa réplicas por configuración; los tiempos no dependen del equipo."""
    groups = {}
    for config, result in records:
        key = (config["green_ns_s"], config["green_ew_s"],
               config["arrival_ns_vpm"], config["arrival_ew_vpm"])
        group = groups.setdefault(key, {
            "green_ns_s": key[0], "green_ew_s": key[1],
            "arrival_ns_vpm": key[2], "arrival_ew_vpm": key[3],
            "runs": 0, "arrived": 0, "departed": 0, "remaining": 0,
            "wait_sum": 0.0, "compute_s": 0.0,
        })
        group["runs"] += 1
        for field in ("arrived", "departed", "remaining", "compute_s"):
            group[field] += result[field]
        group["wait_sum"] += result["mean_wait_s"] * result["arrived"]
    for group in groups.values():
        wait_sum = group.pop("wait_sum")
        group["mean_wait_s"] = round(
            wait_sum / group["arrived"], 2
        ) if group["arrived"] else 0.0
        group["completion_pct"] = round(
            100 * group["departed"] / group["arrived"], 2
        ) if group["arrived"] else 100.0
        group["compute_s"] = round(group["compute_s"], 4)
    return sorted(groups.values(), key=lambda row: (
        row["mean_wait_s"], -row["completion_pct"], row["green_ns_s"]
    ))


async def send(ws, message):
    await ws.send(json.dumps(message, ensure_ascii=False, allow_nan=False))


async def work_session(ws, args, pool):
    await send(ws, {"role": "slave", "name": args.name, "token": args.token,
                    "capacity": args.processes})
    hello = json.loads(await asyncio.wait_for(ws.recv(), 10))
    if hello.get("type") != "registered":
        raise ValueError(hello.get("error", "Registro rechazado"))
    print(f"Trabajador {args.name}: {args.processes} procesos disponibles", flush=True)
    active = {}
    loop = asyncio.get_running_loop()

    async def process(job):
        assignment = job["assignment"]
        response = {"id": job["id"], "assignment": assignment}
        try:
            result = await loop.run_in_executor(pool, simulate, job["config"])
        except Exception as exc:
            response.update(type="failed", error=str(exc)[:500])
        else:
            response.update(type="result", result=result)
            print(f"Completada {job['id'][:12]}: "
                  f"espera {result['mean_wait_s']:.2f} s", flush=True)
        await send(ws, response)

    async def heartbeat():
        while True:
            await asyncio.sleep(hello["heartbeat_s"])
            await send(ws, {"type": "heartbeat", "assignments": list(active)})

    heartbeat_task = asyncio.create_task(heartbeat())
    receive_task = asyncio.create_task(ws.recv())
    try:
        while True:
            watched = [receive_task, heartbeat_task, *active.values()]
            finished, _ = await asyncio.wait(watched, return_when=asyncio.FIRST_COMPLETED)
            if heartbeat_task in finished:
                await heartbeat_task
            for assignment, task in list(active.items()):
                if task in finished:
                    del active[assignment]
                    await task
            if receive_task in finished:
                job = json.loads(receive_task.result())
                if job.get("type") == "error":
                    raise ValueError(job.get("error", "Petición rechazada"))
                if job.get("type") == "job":
                    if len(active) >= args.processes:
                        raise ValueError("El servidor excede la capacidad del trabajador")
                    active[job["assignment"]] = asyncio.create_task(process(job))
                receive_task = asyncio.create_task(ws.recv())
    finally:
        for task in (receive_task, heartbeat_task, *active.values()):
            task.cancel()
        await asyncio.gather(receive_task, heartbeat_task, *active.values(),
                             return_exceptions=True)


async def run(args):
    # Los procesos ejecutan CPU en paralelo; el bucle de red sigue atendiendo latidos.
    with ProcessPoolExecutor(max_workers=args.processes) as pool:
        while True:
            try:
                async with connect(args.server, proxy=None, max_size=1024 * 1024,
                                   open_timeout=10, close_timeout=5) as ws:
                    await work_session(ws, args, pool)
            except (OSError, ConnectionClosed, InvalidHandshake, TimeoutError) as exc:
                if isinstance(exc, ConnectionClosed) and exc.code == 1008:
                    raise ValueError(f"Registro rechazado: {exc}") from exc
                print(f"Conexión interrumpida ({exc}). Reintento en 3 s.", flush=True)
                await asyncio.sleep(3)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="ws://127.0.0.1:8765")
    parser.add_argument("--name", default=f"{socket.gethostname()}-{os.getpid()}")
    parser.add_argument("--processes", type=int, default=1,
                        help="Procesos de cálculo simultáneos (1 a 32)")
    parser.add_argument("--token", default=os.environ.get("LAB_TOKEN", ""))
    args = parser.parse_args()
    if not 1 <= args.processes <= 32:
        parser.error("--processes debe estar entre 1 y 32")
    if not args.name or len(args.name) > 80:
        parser.error("--name debe contener entre 1 y 80 caracteres")
    return args


if __name__ == "__main__":
    try:
        asyncio.run(run(parse_args()))
    except KeyboardInterrupt:
        print("Trabajador detenido.")
    except ValueError as error:
        raise SystemExit(str(error)) from error
