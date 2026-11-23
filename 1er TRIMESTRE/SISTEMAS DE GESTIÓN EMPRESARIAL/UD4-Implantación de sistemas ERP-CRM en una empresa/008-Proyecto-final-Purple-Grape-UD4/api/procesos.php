<?php
declare(strict_types=1);
require_once __DIR__.'/metadatos.php';
function guardarRegistro(string $tabla, array $datos, ?int $id): array {
    return transaccion(function() use($tabla,$datos,$id) {
        $datos=validarDatos($tabla,$datos,$id===null); $segura=identificador($tabla);
        if (!$datos) throw new InvalidArgumentException('No hay campos para guardar.');
        $campos=array_keys($datos);
        if ($id===null) {
            ejecutar('INSERT INTO '.$segura.' ('.implode(',',array_map('identificador',$campos)).') VALUES ('.implode(',',array_fill(0,count($campos),'?')).')',array_values($datos));
            $id=(int)db()->lastInsertId();
        } else {
            if (!uno("SELECT identificador FROM $segura WHERE identificador=?",[$id])) throw new InvalidArgumentException('El registro ya no existe.');
            ejecutar("UPDATE $segura SET ".implode(',',array_map(fn($n)=>identificador($n).'=?',$campos)).' WHERE identificador=?',[...array_values($datos),$id]);
        }
        auditar('guardar',$tabla,$id,$datos); return ['ok'=>true,'id'=>$id];
    });
}
function emitirFactura(int $pedidoId): array {
    return transaccion(function() use($pedidoId) {
        if ($f=uno('SELECT * FROM facturas WHERE pedido_id=?',[$pedidoId])) return ['ok'=>true,'factura'=>$f,'duplicada'=>true];
        $p=uno('SELECT p.*,trim(c.nombre||" "||coalesce(c.apellidos,"")) AS cliente FROM pedidos p JOIN clientes c ON c.identificador=p.cliente_id WHERE p.identificador=?',[$pedidoId]);
        if (!$p || !in_array($p['estado'],['Confirmado','En fabricación','Entregado'],true)) throw new InvalidArgumentException('Selecciona un pedido confirmado, en fabricación o entregado.');
        if (!uno('SELECT 1 FROM lineaspedido WHERE pedido_id=?',[$pedidoId])) throw new InvalidArgumentException('El pedido no tiene líneas.');
        $base=(int)round((float)$p['total']*100); $iva=(int)round($base*0.21); $numero='PG-'.date('Y').'-P'.$pedidoId;
        ejecutar('INSERT INTO facturas(numero,pedido_id,cliente,fecha,base_centimos,iva_centimos,total_centimos) VALUES(?,?,?,?,?,?,?)',
            [$numero,$pedidoId,$p['cliente'],date('Y-m-d'),$base,$iva,$base+$iva]);
        $id=(int)db()->lastInsertId(); auditar('emitir_factura','facturas',$id,['pedido'=>$pedidoId]);
        return ['ok'=>true,'factura'=>uno('SELECT * FROM facturas WHERE identificador=?',[$id]),'duplicada'=>false];
    });
}
function sincronizarFactura(int $id): array {
    global $config;
    $f=uno('SELECT * FROM facturas WHERE identificador=?',[$id]);
    if (!$f) throw new InvalidArgumentException('Factura inexistente.');
    $payload=['origen'=>'purple-grape-ud4','documento'=>$f['numero'],'fecha'=>$f['fecha'],'cliente'=>$f['cliente'],
        'base_centimos'=>$f['base_centimos'],'iva_centimos'=>$f['iva_centimos'],'total_centimos'=>$f['total_centimos']];
    try {
        // Sin transacción SQLite abierta durante la conexión remota; reintentos idempotentes.
        $r=httpJson($config['contabilidad_url'],$payload,['Authorization: Bearer '.$config['integracion_clave']]);
        if (($r['ok']??false)!==true || !is_string($r['referencia']??null) || !in_array($r['motor']??'', ['sqlite','mysql'],true))
            throw new RuntimeException('Respuesta contable no válida.');
        transaccion(function() use($r,$id) {
            ejecutar("UPDATE facturas SET estado='Sincronizada',referencia_externa=? WHERE identificador=?",[$r['referencia'],$id]);
            ejecutar("INSERT INTO integraciones_log(factura_id,estado,mensaje) VALUES(?,'OK',?)",[$id,$r['referencia'].' · '.$r['motor']]);
            auditar('sincronizar','facturas',$id,$r);
        });
        return ['ok'=>true]+$r;
    } catch(Throwable $e) {
        ejecutar("INSERT INTO integraciones_log(factura_id,estado,mensaje) VALUES(?,'ERROR',?)",[$id,mb_substr($e->getMessage(),0,1000)]);
        throw new RuntimeException('No se ha confirmado este envío. Puedes reintentarlo. '.$e->getMessage());
    }
}
function adaptarCampo(array $e): array {
    $tabla=$e['tabla']??''; $n=trim($e['nombre']??''); identificador($n);
    $tipos=['text'=>'TEXT','textarea'=>'TEXT','email'=>'TEXT','date'=>'TEXT','number'=>'REAL','checkbox'=>'INTEGER','select'=>'TEXT'];
    $tipo=$e['tipo']??'text';
    if (!isset($tipos[$tipo]) || !in_array($tabla,entidades(),true) || $tabla==='facturas') throw new InvalidArgumentException('Adaptación no permitida.');
    $schema=estructura($tabla);
    if (in_array($n,array_column($schema['columnas'],'name'),true)) throw new InvalidArgumentException('El campo ya existe.');
    $titulo=trim($e['titulo']??$n);
    if (mb_strlen($titulo)>80) throw new InvalidArgumentException('Etiqueta demasiado larga.');
    $def=['titulo'=>$titulo?:$n,'tipo'=>$tipo,'required'=>false,'readonly'=>false];
    if ($tipo==='number') $def+=['min'=>0,'step'=>'0.01'];
    if ($tipo==='checkbox') $def['defecto']=0;
    if ($tipo==='select') {
        $ops=array_values(array_unique(array_filter(array_map('trim',explode(',',$e['opciones']??'')))));
        if (!$ops || count($ops)>20 || max(array_map('mb_strlen',$ops))>80) throw new InvalidArgumentException('Indica entre 1 y 20 opciones separadas por comas, de hasta 80 caracteres.');
        $def['opciones']=$ops;
    }
    return transaccion(function() use($tabla,$n,$tipos,$tipo,$def) {
        db()->exec('ALTER TABLE '.identificador($tabla).' ADD COLUMN '.identificador($n).' '.$tipos[$tipo]);
        ejecutar('INSERT INTO campos_personalizados(entidad,nombre,definicion) VALUES(?,?,?)',[$tabla,$n,json_encode($def,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
        auditar('crear_campo',$tabla,$n,$def); return ['ok'=>true];
    });
}
function crearTabla(array $e): array {
    $nombre=trim($e['nombre']??''); identificador($nombre);
    if (preg_match('/^(sqlite_|v_)/',$nombre) || in_array($nombre,array_merge(entidades(),['ajustes','auditoria','campos_personalizados','integraciones_log']),true)) throw new InvalidArgumentException('Nombre de tabla reservado o existente.');
    return transaccion(function() use($nombre) {
        db()->exec('CREATE TABLE '.identificador($nombre).' (identificador INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,notas TEXT)');
        foreach(['nombre','notas'] as $n) ejecutar('INSERT INTO campos_personalizados(entidad,nombre,definicion,tabla_nueva) VALUES(?,?,?,1)',
            [$nombre,$n,json_encode(['tipo'=>$n==='notas'?'textarea':'text','required'=>$n==='nombre'],JSON_THROW_ON_ERROR)]);
        auditar('crear_tabla',$nombre,0); return ['ok'=>true];
    });
}
function panel(): array {
    return ajustes('panel',[
        ['id'=>'ventas','titulo'=>'Importe de pedidos por mes','fuente'=>'ventas_mes','tipo'=>'barras','ancho'=>2],
        ['id'=>'estados','titulo'=>'Estado de los pedidos','fuente'=>'pedidos_estado','tipo'=>'anillo','ancho'=>1],
        ['id'=>'tablas','titulo'=>'Registros por entidad','fuente'=>'registros','tipo'=>'tarta','ancho'=>1],
        ['id'=>'stock','titulo'=>'Componentes con stock bajo','fuente'=>'stock','tipo'=>'tabla','ancho'=>2],
    ]);
}
function validarPanel(mixed $cards): array {
    if (!is_array($cards) || !array_is_list($cards) || count($cards)<1 || count($cards)>12) throw new InvalidArgumentException('Configura entre 1 y 12 tarjetas.');
    $out=[]; $ids=[];
    foreach($cards as $i=>$c) {
        if (!is_array($c) || !in_array($c['fuente']??'',['ventas_mes','pedidos_estado','registros','stock','ventas_cliente'],true)
            || !in_array($c['tipo']??'',['barras','tarta','anillo','tabla'],true) || !in_array($c['ancho']??0,[1,2,3],true)) throw new InvalidArgumentException('Tarjeta no válida.');
        $titulo=trim((string)($c['titulo']??''));
        if ($titulo==='' || mb_strlen($titulo)>100) throw new InvalidArgumentException('El título debe tener entre 1 y 100 caracteres.');
        $id=(string)($c['id']??'tarjeta'.$i);
        if (!preg_match('/^[a-zA-Z0-9_-]{1,40}$/D',$id) || in_array($id,$ids,true)) throw new InvalidArgumentException('Identificador de tarjeta no válido o repetido.');
        $ids[]=$id; $out[]=['id'=>$id,'titulo'=>$titulo,'fuente'=>$c['fuente'],'tipo'=>$c['tipo'],'ancho'=>$c['ancho']];
    }
    return $out;
}
function datosPanel(): array {
    $recuentos=[];
    foreach(entidades() as $t) $recuentos[]=['label'=>$t,'value'=>(int)uno('SELECT count(*) AS n FROM '.identificador($t))['n']];
    return [
        'kpis'=>[
            'clientes'=>(int)uno('SELECT count(*) AS n FROM clientes')['n'],
            'cartera'=>(float)uno("SELECT coalesce(sum(total),0) AS n FROM pedidos WHERE estado NOT IN('Cancelado','Borrador')")['n'],
            'oportunidades'=>(int)uno("SELECT count(*) AS n FROM oportunidades WHERE etapa NOT IN('Ganada','Perdida')")['n'],
            'alertas'=>(int)uno('SELECT count(*) AS n FROM v_stock_alertas')['n'],
        ],
        'fuentes'=>[
            'ventas_mes'=>consulta("SELECT substr(fecha,1,7) AS label,round(sum(total),2) AS value FROM pedidos WHERE estado!='Cancelado' GROUP BY label ORDER BY label"),
            'pedidos_estado'=>consulta('SELECT estado AS label,count(*) AS value FROM pedidos GROUP BY estado ORDER BY estado'),
            'ventas_cliente'=>consulta('SELECT nombre AS label,importe AS value FROM v_ventas_cliente WHERE importe>0 ORDER BY importe DESC LIMIT 10'),
            'registros'=>$recuentos,
            'stock'=>consulta("SELECT nombre AS label,stock AS value FROM v_stock_alertas ORDER BY stock"),
        ],'tarjetas'=>panel()
    ];
}

