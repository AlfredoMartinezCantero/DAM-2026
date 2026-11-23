#!/usr/bin/env python3
"""MySQL 8 aislado en /tmp: rutina nativa + flujo HTTP. No usa el servidor del equipo."""
import concurrent.futures
import getpass
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

ROOT=Path(__file__).resolve().parents[1]
def main():
    if not shutil.which("mysqld") or not shutil.which("mysql"):
        raise SystemExit("Se necesitan mysqld y mysql (MySQL 8).")
    with tempfile.TemporaryDirectory(prefix="pg-mysql-") as tmp:
        t=Path(tmp);data=t/"data";data.mkdir();socket=t/"mysql.sock";log=t/"mysql.log"
        initialize=subprocess.run(["mysqld","--no-defaults","--initialize-insecure","--datadir="+str(data),
            "--log-error="+str(log)],capture_output=True,text=True,timeout=90)
        if initialize.returncode:
            raise SystemExit(initialize.stderr+"\n"+(log.read_text() if log.exists() else ""))
        process=subprocess.Popen(["mysqld","--no-defaults","--datadir="+str(data),"--socket="+str(socket),
            "--pid-file="+str(t/"mysql.pid"),"--skip-networking","--mysqlx=OFF","--log-error="+str(log)],
            stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        cmd=["mysql","--no-defaults","--socket="+str(socket),"-uroot","--batch","--skip-column-names"]
        def sql(text, expected=True):
            r=subprocess.run(cmd,input=text,text=True,capture_output=True)
            if expected and r.returncode: raise AssertionError(r.stderr)
            if not expected and not r.returncode: raise AssertionError("La rutina debía rechazar esta operación.")
            return r.stdout.strip()
        try:
            for _ in range(120):
                if process.poll() is not None: raise RuntimeError(log.read_text())
                if socket.exists():
                    r=subprocess.run(cmd+["-e","SELECT 1"],capture_output=True)
                    if not r.returncode: break
                time.sleep(.1)
            else: raise RuntimeError("MySQL no arranca: "+log.read_text())
            sql("CREATE DATABASE grape_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; USE grape_test;\n"+(ROOT/"sql/mysql/contabilidad.sql").read_text())
            print("OK · Instalación del esquema y procedimiento almacenado nativo",flush=True)
            sql("USE grape_test; CALL sp_contabilizar_factura('test','F-1','2026-11-23','Cliente',10000,2100,12100);")
            check=sql("USE grape_test; SELECT COUNT(*) FROM movimientos; SELECT SUM(debe_centimos)=SUM(haber_centimos) FROM movimientos;")
            assert check=="3\n1",check
            print("OK · Procedimiento crea tres movimientos equilibrados",flush=True)
            sql("USE grape_test; CALL sp_contabilizar_factura('test','F-1','2026-11-23','Cliente',10000,2100,12100);")
            assert sql("USE grape_test; SELECT COUNT(*) FROM movimientos;")=="3"
            print("OK · Repetición idempotente del procedimiento",flush=True)
            sql("USE grape_test; CALL sp_contabilizar_factura('test','F-1','2026-11-23','Otro cliente',10000,2100,12100);",False)
            sql("USE grape_test; CALL sp_contabilizar_factura('test','F-2','2026-11-23','Cliente',10000,2100,12000);",False)
            sql("USE grape_test; CALL sp_contabilizar_factura('test','F-3','2026-11-23','Cliente',NULL,2100,12100);",False)
            assert sql("USE grape_test; SELECT COUNT(*) FROM documentos; SELECT COUNT(*) FROM movimientos;")=="1\n3"
            print("OK · Conflictos, descuadres y nulos producen rollback",flush=True)
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
                list(pool.map(lambda _: sql("USE grape_test; CALL sp_contabilizar_factura('test','F-CONC','2026-11-23','Cliente',100,21,121);"),range(5)))
            assert sql("USE grape_test; SELECT COUNT(*) FROM documentos; SELECT COUNT(*) FROM movimientos;")=="2\n6"
            print("OK · Cinco envíos concurrentes crean un único asiento",flush=True)
            sql("USE grape_test; DELETE FROM movimientos; DELETE FROM documentos;")
            env={**os.environ,"CONTABILIDAD_MYSQL_DSN":"mysql:unix_socket="+str(socket)+";dbname=grape_test;charset=utf8mb4",
                "CONTABILIDAD_MYSQL_USUARIO":"root","CONTABILIDAD_MYSQL_CLAVE":""}
            result=subprocess.run([sys.executable,"-u",str(ROOT/"tests/verificar.py"),"--mysql"],cwd=ROOT,env=env)
            if result.returncode: raise SystemExit(result.returncode)
            print("RESULTADO MySQL: rutina nativa y flujo HTTP correctos.",flush=True)
        finally:
            # SHUTDOWN evita restricciones de señal del perfil AppArmor de mysqld.
            if process.poll() is None:
                subprocess.run(cmd+["-e","SHUTDOWN"],capture_output=True,timeout=10)
                process.wait(timeout=30)
if __name__=="__main__":
    main()

