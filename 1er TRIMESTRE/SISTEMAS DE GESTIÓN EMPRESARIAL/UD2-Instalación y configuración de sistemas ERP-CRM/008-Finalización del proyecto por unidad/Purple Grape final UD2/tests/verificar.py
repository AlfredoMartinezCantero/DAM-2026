#!/usr/bin/env python3
"""Pruebas de integración en bases temporales. No se modifica la base de entrega."""
from pathlib import Path
import http.cookiejar
import json
import os
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
checks = 0

def check(cond, message):
    global checks
    assert cond, message
    checks += 1

with tempfile.TemporaryDirectory(prefix='darkorange-test-') as tmp:
    env = dict(os.environ)
    for perfil, cantidad in [('comercial', 4), ('taller', 4), ('completo', 6)]:
        env['DARKORANGE_DB'] = str(Path(tmp) / (perfil + '.sqlite'))
        r = subprocess.run(['php', str(ROOT/'utilidades/instalar.php'), '--perfil='+perfil, '--vacia'],env=env,capture_output=True,text=True)
        check(r.returncode == 0, r.stderr)
        with sqlite3.connect(env['DARKORANGE_DB']) as db:
            check(db.execute('SELECT COUNT(*) FROM modulos WHERE activo=1').fetchone()[0] == cantidad, 'Perfil incorrecto')
            check(db.execute('SELECT COUNT(*) FROM clientes').fetchone()[0] == 0, 'La instalación debe estar vacía')
        r = subprocess.run(['php',str(ROOT/'utilidades/instalar.php')],env=env,capture_output=True,text=True)
        check(r.returncode != 0, 'No debe sobrescribir una base')
    env['DARKORANGE_DB'] = str(Path(tmp)/'web.sqlite')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0))
        port=sock.getsockname()[1]
    log = open(Path(tmp)/'servidor.log','w+')
    server = subprocess.Popen(['php','-S',f'127.0.0.1:{port}','utilidades/router.php'],cwd=ROOT,env=env,stdout=log,stderr=log)
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    base=f'http://127.0.0.1:{port}/'
    def request(path, data=None, token=None):
        headers={}
        if data is not None:
            headers['Content-Type']='application/json'
            if token is not None: headers['X-CSRF-Token']=token
        req=urllib.request.Request(base+path, data=json.dumps(data).encode() if data is not None else None,headers=headers)
        try:
            with opener.open(req, timeout=5) as response: return response.status,response.read()
        except urllib.error.HTTPError as e: return e.code,e.read()
    def api(ruta,data=None,token=None,suffix=''):
        status,body=request('api/superapi.php?ruta='+ruta+suffix,data,token)
        return status,json.loads(body)
    try:
        for _ in range(50):
            try:
                status,body=request('api/instalar.php')
                break
            except (urllib.error.URLError,ConnectionError):
                if server.poll() is not None:
                    log.seek(0)
                    raise RuntimeError(log.read())
                time.sleep(.1)
        else: raise RuntimeError('El servidor no arrancó')
        token=json.loads(body)['csrf']
        check(status==200,'Instalador disponible')
        check(api('inicio')[0]==503,'Debe detectar base ausente')
        check(request('api/instalar.php',{'nombre':'x','demo':True},token)[0]==422,'Debe rechazar identidad inválida')
        check(not Path(env['DARKORANGE_DB']).exists(),'Instalación fallida debe revertirse')
        check(request('api/instalar.php',{'demo':True,'perfil':'completo'},token)[0]==200,'Instalación web')
        check(request('api/instalar.php',{'demo':True},token)[0]==422,'Instalación repetida debe conservar datos')
        for path in ['index.html','estudio.html','estilo.css','codigo.js','instalador.html','marca.svg']:
            check(request(path)[0]==200,'Debe servir '+path)
        for path in ['data/darkorange_alfredo.sqlite','data/darkorange.db','data/schema.sql','api/nucleo.php','utilidades/instalar.php','tests/verificar.py']:
            check(request(path)[0]==403,'Debe bloquear '+path)
        status, inicio=api('inicio')
        token=inicio['csrf']
        check(status==200 and len(inicio['modulos'])==6,'Seis módulos activos')
        status,resumen=api('resumen')
        check(resumen['kpis']=={'clientes':5,'pedidos':3,'cobros':817.96,'stock':2},'Indicadores de demostración')
        for mod in inicio['modulos'].values():
            for tabla in mod['entidades']:
                check(api('tabla',suffix='&tabla='+tabla)[0]==200,'Listado de '+tabla)
        check(api('crear',{'tabla':'clientes','datos':{}},'incorrecto')[0]==403,'CSRF obligatorio')
        check(api('crear')[0]==405,'Las escrituras exigen POST')
        check(api('tabla',suffix='&tabla=sqlite_master')[0]==422,'Catálogo cerrado')
        def create(tabla,datos):
            code,d=api('crear',{'tabla':tabla,'datos':datos},token)
            check(code==200,d.get('error',tabla))
            return d['id']
        def remove(tabla,id):
            code,d=api('eliminar',{'tabla':tabla,'id':id},token)
            check(code==200,d.get('error',tabla))
        cliente=create('clientes',{'nombre':"Cliente O'Connor <prueba>",'email':'cliente@test.example','telefono':'','ciudad':'Madrid','estado':'Activo'})
        check(api('actualizar',{'tabla':'clientes','id':cliente,'datos':{'nombre':'Cliente actualizado','email':'cliente@test.example','telefono':'123','ciudad':'Madrid','estado':'Potencial'}},token)[0]==200,'Actualizar cliente')
        check(api('crear',{'tabla':'clientes','datos':{'nombre':'Duplicado','email':'cliente@test.example','estado':'Activo'}},token)[0]==503,'Correo único')
        producto=create('productos',{'nombre':'Equipo de prueba','categoria':'Pruebas','precio':10.25,'stock':2,'stock_minimo':3})
        proveedor=create('proveedores',{'nombre':'Proveedor test','email':'prov@test.example','telefono':'','especialidad':'Pruebas'})
        componente=create('componentes',{'nombre':'Pieza test','proveedor_id':proveedor,'precio':4,'stock':9})
        empleado=create('empleados',{'nombre':'Persona test','email':'empleado@test.example','departamento':'Test','puesto':'Técnico','salario':24000})
        pedido=create('pedidos',{'cliente_id':cliente,'fecha':'2026-10-14','estado':'Confirmado','notas':''})
        linea=create('lineaspedido',{'pedido_id':pedido,'producto_id':producto,'cantidad':3,'precio_unitario':10.25})
        pedidos=api('tabla',suffix='&tabla=pedidos')[1]['registros']
        check(next(p for p in pedidos if p['id']==pedido)['total']==30.75,'Total de líneas calculado')
        check(api('crear',{'tabla':'lineaspedido','datos':{'pedido_id':pedido,'producto_id':producto,'cantidad':-1,'precio_unitario':10}},token)[0]==422,'Cantidad negativa rechazada')
        check(api('crear',{'tabla':'pedidos','datos':{'cliente_id':99999,'fecha':'2026-10-14','estado':'Pendiente','notas':''}},token)[0]==503,'Clave foránea validada')
        check(api('actualizar',{'tabla':'pedidos','id':pedido,'datos':{'cliente_id':cliente,'fecha':'2026-02-30','estado':'Pendiente','notas':''}},token)[0]==422,'Fecha inválida rechazada')
        check(api('eliminar',{'tabla':'clientes','id':cliente},token)[0]==503,'No borrar cliente relacionado')
        factura=create('facturas',{'numero':'TEST-001','pedido_id':pedido,'fecha':'2026-10-14','vencimiento':'2026-10-30','estado':'Pendiente'})
        facturas=api('tabla',suffix='&tabla=facturas')[1]['registros']
        check(next(f for f in facturas if f['id']==factura)['total']==37.21,'IVA y total de factura')
        check(api('eliminar',{'tabla':'lineaspedido','id':linea},token)[0]==422,'Factura bloquea líneas')
        check(api('eliminar',{'tabla':'pedidos','id':pedido},token)[0]==422,'Factura bloquea pedido')
        datos={'numero':'TEST-001','pedido_id':pedido,'fecha':'2026-10-14','vencimiento':'2026-10-30','estado':'Pagada'}
        check(api('actualizar',{'tabla':'facturas','id':factura,'datos':datos},token)[0]==200,'Registrar cobro')
        remove('facturas',factura)
        remove('pedidos',pedido)
        lineas=api('tabla',suffix='&tabla=lineaspedido')[1]['registros']
        check(not any(l['id']==linea for l in lineas),'Borrado de líneas en cascada')
        for tabla,id in [('clientes',cliente),('productos',producto),('componentes',componente),('proveedores',proveedor),('empleados',empleado)]: remove(tabla,id)
        check(api('eliminar',{'tabla':'clientes','id':99999},token)[0]==404,'Detectar registro inexistente')
        code,exportacion=api('exportar')
        check(code==200 and len(exportacion['datos'])==8,'Exportación de todas las entidades')
        for perfil, cantidad in [('taller',4),('comercial',4),('completo',6)]:
            check(api('configurar',{'nombre':'Estudio prueba','color':'#ed7135','perfil':perfil},token)[0]==200,'Cambio de perfil')
            check(len(api('inicio')[1]['modulos'])==cantidad,'Módulos por perfil')
            if perfil=='taller': check(api('tabla',suffix='&tabla=pedidos')[0]==403,'Módulo inactivo bloqueado')
            if perfil=='comercial': check(api('tabla',suffix='&tabla=empleados')[0]==403,'RRHH inactivo bloqueado')
        with sqlite3.connect(env['DARKORANGE_DB']) as db:
            check(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok','Integridad SQLite')
            check(not db.execute('PRAGMA foreign_key_check').fetchall(),'Relaciones válidas')
            check(db.execute('SELECT COUNT(*) FROM clientes').fetchone()[0]==5,'Perfiles conservan datos')
            check(db.execute("SELECT COUNT(*) FROM actividad WHERE accion='Creación'").fetchone()[0]==8,'Operaciones auditadas')
        print(f'OK · {checks} comprobaciones de integración. Base de entrega intacta.')
    finally:
        server.terminate()
        server.wait(timeout=10)
        log.close()
