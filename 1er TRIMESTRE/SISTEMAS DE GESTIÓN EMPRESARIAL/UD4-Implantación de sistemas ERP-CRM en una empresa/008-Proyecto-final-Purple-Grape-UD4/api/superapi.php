<?php
declare(strict_types=1);
require_once __DIR__.'/ia.php';
try {
    sesion();
    $ruta=$_GET['ruta']??'config';
    $lectura=['config','modulos','entidades','estructura','opciones','calendario','tabla','panel','vistas','auditoria','integracion','ia_estado','informes','exportar','informe'];
    if (!in_array($ruta,$lectura,true)) protegerEscritura();
    $e=$_SERVER['REQUEST_METHOD']==='POST'?entrada():[];
    switch($ruta) {
        case 'config':
            jsonSalida(['nombre'=>$config['nombre'],'color'=>$config['color'],'modelo'=>$config['modelo'],'csrf'=>$_SESSION['csrf'],
                'catalogo'=>catalogo(),'modulos'=>ajustes('modulos',['ventas','compras','rrhh','facturacion']),
                'entidades'=>entidades(),'vistas'=>vistas(),'version'=>4]);
        case 'modulos': jsonSalida(ajustes('modulos',array_keys(catalogo())));
        case 'entidades': jsonSalida(entidades());
        case 'vistas': jsonSalida(vistas());
        case 'estructura': jsonSalida(estructura($_GET['tabla']??''));
        case 'opciones':
            $t=$_GET['tabla']??''; estructura($t);
            if (!in_array($t,['clientes','pedidos','productos','proveedores'],true)) throw new InvalidArgumentException('Relación no permitida.');
            $r=listado($t,[],true); $opts=[];
            foreach($r['registros'] as $row) $opts[]=['value'=>$row['identificador'],'label'=>isset($row['nombre'])?$row['identificador'].' · '.$row['nombre']:$row['identificador'].' · '.$row['fecha'].' · '.$row['estado']];
            jsonSalida($opts);
        case 'tabla': jsonSalida(listado($_GET['tabla']??'',$_GET));
        case 'calendario':
            $mes=$_GET['mes']??date('Y-m');
            if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/D',$mes)) throw new InvalidArgumentException('Mes no válido.');
            jsonSalida(consulta('SELECT * FROM v_pedidos_detalle WHERE fecha>=? AND fecha<? ORDER BY fecha',[$mes.'-01',date('Y-m-d',strtotime($mes.'-01 +1 month'))]));
        case 'crear': jsonSalida(guardarRegistro($e['tabla']??'',$e['datos']??[],null),201);
        case 'actualizar': jsonSalida(guardarRegistro($e['tabla']??'',$e['datos']??[],(int)($e['id']??0)));
        case 'eliminar':
            $t=$e['tabla']??''; $s=estructura($t);
            if ($s['soloLectura']) throw new InvalidArgumentException('Esta entidad es de solo lectura.');
            $id=(int)($e['id']??0);
            transaccion(function() use($t,$id) {
                if (!ejecutar('DELETE FROM '.identificador($t).' WHERE identificador=?',[$id])) throw new InvalidArgumentException('Registro inexistente.');
                auditar('eliminar',$t,$id);
            }); jsonSalida(['ok'=>true]);
        case 'modulos_guardar':
            $ms=$e['modulos']??null;
            if (!is_array($ms) || !array_is_list($ms) || !$ms || array_diff($ms,array_keys(catalogo()))) throw new InvalidArgumentException('Selecciona al menos un módulo válido.');
            transaccion(function() use($ms) { guardarAjustes('modulos',array_values(array_unique($ms))); auditar('modulos','ajustes',0,$ms); });
            jsonSalida(['ok'=>true]);
        case 'campo_crear': jsonSalida(adaptarCampo($e),201);
        case 'tabla_crear': jsonSalida(crearTabla($e),201);
        case 'panel': jsonSalida(datosPanel());
        case 'panel_guardar':
            $cards=validarPanel($e['tarjetas']??null);
            transaccion(function() use($cards) { guardarAjustes('panel',$cards); auditar('panel','ajustes',0,$cards); }); jsonSalida(['ok'=>true]);
        case 'facturar': jsonSalida(emitirFactura((int)($e['pedido_id']??0)));
        case 'sincronizar': jsonSalida(sincronizarFactura((int)($e['factura_id']??0)));
        case 'integracion':
            $estado=['ok'=>false,'mensaje'=>'Servicio contable no disponible.'];
            try { $estado=httpJson($config['contabilidad_url'],null,['Authorization: Bearer '.$config['integracion_clave']],5); }
            catch(Throwable $err) { $estado['mensaje']=$err->getMessage(); }
            jsonSalida(['servicio'=>$estado,'facturas'=>consulta('SELECT * FROM facturas ORDER BY identificador DESC'),
                'historial'=>consulta('SELECT * FROM integraciones_log ORDER BY identificador DESC LIMIT 50')]);
        case 'auditoria': jsonSalida(consulta('SELECT * FROM auditoria ORDER BY identificador DESC LIMIT 100'));
        case 'ia_estado':
            session_write_close();
            jsonSalida(estadoIA());
        case 'ia':
            session_write_close();
            jsonSalida(consultarIA((string)($e['prompt']??''),($e['proponer']??false)===true));
        case 'informes': jsonSalida(ajustes('informes',[]));
        case 'informe_guardar':
            $t=$e['tabla']??''; $schema=estructura($t); $cols=$e['columnas']??[];
            if (!is_array($cols) || !$cols || array_diff($cols,array_column($schema['columnas'],'name'))) throw new InvalidArgumentException('Selecciona columnas válidas.');
            $titulo=trim((string)($e['titulo']??''));
            if (!$titulo || mb_strlen($titulo)>100) throw new InvalidArgumentException('Título de informe no válido.');
            $filtros=array_intersect_key($e['filtros']??[],array_flip(['buscar','campo','operador','valor','desde','hasta','orden','sentido']));
            listado($t,$filtros); // Valida la consulta antes de guardarla.
            $informes=ajustes('informes',[]);
            if (count($informes)>=20) throw new InvalidArgumentException('Máximo 20 informes guardados.');
            $id=bin2hex(random_bytes(8));
            $informes[]=['id'=>$id,'titulo'=>$titulo,'tabla'=>$t,'columnas'=>array_values(array_unique($cols)),'filtros'=>$filtros];
            transaccion(function() use($informes,$id) { guardarAjustes('informes',$informes); auditar('guardar_informe','ajustes',$id); });
            jsonSalida(['ok'=>true,'id'=>$id],201);
        case 'informe_eliminar':
            $informes=array_values(array_filter(ajustes('informes',[]),fn($r)=>$r['id']!==($e['id']??'')));
            guardarAjustes('informes',$informes); jsonSalida(['ok'=>true]);
        case 'informe':
            $informe=null;
            foreach(ajustes('informes',[]) as $r) if ($r['id']===($_GET['id']??'')) $informe=$r;
            if (!$informe) throw new InvalidArgumentException('Informe inexistente.');
            jsonSalida(['informe'=>$informe,'datos'=>listado($informe['tabla'],$informe['filtros'],true)]);
        case 'exportar':
            $t=$_GET['tabla']??''; $r=listado($t,$_GET,true);
            header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="'.$t.'.csv"');
            $out=fopen('php://output','w'); fwrite($out,"\xEF\xBB\xBF");
            fputcsv($out,array_column($r['columnas'],'name'),',','"','');
            foreach($r['registros'] as $row) {
                $values=array_map(function($v) {
                    if (is_string($v) && preg_match('/^[=+\-@\t\r]/u',$v)) return "'".$v;
                    return $v;
                },array_values($row));
                fputcsv($out,$values,',','"','');
            }
            fclose($out); exit;
        default: jsonSalida(['ok'=>false,'error'=>'Ruta no encontrada.'],404);
    }
} catch(InvalidArgumentException|JsonException $error) {
    jsonSalida(['ok'=>false,'error'=>$error->getMessage()],422);
} catch(PDOException $error) {
    error_log('[Purple Grape] '.$error->getMessage());
    $msg=str_contains($error->getMessage(),'facturado')?'El pedido está facturado y no admite cambios.':
        (str_contains($error->getMessage(),'FOREIGN KEY')?'Hay registros relacionados. Revisa las relaciones antes de borrar o guardar.':'La base de datos ha rechazado la operación. Revisa los datos y las relaciones.');
    jsonSalida(['ok'=>false,'error'=>$msg],409);
} catch(Throwable $error) {
    error_log('[Purple Grape] '.$error->getMessage());
    jsonSalida(['ok'=>false,'error'=>$error->getMessage()],503);
}

