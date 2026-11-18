#!/usr/bin/env python3
"""Servidor de la granja de render: cola SQLite, escenas, PNG y monitor web."""

import argparse
import asyncio
from dataclasses import dataclass, field
import hmac
import math
import os
from pathlib import Path
import sqlite3
import time
from urllib.parse import parse_qs, urlsplit
import uuid

from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed

from protocolo import (BASE, MAX_MESSAGE, MAX_PNG, MAX_SCENE, atomic_write, canonical,
                       decode, digest, encode, frame_path, job_id, message, send,
                       validate_name, validate_png, validate_spec)
import json
from paquetes import PackageReceiver, send_package


@dataclass
class Client:
    role: str
    name: str
    run_id: str = ""
    capacity: int = 0
    version: str = ""
    assigned: dict = field(default_factory=dict)
    assets: set = field(default_factory=set)
    pending_asset: str = ""
    seen: float = field(default_factory=time.time)


class Broker:
    def __init__(self, args):
        self.args = args
        args.data.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(args.data / "cola.sqlite3")
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA busy_timeout=5000")
        self.db.execute("CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, spec TEXT NOT NULL)")
        self.db.execute("""CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, run_id TEXT NOT NULL, frame INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued', worker TEXT, assignment TEXT,
            attempts INTEGER NOT NULL DEFAULT 0, lease REAL NOT NULL DEFAULT 0,
            result TEXT, error TEXT, acknowledged INTEGER NOT NULL DEFAULT 0,
            updated REAL NOT NULL, UNIQUE(run_id,frame)
        )""")
        self.db.execute("CREATE INDEX IF NOT EXISTS dispatch ON jobs(status,updated)")
        self.db.execute("CREATE INDEX IF NOT EXISTS run_jobs ON jobs(run_id,frame)")
        self.db.execute("UPDATE jobs SET status='queued',worker=NULL,assignment=NULL,lease=0 "
                        "WHERE status='running'")
        self.db.commit()
        self.clients = {}
        self.lock = asyncio.Lock()
        self.stopping = False

    def spec(self, run_id):
        row = self.db.execute("SELECT spec FROM runs WHERE id=?", (run_id,)).fetchone()
        if row is None:
            raise ValueError("Animación desconocida")
        return json.loads(row[0])

    def scene_path(self, checksum, source="blend"):
        return self.args.data / "escenas" / (checksum + (".zip" if source == "package" else ".blend"))

    def png_path(self, run_id, frame):
        return frame_path(self.args.data / "fotogramas" / run_id, frame)

    def terminal(self, row):
        payload = {"id": row["id"], "run_id": row["run_id"], "frame": row["frame"],
                   "worker": row["worker"], "error": row["error"],
                   "type": "result" if row["status"] == "done" else "failed"}
        if row["status"] == "done":
            metadata = json.loads(row["result"])
            data = self.png_path(row["run_id"], row["frame"]).read_bytes()
            validate_png(data, self.spec(row["run_id"]), metadata["sha256"])
            payload.update(**metadata, image=encode(data))
        return payload

    async def notify(self, row):
        recipients = [ws for ws, client in self.clients.items()
                      if client.role == "master" and client.run_id == row["run_id"]]
        if recipients:
            payload = self.terminal(row)
            for ws in recipients:
                try:
                    await send(ws, payload)
                except ConnectionClosed:
                    pass

    async def replay(self, ws, run_id):
        rows = self.db.execute("SELECT * FROM jobs WHERE run_id=? "
                               "AND status IN ('done','failed') ORDER BY frame", (run_id,)).fetchall()
        for row in rows:
            try:
                payload = self.terminal(row)
            except (OSError, ValueError):
                # Una caché borrada no debe presentar un trabajo como recuperable.
                with self.db:
                    self.db.execute("""UPDATE jobs SET status='queued',result=NULL,
                        attempts=0,acknowledged=0,updated=? WHERE id=?""", (time.time(), row["id"]))
                continue
            await send(ws, payload)

    async def schedule(self):
        if self.stopping:
            return
        notifications, expired_clients = [], set()
        async with self.lock:
            now = time.time()
            expired = self.db.execute("SELECT * FROM jobs WHERE status='running' AND lease<=?",
                                      (now,)).fetchall()
            for row in expired:
                expired_clients.update(ws for ws, client in self.clients.items()
                                       if client.assigned.get(row["id"]) == row["assignment"])
                self.db.execute("""UPDATE jobs SET status='queued',worker=NULL,assignment=NULL,
                    error='Latido caducado',updated=? WHERE id=?""", (now, row["id"]))
            exhausted = self.db.execute("SELECT id FROM jobs WHERE status='queued' AND attempts>=?",
                                        (self.args.max_attempts,)).fetchall()
            for row in exhausted:
                self.db.execute("UPDATE jobs SET status='failed',error=COALESCE(error,'Intentos agotados'),"
                                "updated=? WHERE id=?", (now, row["id"]))
                notifications.append(self.db.execute("SELECT * FROM jobs WHERE id=?", (row["id"],)).fetchone())
            self.db.commit()
            for ws, client in list(self.clients.items()):
                if client.role != "slave" or ws in expired_clients or client.pending_asset:
                    continue
                while len(client.assigned) < client.capacity:
                    row = self.db.execute("""SELECT jobs.*,runs.spec FROM jobs JOIN runs
                        ON jobs.run_id=runs.id WHERE status='queued' AND attempts<?
                        ORDER BY updated,frame LIMIT 1""", (self.args.max_attempts,)).fetchone()
                    if row is None:
                        break
                    spec = json.loads(row["spec"])
                    try:
                        if spec["scene_sha"] and spec["scene_sha"] not in client.assets:
                            path = self.scene_path(spec["scene_sha"], spec["source"])
                            if spec["source"] == "package":
                                client.pending_asset = spec["scene_sha"]
                                await send_package(ws, path, spec["scene_sha"], send)
                                break  # Asignar el primer frame cuando confirme la extracción.
                            else:
                                data = path.read_bytes()
                                await send(ws, {"type": "scene", "sha256": spec["scene_sha"], "data": encode(data)})
                            client.assets.add(spec["scene_sha"])
                        assignment = uuid.uuid4().hex
                        with self.db:
                            self.db.execute("""UPDATE jobs SET status='running',worker=?,assignment=?,
                                attempts=attempts+1,lease=?,updated=? WHERE id=?""",
                                            (client.name, assignment, time.time() + self.args.lease,
                                             time.time(), row["id"]))
                        client.assigned[row["id"]] = assignment
                        await send(ws, {"type": "job", "id": row["id"], "frame": row["frame"],
                                        "assignment": assignment, "spec": spec})
                    except ConnectionClosed:
                        break
                    except OSError as exc:
                        with self.db:
                            self.db.execute("UPDATE jobs SET status='failed',error=?,updated=? WHERE id=?",
                                            (f"Escena no disponible: {exc}", time.time(), row["id"]))
                        notifications.append(self.db.execute("SELECT * FROM jobs WHERE id=?", (row["id"],)).fetchone())
        for ws in expired_clients:
            await ws.close(1012, "Latido caducado; vuelve a conectar")
        for row in notifications:
            await self.notify(row)

    async def enqueue(self, ws, client, payload):
        frames = payload.get("frames")
        spec = self.spec(client.run_id)
        if (not isinstance(frames, list) or not 1 <= len(frames) <= 10
                or any(type(frame) is not int or not spec["start"] <= frame <= spec["end"] for frame in frames)):
            raise ValueError("Envía entre 1 y 10 fotogramas válidos por lote")
        if spec["scene_sha"] and not self.scene_path(spec["scene_sha"], spec["source"]).is_file():
            raise ValueError("Primero debe enviarse la escena o paquete")
        with self.db:
            for frame in frames:
                self.db.execute("INSERT OR IGNORE INTO jobs(id,run_id,frame,updated) VALUES (?,?,?,?)",
                                (job_id(client.run_id, spec, frame), client.run_id, frame, time.time()))
        await send(ws, {"type": "enqueued", "frames": frames})
        await self.schedule()

    async def accept_result(self, client, payload):
        identifier, assignment = payload.get("id"), payload.get("assignment")
        if not isinstance(identifier, str) or client.assigned.get(identifier) != assignment:
            return
        row = self.db.execute("SELECT * FROM jobs WHERE id=? AND status='running' AND assignment=?",
                              (identifier, assignment)).fetchone()
        if row is None:
            return
        success, metadata = payload.get("type") == "result", None
        error = str(payload.get("error") or "Error del trabajador")[:1000]
        if success:
            try:
                data = decode(payload.get("image"), MAX_PNG)
                checksum = validate_png(data, self.spec(row["run_id"]), payload.get("sha256"))
                render_s = payload.get("render_s")
                if type(render_s) not in (int, float) or not math.isfinite(render_s) or render_s < 0:
                    raise ValueError("Tiempo de render inválido")
                metadata = {"sha256": checksum, "render_s": render_s}
                atomic_write(self.png_path(row["run_id"], row["frame"]), data)
            except (ValueError, OSError) as exc:
                success, error = False, str(exc)
        status = "done" if success else ("failed" if row["attempts"] >= self.args.max_attempts else "queued")
        with self.db:
            self.db.execute("""UPDATE jobs SET status=?,result=?,error=?,assignment=NULL,
                lease=0,updated=? WHERE id=? AND assignment=?""",
                            (status, canonical(metadata) if success else None, None if success else error,
                             time.time(), identifier, assignment))
        client.assigned.pop(identifier, None)
        if status in ("done", "failed"):
            await self.notify(self.db.execute("SELECT * FROM jobs WHERE id=?", (identifier,)).fetchone())
        await self.schedule()

    async def handle(self, ws):
        client = None
        receiver = PackageReceiver(self.args.data / "escenas")
        try:
            hello = message(await asyncio.wait_for(ws.recv(), 15))
            role, token = hello.get("role"), hello.get("token", "")
            if (role not in ("master", "slave") or not isinstance(token, str)
                    or not hmac.compare_digest(token.encode(), self.args.token.encode())):
                await ws.close(1008, "Credenciales incorrectas")
                return
            if role == "master":
                run_id = validate_name(hello.get("run_id"))
                spec = canonical(validate_spec(hello.get("spec")))
                previous = self.db.execute("SELECT spec FROM runs WHERE id=?", (run_id,)).fetchone()
                if previous and previous[0] != spec:
                    raise ValueError("Esa animación ya tiene otros parámetros; cambia --run-id")
                if any(c.role == role and c.run_id == run_id for c in self.clients.values()):
                    raise ValueError("Esa animación ya tiene un maestro conectado")
                with self.db:
                    self.db.execute("INSERT OR IGNORE INTO runs VALUES (?,?)", (run_id, spec))
                client = Client(role, run_id, run_id=run_id)
            else:
                name, capacity = hello.get("name"), hello.get("capacity")
                if not isinstance(name, str) or not 1 <= len(name) <= 80:
                    raise ValueError("Nombre de trabajador inválido")
                if type(capacity) is not int or not 1 <= capacity <= 8:
                    raise ValueError("Capacidad inválida (1 a 8)")
                if any(c.role == role and c.name == name for c in self.clients.values()):
                    raise ValueError("Nombre de trabajador duplicado")
                client = Client(role, name, capacity=capacity, version=str(hello.get("blender_version", ""))[:100])
            self.clients[ws] = client
            spec = self.spec(client.run_id) if role == "master" else None
            await send(ws, {"type": "registered", "heartbeat_s": max(1, min(10, self.args.lease / 3)),
                            "needs_scene": bool(spec and spec["scene_sha"]
                                                and not self.scene_path(spec["scene_sha"], spec["source"]).is_file())})
            print(f"Conectado {role}: {client.name}", flush=True)
            if role == "master":
                await self.replay(ws, client.run_id)
            await self.schedule()
            async for raw in ws:
                payload = message(raw)
                kind = payload.get("type")
                client.seen = time.time()
                if role == "master" and kind == "asset_begin":
                    spec = self.spec(client.run_id)
                    if spec["source"] != "package":
                        raise ValueError("La animación no utiliza un paquete")
                    receiver.begin(payload, expected=spec["scene_sha"])
                elif role == "master" and kind == "asset_chunk":
                    receiver.chunk(payload)
                elif role == "master" and kind == "asset_end":
                    receiver.finish()
                    await send(ws, {"type": "scene_ready"})
                elif role == "master" and kind == "scene":
                    if self.spec(client.run_id)["source"] != "blend":
                        raise ValueError("La animación requiere un paquete de recursos")
                    data = decode(payload.get("data"), MAX_SCENE)
                    checksum = self.spec(client.run_id)["scene_sha"]
                    if not checksum or digest(data) != checksum:
                        raise ValueError("La escena no coincide con la huella del proyecto")
                    atomic_write(self.scene_path(checksum), data)
                    await send(ws, {"type": "scene_ready"})
                elif role == "master" and kind == "enqueue":
                    await self.enqueue(ws, client, payload)
                elif role == "master" and kind == "replay_results":
                    await self.replay(ws, client.run_id)
                    await self.schedule()
                elif role == "master" and kind == "ack":
                    if not isinstance(payload.get("id"), str):
                        raise ValueError("Acuse inválido")
                    with self.db:
                        self.db.execute("UPDATE jobs SET acknowledged=1 WHERE id=? AND run_id=? "
                                        "AND status IN ('done','failed')", (payload["id"], client.run_id))
                elif role == "slave" and kind == "heartbeat":
                    assignments = payload.get("assignments")
                    if (not isinstance(assignments, list) or len(assignments) > 8
                            or any(not isinstance(value, str) for value in assignments)):
                        raise ValueError("Latido inválido")
                    with self.db:
                        self.db.executemany("UPDATE jobs SET lease=? WHERE assignment=? AND status='running'",
                                            [(time.time() + self.args.lease, value)
                                             for value in set(assignments) & set(client.assigned.values())])
                elif role == "slave" and kind == "asset_ready":
                    if not client.pending_asset or payload.get("sha256") != client.pending_asset:
                        raise ValueError("Confirmación de paquete inesperada")
                    client.assets.add(client.pending_asset)
                    client.pending_asset = ""
                    await self.schedule()
                elif role == "slave" and kind in ("result", "failed"):
                    await self.accept_result(client, payload)
                else:
                    raise ValueError("Mensaje no permitido para este cliente")
        except (ValueError, TypeError, KeyError) as exc:
            try:
                await send(ws, {"type": "error", "error": str(exc)[:1000]})
                await ws.close(1008, "Petición inválida")
            except ConnectionClosed:
                pass
        except (ConnectionClosed, TimeoutError):
            pass
        finally:
            receiver.abort()
            self.clients.pop(ws, None)
            if client:
                with self.db:
                    for identifier, assignment in client.assigned.items():
                        self.db.execute("UPDATE jobs SET status='queued',worker=NULL,assignment=NULL,"
                                        "lease=0,updated=? WHERE id=? AND status='running' AND assignment=?",
                                        (time.time(), identifier, assignment))
                print(f"Desconectado {client.role}: {client.name}", flush=True)
                await self.schedule()

    def stats(self, run_id=None):
        runs = [row[0] for row in self.db.execute("SELECT id FROM runs ORDER BY rowid DESC LIMIT 100")]
        run_id = run_id or (runs[0] if runs else None)
        spec = self.spec(run_id) if run_id else None
        rows = self.db.execute("SELECT frame,status,worker,result,error FROM jobs WHERE run_id=? ORDER BY frame",
                               (run_id,)).fetchall()
        counts = {key: 0 for key in ("queued", "running", "done", "failed")}
        frames, render_s = [], 0
        for row in rows:
            counts[row["status"]] += 1
            result = json.loads(row["result"]) if row["result"] else {}
            render_s += result.get("render_s", 0)
            frames.append({"frame": row["frame"], "status": row["status"], "worker": row["worker"],
                           "render_s": result.get("render_s"), "error": row["error"]})
        done = [row["frame"] for row in rows if row["status"] == "done"]
        return {"run_id": run_id, "runs": runs, "spec": spec, "counts": counts,
                "total": spec["end"] - spec["start"] + 1 if spec else 0,
                "frames": frames, "preview_frame": done[-1] if done else None,
                "render_s_sum": round(render_s, 2),
                "workers": [{"name": c.name, "busy": len(c.assigned), "capacity": c.capacity,
                             "blender": c.version, "last_seen_s": round(time.time() - c.seen, 1)}
                            for c in self.clients.values() if c.role == "slave"]}

    async def monitor(self, reader, writer):
        try:
            request = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 5)
            lines = request.decode("latin1").split("\r\n")
            method, target, _ = lines[0].split(" ", 2)
            url = urlsplit(target)
            query = parse_qs(url.query)
            headers = {key.strip().lower(): value.strip() for line in lines[1:] if ":" in line
                       for key, value in [line.split(":", 1)]}
            authorized = not self.args.token or hmac.compare_digest(
                headers.get("authorization", "").encode(), ("Bearer " + self.args.token).encode())
            status, kind, body = "200 OK", "text/html; charset=utf-8", HTML.encode()
            if method != "GET":
                status, body = "405 Method Not Allowed", b"GET only"
            elif url.path in ("/api", "/frame") and not authorized:
                status, body = "401 Unauthorized", b"Token incorrecto"
            elif url.path == "/api":
                kind = "application/json; charset=utf-8"
                body = canonical(self.stats(query.get("run_id", [None])[0])).encode()
            elif url.path == "/frame":
                run_id = validate_name(query.get("run_id", [None])[0])
                frame = int(query.get("frame", [""])[0])
                spec = self.spec(run_id)
                if not spec["start"] <= frame <= spec["end"]:
                    raise ValueError("Fotograma fuera de intervalo")
                body = self.png_path(run_id, frame).read_bytes()
                kind = "image/png"
            elif url.path != "/":
                status, body = "404 Not Found", b"Not found"
            writer.write((f"HTTP/1.1 {status}\r\nContent-Type: {kind}\r\nContent-Length: {len(body)}\r\n"
                          "Cache-Control: no-store\r\nConnection: close\r\n\r\n").encode() + body)
            await writer.drain()
        except (ValueError, FileNotFoundError) as exc:
            body = canonical({"error": str(exc)}).encode()
            status = "404 Not Found" if isinstance(exc, FileNotFoundError) else "400 Bad Request"
            writer.write((f"HTTP/1.1 {status}\r\nContent-Type: application/json; charset=utf-8\r\n"
                          f"Content-Length: {len(body)}\r\nConnection: close\r\n\r\n").encode() + body)
            try:
                await writer.drain()
            except OSError:
                pass
        except (OSError, TimeoutError, asyncio.IncompleteReadError, asyncio.LimitOverrunError):
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


HTML = """<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Renderizador de animaciones 3D</title><style>
:root{font:16px system-ui;color:#e8edf6;background:#101620;color-scheme:dark}body{max-width:1160px;margin:36px auto;padding:0 22px}
h1{margin-bottom:8px}p,small{color:#a7b6cb}.controls,.cards{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0;align-items:center}
input,select,button{font:inherit;border:1px solid #3b5067;border-radius:8px;background:#1c293a;color:inherit;padding:10px}button{cursor:pointer}
.card{background:#1c293a;padding:18px;border-radius:12px;flex:1;min-width:100px}.card strong{display:block;font-size:1.9rem}
progress{width:100%;height:20px;accent-color:#63d6c1}.layout{display:grid;grid-template-columns:1.3fr 1fr;gap:24px}
#preview{width:100%;aspect-ratio:16/9;object-fit:contain;background:#080e16;border-radius:12px}table{width:100%;border-collapse:collapse}
td,th{padding:10px;text-align:left;border-bottom:1px solid #35455c}#frames{display:flex;flex-wrap:wrap;gap:5px;margin:20px 0}
.frame{font-size:12px;background:#344055;padding:6px;border-radius:4px;min-width:25px;text-align:center}.done{background:#246656}.running{background:#916f22}.failed{background:#8c3446}
#status{color:#7de1c9}.scroll{overflow:auto}@media(max-width:800px){.layout{grid-template-columns:1fr}}
</style><small>PROGRAMACIÓN DE SERVICIOS Y PROCESOS · GRANJA DE RENDER</small><h1>Renderizador de animaciones 3D</h1>
<p>Cada equipo renderiza fotogramas independientes. El maestro los reúne y construye la animación.</p>
<div class="controls"><label for="token">Token</label><input id="token" type="password" placeholder="Opcional en local"><button id="connect">Conectar</button>
<label for="run">Animación</label><select id="run"><option value="">Más reciente</option></select></div>
<p id="status" role="status">Conectando…</p><progress id="progress" value="0" max="1"></progress><div id="cards" class="cards"></div>
<div class="layout"><section><h2>Vista del último fotograma disponible</h2><img id="preview" alt="Aquí aparecerá un fotograma renderizado" hidden><p id="caption">Esperando el primer render.</p></section>
<section><h2>Trabajadores</h2><div class="scroll"><table><thead><tr><th>Equipo</th><th>Renders</th><th>Blender</th></tr></thead><tbody id="workers"></tbody></table></div></section></div>
<h2>Fotogramas</h2><p>Verde: terminado · Amarillo: renderizando · Gris: en cola · Rojo: fallido</p><div id="frames"></div>
<p>Al terminar, abre <code>resultados/&lt;animación&gt;/animacion.gif</code> en el equipo del maestro (o el MP4 si elegiste ese formato).</p>
<script>
const $ = id => document.getElementById(id);
let token = sessionStorage.getItem('render_token') || '', busy = false, previewKey = '', objectUrl = '';
$('token').value = token;
function cell(row, value) { const td=document.createElement('td'); td.textContent=value; row.append(td); }
async function refresh() {
 if (busy) return; busy=true;
 try {
  const selected=$('run').value, headers=token?{Authorization:'Bearer '+token}:{};
  const response=await fetch('/api'+(selected?'?run_id='+encodeURIComponent(selected):''),{headers});
  if (!response.ok) throw Error(response.status===401?'Introduce el token y pulsa Conectar.':'El servidor no responde.');
  const data=await response.json();
  $('run').replaceChildren(new Option('Más reciente',''),...data.runs.map(id=>new Option(id,id))); $('run').value=selected;
  $('status').textContent=data.run_id?data.run_id+' · '+data.counts.done+'/'+data.total+' fotogramas · '+data.spec.width+' × '+data.spec.height+' · '+data.spec.fps+' FPS':'Esperando la primera animación. Ejecuta master.py.';
  $('progress').max=Math.max(1,data.total); $('progress').value=data.counts.done;
  const labels={queued:'En cola',running:'Renderizando',done:'Terminados',failed:'Fallidos'};
  $('cards').replaceChildren(...Object.entries(labels).map(([key,label])=>{const c=document.createElement('div'); c.className='card';const n=document.createElement('strong');n.textContent=data.counts[key];const t=document.createElement('span');t.textContent=label;c.append(n,t);return c;}));
  $('workers').replaceChildren(...data.workers.map(w=>{const row=document.createElement('tr');cell(row,w.name);cell(row,w.busy+'/'+w.capacity);cell(row,w.blender);return row;}));
  $('frames').replaceChildren(...data.frames.map(f=>{const item=document.createElement('span');item.className='frame '+f.status;item.textContent=f.frame;item.title=(f.worker||'Sin asignar')+(f.render_s?' · '+f.render_s+' s':'')+(f.error?' · '+f.error:'');return item;}));
  const key=data.run_id+':'+data.preview_frame;
  if (data.preview_frame!==null && key!==previewKey) {
   const image=await fetch('/frame?run_id='+encodeURIComponent(data.run_id)+'&frame='+data.preview_frame,{headers});
   if (image.ok) {const next=URL.createObjectURL(await image.blob());$('preview').src=next;$('preview').hidden=false;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=next;previewKey=key;$('caption').textContent='Fotograma '+data.preview_frame+' · Tiempo acumulado de render: '+data.render_s_sum+' s (suma de los trabajadores).';}
  } else if (data.preview_frame===null) {$('preview').hidden=true;$('preview').removeAttribute('src');previewKey='';$('caption').textContent='Esperando el primer render.';}
 } catch(error) {$('status').textContent=error.message;} finally {busy=false;}
}
$('connect').onclick=()=>{token=$('token').value;sessionStorage.setItem('render_token',token);refresh();};$('run').onchange=refresh;
refresh();setInterval(refresh,1500);
</script></html>"""


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8775)
    parser.add_argument("--monitor-port", type=int, default=8776)
    parser.add_argument("--data", type=Path, default=BASE / "datos" / "servidor")
    parser.add_argument("--token", default=os.environ.get("RENDER_TOKEN", ""))
    parser.add_argument("--lease", type=int, default=60)
    parser.add_argument("--max-attempts", type=int, default=3)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535 or not 1 <= args.monitor_port <= 65535 or args.port == args.monitor_port:
        parser.error("Utiliza puertos distintos entre 1 y 65535")
    if not 3 <= args.lease <= 3600 or not 1 <= args.max_attempts <= 10:
        parser.error("--lease: 3 a 3600; --max-attempts: 1 a 10")
    if args.host not in ("127.0.0.1", "localhost", "::1") and not args.token:
        parser.error("Para escuchar en red configura RENDER_TOKEN o --token")
    return args


async def main(args):
    broker = Broker(args)
    try:
        async with serve(broker.handle, args.host, args.port, max_size=MAX_MESSAGE,
                         ping_timeout=60, close_timeout=5), await asyncio.start_server(
                             broker.monitor, args.host, args.monitor_port, limit=8192):
            print(f"Broker: ws://{args.host}:{args.port}\nMonitor: http://{args.host}:{args.monitor_port}", flush=True)
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
        print("Servidor detenido. La cola y los fotogramas permanecen guardados.")
    except (OSError, sqlite3.Error) as error:
        raise SystemExit(str(error)) from error
