<?php
declare(strict_types=1);
// Configuración del servidor; nunca se envían claves al navegador.
return [
    'db' => getenv('PURPLE_DB') ?: __DIR__.'/../data/purplegrape.db',
    'nombre' => 'Purple Grape · ERP / CRM',
    'color' => '#7c3aed',
    'ollama_url' => rtrim(getenv('OLLAMA_URL') ?: 'http://10.0.2.2:11434', '/'),
    'modelo' => 'phi4-mini:latest',
    'contabilidad_url' => getenv('CONTABILIDAD_URL') ?: 'http://127.0.0.1:8085/integraciones/contabilidad/api.php',
    'integracion_clave' => getenv('INTEGRACION_CLAVE') ?: 'purple-grape-demo-local',
    'contabilidad_db' => getenv('CONTABILIDAD_DB') ?: __DIR__.'/../var/contabilidad.sqlite',
    'mysql_dsn' => getenv('CONTABILIDAD_MYSQL_DSN') ?: '',
    'mysql_usuario' => getenv('CONTABILIDAD_MYSQL_USUARIO') ?: '',
    'mysql_clave' => getenv('CONTABILIDAD_MYSQL_CLAVE') ?: '',
];

