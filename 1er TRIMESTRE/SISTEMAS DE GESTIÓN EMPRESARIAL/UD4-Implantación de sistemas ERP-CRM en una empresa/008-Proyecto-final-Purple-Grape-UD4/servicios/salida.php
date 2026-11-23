<?php
require_once __DIR__.'/../api/metadatos.php';
try { jsonSalida(listado($_GET['tabla']??'clientes',$_GET,true)); }
catch(Throwable $e) { jsonSalida(['ok'=>false,'error'=>$e->getMessage()],422); }

