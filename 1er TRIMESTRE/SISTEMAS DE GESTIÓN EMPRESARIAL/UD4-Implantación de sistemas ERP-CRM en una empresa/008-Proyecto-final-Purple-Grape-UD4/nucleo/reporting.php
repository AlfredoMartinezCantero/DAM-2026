<?php
require_once __DIR__.'/../api/metadatos.php';
try {
    $tablas=[];
    foreach(entidades() as $t) $tablas[]=['nombre'=>$t]+listado($t,[],true);
    jsonSalida(['tablas'=>$tablas]);
} catch(Throwable $e) { jsonSalida(['ok'=>false,'error'=>$e->getMessage()],503); }

