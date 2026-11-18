"""Pruebas de protocolo, persistencia, reparto y render real opcional."""

import asyncio
from contextlib import closing
from io import BytesIO
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from PIL import Image
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed

import master
from protocolo import (canonical, decode, digest, encode, frame_path, job_id,
                       message, send, validate_name, validate_png, validate_spec)


SPEC = {"version": 1, "source": "demo", "scene_sha": "", "start": 1, "end": 4,
        "fps": 4, "width": 160, "height": 96, "samples": 1}
BLENDER = os.environ.get("BLENDER_TEST_PATH")
FFMPEG = os.environ.get("FFMPEG_TEST_PATH")


def png(frame=1, spec=None):
    spec = spec or SPEC
    with BytesIO() as stream:
        Image.new("RGB", (spec["width"], spec["height"]),
                  (frame * 47 % 256, frame * 89 % 256, frame * 113 % 256)).save(stream, format="PNG")
        return stream.getvalue()


class ProtocolTests(unittest.TestCase):
    def test_spec_bounds(self):
        self.assertEqual(validate_spec(SPEC), SPEC)
        for key, value in (("end", 1001), ("start", 0), ("fps", 0), ("width", True),
                           ("height", 2161), ("samples", 513), ("scene_sha", "../bad")):
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_spec({**SPEC, key: value})

    def test_run_names_cannot_escape_output(self):
        self.assertEqual(validate_name("orbita-1"), "orbita-1")
        for value in ("../otra", "a/b", "", "a" * 65, None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_name(value)

    def test_files_are_verified(self):
        data = png()
        self.assertEqual(decode(encode(data), 10000), data)
        self.assertEqual(validate_png(data, SPEC, digest(data)), digest(data))
        for bad_data, spec, checksum in ((data, SPEC, "a" * 64), (data, {**SPEC, "width": 200}, None),
                                         (b"fake PNG", SPEC, None)):
            with self.subTest(checksum=checksum), self.assertRaises(ValueError):
                validate_png(bad_data, spec, checksum)
        with self.assertRaises(ValueError):
            decode("not base64!", 100)
        with self.assertRaises(ValueError):
            decode(encode(data), 10)

    def test_identifiers_are_scoped(self):
        self.assertEqual(job_id("one", SPEC, 1), job_id("one", dict(SPEC), 1))
        self.assertNotEqual(job_id("one", SPEC, 1), job_id("two", SPEC, 1))
        self.assertNotEqual(job_id("one", SPEC, 1), job_id("one", SPEC, 2))
        self.assertNotEqual(job_id("one", SPEC, 1), job_id("one", {**SPEC, "samples": 2}, 1))

    def test_gif_uses_numeric_order_and_preserves_changing_colors(self):
        with tempfile.TemporaryDirectory(prefix="render-gif-") as directory:
            folder = Path(directory)
            (folder / "fotogramas").mkdir()
            for frame in (4, 2, 1, 3):
                frame_path(folder / "fotogramas", frame).write_bytes(png(frame))
            path = master.assemble(type("Args", (), {"format": "gif"})(), SPEC, folder)
            with Image.open(path) as animation:
                self.assertEqual(animation.n_frames, 4)
                for index in range(4):
                    animation.seek(index)
                    expected = Image.open(BytesIO(png(index + 1))).getpixel((0, 0))
                    self.assertEqual(animation.convert("RGB").getpixel((0, 0)), expected)

    def test_database_prevents_parameter_collision(self):
        with tempfile.TemporaryDirectory(prefix="render-db-") as directory:
            path = Path(directory) / "master.sqlite3"
            master.open_database(path, "one", SPEC).close()
            with self.assertRaises(ValueError):
                master.open_database(path, "one", {**SPEC, "samples": 2})

    @unittest.skipUnless(FFMPEG, "Configura FFMPEG_TEST_PATH para verificar MP4")
    def test_mp4_contains_all_frames(self):
        with tempfile.TemporaryDirectory(prefix="render-mp4-") as directory:
            folder = Path(directory)
            (folder / "fotogramas").mkdir()
            for frame in range(1, 5):
                frame_path(folder / "fotogramas", frame).write_bytes(png(frame))
            args = type("Args", (), {"format": "mp4", "ffmpeg": FFMPEG})()
            path = master.assemble(args, SPEC, folder)
            result = subprocess.run([FFMPEG, "-v", "error", "-i", path,
                                     "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
                                    capture_output=True, timeout=30,
                                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            self.assertEqual(result.returncode, 0)
            self.assertEqual(len(result.stdout), 4 * SPEC["width"] * SPEC["height"] * 3)

    def test_cli_rejects_invalid_limits(self):
        for args in (("--end", "1001"), ("--window", "0"), ("--fps", "0"),
                     ("--width", "3840", "--height", "2160", "--end", "1000")):
            with self.subTest(args=args):
                result = subprocess.run([sys.executable, str(ROOT / "master.py"), *args],
                                        capture_output=True, timeout=15)
                self.assertEqual(result.returncode, 2)


class ClusterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="render-cluster-")
        self.folder = Path(self.temporary.name)
        self.processes, self.logs, self.sockets = [], [], []
        self.port, self.http = self.free_port(), self.free_port()
        while self.http == self.port:
            self.http = self.free_port()
        self.uri = f"ws://127.0.0.1:{self.port}"
        self.token = "isolated-render-test"
        self.start_server()
        await self.until(lambda: self.stats())

    async def asyncTearDown(self):
        for ws in self.sockets:
            await ws.close()
        for process in reversed(self.processes):
            self.stop(process)
        for stream in self.logs:
            stream.close()
        self.temporary.cleanup()

    @staticmethod
    def free_port():
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            return sock.getsockname()[1]

    def launch(self, script, arguments):
        stream = (self.folder / f"{script}-{len(self.logs)}.log").open("wb")
        self.logs.append(stream)
        process = subprocess.Popen([sys.executable, "-u", str(ROOT / script), *arguments],
                                   cwd=self.folder, stdout=stream, stderr=subprocess.STDOUT,
                                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        self.processes.append(process)
        return process

    def start_server(self):
        self.server = self.launch("server.py", ["--port", str(self.port), "--monitor-port", str(self.http),
                                               "--data", str(self.folder / "server"), "--token", self.token,
                                               "--lease", "3", "--max-attempts", "2"])

    @staticmethod
    def stop(process):
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=15)

    def stats(self, run_id=""):
        target = f"http://127.0.0.1:{self.http}/api" + ("?run_id=" + run_id if run_id else "")
        with urlopen(Request(target, headers={"Authorization": "Bearer " + self.token}), timeout=2) as stream:
            return json.load(stream)

    async def until(self, predicate, timeout=60):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            try:
                result = await asyncio.to_thread(predicate)
                if result:
                    return result
            except OSError:
                pass
            await asyncio.sleep(.05)
        logs = "\n".join(path.read_text(encoding="utf-8", errors="replace")[-2000:]
                         for path in self.folder.glob("*.log"))
        self.fail("Tiempo de espera agotado.\n" + logs)

    def coordinator(self, run_id="test", extra=()):
        return self.launch("master.py", ["--server", self.uri, "--token", self.token,
                                         "--run-id", run_id, "--end", "4", "--fps", "4",
                                         "--width", "160", "--height", "96", "--samples", "1",
                                         "--timeout", "60", "--db", str(self.folder / "master.sqlite3"),
                                         "--output", str(self.folder / "output"), *extra])

    async def worker(self, name="fake"):
        ws = await connect(self.uri, proxy=None)
        self.sockets.append(ws)
        await send(ws, {"role": "slave", "name": name, "capacity": 1, "token": self.token})
        self.assertEqual(message(await ws.recv())["type"], "registered")
        return ws

    async def next_job(self, ws):
        while True:
            payload = message(await asyncio.wait_for(ws.recv(), 15))
            if payload["type"] == "job":
                return payload

    async def answer(self, ws, job, **overrides):
        data = png(job["frame"], job["spec"])
        await send(ws, {"type": "result", "id": job["id"], "assignment": job["assignment"],
                        "image": encode(data), "sha256": digest(data), "render_s": .1, **overrides})

    def jobs(self, run_id="test"):
        with closing(sqlite3.connect(self.folder / "server" / "cola.sqlite3")) as db:
            db.row_factory = sqlite3.Row
            return db.execute("SELECT * FROM jobs WHERE run_id=? ORDER BY frame", (run_id,)).fetchall()

    async def test_authentication(self):
        with self.assertRaises(HTTPError) as denied:
            urlopen(f"http://127.0.0.1:{self.http}/api", timeout=2)
        self.assertEqual(denied.exception.code, 401)
        with self.assertRaises(HTTPError) as unknown:
            urlopen(Request(f"http://127.0.0.1:{self.http}/api?run_id=unknown",
                            headers={"Authorization": "Bearer " + self.token}), timeout=2)
        self.assertEqual(unknown.exception.code, 400)
        async with connect(self.uri, proxy=None) as ws:
            await send(ws, {"role": "slave", "name": "bad", "capacity": 1, "token": "wrong"})
            with self.assertRaises(ConnectionClosed) as closed:
                await ws.recv()
            self.assertEqual(closed.exception.rcvd.code, 1008)

    async def test_delivery_recovery_and_local_resume(self):
        coordinator = self.coordinator()
        await self.until(lambda: self.stats("test")["counts"]["queued"] == 4)
        interrupted = await self.worker("interrupted")
        first = await self.next_job(interrupted)
        await interrupted.close()
        await self.until(lambda: self.stats("test")["counts"]["queued"] == 4)
        worker = await self.worker()
        for _ in range(4):
            await self.answer(worker, await self.next_job(worker))
        await self.until(lambda: coordinator.poll() is not None)
        self.assertEqual(coordinator.returncode, 0)
        self.assertEqual(next(row for row in self.jobs() if row["id"] == first["id"])["attempts"], 2)
        attempts = [row["attempts"] for row in self.jobs()]
        output = self.folder / "output" / "test"
        with Image.open(output / "animacion.gif") as animation:
            self.assertEqual(animation.n_frames, 4)
        url = f"http://127.0.0.1:{self.http}/frame?run_id=test&frame=1"
        with urlopen(Request(url, headers={"Authorization": "Bearer " + self.token}), timeout=2) as stream:
            self.assertEqual(stream.read(), png(1))
        frame_path(output / "fotogramas", 2).unlink()
        resumed = self.coordinator()
        await self.until(lambda: resumed.poll() is not None)
        self.assertEqual(resumed.returncode, 0)
        self.assertEqual(frame_path(output / "fotogramas", 2).read_bytes(), png(2))
        self.assertEqual([row["attempts"] for row in self.jobs()], attempts)
        repeated = self.coordinator()
        await self.until(lambda: repeated.poll() is not None)
        self.assertEqual(repeated.returncode, 0)
        self.assertEqual([row["attempts"] for row in self.jobs()], attempts)

    async def test_terminal_failures_finish_without_partial_animation(self):
        coordinator = self.coordinator(extra=("--end", "1"))
        await self.until(lambda: self.stats("test")["counts"]["queued"] == 1)
        ws = await self.worker()
        for _ in range(2):
            job = await self.next_job(ws)
            await send(ws, {"type": "failed", "id": job["id"], "assignment": job["assignment"],
                            "error": "Fallo provocado por la prueba"})
        await self.until(lambda: coordinator.poll() is not None)
        self.assertEqual(coordinator.returncode, 1)
        report = json.loads((self.folder / "output" / "test" / "resumen.json").read_text(encoding="utf-8"))
        self.assertEqual(report["failed"], 1)
        self.assertFalse((self.folder / "output" / "test" / "animacion.gif").exists())

    async def test_restart_and_stale_assignment(self):
        coordinator = self.coordinator(extra=("--end", "1"))
        await self.until(lambda: self.stats("test")["counts"]["queued"] == 1)
        old = await self.worker("old")
        old_job = await self.next_job(old)
        self.stop(self.server)
        await old.close()
        self.start_server()
        await self.until(lambda: self.stats("test")["counts"]["queued"] == 1)
        worker = await self.worker("new")
        job = await self.next_job(worker)
        await self.answer(worker, job, assignment=old_job["assignment"])
        await asyncio.sleep(.1)
        self.assertEqual(self.jobs()[0]["status"], "running")
        await self.answer(worker, job)
        await self.until(lambda: coordinator.poll() is not None)
        self.assertEqual(coordinator.returncode, 0)

    @unittest.skipUnless(BLENDER, "Configura BLENDER_TEST_PATH para el render real")
    async def test_real_blender_two_workers(self):
        for name in ("real-a", "real-b"):
            self.launch("slave.py", ["--server", self.uri, "--token", self.token, "--name", name,
                                     "--blender", BLENDER, "--cache", str(self.folder / name)])
        coordinator = self.coordinator("real", extra=("--end", "6", "--fps", "6"))
        await self.until(lambda: coordinator.poll() is not None, timeout=120)
        self.assertEqual(coordinator.returncode, 0)
        report = json.loads((self.folder / "output" / "real" / "resumen.json").read_text(encoding="utf-8"))
        self.assertEqual(report["completed"], 6)
        self.assertEqual(set(report["workers"]), {"real-a", "real-b"})
        with Image.open(report["animation"]) as animation:
            self.assertEqual(animation.n_frames, 6)

    @unittest.skipUnless(BLENDER, "Configura BLENDER_TEST_PATH para escenas propias")
    async def test_real_blend_is_transferred_to_worker(self):
        scene = self.folder / "scene.blend"
        expression = ("import bpy; cube=bpy.data.objects['Cube']; "
                      "cube.rotation_euler.z=0; cube.keyframe_insert(data_path='rotation_euler',frame=1); "
                      "cube.rotation_euler.z=.7; cube.keyframe_insert(data_path='rotation_euler',frame=2); "
                      f"bpy.ops.wm.save_as_mainfile(filepath={str(scene)!r})")
        result = await asyncio.to_thread(subprocess.run,
            [BLENDER, "--background", "--factory-startup", "--python-exit-code", "1", "--python-expr", expression],
            capture_output=True, timeout=60, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        self.assertEqual(result.returncode, 0)
        self.launch("slave.py", ["--server", self.uri, "--token", self.token, "--name", "blend-worker",
                                 "--blender", BLENDER, "--cache", str(self.folder / "blend-worker")])
        coordinator = self.coordinator("own-scene", extra=("--end", "2", "--scene", str(scene)))
        await self.until(lambda: coordinator.poll() is not None, timeout=120)
        self.assertEqual(coordinator.returncode, 0)
        cached = self.folder / "blend-worker" / "escenas" / (digest(scene.read_bytes()) + ".blend")
        self.assertEqual(cached.read_bytes(), scene.read_bytes())
        frames = self.folder / "output" / "own-scene" / "fotogramas"
        self.assertNotEqual(frame_path(frames, 1).read_bytes(), frame_path(frames, 2).read_bytes())


if __name__ == "__main__":
    unittest.main()
