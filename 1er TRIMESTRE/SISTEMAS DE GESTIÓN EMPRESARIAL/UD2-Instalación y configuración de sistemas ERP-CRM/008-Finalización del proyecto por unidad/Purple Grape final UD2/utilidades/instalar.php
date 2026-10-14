<?php
// Instalación reproducible desde consola, sin dependencias ni permisos de administrador.
require_once __DIR__.'/../api/nucleo.php';
if(PHP_SAPI!=='cli') { http_response_code(403); exit('Solo disponible desde consola.'); }
$opts=getopt('', ['perfil:','vacia','nombre:']);
try {
    $resultado=instalar(['perfil'=>$opts['perfil']??'completo','nombre'=>$opts['nombre']??'Purple Grape','color'=>'#7c3aed','demo'=>!isset($opts['vacia'])]);
    echo json_encode($resultado,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;
} catch(Throwable $error) { fwrite(STDERR,$error->getMessage().PHP_EOL); exit(1); }
