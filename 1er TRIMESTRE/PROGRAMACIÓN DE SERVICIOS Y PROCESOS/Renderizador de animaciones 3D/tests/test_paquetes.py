"""Cachés portables: integridad, extracción acotada y transferencia por fragmentos."""

import asyncio
import base64
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from paquetes import (CHUNK_SIZE, PackageReceiver, create_package, extract_package,
                      file_digest, inspect_package, send_package, validate_package_render)
from protocolo import send
import test_renderizador as base_tests

BLENDER = base_tests.BLENDER


def make_package(folder, scene=b"test scene"):
    source = folder / "source"
    source.mkdir()
    (source / "scene.blend").write_bytes(scene)
    (source / "cache" / "mesh").mkdir(parents=True)
    (source / "cache" / "mesh" / "fluid_mesh_0001.bobj.gz").write_bytes(b"test mesh")
    (source / "manifest.json").write_text(json.dumps({
        "version": 1, "scene": "scene.blend", "cache": "cache", "kind": "liquid",
        "start": 1, "end": 4, "fps": 4,
    }), encoding="utf-8")
    return create_package(source, folder / "scene.render.zip")


class PackageTests(unittest.TestCase):
    def test_extracts_scene_and_cache_together(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            package = make_package(folder)
            target, manifest = extract_package(package, folder / "worker")
            self.assertEqual((target / "scene.blend").read_bytes(), b"test scene")
            self.assertEqual((target / "cache/mesh/fluid_mesh_0001.bobj.gz").read_bytes(), b"test mesh")
            self.assertEqual(manifest["fps"], 4)
            self.assertEqual(extract_package(package, folder / "worker")[0], target)
            validate_package_render(package, {"start": 1, "end": 4, "fps": 4})
            with self.assertRaises(ValueError):
                validate_package_render(package, {"start": 1, "end": 5, "fps": 4})
            with self.assertRaises(ValueError):
                validate_package_render(package, {"start": 1, "end": 4, "fps": 24})

    def test_rejects_paths_that_escape_the_cache(self):
        for name in ("../outside", "cache/../../outside", "/outside", "cache\\outside", "cache/NUL"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "bad.zip"
                with zipfile.ZipFile(path, "w") as archive:
                    archive.writestr(name, "bad")
                with self.assertRaises(ValueError):
                    inspect_package(path)

    def test_rejects_missing_liquid_mesh_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.zip"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("scene.blend", b"blend")
                archive.writestr("manifest.json", json.dumps({"version": 1, "kind": "liquid",
                    "scene": "scene.blend", "cache": "cache", "start": 1, "end": 4, "fps": 4}))
            with self.assertRaises(ValueError):
                inspect_package(path)

    def test_incomplete_transfer_is_removed(self):
        with tempfile.TemporaryDirectory() as directory:
            receiver = PackageReceiver(Path(directory))
            receiver.begin({"sha256": "a" * 64, "size": 100})
            receiver.chunk({"data": base64.b64encode(b"incomplete").decode()})
            with self.assertRaises(ValueError):
                receiver.finish()
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_bad_checksum_and_oversized_chunk_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            receiver = PackageReceiver(Path(directory))
            with self.assertRaises(ValueError):
                receiver.begin({"sha256": "a" * 64, "size": 10}, expected="b" * 64)
            receiver.begin({"sha256": "a" * 64, "size": 10})
            with self.assertRaises(ValueError):
                receiver.chunk({"data": base64.b64encode(b"x" * 11).decode()})
            receiver.abort()
            self.assertEqual(list(Path(directory).iterdir()), [])


class FragmentTests(unittest.IsolatedAsyncioTestCase):
    async def test_bounded_transfer_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            package = make_package(folder, os.urandom(CHUNK_SIZE + 123))
            receiver = PackageReceiver(folder / "receiver")
            messages = []

            class Socket:
                async def send(self, raw):
                    payload = json.loads(raw)
                    messages.append(payload["type"])
                    if payload["type"] == "asset_begin":
                        receiver.begin(payload, expected=file_digest(package))
                    elif payload["type"] == "asset_chunk":
                        self_outer.assertLessEqual(len(base64.b64decode(payload["data"])), CHUNK_SIZE)
                        receiver.chunk(payload)
                    else:
                        receiver.finish()

            self_outer = self
            await send_package(Socket(), package, file_digest(package), send)
            self.assertEqual(messages[0], "asset_begin")
            self.assertEqual(messages[-1], "asset_end")
            received = folder / "receiver" / (file_digest(package) + ".zip")
            self.assertEqual(received.read_bytes(), package.read_bytes())


class PackageClusterTests(base_tests.ClusterTests):
    # Reutilizar los ayudantes, sin volver a ejecutar las pruebas heredadas.
    test_authentication = None
    test_delivery_recovery_and_local_resume = None
    test_terminal_failures_finish_without_partial_animation = None
    test_restart_and_stale_assignment = None
    test_real_blender_two_workers = None
    test_real_blend_is_transferred_to_worker = None

    async def test_worker_confirms_extraction_before_assignment(self):
        package = make_package(self.folder)
        coordinator = self.coordinator(extra=("--package", str(package)))
        await self.until(lambda: self.stats("test")["counts"]["queued"] == 4)
        ws = await self.worker("package-worker")
        receiver = PackageReceiver(self.folder / "fake-cache")
        while True:
            payload = json.loads(await asyncio.wait_for(ws.recv(), 15))
            if payload["type"] == "asset_begin":
                receiver.begin(payload)
            elif payload["type"] == "asset_chunk":
                receiver.chunk(payload)
            elif payload["type"] == "asset_end":
                received = receiver.finish()
                break
        await asyncio.sleep(3.2)
        self.assertEqual(self.stats("test")["counts"]["running"], 0)
        self.assertEqual(self.stats("test")["counts"]["queued"], 4)
        await send(ws, {"type": "asset_ready", "sha256": file_digest(received)})
        for _ in range(4):
            await self.answer(ws, await self.next_job(ws))
        await self.until(lambda: coordinator.poll() is not None)
        self.assertEqual(coordinator.returncode, 0)

    @unittest.skipUnless(BLENDER, "Configura BLENDER_TEST_PATH para paquetes con Blender")
    async def test_real_worker_renders_a_portable_package(self):
        import subprocess
        scene = self.folder / "cube.blend"
        expression = f"import bpy; bpy.ops.wm.save_as_mainfile(filepath={str(scene)!r})"
        result = await asyncio.to_thread(subprocess.run,
            [BLENDER, "--background", "--factory-startup", "--python-exit-code", "1", "--python-expr", expression],
            capture_output=True, timeout=60, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        self.assertEqual(result.returncode, 0)
        package = make_package(self.folder, scene.read_bytes())
        self.launch("slave.py", ["--server", self.uri, "--token", self.token, "--name", "portable-worker",
                                 "--blender", BLENDER, "--cache", str(self.folder / "portable-worker")])
        coordinator = self.coordinator(extra=("--package", str(package), "--end", "2"))
        await self.until(lambda: coordinator.poll() is not None, timeout=120)
        self.assertEqual(coordinator.returncode, 0)
        root = self.folder / "portable-worker" / "paquetes" / file_digest(package)
        self.assertTrue((root / "scene.blend").is_file())
        self.assertTrue((root / "cache" / "mesh" / "fluid_mesh_0001.bobj.gz").is_file())


if __name__ == "__main__":
    unittest.main()
