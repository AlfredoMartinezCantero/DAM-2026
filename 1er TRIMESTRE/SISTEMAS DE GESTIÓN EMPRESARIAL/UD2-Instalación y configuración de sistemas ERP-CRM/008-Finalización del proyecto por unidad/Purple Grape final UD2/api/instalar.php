<?php
require_once __DIR__.'/nucleo.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
sesion();
try {
    if($_SERVER['REQUEST_METHOD']==='GET') responder(['instalado'=>is_file(ruta_db()),'csrf'=>$_SESSION['csrf'],'perfiles'=>perfiles()]);
    else { escritura(); responder(instalar(entrada())); }
} catch(Throwable $e) { error_api($e); }
