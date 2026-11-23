<?php
declare(strict_types=1);
date_default_timezone_set('Europe/Madrid');
$config = require __DIR__.'/../config/aplicacion.php';

function db(): PDO {
    global $config;
    static $db;
    if (!$db) {
        if (!is_file($config['db'])) throw new RuntimeException('Falta la base de datos. Ejecuta php util/migrar.php.');
        $db = new PDO('sqlite:'.$config['db'], null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]);
        $db->exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
    }
    return $db;
}
function consulta(string $sql, array $valores = []): array {
    $s=db()->prepare($sql); $s->execute($valores); return $s->fetchAll();
}
function ejecutar(string $sql, array $valores = []): int {
    $s=db()->prepare($sql); $s->execute($valores); return $s->rowCount();
}
function uno(string $sql, array $valores = []): ?array { return consulta($sql,$valores)[0] ?? null; }
function identificador(string $nombre): string {
    if (!preg_match('/^[a-z][a-z0-9_]{0,47}$/D',$nombre)) throw new InvalidArgumentException('Usa un nombre SQL en minúsculas, sin espacios ni acentos.');
    return '"'.$nombre.'"';
}
function ajustes(string $clave, mixed $defecto = null): mixed {
    $fila=uno('SELECT valor FROM ajustes WHERE clave=?',[$clave]);
    return $fila ? json_decode($fila['valor'],true,512,JSON_THROW_ON_ERROR) : $defecto;
}
function guardarAjustes(string $clave, mixed $valor): void {
    ejecutar('INSERT INTO ajustes(clave,valor) VALUES(?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor',[$clave,json_encode($valor,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
}
function auditar(string $accion, string $tabla, mixed $id, mixed $detalle = null): void {
    ejecutar('INSERT INTO auditoria(accion,entidad,registro,detalle) VALUES(?,?,?,?)',
        [$accion,$tabla,(string)$id,json_encode($detalle,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
}
function transaccion(callable $operacion): mixed {
    db()->exec('BEGIN IMMEDIATE');
    try { $r=$operacion(); db()->exec('COMMIT'); return $r; }
    catch(Throwable $e) { db()->exec('ROLLBACK'); throw $e; }
}
function jsonSalida(mixed $datos, int $estado = 200): never {
    http_response_code($estado); header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff');
    echo json_encode($datos,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR); exit;
}
function entrada(): array {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0)>131072) throw new InvalidArgumentException('Petición demasiado grande.');
    $dato=json_decode(file_get_contents('php://input'),true,512,JSON_THROW_ON_ERROR);
    if (!is_array($dato) || array_is_list($dato)) throw new InvalidArgumentException('Se requiere un objeto JSON.');
    return $dato;
}
function sesion(): void {
    if (session_status()!==PHP_SESSION_ACTIVE) {
        session_set_cookie_params(['httponly'=>true,'samesite'=>'Strict','secure'=>!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off']);
        session_start();
    }
    $_SESSION['csrf'] ??= bin2hex(random_bytes(24));
}
function protegerEscritura(): void {
    if ($_SERVER['REQUEST_METHOD']!=='POST') jsonSalida(['ok'=>false,'error'=>'Usa POST.'],405);
    if (!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) jsonSalida(['ok'=>false,'error'=>'Sesión caducada. Recarga la página.'],403);
}
function httpJson(string $url, ?array $body = null, array $cabeceras = [], int $tiempo = 15): array {
    $c=curl_init($url); $headers=array_merge(['Accept: application/json'],$cabeceras);
    $options=[CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>4,CURLOPT_TIMEOUT=>$tiempo,
        CURLOPT_PROTOCOLS=>CURLPROTO_HTTP|CURLPROTO_HTTPS,CURLOPT_FOLLOWLOCATION=>false];
    if ($body!==null) { $options[CURLOPT_POST]=true; $options[CURLOPT_POSTFIELDS]=json_encode($body,JSON_THROW_ON_ERROR); $headers[]='Content-Type: application/json'; }
    $options[CURLOPT_HTTPHEADER]=$headers; curl_setopt_array($c,$options);
    $raw=curl_exec($c); $error=curl_error($c); $status=curl_getinfo($c,CURLINFO_RESPONSE_CODE);
    if ($raw===false) throw new RuntimeException('No se pudo conectar con el servicio: '.$error);
    $result=json_decode($raw,true,512,JSON_THROW_ON_ERROR);
    if (!is_array($result)) throw new RuntimeException('El servicio no devolvió un objeto JSON.');
    if ($status>=400) throw new RuntimeException($result['error'] ?? 'Error HTTP '.$status.' del servicio externo.');
    return $result;
}

