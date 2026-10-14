<?php
// Exportación de lectura: incluye también tablas vacías y sin clave primaria.
header('Content-Type: application/json; charset=utf-8');
try {
  $db = new SQLite3(__DIR__.'/../data/darkorange.db', SQLITE3_OPEN_READONLY);
  $db->enableExceptions(true);
  $db->exec('BEGIN');
  $resultado = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  $tablas = [];
  while ($fila = $resultado->fetchArray(SQLITE3_ASSOC)) {
    $nombre = $fila['name'];
    $identificador = '"'.str_replace('"', '""', $nombre).'"';
    $esquema = $db->query("PRAGMA table_info($identificador)");
    $columnas = [];
    while ($columna = $esquema->fetchArray(SQLITE3_ASSOC)) $columnas[] = $columna;
    $consulta = $db->query("SELECT * FROM $identificador");
    $registros = [];
    while ($registro = $consulta->fetchArray(SQLITE3_ASSOC)) $registros[] = $registro;
    $tablas[] = ['nombre'=>$nombre, 'columnas'=>$columnas, 'registros'=>$registros];
  }
  $db->exec('COMMIT');
  $db->close();
  echo json_encode(['tablas'=>$tablas], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR);
} catch (Throwable $error) {
  http_response_code(500);
  echo json_encode(['error'=>'No se ha podido generar el informe de la base de datos.']);
}
