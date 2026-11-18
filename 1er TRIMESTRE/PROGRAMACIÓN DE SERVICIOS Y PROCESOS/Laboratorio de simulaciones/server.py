#!/usr/bin/env python3
"""Broker persistente de simulaciones con reparto, reintentos y monitor HTTP."""

import argparse
import asyncio
from dataclasses import dataclass, field
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import time
from urllib.parse import parse_qs, urlsplit
import uuid

from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed

from slave import send, summarize, validate_config


BASE = Path(__file__).resolve().parent


@dataclass
class Client:
    role: str
    name: str
    run_id: str = ""
    capacity: int = 0
    assigned: dict = field(default_factory=dict)
    seen: float = field(default_factory=time.time)


class Broker:
    def __init__(self, args):
        self.args = args
        args.db.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(args.db)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA busy_timeout=5000")
        self.db.execute("""CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, run_id TEXT NOT NULL, config TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued', worker TEXT, assignment TEXT,
            attempts INTEGER NOT NULL DEFAULT 0, lease REAL NOT NULL DEFAULT 0,
            result TEXT, error TEXT, acknowledged INTEGER NOT NULL DEFAULT 0,
            updated REAL NOT NULL
        )""")
        self.db.execute("CREATE INDEX IF NOT EXISTS dispatch ON jobs(status, updated)")
        self.db.execute("CREATE INDEX IF NOT EXISTS experiments ON jobs(run_id, status)")
        self.db.execute("""CREATE TABLE IF NOT EXISTS runs (
            run_id TEXT PRIMARY KEY, spec_hash TEXT NOT NULL
        )""")
        # Una asignación de un proceso anterior deja de ser válida al arrancar.
        self.db.execute("""UPDATE jobs SET status='queued', worker=NULL,
            assignment=NULL, lease=0 WHERE status='running'""")
        self.db.commit()
        self.clients = {}
        self.schedule_lock = asyncio.Lock()
        self.stopping = False

    def terminal_message(self, row):
        return {"type": "result" if row["status"] == "done" else "failed",
                "id": row["id"], "run_id": row["run_id"], "worker": row["worker"],
                "result": json.loads(row["result"]) if row["result"] else None,
                "error": row["error"]}

    async def notify(self, row):
        for ws, client in list(self.clients.items()):
            if client.role == "master" and client.run_id == row["run_id"]:
                try:
                    await send(ws, self.terminal_message(row))
                except ConnectionClosed:
                    pass  # El resultado persiste y se recupera al reconectar.

    async def replay(self, ws, run_id):
        rows = self.db.execute("""SELECT * FROM jobs WHERE run_id=?
            AND status IN ('done','failed') ORDER BY updated""", (run_id,)).fetchall()
        for row in rows:
            await send(ws, self.terminal_message(row))

    async def schedule(self):
        if self.stopping:
            return
        notifications = []
        expired_connections = set()
        async with self.schedule_lock:
            now = time.time()
            expired = self.db.execute(
                "SELECT * FROM jobs WHERE status='running' AND lease<=?", (now,)
            ).fetchall()
            for row in expired:
                for ws, client in list(self.clients.items()):
                    if client.assigned.get(row["id"]) == row["assignment"]:
                        expired_connections.add(ws)
                self.db.execute("""UPDATE jobs SET status='queued', worker=NULL,
                    assignment=NULL, error='Latido del trabajador caducado', updated=?
                    WHERE id=?""", (now, row["id"]))
            exhausted = self.db.execute("""SELECT id FROM jobs
                WHERE status='queued' AND attempts>=?""", (self.args.max_attempts,)).fetchall()
            for row in exhausted:
                self.db.execute("""UPDATE jobs SET status='failed',
                    error=COALESCE(error,'Intentos agotados'), updated=? WHERE id=?""",
                                (now, row["id"]))
                notifications.append(self.db.execute(
                    "SELECT * FROM jobs WHERE id=?", (row["id"],)
                ).fetchone())
            self.db.commit()
            for ws, client in list(self.clients.items()):
                if client.role != "slave" or ws in expired_connections:
                    continue
                while len(client.assigned) < client.capacity:
                    row = self.db.execute("""SELECT * FROM jobs
                        WHERE status='queued' AND attempts<? ORDER BY updated, id LIMIT 1""",
                                          (self.args.max_attempts,)).fetchone()
                    if row is None:
                        break
                    assignment = uuid.uuid4().hex
                    with self.db:
                        self.db.execute("""UPDATE jobs SET status='running', worker=?,
                            assignment=?, attempts=attempts+1, lease=?, updated=? WHERE id=?""",
                                        (client.name, assignment, now + self.args.lease,
                                         now, row["id"]))
                    client.assigned[row["id"]] = assignment
                    try:
                        await send(ws, {"type": "job", "id": row["id"],
                                        "assignment": assignment,
                                        "config": json.loads(row["config"])})
                    except ConnectionClosed:
                        # El finally del cliente devuelve todas sus tareas a la cola.
                        break
        # Cerrar fuera del lock permite que el finally de cada handler reprograme.
        for ws in expired_connections:
            await ws.close(1012, "Latido caducado; vuelve a conectar")
        for row in notifications:
            await self.notify(row)

    async def enqueue(self, ws, client, message):
        jobs = message.get("jobs")
        if not isinstance(jobs, list) or not 1 <= len(jobs) <= 10:
            raise ValueError("Cada lote debe contener entre 1 y 10 simulaciones")
        validated = []
        for job in jobs:
            if not isinstance(job, dict):
                raise ValueError("Trabajo inválido")
            config = validate_config(job.get("config"))
            encoded = json.dumps(config, sort_keys=True, separators=(",", ":"), allow_nan=False)
            expected = hashlib.sha256(f"{client.run_id}|{encoded}".encode()).hexdigest()
            if job.get("id") != expected:
                raise ValueError("Identificador incompatible con los parámetros")
            validated.append((expected, encoded))
        existing = self.db.execute("SELECT COUNT(*) FROM jobs WHERE run_id=?",
                                   (client.run_id,)).fetchone()[0]
        new = {job_id for job_id, _ in validated
               if not self.db.execute("SELECT 1 FROM jobs WHERE id=?", (job_id,)).fetchone()}
        if existing + len(new) > 5000:
            raise ValueError("Un experimento admite como máximo 5000 simulaciones")
        with self.db:
            for job_id, encoded in validated:
                self.db.execute("""INSERT OR IGNORE INTO jobs(id,run_id,config,updated)
                    VALUES (?,?,?,?)""", (job_id, client.run_id, encoded, time.time()))
        await send(ws, {"type": "enqueued", "ids": [job_id for job_id, _ in validated]})
        # Si se perdió la base local del maestro, también recupera resultados ya confirmados.
        for job_id, _ in validated:
            row = self.db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
            if row["status"] in ("done", "failed"):
                await send(ws, self.terminal_message(row))
        await self.schedule()

    @staticmethod
    def validate_result(result, config):
        if not isinstance(result, dict):
            raise ValueError("Resultado inválido")
        for key in ("arrived", "departed", "remaining", "p95_wait_s", "max_queue_per_lane"):
            if type(result.get(key)) is not int or result[key] < 0:
                raise ValueError(f"Métrica inválida: {key}")
        for key in ("mean_wait_s", "mean_queue", "completion_pct", "compute_s"):
            value = result.get(key)
            if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
                raise ValueError(f"Métrica inválida: {key}")
        if (result["arrived"] != result["departed"] + result["remaining"]
                or result["arrived"] > config["duration_s"] * 4
                or result["completion_pct"] > 100
                or result["mean_wait_s"] > config["duration_s"]):
            raise ValueError("El resultado incumple las invariantes de la simulación")

    async def accept_result(self, client, message):
        job_id = message.get("id")
        assignment = message.get("assignment")
        if not isinstance(job_id, str) or client.assigned.get(job_id) != assignment:
            return
        row = self.db.execute("SELECT * FROM jobs WHERE id=? AND status='running' "
                              "AND assignment=?", (job_id, assignment)).fetchone()
        if row is None:
            return
        result = message.get("result")
        error = str(message.get("error") or "Error del trabajador")[:500]
        success = message.get("type") == "result"
        if success:
            try:
                self.validate_result(result, json.loads(row["config"]))
            except ValueError as exc:
                success = False
                error = str(exc)
        status = "done" if success else (
            "failed" if row["attempts"] >= self.args.max_attempts else "queued"
        )
        with self.db:
            self.db.execute("""UPDATE jobs SET status=?, result=?, error=?,
                assignment=NULL, lease=0, updated=? WHERE id=? AND assignment=?""",
                            (status, json.dumps(result, allow_nan=False) if success else None,
                             None if success else error, time.time(), job_id, assignment))
        client.assigned.pop(job_id, None)
        if status in ("done", "failed"):
            await self.notify(self.db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone())
        await self.schedule()

    async def handle(self, ws):
        client = None
        try:
            hello = json.loads(await asyncio.wait_for(ws.recv(), 10))
            if not isinstance(hello, dict):
                raise ValueError("Registro inválido")
            role = hello.get("role")
            token = hello.get("token", "")
            if (role not in ("master", "slave") or not isinstance(token, str)
                    or not hmac.compare_digest(token.encode(), self.args.token.encode())):
                await ws.close(1008, "Credenciales incorrectas")
                return
            if role == "master":
                run_id = hello.get("run_id", "")
                if not isinstance(run_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", run_id):
                    raise ValueError("Nombre de experimento inválido")
                fingerprint = hello.get("spec_hash", "")
                if not isinstance(fingerprint, str) or not re.fullmatch(r"[0-9a-f]{64}", fingerprint):
                    raise ValueError("Huella del experimento inválida")
                previous = self.db.execute("SELECT spec_hash FROM runs WHERE run_id=?",
                                           (run_id,)).fetchone()
                if previous and previous[0] != fingerprint:
                    raise ValueError("Ese experimento ya utiliza otros parámetros; cambia --run-id")
                if any(c.role == role and c.run_id == run_id for c in self.clients.values()):
                    await ws.close(1008, "Ese experimento ya tiene un maestro conectado")
                    return
                with self.db:
                    self.db.execute("INSERT OR IGNORE INTO runs VALUES (?,?)", (run_id, fingerprint))
                client = Client(role=role, name=run_id, run_id=run_id)
            else:
                name = hello.get("name")
                capacity = hello.get("capacity", 1)
                if not isinstance(name, str) or not 1 <= len(name) <= 80:
                    raise ValueError("Nombre de trabajador inválido")
                if type(capacity) is not int or not 1 <= capacity <= 32:
                    raise ValueError("Capacidad inválida")
                if any(c.role == role and c.name == name for c in self.clients.values()):
                    await ws.close(1008, "Nombre de trabajador duplicado")
                    return
                client = Client(role=role, name=name, capacity=capacity)
            self.clients[ws] = client
            await send(ws, {"type": "registered", "role": role,
                            "heartbeat_s": max(1, min(10, self.args.lease / 3))})
            print(f"Conectado {role}: {client.name}", flush=True)
            if role == "master":
                await self.replay(ws, client.run_id)
            await self.schedule()
            async for raw in ws:
                message = json.loads(raw)
                if not isinstance(message, dict):
                    raise ValueError("El mensaje debe ser un objeto JSON")
                client.seen = time.time()
                kind = message.get("type")
                if role == "master" and kind == "enqueue":
                    await self.enqueue(ws, client, message)
                elif role == "master" and kind == "replay_results":
                    await self.replay(ws, client.run_id)
                elif role == "master" and kind == "ack":
                    job_id = message.get("id")
                    if not isinstance(job_id, str):
                        raise ValueError("Acuse de recibo inválido")
                    with self.db:
                        self.db.execute("""UPDATE jobs SET acknowledged=1 WHERE id=?
                            AND run_id=? AND status IN ('done','failed')""", (job_id, client.run_id))
                elif role == "slave" and kind == "heartbeat":
                    assignments = message.get("assignments")
                    if (not isinstance(assignments, list) or len(assignments) > 32
                            or any(not isinstance(value, str) for value in assignments)):
                        raise ValueError("Latido inválido")
                    active = set(assignments) & set(client.assigned.values())
                    with self.db:
                        self.db.executemany("""UPDATE jobs SET lease=? WHERE assignment=?
                            AND status='running'""",
                                            [(time.time() + self.args.lease, value) for value in active])
                elif role == "slave" and kind in ("result", "failed"):
                    await self.accept_result(client, message)
                else:
                    raise ValueError("Tipo de mensaje no permitido para este cliente")
        except (ValueError, TypeError, KeyError) as exc:
            try:
                await send(ws, {"type": "error", "error": str(exc)[:500]})
                await ws.close(1008, "Mensaje inválido")
            except ConnectionClosed:
                pass
        except (ConnectionClosed, TimeoutError):
            pass
        finally:
            self.clients.pop(ws, None)
            if client:
                with self.db:
                    for job_id, assignment in client.assigned.items():
                        self.db.execute("""UPDATE jobs SET status='queued', worker=NULL,
                            assignment=NULL, lease=0, updated=? WHERE id=?
                            AND status='running' AND assignment=?""",
                                        (time.time(), job_id, assignment))
                print(f"Desconectado {client.role}: {client.name}", flush=True)
                await self.schedule()

    def stats(self, run_id=None):
        runs = [row[0] for row in self.db.execute(
            "SELECT run_id FROM jobs GROUP BY run_id ORDER BY MAX(updated) DESC LIMIT 100"
        )]
        run_id = run_id or (runs[0] if runs else None)
        counts = {status: 0 for status in ("queued", "running", "done", "failed")}
        if run_id:
            counts.update({row[0]: row[1] for row in self.db.execute(
                "SELECT status,COUNT(*) FROM jobs WHERE run_id=? GROUP BY status", (run_id,)
            )})
        records = [(json.loads(row[0]), json.loads(row[1])) for row in self.db.execute(
            "SELECT config,result FROM jobs WHERE run_id=? AND status='done'", (run_id,)
        )]
        return {"run_id": run_id, "runs": runs, "counts": counts,
                "workers": [{"name": client.name, "busy": len(client.assigned),
                             "capacity": client.capacity,
                             "last_seen_s": round(time.time() - client.seen, 1)}
                            for client in self.clients.values() if client.role == "slave"],
                "masters": sum(c.role == "master" for c in self.clients.values()),
                "ranking": summarize(records)}

    async def monitor(self, reader, writer):
        try:
            request = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 5)
            lines = request.decode("latin1").split("\r\n")
            method, target, _ = lines[0].split(" ", 2)
            headers = {key.strip().lower(): value.strip()
                       for line in lines[1:] if ":" in line
                       for key, value in [line.split(":", 1)]}
            url = urlsplit(target)
            status, content_type, body = "200 OK", "text/html; charset=utf-8", HTML.encode()
            if method != "GET":
                status, body = "405 Method Not Allowed", b"GET only"
            elif url.path == "/api":
                expected = "Bearer " + self.args.token
                authorized = not self.args.token or hmac.compare_digest(
                    headers.get("authorization", "").encode(), expected.encode()
                )
                content_type = "application/json; charset=utf-8"
                if authorized:
                    run_id = parse_qs(url.query).get("run_id", [None])[0]
                    body = json.dumps(self.stats(run_id), ensure_ascii=False, allow_nan=False).encode()
                else:
                    status, body = "401 Unauthorized", b'{"error":"Token incorrecto"}'
            elif url.path != "/":
                status, body = "404 Not Found", b"Not found"
            writer.write((f"HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\n"
                          f"Content-Length: {len(body)}\r\nCache-Control: no-store\r\n"
                          "Connection: close\r\n\r\n").encode() + body)
            await writer.drain()
        except (ValueError, OSError, TimeoutError, asyncio.IncompleteReadError,
                asyncio.LimitOverrunError):
            pass
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except OSError:
                pass

    async def ticker(self):
        while True:
            await self.schedule()
            await asyncio.sleep(1)


HTML = """<!doctype html>
<html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Laboratorio de simulaciones</title>
<style>
:root{font:16px system-ui;color:#e7edf7;background:#101827;color-scheme:dark}
body{max-width:1120px;margin:38px auto;padding:0 22px}h1{font-size:2rem;margin-bottom:6px}
p,small{color:#aebdd1}header{border-bottom:1px solid #344156;padding-bottom:22px}
.controls,.cards{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0;align-items:center}
input,select,button{font:inherit;padding:10px;border:1px solid #415470;border-radius:8px;background:#1b293e;color:inherit}
button{cursor:pointer;background:#224f60}.card{background:#1b293e;padding:20px;border-radius:12px;flex:1;min-width:120px}
.card strong{font-size:2rem;display:block}.card span{color:#aebdd1}.table-wrap{overflow:auto}
table{border-collapse:collapse;width:100%;background:#1b293e}td,th{padding:13px;text-align:left;border-bottom:1px solid #344156;white-space:nowrap}
.bar{display:inline-block;background:#58c4ac;height:9px;border-radius:6px;margin-left:12px;vertical-align:middle}
#status{color:#7de1c9}h2{margin-top:32px;font-size:1.25rem}.note{line-height:1.6}
</style>
<header><small>PROGRAMACIÓN DE SERVICIOS Y PROCESOS</small><h1>Laboratorio de simulaciones</h1>
<p>Un cruce, cuatro accesos y experimentos repartidos entre varios equipos.</p></header>
<div class="controls"><label for="token">Token</label><input id="token" type="password" placeholder="Solo si se ha configurado">
<button id="connect">Conectar</button><label for="run">Experimento</label><select id="run"><option value="">Más reciente</option></select></div>
<p id="status" role="status">Conectando con el laboratorio…</p><div id="cards" class="cards"></div>
<h2>Trabajadores conectados</h2><div class="table-wrap"><table><thead><tr><th>Equipo</th><th>Procesos ocupados</th><th>Último mensaje</th></tr></thead><tbody id="workers"></tbody></table></div>
<h2>Comparación de semáforos</h2><p>Ordenada por menor espera media acumulada. Los resultados se actualizan cada segundo.</p>
<div class="table-wrap"><table><thead><tr><th>Verde N/S</th><th>Verde E/O</th><th>Réplicas</th><th>Espera media</th><th>Completados</th></tr></thead><tbody id="ranking"></tbody></table></div>
<p class="note">Modelo inicial: un carril por acceso, movimientos rectos y llegadas aleatorias.
La espera incluye la acumulada por los vehículos que siguen en cola al terminar.
Cada réplica ejecuta segundos virtuales; el monitor muestra el reparto real de trabajos.</p>
<script>
const $ = id => document.getElementById(id);
let token = sessionStorage.getItem('lab_token') || '';
$('token').value = token;
function cell(row, value) { const td = document.createElement('td'); td.textContent = value; row.append(td); return td; }
function message(text) { const row = document.createElement('tr'); const td = cell(row, text); td.colSpan = 5; return row; }
let refreshing = false;
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const selected = $('run').value;
    const response = await fetch('/api' + (selected ? '?run_id=' + encodeURIComponent(selected) : ''),
      {headers: token ? {Authorization: 'Bearer ' + token} : {}});
    if (!response.ok) throw Error(response.status === 401 ? 'Introduce el token del servidor y pulsa Conectar.' : 'No se pudo consultar el servidor.');
    const data = await response.json();
    const options = [new Option('Más reciente', ''), ...data.runs.map(id => new Option(id, id))];
    $('run').replaceChildren(...options); $('run').value = selected;
    $('status').textContent = data.run_id ? 'Experimento: ' + data.run_id + ' · Maestros conectados: ' + data.masters : 'Esperando el primer experimento. Ejecuta master.py para empezar.';
    const labels = {queued:'En cola', running:'En ejecución', done:'Completadas', failed:'Fallidas'};
    $('cards').replaceChildren(...Object.entries(labels).map(([key, label]) => {
      const card = document.createElement('div'); card.className = 'card';
      const count = document.createElement('strong'); count.textContent = data.counts[key];
      const title = document.createElement('span'); title.textContent = label; card.append(count, title); return card;
    }));
    $('workers').replaceChildren(...(data.workers.length ? data.workers.map(worker => {
      const row = document.createElement('tr'); cell(row, worker.name); cell(row, worker.busy + '/' + worker.capacity); cell(row, worker.last_seen_s + ' s'); return row;
    }) : [message('Sin trabajadores. Ejecuta slave.py en uno o varios equipos.')]));
    const maximum = Math.max(1, ...data.ranking.map(item => item.mean_wait_s));
    $('ranking').replaceChildren(...(data.ranking.length ? data.ranking.map(item => {
      const row = document.createElement('tr'); cell(row, item.green_ns_s + ' s'); cell(row, item.green_ew_s + ' s'); cell(row, item.runs);
      const wait = cell(row, item.mean_wait_s.toFixed(2) + ' s'); const bar = document.createElement('span'); bar.className = 'bar'; bar.style.width = (100 * item.mean_wait_s / maximum) + 'px'; wait.append(bar);
      cell(row, item.completion_pct.toFixed(2) + '%'); return row;
    }) : [message('La comparación aparecerá al completar las primeras simulaciones.')]));
  } catch (error) { $('status').textContent = error.message; }
  finally { refreshing = false; }
}
$('connect').onclick = () => { token = $('token').value; sessionStorage.setItem('lab_token', token); refresh(); };
$('run').onchange = refresh;
refresh(); setInterval(refresh, 1000);
</script></html>"""


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--monitor-port", type=int, default=8766)
    parser.add_argument("--db", type=Path, default=BASE / "datos" / "cola.sqlite3")
    parser.add_argument("--lease", type=int, default=30, help="Segundos sin latidos antes de reasignar")
    parser.add_argument("--max-attempts", type=int, default=3)
    parser.add_argument("--token", default=os.environ.get("LAB_TOKEN", ""))
    args = parser.parse_args()
    if not (1 <= args.port <= 65535 and 1 <= args.monitor_port <= 65535):
        parser.error("Los puertos deben estar entre 1 y 65535")
    if args.port == args.monitor_port:
        parser.error("WebSocket y monitor necesitan puertos distintos")
    if not 3 <= args.lease <= 3600 or not 1 <= args.max_attempts <= 10:
        parser.error("--lease: 3 a 3600; --max-attempts: 1 a 10")
    if args.host not in ("127.0.0.1", "localhost", "::1") and not args.token:
        parser.error("Para escuchar en la red configura LAB_TOKEN o --token")
    return args


async def main(args):
    broker = Broker(args)
    try:
        async with serve(broker.handle, args.host, args.port, max_size=1024 * 1024,
                         close_timeout=5), await asyncio.start_server(
                             broker.monitor, args.host, args.monitor_port, limit=8192):
            print(f"Broker: ws://{args.host}:{args.port}\n"
                  f"Monitor: http://{args.host}:{args.monitor_port}", flush=True)
            try:
                await broker.ticker()
            finally:
                broker.stopping = True
    finally:
        broker.db.close()


if __name__ == "__main__":
    try:
        asyncio.run(main(parse_args()))
    except KeyboardInterrupt:
        print("Servidor detenido. La cola permanece guardada.")
    except (OSError, sqlite3.Error) as error:
        raise SystemExit(str(error)) from error
