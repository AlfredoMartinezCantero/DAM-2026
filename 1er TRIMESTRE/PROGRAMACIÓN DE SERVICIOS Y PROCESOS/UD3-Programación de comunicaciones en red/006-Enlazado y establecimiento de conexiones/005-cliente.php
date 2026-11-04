<?php

$curl = curl_init("/var/www/html/DAM-2026/DAM-2026/1er TRIMESTRE/PROGRAMACIÓN DE SERVICIOS Y PROCESOS/UD3-Programación de comunicaciones en red/006-Enlazado y establecimiento de conexiones/004-servidor.php");

curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);

$contenido = curl_exec($curl);

curl_close($curl);

echo $contenido;

?>