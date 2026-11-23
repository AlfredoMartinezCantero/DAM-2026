<?php
declare(strict_types=1);
require_once __DIR__.'/bootstrap.php';

function catalogo(): array {
    return [
        'ventas'=>['titulo'=>'Ventas y CRM','entidades'=>['clientes','productos','pedidos','lineaspedido','oportunidades']],
        'compras'=>['titulo'=>'Compras y almacén','entidades'=>['proveedores','componentes']],
        'rrhh'=>['titulo'=>'Personas','entidades'=>['empleados']],
        'facturacion'=>['titulo'=>'Facturación','entidades'=>['facturas']],
    ];
}
function entidades(): array {
    $nombres=[];
    foreach(catalogo() as $m) $nombres=array_merge($nombres,$m['entidades']);
    foreach(consulta('SELECT DISTINCT entidad FROM campos_personalizados WHERE tabla_nueva=1') as $t) $nombres[]=$t['entidad'];
    return array_values(array_unique($nombres));
}
function vistas(): array { return ['v_pedidos_detalle','v_ventas_cliente','v_stock_alertas','v_facturas_estado']; }
function campoBase(string $tabla, string $nombre, string $tipo): array {
    $c=['name'=>$nombre,'titulo'=>ucfirst(str_replace('_',' ',$nombre)),'tipo'=>'text','required'=>false];
    if (str_contains($tipo,'INT') || str_contains($tipo,'REAL')) { $c['tipo']='number'; $c['min']=0; $c['step']=str_contains($tipo,'REAL')?'0.01':'1'; }
    if (in_array($nombre,['nombre','fecha','cliente_id','pedido_id','producto_id','proveedor_id','cantidad','precio_unitario','precio','stock'],true)) $c['required']=true;
    if (in_array($nombre,['fecha','fecha_entrega','fecha_cierre'],true)) $c['tipo']='date';
    if ($nombre==='email') $c['tipo']='email';
    if ($nombre==='telefono') $c['tipo']='tel';
    if ($nombre==='notas') $c['tipo']='textarea';
    if ($nombre==='activo') { $c['tipo']='checkbox'; $c['defecto']=1; }
    $enums=[
        'segmento'=>['Aerolínea','Distribuidor','Particular'],
        'prioridad'=>['Normal','Alta','Urgente'],
        'etapa'=>['Contacto','Propuesta','Negociación','Ganada','Perdida'],
    ];
    if ($tabla==='pedidos' && $nombre==='estado') $enums['estado']=['Borrador','Confirmado','En fabricación','Entregado','Cancelado'];
    if (isset($enums[$nombre])) { $c['tipo']='select'; $c['opciones']=$enums[$nombre]; $c['defecto']=$enums[$nombre][0]; }
    $relaciones=['cliente_id'=>'clientes','pedido_id'=>'pedidos','producto_id'=>'productos','proveedor_id'=>'proveedores'];
    if (isset($relaciones[$nombre])) { $c['tipo']='relacion'; $c['relacion']=$relaciones[$nombre]; $c['required']=true; }
    if ($nombre==='cantidad') $c['min']=1;
    if ($tabla==='pedidos' && $nombre==='total') $c['readonly']=true;
    return $c;
}
function estructura(string $tabla): array {
    if (!in_array($tabla,array_merge(entidades(),vistas()),true)) throw new InvalidArgumentException('Entidad no permitida.');
    $columnas=consulta('PRAGMA table_info('.identificador($tabla).')');
    $custom=consulta('SELECT nombre,definicion FROM campos_personalizados WHERE entidad=?',[$tabla]);
    $mapa=array_column($custom,'definicion','nombre');
    foreach($columnas as &$c) {
        $base=campoBase($tabla,$c['name'],strtoupper($c['type']));
        if (isset($mapa[$c['name']])) $base=array_replace($base,json_decode($mapa[$c['name']],true,512,JSON_THROW_ON_ERROR));
        $c=array_replace($c,$base);
        $c['readonly']=($c['pk'] || $tabla==='facturas' || in_array($tabla,vistas(),true)) ? true : ($c['readonly']??false);
    }
    unset($c);
    return ['columnas'=>$columnas,'clavePrimaria'=>'identificador','soloLectura'=>$tabla==='facturas' || in_array($tabla,vistas(),true)];
}
function validarDatos(string $tabla, array $datos, bool $crear): array {
    $schema=estructura($tabla);
    if ($schema['soloLectura']) throw new InvalidArgumentException('Esta entidad se gestiona mediante procesos.');
    $campos=array_column($schema['columnas'],null,'name'); $limpios=[];
    foreach($datos as $n=>$v) {
        if (!isset($campos[$n]) || $campos[$n]['readonly']) throw new InvalidArgumentException('Campo no editable: '.$n);
        if (is_array($v) || is_object($v)) throw new InvalidArgumentException('Valor no válido en '.$n);
        $c=$campos[$n]; $v=is_string($v)?trim($v):$v;
        if ($v==='' || $v===null) {
            if ($c['required']) throw new InvalidArgumentException('Completa '.$c['titulo']);
            $limpios[$n]=null; continue;
        }
        if (in_array($c['tipo'],['number','relacion','checkbox'],true)) {
            if (!is_numeric($v) || !is_finite((float)$v)) throw new InvalidArgumentException('Número no válido en '.$n);
            $entero=$c['tipo']!=='number' || ($c['step']??'1')==='1';
            if ($entero && (float)$v!==floor((float)$v)) throw new InvalidArgumentException('Se requiere un entero en '.$n);
            if ((float)$v<($c['min']??0) || (float)$v>($c['max']??1000000000000)) throw new InvalidArgumentException('Número fuera de rango en '.$n);
            if ($c['tipo']==='checkbox' && !in_array((int)$v,[0,1],true)) throw new InvalidArgumentException('Valor booleano no válido.');
            if ($c['tipo']==='relacion' && !uno('SELECT identificador FROM '.identificador($c['relacion']).' WHERE identificador=?',[$v])) throw new InvalidArgumentException('Relación inexistente: '.$n);
            $v=$entero?(int)$v:round((float)$v,2);
        } else {
            $v=(string)$v;
            if (mb_strlen($v)>($c['tipo']==='textarea'?4000:255)) throw new InvalidArgumentException('Texto demasiado largo en '.$n);
            if ($c['tipo']==='email' && !filter_var($v,FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('Email no válido.');
            if ($c['tipo']==='date' && (!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$v) || !checkdate((int)substr($v,5,2),(int)substr($v,8,2),(int)substr($v,0,4)))) throw new InvalidArgumentException('Fecha no válida.');
            if ($c['tipo']==='select' && !in_array($v,$c['opciones'],true)) throw new InvalidArgumentException('Opción no permitida en '.$n);
        }
        $limpios[$n]=$v;
    }
    if ($crear) foreach($campos as $n=>$c) {
        if ($c['readonly'] || array_key_exists($n,$limpios)) continue;
        if (array_key_exists('defecto',$c)) $limpios[$n]=$c['defecto'];
        elseif ($c['required']) throw new InvalidArgumentException('Completa '.$c['titulo']);
    }
    return $limpios;
}
function listado(string $tabla, array $filtros = [], bool $todo = false): array {
    $schema=estructura($tabla); $nombres=array_column($schema['columnas'],'name');
    $where=[]; $params=[];
    if (trim((string)($filtros['buscar']??''))!=='') {
        $where[]='('.implode(' OR ',array_map(fn($n)=>'CAST('.identificador($n).' AS TEXT) LIKE ?', $nombres)).')';
        foreach($nombres as $_) $params[]='%'.mb_substr($filtros['buscar'],0,200).'%';
    }
    if (($filtros['campo']??'')!=='') {
        $campo=$filtros['campo'];
        if (!in_array($campo,$nombres,true)) throw new InvalidArgumentException('Campo de filtro no permitido.');
        $op=$filtros['operador']??'=';
        if (!in_array($op,['=','>=','<=','LIKE'],true)) throw new InvalidArgumentException('Operador no permitido.');
        $where[]=identificador($campo)." $op ?"; $params[]=$op==='LIKE'?'%'.($filtros['valor']??'').'%':($filtros['valor']??'');
    }
    $fecha=in_array('fecha',$nombres,true)?'fecha':(in_array('fecha_cierre',$nombres,true)?'fecha_cierre':null);
    foreach(['desde'=>'>=','hasta'=>'<='] as $key=>$op) {
        if (!empty($filtros[$key])) {
            if (!$fecha || !preg_match('/^\d{4}-\d{2}-\d{2}$/D',$filtros[$key])) throw new InvalidArgumentException('Filtro de fecha no válido para esta entidad.');
            $where[]=identificador($fecha)." $op ?"; $params[]=$filtros[$key];
        }
    }
    $orden=$filtros['orden']??$nombres[0];
    if (!in_array($orden,$nombres,true)) throw new InvalidArgumentException('Orden no permitido.');
    $sentido=($filtros['sentido']??'DESC')==='ASC'?'ASC':'DESC';
    $sql=' FROM '.identificador($tabla).($where?' WHERE '.implode(' AND ',$where):'');
    $total=(int)uno('SELECT COUNT(*) AS n'.$sql,$params)['n'];
    $pagina=max(1,(int)($filtros['pagina']??1)); $limite=$todo?10000:30;
    return $schema+['registros'=>consulta('SELECT *'.$sql.' ORDER BY '.identificador($orden)." $sentido LIMIT $limite OFFSET ".($todo?0:($pagina-1)*$limite),$params),'total'=>$total,'pagina'=>$pagina,'limite'=>$limite];
}

