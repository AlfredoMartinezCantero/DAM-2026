#!/usr/bin/env python3
"""Pruebas funcionales sobre una copia temporal. No modifica la base entregada."""
import argparse
import contextlib
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
COUNT = 0

def check(condition, message):
    global COUNT
    if not condition:
        raise AssertionError(message)
    COUNT += 1
    print(f"OK {COUNT:03d} · {message}")

def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

class Client:
    def __init__(self, base):
        self.base = base
        self.cookies = http.cookiejar.CookieJar()
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))
        self.csrf = ""

    def raw(self, path, data=None, token=True, headers=None):
        h = dict(headers or {})
        if data is not None:
            h["Content-Type"] = "application/json"
            if token:
                h["X-CSRF-Token"] = self.csrf
        req = urllib.request.Request(self.base + path, data=None if data is None else json.dumps(data).encode(), headers=h)
        try:
            with self.http.open(req, timeout=160) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def api(self, route, data=None, query="", expected=200, token=True):
        status, raw = self.raw("/api/superapi.php?ruta=" + route + query, data, token)
        try:
            result = json.loads(raw)
        except Exception:
            raise AssertionError(f"{route}: respuesta no JSON: {raw[:1000]!r}")
        check(status == expected, f"{route} · HTTP {status}, esperado {expected}")
        return result

@contextlib.contextmanager
def servers(project, env):
    ports = [free_port(), free_port()]
    env = {**os.environ, **env, "CONTABILIDAD_URL": f"http://127.0.0.1:{ports[1]}/integraciones/contabilidad/api.php"}
    # La URL sin prefijo también se sirve mediante un router dedicado en el segundo proceso.
    log = tempfile.TemporaryFile()
    procs = []
    try:
        for port in ports:
            procs.append(subprocess.Popen(["php", "-S", f"127.0.0.1:{port}", "router.php"], cwd=project, env=env, stdout=log, stderr=log))
        clients = [Client(f"http://127.0.0.1:{p}") for p in ports]
        for client in clients:
            for _ in range(60):
                try:
                    if client.raw("/index.html")[0] == 200:
                        break
                except OSError:
                    pass
                time.sleep(.1)
            else:
                log.seek(0)
                raise RuntimeError("No arranca PHP: " + log.read().decode(errors="replace")[-3000:])
        yield clients
    finally:
        for p in procs:
            p.terminate()
        for p in procs:
            p.wait(timeout=10)
        log.close()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ia-real", action="store_true", help="Consulta al Ollama configurado en el entorno.")
    parser.add_argument("--mysql", action="store_true", help="Usa el servidor MySQL configurado en CONTABILIDAD_MYSQL_DSN.")
    args = parser.parse_args()
    original = hashlib.sha256((ROOT / "data/purplegrape.db").read_bytes()).hexdigest()
    with tempfile.TemporaryDirectory(prefix="purple-grape-test-") as tmp:
        project = Path(tmp) / "proyecto"
        shutil.copytree(ROOT, project, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        for file in (project / "var").glob("*"):
            if file.is_file() and file.name != ".gitkeep":
                file.unlink()
        env = {"PURPLE_DB": str(project / "data/purplegrape.db"), "CONTABILIDAD_DB": str(project / "var/contabilidad.sqlite")}
        if not args.mysql:
            env["CONTABILIDAD_MYSQL_DSN"] = ""
        with servers(project, env) as (c, external):
            cfg = c.api("config")
            c.csrf = cfg["csrf"]
            check(cfg["modelo"] == "phi4-mini:latest", "Modelo solicitado exacto")
            check(cfg["color"] == "#7c3aed", "Tema Purple Grape")
            check(len(cfg["entidades"]) == 9, "Siete entidades de UD3 y dos de UD4")
            for path in ["/data/purplegrape.db", "/config/aplicacion.php", "/var/contabilidad.sqlite", "/util/migrar.php", "/.gitignore", "/api/procesos.php"]:
                check(c.raw(path)[0] == 403, "Archivo interno protegido: " + path)
            check(c.raw("/api/superapi.php?ruta=crear", {"tabla":"clientes","datos":{"nombre":"Sin CSRF"}}, token=False)[0] == 403, "CSRF obligatorio")
            for table in cfg["entidades"]:
                schema = c.api("tabla", query="&tabla=" + table)
                check(len(schema["columnas"]) > 0, "Estructura de " + table)
                if table == "clientes":
                    check(schema["total"] == 61, "Se conservan los 61 clientes de UD3")
            check(c.api("tabla", query="&tabla=clientes&pagina=2")["pagina"] == 2, "Paginación del servidor")
            c.api("tabla", query="&tabla=sqlite_master", expected=422)
            c.api("tabla", query="&tabla=clientes&orden=nombre%3BDROP%20TABLE%20clientes", expected=422)
            c.api("crear", {"tabla":"clientes","datos":{"nombre":"Sin validar","email":"incorrecto"}}, expected=422)
            c.api("crear", {"tabla":"clientes","datos":{"nombre":""}}, expected=422)
            cliente = c.api("crear", {"tabla":"clientes","datos":{"nombre":"Prueba O'Connor <script>","email":"prueba@example.test","activo":0}}, expected=201)["id"]
            c.api("actualizar", {"tabla":"clientes","id":cliente,"datos":{"nombre":"Prueba editada","segmento":"Distribuidor"}})
            rows = c.api("tabla", query="&tabla=clientes&campo=identificador&valor=" + str(cliente))["registros"]
            check(rows[0]["activo"] == 0 and rows[0]["segmento"] == "Distribuidor", "Tipos, booleanos y actualización parcial")
            c.api("campo_crear", {"tabla":"clientes","nombre":"fecha_revision","titulo":"Fecha de revisión","tipo":"date"}, expected=201)
            c.api("actualizar", {"tabla":"clientes","id":cliente,"datos":{"fecha_revision":"2026-02-30"}}, expected=422)
            c.api("actualizar", {"tabla":"clientes","id":cliente,"datos":{"fecha_revision":"2026-12-01"}})
            c.api("campo_crear", {"tabla":"clientes","nombre":"servicio","titulo":"Servicio","tipo":"select","opciones":"Básico,Premium"}, expected=201)
            c.api("actualizar", {"tabla":"clientes","id":cliente,"datos":{"servicio":"Otro"}}, expected=422)
            c.api("actualizar", {"tabla":"clientes","id":cliente,"datos":{"servicio":"Premium"}})
            c.api("campo_crear", {"tabla":"clientes","nombre":"email","tipo":"text"}, expected=422)
            c.api("campo_crear", {"tabla":"clientes","nombre":"x);drop","tipo":"text"}, expected=422)
            c.api("tabla_crear", {"nombre":"contratos"}, expected=201)
            contrato = c.api("crear", {"tabla":"contratos","datos":{"nombre":"Contrato demo","notas":"Texto Unicode: ñ, á, €"}}, expected=201)["id"]
            check("contratos" in c.api("entidades"), "Tabla creada y registrada en el catálogo")
            c.api("eliminar", {"tabla":"contratos","id":contrato})
            c.api("modulos_guardar", {"modulos":[]}, expected=422)
            c.api("modulos_guardar", {"modulos":["ventas","compras"]})
            check(c.api("modulos") == ["ventas","compras"], "Selección de módulos persistente")
            pedido = c.api("crear", {"tabla":"pedidos","datos":{"fecha":"2026-11-23","estado":"Confirmado","cliente_id":cliente}}, expected=201)["id"]
            c.api("crear", {"tabla":"lineaspedido","datos":{"pedido_id":pedido,"producto_id":999999,"cantidad":2,"precio_unitario":12.35}}, expected=422)
            c.api("crear", {"tabla":"lineaspedido","datos":{"pedido_id":pedido,"producto_id":1,"cantidad":-1,"precio_unitario":12.35}}, expected=422)
            linea = c.api("crear", {"tabla":"lineaspedido","datos":{"pedido_id":pedido,"producto_id":1,"cantidad":2,"precio_unitario":12.35}}, expected=201)["id"]
            def total():
                return c.api("tabla",query=f"&tabla=pedidos&campo=identificador&valor={pedido}")["registros"][0]["total"]
            check(abs(total()-24.70) < .0001, "Trigger recalcula total al insertar líneas")
            c.api("actualizar", {"tabla":"lineaspedido","id":linea,"datos":{"cantidad":3}})
            check(abs(total()-37.05) < .0001, "Trigger recalcula al actualizar")
            c.api("actualizar", {"tabla":"pedidos","id":pedido,"datos":{"total":1}}, expected=422)
            c.api("eliminar", {"tabla":"clientes","id":cliente}, expected=409)
            check(len(c.api("calendario", query="&mes=2026-11")) >= 1, "Calendario consulta pedidos del mes")
            c.api("calendario", query="&mes=2026-99", expected=422)
            for view in cfg["vistas"]:
                c.api("tabla", query="&tabla=" + view)
            panel = c.api("panel")
            check(panel["kpis"]["clientes"] == 62, "KPI calculado sobre datos reales")
            cards = [{"id":"test","titulo":"Prueba panel","fuente":"ventas_mes","tipo":"barras","ancho":2}]
            c.api("panel_guardar", {"tarjetas":cards})
            check(c.api("panel")["tarjetas"] == cards, "Panel personalizado persistente")
            c.api("panel_guardar", {"tarjetas":[dict(cards[0], fuente="sql_arbitrario")]}, expected=422)
            c.api("panel_guardar", {"tarjetas":[dict(cards[0], ancho=99)]}, expected=422)
            reporte = c.api("informe_guardar", {"titulo":"Clientes Premium","tabla":"clientes","columnas":["nombre","servicio"],"filtros":{"campo":"servicio","valor":"Premium"}}, expected=201)["id"]
            r = c.api("informe", query="&id=" + reporte)
            check(r["datos"]["total"] == 1 and r["informe"]["columnas"] == ["nombre","servicio"], "Informe personalizado filtra y conserva columnas")
            check(c.raw("/nucleo/reporting.html?id=" + reporte)[0] == 200, "Página imprimible del informe")
            c.api("informe_guardar", {"titulo":"Inválido","tabla":"clientes","columnas":["inexistente"]}, expected=422)
            check(c.raw("/nucleo/reporting.php")[0] == 200, "Informe completo de UD3 conservado")
            c.api("actualizar", {"tabla":"clientes","id":cliente,"datos":{"nombre":"=HYPERLINK(\"http://example.test\")"}})
            status, csv = c.raw(f"/api/superapi.php?ruta=exportar&tabla=clientes&campo=identificador&valor={cliente}")
            check(status == 200 and b"'=HYPERLINK" in csv and csv.startswith(b"\xef\xbb\xbf"), "CSV UTF-8 y protección de fórmulas")
            f = c.api("facturar", {"pedido_id":pedido})
            factura = f["factura"]
            check(factura["base_centimos"] == 3705 and factura["iva_centimos"] == 778 and factura["total_centimos"] == 4483, "Factura congela base, IVA y total en céntimos")
            check(c.api("facturar", {"pedido_id":pedido})["duplicada"], "Emisión de factura idempotente")
            c.api("actualizar", {"tabla":"lineaspedido","id":linea,"datos":{"cantidad":5}}, expected=409)
            c.api("eliminar", {"tabla":"lineaspedido","id":linea}, expected=409)
            c.api("crear", {"tabla":"lineaspedido","datos":{"pedido_id":pedido,"producto_id":1,"cantidad":1,"precio_unitario":1}}, expected=409)
            c.api("actualizar", {"tabla":"pedidos","id":pedido,"datos":{"estado":"Cancelado"}}, expected=409)
            c.api("actualizar", {"tabla":"facturas","id":factura["identificador"],"datos":{"total_centimos":1}}, expected=422)
            check(external.raw("/integraciones/contabilidad/api.php")[0] == 401, "API contable exige credencial")
            sync = c.api("sincronizar", {"factura_id":factura["identificador"]})
            check(sync["motor"] == ("mysql" if args.mysql else "sqlite"), "Motor contable solicitado activo")
            check(c.api("sincronizar", {"factura_id":factura["identificador"]})["duplicada"], "Reintento HTTP sin duplicar asiento")
            info = c.api("integracion")
            check(info["servicio"]["ok"] and len(info["servicio"]["documentos"]) == 1, "Documento recibido en el segundo ERP")
            balances = info["servicio"]["saldos"]
            check(sum(int(x["debe_centimos"]) for x in balances) == sum(int(x["haber_centimos"]) for x in balances) == 4483, "Asiento contable equilibrado")
            check(len(balances) == 3, "Cuentas 430, 700 y 477 generadas")
            payload = {"origen":"purple-grape-ud4","documento":factura["numero"],"fecha":factura["fecha"],"cliente":factura["cliente"],"base_centimos":3705,"iva_centimos":778,"total_centimos":4484}
            check(external.raw("/integraciones/contabilidad/api.php",payload,headers={"Authorization":"Bearer purple-grape-demo-local"})[0] == 422, "Contabilidad rechaza asiento descuadrado")
            if not args.mysql:
                database=sqlite3.connect(project / "var/contabilidad.sqlite")
                check(database.execute("SELECT count(*) FROM documentos").fetchone()[0] == 1, "No hay documentos parciales tras error")
                check(database.execute("SELECT count(*) FROM movimientos").fetchone()[0] == 3, "No hay movimientos duplicados")
                database.close()
            check(len(c.api("auditoria")) >= 20, "Operaciones documentadas en auditoría")
            c.api("ia", {"prompt":""}, expected=422)
            if args.ia_real:
                check(c.api("ia_estado")["instalado"], "Ollama real: phi4-mini:latest disponible")
                r=c.api("ia", {"prompt":"Resume los indicadores disponibles en dos frases. No cambies el panel."})
                check(bool(r["respuesta"]) and r["modelo"]=="phi4-mini:latest" and r["tarjetas"]==[], "Inferencia real con phi4-mini:latest")
                check(r["referencia"][0]["valor"]=="62" and r["referencia"][1]["valor"].endswith(" EUR"), "IA acompaña la interpretación con indicadores verificados")
                (ROOT / "tests/ultima-respuesta-ia.txt").write_text("Datos de prueba (copia temporal):\n"+json.dumps(r["referencia"],ensure_ascii=False,indent=2)+"\n\nRespuesta generada por phi4-mini:latest:\n"+r["respuesta"]+"\n",encoding="utf-8")
            else:
                print("PENDIENTE · IA real: ejecutar con --ia-real")
            database=sqlite3.connect(project / "data/purplegrape.db")
            check(database.execute("PRAGMA integrity_check").fetchone()[0]=="ok", "Integridad SQLite")
            check(database.execute("PRAGMA foreign_key_check").fetchall()==[], "Integridad de relaciones")
            database.close()
    check(hashlib.sha256((ROOT / "data/purplegrape.db").read_bytes()).hexdigest()==original, "La base entregada no cambia durante las pruebas")
    print(f"\nRESULTADO: {COUNT} comprobaciones correctas.")

if __name__=="__main__":
    main()

