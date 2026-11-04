<?php
// Router solo para php -S. Apache usa .htaccess o la configuración de Directory.
$raiz=realpath(__DIR__.'/..');
$ruta=rawurldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH) ?: '/');
$archivo=realpath($raiz.$ruta);
$partes=explode('/',trim($ruta,'/'));
$privada=in_array($partes[0]??'',['data','utilidades','tests','.git','.agents','.codex'],true);
$interna=preg_match('~^/api/(nucleo|modulos)\.php$~',$ruta);
if($privada||$interna||preg_match('/\.(sqlite|db|sql|bak|txt)$/i',$ruta)||($archivo&&$archivo!==$raiz&&!str_starts_with($archivo,$raiz.DIRECTORY_SEPARATOR))) {
    http_response_code(403);header('Content-Type: text/plain; charset=utf-8');echo 'Acceso directo no permitido.';return true;
}
return false;
