<?php
require_once __DIR__.'/nucleo.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
sesion();
function filas(PDO $db,string $tabla): array {
    entidad($tabla);
    $fuente=['pedidos'=>'resumen_pedidos','facturas'=>'resumen_facturas'][$tabla]??$tabla;
    return $db->query('SELECT * FROM "'.$fuente.'" ORDER BY id DESC')->fetchAll();
}
function validar_datos(array $meta,array $datos): array {
    if(array_diff(array_keys($datos),array_keys($meta['campos']))) throw new InvalidArgumentException('Hay campos desconocidos.');
    $salida=[];
    foreach($meta['campos'] as $campo=>$info) {
        $v=$datos[$campo]??'';
        if(!is_scalar($v)) throw new InvalidArgumentException('Valor no válido: '.$info['label']);
        $v=trim((string)$v);
        if($info['required']&&$v==='') throw new InvalidArgumentException('Completa '.$info['label'].'.');
        if(strlen($v)>2000) throw new InvalidArgumentException('Texto demasiado largo.');
        if($info['type']==='email'&&!filter_var($v,FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('Correo no válido.');
        if($info['type']==='date') {
            $d=DateTimeImmutable::createFromFormat('!Y-m-d',$v);
            if(!$d||$d->format('Y-m-d')!==$v) throw new InvalidArgumentException('Fecha no válida.');
        }
        if($info['type']==='select'&&!in_array($v,$info['options'],true)) throw new InvalidArgumentException('Estado no válido.');
        if(in_array($info['type'],['number','integer','relation'],true)) {
            if(!is_numeric($v)||!is_finite((float)$v)||($info['type']!=='number'&&!preg_match('/^\d+$/',$v))||(float)$v<($info['min']??1)||(float)$v>1000000000) throw new InvalidArgumentException('Número no válido: '.$info['label']);
            $v=$info['type']==='number'?round((float)$v,2):(int)$v;
        }
        $salida[$campo]=$v;
    }
    return $salida;
}
try {
    $db=conexion(); $ruta=$_GET['ruta']??'inicio';
    if($ruta==='inicio') {
        $catalogo=catalogo(); $activos=activos($db);
        $modulos=array_intersect_key($catalogo,array_flip($activos));
        responder(['config'=>configuracion($db),'modulos'=>$modulos,'csrf'=>$_SESSION['csrf']]);
    } elseif($ruta==='resumen') {
        $on=activos($db); $kpis=[];
        if(in_array('crm',$on,true)) $kpis['clientes']=(int)$db->query('SELECT COUNT(*) FROM clientes')->fetchColumn();
        if(in_array('ventas',$on,true)) $kpis['pedidos']=(int)$db->query("SELECT COUNT(*) FROM pedidos WHERE estado IN ('Pendiente','Confirmado')")->fetchColumn();
        if(in_array('facturacion',$on,true)) $kpis['cobros']=(float)$db->query("SELECT COALESCE(SUM(total),0) FROM resumen_facturas WHERE estado='Pendiente'")->fetchColumn();
        if(in_array('inventario',$on,true)) $kpis['stock']=(int)$db->query('SELECT COUNT(*) FROM productos WHERE stock<=stock_minimo')->fetchColumn();
        responder(['kpis'=>$kpis,'pedidos'=>in_array('ventas',$on,true)?array_slice(filas($db,'pedidos'),0,5):[], 'stock'=>in_array('inventario',$on,true)?$db->query('SELECT * FROM productos WHERE stock<=stock_minimo ORDER BY stock LIMIT 5')->fetchAll():[], 'actividad'=>$db->query('SELECT * FROM actividad ORDER BY id DESC LIMIT 7')->fetchAll()]);
    } elseif($ruta==='opciones') {
        $op=[];
        // Lectura de referencias también para módulos dependientes (sin permitir editarlos).
        foreach(['clientes','productos','proveedores','pedidos'] as $t) {
            $op[$t]=array_map(fn($r)=>['id'=>$r['id'],'nombre'=>$t==='pedidos'?'#'.str_pad($r['id'],4,'0',STR_PAD_LEFT).' · '.$r['cliente']: $r['nombre']],filas($db,$t));
        }
        responder($op);
    } elseif(in_array($ruta,['tabla','crear','actualizar','eliminar'],true)) {
        if($ruta!=='tabla') escritura();
        $e=$ruta==='tabla'?$_GET:entrada();
        $tabla=$e['tabla']??'';
        if(!is_string($tabla)) throw new InvalidArgumentException('Entidad no válida.');
        $meta=entidad($tabla);
        if(!in_array($meta['modulo'],activos($db),true)) { http_response_code(403); throw new InvalidArgumentException('Este módulo está desactivado en el perfil actual.'); }
        if($ruta==='tabla') responder(['meta'=>$meta,'registros'=>filas($db,$tabla)]);
        else {
            escritura();
            $id=$e['id']??null;
            if($ruta!=='crear'&&(!is_scalar($id)||!ctype_digit((string)$id)||(int)$id<1)) throw new InvalidArgumentException('Identificador no válido.');
            $db->beginTransaction();
            if($ruta!=='crear') {
                $st=$db->prepare('SELECT id FROM "'.$tabla.'" WHERE id=?'); $st->execute([$id]);
                if(!$st->fetch()) { http_response_code(404); throw new InvalidArgumentException('El registro ya no existe.'); }
            }
            // Una factura congela sus líneas y el cliente/estado del pedido para conservar el importe.
            if(in_array($tabla,['lineaspedido','pedidos'],true)) {
                $pedidos=[];
                if($tabla==='pedidos'&&$id) $pedidos[]=$id;
                if($tabla==='lineaspedido') {
                    if($id) { $st=$db->prepare('SELECT pedido_id FROM lineaspedido WHERE id=?'); $st->execute([$id]); $pedidos[]=$st->fetchColumn(); }
                    if(isset($e['datos']['pedido_id'])) $pedidos[]=$e['datos']['pedido_id'];
                }
                foreach($pedidos as $pedido) { $st=$db->prepare('SELECT id FROM facturas WHERE pedido_id=?'); $st->execute([$pedido]); if($st->fetch()) throw new InvalidArgumentException('El pedido está facturado. Elimina primero su factura si necesitas corregirlo.'); }
            }
            if($ruta==='eliminar') $db->prepare('DELETE FROM "'.$tabla.'" WHERE id=?')->execute([$id]);
            else {
                if(!isset($e['datos'])||!is_array($e['datos'])) throw new InvalidArgumentException('Datos no válidos.');
                $datos=validar_datos($meta,$e['datos']);
                if($tabla==='facturas') {
                    if($datos['vencimiento']<$datos['fecha']) throw new InvalidArgumentException('El vencimiento debe ser posterior o igual a la emisión.');
                    $st=$db->prepare('SELECT total,estado FROM resumen_pedidos WHERE id=?'); $st->execute([$datos['pedido_id']]); $pedido=$st->fetch();
                    if(!$pedido||$pedido['total']<=0||$pedido['estado']==='Cancelado') throw new InvalidArgumentException('Para facturar, elige un pedido con líneas y que no esté cancelado.');
                }
                $campos=array_keys($datos);
                if($ruta==='crear') {
                    $sql='INSERT INTO "'.$tabla.'" ('.implode(',',$campos).') VALUES ('.implode(',',array_fill(0,count($campos),'?')).')';
                    $db->prepare($sql)->execute(array_values($datos)); $id=$db->lastInsertId();
                } else {
                    $sql='UPDATE "'.$tabla.'" SET '.implode(',',array_map(fn($c)=>$c.'=?',$campos)).' WHERE id=?';
                    $db->prepare($sql)->execute([...array_values($datos),$id]);
                }
            }
            registrar($db,['crear'=>'Creación','actualizar'=>'Edición','eliminar'=>'Eliminación'][$ruta],$tabla,'Registro #'.$id);
            $db->commit(); responder(['ok'=>true,'id'=>(int)$id]);
        }
    } elseif($ruta==='configurar') {
        escritura(); $db->beginTransaction(); configurar($db,entrada()); $db->commit(); responder(['ok'=>true]);
    } elseif($ruta==='exportar') {
        $tablas=[]; foreach(catalogo() as $id=>$mod) if(in_array($id,activos($db),true)) foreach($mod['entidades'] as $t=>$m) $tablas[$t]=filas($db,$t);
        header('Content-Disposition: attachment; filename="purple-grape-exportacion.json"');
        responder(['fecha'=>gmdate('c'),'configuracion'=>configuracion($db),'datos'=>$tablas]);
    } else { http_response_code(404); throw new InvalidArgumentException('Ruta no válida.'); }
} catch(Throwable $e) { if(isset($db)&&$db->inTransaction()) $db->rollBack(); error_api($e); }
