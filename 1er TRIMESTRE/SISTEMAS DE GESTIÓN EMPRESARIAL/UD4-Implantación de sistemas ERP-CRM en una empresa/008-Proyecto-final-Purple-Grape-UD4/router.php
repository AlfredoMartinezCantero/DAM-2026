<?php
// Router del servidor PHP de desarrollo; Apache usa .htaccess.
$path=rawurldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH)?:'/');
if (str_contains($path,'..') || preg_match('~(^|/)(data|var|config|tests|sql|docs|util|\.git)(/|$)|(^|/)\.|/(bootstrap|metadatos|procesos|ia)\.php$~',$path)) {
    http_response_code(403); exit('Acceso no permitido');
}
$file=__DIR__.$path;
if ($path==='/') { readfile(__DIR__.'/index.html'); return true; }
if (!is_file($file)) { http_response_code(404); exit('Recurso no encontrado'); }
return false;

