<?php
declare(strict_types=1);
// Segundo sistema independiente: API contable, con su base y su transacción.
require_once __DIR__.'/../../api/bootstrap.php';
try {
    if (!hash_equals('Bearer '.$config['integracion_clave'],$_SERVER['HTTP_AUTHORIZATION']??'')) jsonSalida(['ok'=>false,'error'=>'Clave de integración no válida.'],401);
    $mysql=$config['mysql_dsn']!=='';
    $contable=new PDO($mysql?$config['mysql_dsn']:'sqlite:'.$config['contabilidad_db'],
        $mysql?$config['mysql_usuario']:null,$mysql?$config['mysql_clave']:null,
        [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    if (!$mysql) {
        $contable->exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
        $contable->exec(file_get_contents(__DIR__.'/schema.sql'));
    }
    if ($_SERVER['REQUEST_METHOD']==='GET') {
        $docs=$contable->query('SELECT * FROM documentos ORDER BY identificador DESC LIMIT 50')->fetchAll();
        $saldos=$contable->query('SELECT cuenta,sum(debe_centimos) AS debe_centimos,sum(haber_centimos) AS haber_centimos FROM movimientos GROUP BY cuenta ORDER BY cuenta')->fetchAll();
        jsonSalida(['ok'=>true,'sistema'=>'Grape Contabilidad · ERP académico','motor'=>$mysql?'mysql':'sqlite','procedimiento'=>$mysql?'sp_contabilizar_factura':'Transacción SQLite de demostración','documentos'=>$docs,'saldos'=>$saldos]);
    }
    if ($_SERVER['REQUEST_METHOD']!=='POST') jsonSalida(['ok'=>false,'error'=>'Método no permitido.'],405);
    $e=entrada();
    foreach(['origen','documento','fecha','cliente'] as $k) if (!is_string($e[$k]??null) || !trim($e[$k]) || mb_strlen($e[$k])>200) throw new InvalidArgumentException('Campo contable no válido: '.$k);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$e['fecha']) || !checkdate((int)substr($e['fecha'],5,2),(int)substr($e['fecha'],8,2),(int)substr($e['fecha'],0,4))) throw new InvalidArgumentException('Fecha contable no válida.');
    foreach(['base_centimos','iva_centimos','total_centimos'] as $k)
        if (!is_int($e[$k]??null) || $e[$k]<0 || $e[$k]>1000000000000000) throw new InvalidArgumentException('Importe no válido: '.$k);
    if ($e['total_centimos']!==$e['base_centimos']+$e['iva_centimos']) throw new InvalidArgumentException('El asiento no cuadra.');
    if ($mysql) {
        $stmt=$contable->prepare('CALL sp_contabilizar_factura(?,?,?,?,?,?,?)');
        $stmt->execute([$e['origen'],$e['documento'],$e['fecha'],$e['cliente'],$e['base_centimos'],$e['iva_centimos'],$e['total_centimos']]);
        $r=$stmt->fetch(); $stmt->closeCursor(); $id=(int)$r['identificador']; $duplicada=(bool)$r['duplicada'];
    } else {
        $contable->exec('BEGIN IMMEDIATE');
        try {
            $s=$contable->prepare('SELECT * FROM documentos WHERE origen=? AND documento=?'); $s->execute([$e['origen'],$e['documento']]); $prev=$s->fetch();
            $duplicada=(bool)$prev;
            if ($prev) {
                foreach(['fecha','cliente','base_centimos','iva_centimos','total_centimos'] as $k) if ((string)$prev[$k] !== (string)$e[$k]) throw new InvalidArgumentException('Documento ya contabilizado con otros datos.');
                $id=(int)$prev['identificador'];
            } else {
                $s=$contable->prepare('INSERT INTO documentos(origen,documento,fecha,cliente,base_centimos,iva_centimos,total_centimos) VALUES(?,?,?,?,?,?,?)');
                $s->execute([$e['origen'],$e['documento'],$e['fecha'],$e['cliente'],$e['base_centimos'],$e['iva_centimos'],$e['total_centimos']]);
                $id=(int)$contable->lastInsertId();
                $s=$contable->prepare('INSERT INTO movimientos(documento_id,cuenta,debe_centimos,haber_centimos) VALUES(?,?,?,?)');
                foreach([['430',$e['total_centimos'],0],['700',0,$e['base_centimos']],['477',0,$e['iva_centimos']]] as $l) $s->execute([$id,...$l]);
            }
            $contable->exec('COMMIT');
        } catch(Throwable $error) { $contable->exec('ROLLBACK'); throw $error; }
    }
    jsonSalida(['ok'=>true,'referencia'=>'AS-'.$id,'duplicada'=>$duplicada,'motor'=>$mysql?'mysql':'sqlite']);
} catch(InvalidArgumentException|JsonException $error) { jsonSalida(['ok'=>false,'error'=>$error->getMessage()],422); }
catch(Throwable $error) { error_log('[Contabilidad] '.$error->getMessage()); jsonSalida(['ok'=>false,'error'=>'Servicio contable no disponible. Revisa la configuración y el registro PHP.'],503); }

