<?php
$config=require __DIR__.'/../config/aplicacion.php';
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['nombre'=>$config['nombre'],'color'=>$config['color']],JSON_UNESCAPED_UNICODE);

