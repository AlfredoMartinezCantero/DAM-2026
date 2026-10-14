<?php
require_once __DIR__.'/modulos.php';
function ruta_db(): string { return getenv('DARKORANGE_DB') ?: __DIR__.'/../data/darkorange_alfredo.sqlite'; }
function conexion(): PDO {
    if(!is_file(ruta_db())) throw new RuntimeException('La base de datos no existe. Abre instalador.html o ejecuta utilidades/instalar.php.');
    $db=new PDO('sqlite:'.ruta_db(), null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $db->exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    return $db;
}
function configuracion(PDO $db): array { return $db->query('SELECT clave,valor FROM configuracion')->fetchAll(PDO::FETCH_KEY_PAIR); }
function activos(PDO $db): array { return $db->query('SELECT id FROM modulos WHERE activo=1')->fetchAll(PDO::FETCH_COLUMN); }
function registrar(PDO $db,string $accion,string $entidad,string $detalle): void {
    $db->prepare('INSERT INTO actividad(accion,entidad,detalle) VALUES (?,?,?)')->execute([$accion,$entidad,$detalle]);
}
function configurar(PDO $db,array $e): void {
    $perfil=$e['perfil']??'completo';
    if(!is_string($perfil)||!isset(perfiles()[$perfil])) throw new InvalidArgumentException('Perfil no válido.');
    $nombre=trim((string)($e['nombre']??'Purple Grape'));
    $color=$e['color']??'#7c3aed';
    if(strlen($nombre)<3||strlen($nombre)>100) throw new InvalidArgumentException('El nombre debe tener entre 3 y 100 caracteres.');
    if(!is_string($color)||!preg_match('/^#[0-9a-fA-F]{6}$/',$color)) throw new InvalidArgumentException('Color no válido.');
    $st=$db->prepare('INSERT INTO configuracion(clave,valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor');
    foreach(['nombre'=>$nombre,'color'=>$color,'perfil'=>$perfil] as $k=>$v) $st->execute([$k,$v]);
    $st=$db->prepare('INSERT INTO modulos(id,activo) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET activo=excluded.activo');
    foreach(catalogo() as $id=>$m) $st->execute([$id,(int)in_array($id,perfiles()[$perfil],true)]);
    registrar($db,'Configuración','sistema','Perfil '.$perfil.' · '.$nombre);
}
function instalar(array $opciones): array {
    // Creación exclusiva: dos instalaciones simultáneas no pueden sobrescribirse.
    $archivo=@fopen(ruta_db(), 'x');
    if(!$archivo) throw new InvalidArgumentException(is_file(ruta_db())?'La base ya existe. Configura sus módulos desde Ajustes; la instalación no sobrescribe datos.':'No se puede crear la base. Revisa los permisos de la carpeta data.');
    fclose($archivo);
    $db=new PDO('sqlite:'.ruta_db(),null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    try {
        $db->exec('PRAGMA foreign_keys=ON');
        $db->beginTransaction();
        $db->exec(file_get_contents(__DIR__.'/../data/schema.sql'));
        configurar($db,$opciones);
        if(!empty($opciones['demo'])) $db->exec(file_get_contents(__DIR__.'/../data/demo.sql'));
        registrar($db,'Instalación','sistema',empty($opciones['demo'])?'Instalación vacía':'Instalación con demostración');
        $db->commit();
    } catch(Throwable $error) {
        if($db->inTransaction()) $db->rollBack();
        $db=null;
        unlink(ruta_db()); // Solo el archivo nuevo de esta instalación fallida.
        throw $error;
    }
    return ['ok'=>true,'archivo'=>'data/darkorange_alfredo.sqlite'];
}
function entrada(): array {
    try { $e=json_decode(file_get_contents('php://input'),true,512,JSON_THROW_ON_ERROR); }
    catch(JsonException $error) { throw new InvalidArgumentException('JSON no válido.'); }
    if(!is_array($e)||array_is_list($e)) throw new InvalidArgumentException('Se esperaba un objeto JSON.');
    return $e;
}
function sesion(): void {
    ini_set('session.use_strict_mode','1');
    session_set_cookie_params(['httponly'=>true,'samesite'=>'Strict','secure'=>!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off']);
    session_start();
    if(empty($_SESSION['csrf'])) $_SESSION['csrf']=bin2hex(random_bytes(32));
}
function escritura(): void {
    if($_SERVER['REQUEST_METHOD']!=='POST') { http_response_code(405); throw new InvalidArgumentException('Utiliza POST para modificar datos.'); }
    if(!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??'')) { http_response_code(403); throw new InvalidArgumentException('La sesión ha caducado. Recarga la página.'); }
}
function responder($datos): void { echo json_encode($datos,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR); }
function error_api(Throwable $e): void {
    if($e instanceof PDOException) {
        $mensaje=str_contains($e->getMessage(),'FOREIGN KEY')?'Este registro está relacionado con otros datos. Revisa sus relaciones.':(str_contains($e->getMessage(),'UNIQUE')?'Ya existe un registro con ese correo, número o pedido.':'No se pudo guardar. Revisa los datos y los permisos de la base de datos.');
        error_log($e->getMessage());
    } else $mensaje=$e->getMessage();
    if(http_response_code()<400) http_response_code($e instanceof InvalidArgumentException?422:503);
    responder(['ok'=>false,'error'=>$mensaje]);
}
