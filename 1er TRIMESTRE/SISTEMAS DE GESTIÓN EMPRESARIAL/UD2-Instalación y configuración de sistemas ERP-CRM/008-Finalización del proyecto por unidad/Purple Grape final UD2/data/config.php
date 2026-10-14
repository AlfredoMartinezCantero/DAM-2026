<?php
// Compatibilidad con el punto de lectura anterior; la configuración vive en SQLite.
require_once __DIR__.'/../api/nucleo.php';
header('Content-Type: application/json; charset=utf-8');
try { responder(configuracion(conexion())); } catch(Throwable $e) { error_api($e); }
