<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(403); exit('Solo CLI'); }
require_once __DIR__.'/../api/bootstrap.php';
if (ajustesVersion(db())) { echo "Migración UD4 ya aplicada.\n"; exit; }
transaccion(function() {
    $columnas=[
        'clientes'=>["segmento TEXT NOT NULL DEFAULT 'Aerolínea'","activo INTEGER NOT NULL DEFAULT 1 CHECK(activo IN(0,1))"],
        'pedidos'=>["prioridad TEXT NOT NULL DEFAULT 'Normal'","notas TEXT","fecha_entrega TEXT"],
        'componentes'=>["stock_minimo INTEGER NOT NULL DEFAULT 25 CHECK(stock_minimo>=0)"],
    ];
    foreach($columnas as $tabla=>$campos) foreach($campos as $sql) db()->exec('ALTER TABLE '.$tabla.' ADD COLUMN '.$sql);
    db()->exec(file_get_contents(__DIR__.'/../data/migracion-ud4.sql'));
    db()->exec("UPDATE pedidos SET total=coalesce((SELECT round(sum(cantidad*precio_unitario),2) FROM lineaspedido WHERE pedido_id=pedidos.identificador),0)");
    ejecutar("INSERT INTO oportunidades(nombre,cliente_id,valor,etapa,fecha_cierre,notas) VALUES(?,?,?,?,?,?)",
        ['Renovación de flota',1,125000000,'Propuesta','2026-12-15','Ejemplo UD4; oportunidad comercial.']);
    guardarAjustes('version',4); guardarAjustes('modulos',['ventas','compras','rrhh','facturacion']);
    auditar('migracion','sistema',4,'Copia UD3, campos, tablas, vistas, índices y triggers UD4.');
});
echo "Migración UD4 aplicada sin reemplazar registros de UD3.\n";
function ajustesVersion(PDO $db): bool {
    $existe=$db->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ajustes'")->fetchColumn();
    return $existe && (int)ajustes('version',0)>=4;
}

