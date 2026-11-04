<?php
$origen = new SQLite3(__DIR__.'/../../clientes.db', SQLITE3_OPEN_READONLY);
$destino = new SQLite3(__DIR__.'/darkorange.db', SQLITE3_OPEN_READWRITE);
$origen->enableExceptions(true);
$destino->enableExceptions(true);
$destino->exec('BEGIN IMMEDIATE');
try {
    $columnas = $destino->query('PRAGMA table_info(clientes)');
    $tieneApellidos = false;
    while ($columna = $columnas->fetchArray(SQLITE3_ASSOC)) {
        if ($columna['name'] === 'apellidos') $tieneApellidos = true;
    }
    if (!$tieneApellidos) $destino->exec('ALTER TABLE clientes ADD COLUMN apellidos TEXT');
    $insertar = $destino->prepare('INSERT INTO clientes (nombre, apellidos, email)
        SELECT :nombre, :apellidos, :email
        WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE lower(trim(email)) = lower(trim(:email)))');
    $clientes = $origen->query('SELECT nombre, apellidos, email FROM clientes ORDER BY id');
    $total = 0;
    while ($cliente = $clientes->fetchArray(SQLITE3_ASSOC)) {
        foreach ($cliente as $campo => $valor) $insertar->bindValue(':'.$campo, $valor, SQLITE3_TEXT);
        $insertar->execute();
        $total += $destino->changes();
    }
    $destino->exec('COMMIT');
    echo "Clientes importados: ".$total."\n";
} catch (Throwable $error) {
    $destino->exec('ROLLBACK');
    throw $error;
} finally {
    $origen->close();
    $destino->close();
}
