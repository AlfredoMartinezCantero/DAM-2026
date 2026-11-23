CREATE TABLE oportunidades (
 identificador INTEGER PRIMARY KEY AUTOINCREMENT,
 nombre TEXT NOT NULL, cliente_id INTEGER NOT NULL REFERENCES clientes(identificador),
 valor REAL NOT NULL DEFAULT 0 CHECK(valor>=0),
 etapa TEXT NOT NULL DEFAULT 'Contacto' CHECK(etapa IN ('Contacto','Propuesta','Negociación','Ganada','Perdida')),
 fecha_cierre TEXT, notas TEXT
);
CREATE TABLE facturas (
 identificador INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT NOT NULL UNIQUE,
 pedido_id INTEGER NOT NULL UNIQUE REFERENCES pedidos(identificador),
 cliente TEXT NOT NULL, fecha TEXT NOT NULL,
 base_centimos INTEGER NOT NULL CHECK(base_centimos>=0), iva_centimos INTEGER NOT NULL CHECK(iva_centimos>=0),
 total_centimos INTEGER NOT NULL CHECK(total_centimos=base_centimos+iva_centimos),
 estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK(estado IN ('Pendiente','Sincronizada')),
 referencia_externa TEXT
);
CREATE TABLE ajustes (clave TEXT PRIMARY KEY,valor TEXT NOT NULL);
CREATE TABLE campos_personalizados (
 entidad TEXT NOT NULL,nombre TEXT NOT NULL,definicion TEXT NOT NULL,tabla_nueva INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(entidad,nombre)
);
CREATE TABLE auditoria (
 identificador INTEGER PRIMARY KEY AUTOINCREMENT,fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 accion TEXT NOT NULL,entidad TEXT NOT NULL,registro TEXT,detalle TEXT
);
CREATE TABLE integraciones_log (
 identificador INTEGER PRIMARY KEY AUTOINCREMENT,fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 factura_id INTEGER NOT NULL REFERENCES facturas(identificador),estado TEXT NOT NULL,mensaje TEXT NOT NULL
);
CREATE INDEX ix_pedidos_cliente ON pedidos(cliente_id);
CREATE INDEX ix_pedidos_fecha ON pedidos(fecha);
CREATE INDEX ix_lineas_pedido ON lineaspedido(pedido_id);
CREATE INDEX ix_componentes_proveedor ON componentes(proveedor_id);
CREATE VIEW v_pedidos_detalle AS
 SELECT p.identificador,p.fecha,p.fecha_entrega,p.estado,p.prioridad,
 trim(c.nombre||' '||coalesce(c.apellidos,'')) AS cliente,p.total,
 (SELECT count(*) FROM lineaspedido l WHERE l.pedido_id=p.identificador) AS lineas
 FROM pedidos p JOIN clientes c ON c.identificador=p.cliente_id;
CREATE VIEW v_ventas_cliente AS
 SELECT c.identificador,c.nombre,c.pais,c.segmento,count(p.identificador) AS pedidos,
 coalesce(round(sum(CASE WHEN p.estado!='Cancelado' THEN p.total ELSE 0 END),2),0) AS importe
 FROM clientes c LEFT JOIN pedidos p ON p.cliente_id=c.identificador
 GROUP BY c.identificador;
CREATE VIEW v_stock_alertas AS
 SELECT c.identificador,c.nombre,c.tipo,c.stock,c.stock_minimo,p.nombre AS proveedor
 FROM componentes c JOIN proveedores p ON p.identificador=c.proveedor_id
 WHERE c.stock<=c.stock_minimo;
CREATE VIEW v_facturas_estado AS
 SELECT estado,count(*) AS facturas,coalesce(sum(total_centimos),0)/100.0 AS importe
 FROM facturas GROUP BY estado;
-- SQLite no ofrece CREATE PROCEDURE. Estos triggers persisten el cálculo de totales.
CREATE TRIGGER lineas_insert AFTER INSERT ON lineaspedido BEGIN
 UPDATE pedidos SET total=coalesce((SELECT round(sum(cantidad*precio_unitario),2) FROM lineaspedido WHERE pedido_id=NEW.pedido_id),0) WHERE identificador=NEW.pedido_id;
END;
CREATE TRIGGER lineas_update AFTER UPDATE ON lineaspedido BEGIN
 UPDATE pedidos SET total=coalesce((SELECT round(sum(cantidad*precio_unitario),2) FROM lineaspedido WHERE pedido_id=OLD.pedido_id),0) WHERE identificador=OLD.pedido_id;
 UPDATE pedidos SET total=coalesce((SELECT round(sum(cantidad*precio_unitario),2) FROM lineaspedido WHERE pedido_id=NEW.pedido_id),0) WHERE identificador=NEW.pedido_id;
END;
CREATE TRIGGER lineas_delete AFTER DELETE ON lineaspedido BEGIN
 UPDATE pedidos SET total=coalesce((SELECT round(sum(cantidad*precio_unitario),2) FROM lineaspedido WHERE pedido_id=OLD.pedido_id),0) WHERE identificador=OLD.pedido_id;
END;
CREATE TRIGGER factura_bloquea_pedido BEFORE UPDATE ON pedidos
 WHEN EXISTS(SELECT 1 FROM facturas WHERE pedido_id=OLD.identificador)
 BEGIN SELECT RAISE(ABORT,'El pedido está facturado y no admite cambios.'); END;
CREATE TRIGGER factura_bloquea_linea_insert BEFORE INSERT ON lineaspedido
 WHEN EXISTS(SELECT 1 FROM facturas WHERE pedido_id=NEW.pedido_id)
 BEGIN SELECT RAISE(ABORT,'El pedido está facturado y no admite líneas.'); END;
CREATE TRIGGER factura_bloquea_linea_update BEFORE UPDATE ON lineaspedido
 WHEN EXISTS(SELECT 1 FROM facturas WHERE pedido_id IN (OLD.pedido_id,NEW.pedido_id))
 BEGIN SELECT RAISE(ABORT,'El pedido está facturado y no admite cambios.'); END;
CREATE TRIGGER factura_bloquea_linea_delete BEFORE DELETE ON lineaspedido
 WHEN EXISTS(SELECT 1 FROM facturas WHERE pedido_id=OLD.pedido_id)
 BEGIN SELECT RAISE(ABORT,'El pedido está facturado y no admite cambios.'); END;

