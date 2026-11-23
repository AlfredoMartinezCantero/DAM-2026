-- Ejecutar exclusivamente en una base nueva dedicada a Grape Contabilidad (MySQL 8).
CREATE TABLE IF NOT EXISTS documentos (
 identificador BIGINT PRIMARY KEY AUTO_INCREMENT,
 origen VARCHAR(200) NOT NULL,documento VARCHAR(200) NOT NULL,fecha DATE NOT NULL,cliente VARCHAR(200) NOT NULL,
 base_centimos BIGINT NOT NULL,iva_centimos BIGINT NOT NULL,total_centimos BIGINT NOT NULL,
 UNIQUE KEY ux_documento(origen,documento),
 CHECK(base_centimos>=0 AND iva_centimos>=0 AND total_centimos=base_centimos+iva_centimos)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS movimientos (
 identificador BIGINT PRIMARY KEY AUTO_INCREMENT,documento_id BIGINT NOT NULL,
 cuenta VARCHAR(3) NOT NULL,debe_centimos BIGINT NOT NULL,haber_centimos BIGINT NOT NULL,
 FOREIGN KEY(documento_id) REFERENCES documentos(identificador),UNIQUE KEY ux_linea(documento_id,cuenta),
 CHECK(debe_centimos>=0 AND haber_centimos>=0),CHECK(cuenta IN('430','700','477'))
) ENGINE=InnoDB;
DROP PROCEDURE IF EXISTS sp_contabilizar_factura;
DELIMITER //
CREATE PROCEDURE sp_contabilizar_factura(
 IN p_origen VARCHAR(200), IN p_documento VARCHAR(200),IN p_fecha DATE,IN p_cliente VARCHAR(200),
 IN p_base BIGINT,IN p_iva BIGINT,IN p_total BIGINT
)
SQL SECURITY INVOKER
MODIFIES SQL DATA
BEGIN
 DECLARE v_id BIGINT;
 DECLARE v_nuevo INT;
 DECLARE v_fecha DATE;
 DECLARE v_cliente VARCHAR(200);
 DECLARE v_base BIGINT;
 DECLARE v_iva BIGINT;
 DECLARE v_total BIGINT;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION
 BEGIN ROLLBACK; RESIGNAL; END;
 IF p_origen IS NULL OR p_origen='' OR p_documento IS NULL OR p_documento='' OR p_fecha IS NULL
  OR p_cliente IS NULL OR p_cliente='' OR p_base IS NULL OR p_iva IS NULL OR p_total IS NULL
  OR p_base<0 OR p_iva<0 OR p_total<>p_base+p_iva THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Documento o importes no validos';
 END IF;
 START TRANSACTION;
 INSERT INTO documentos(origen,documento,fecha,cliente,base_centimos,iva_centimos,total_centimos)
  VALUES(p_origen,p_documento,p_fecha,p_cliente,p_base,p_iva,p_total)
  ON DUPLICATE KEY UPDATE identificador=LAST_INSERT_ID(identificador);
 SET v_nuevo=ROW_COUNT();
 SELECT identificador,fecha,cliente,base_centimos,iva_centimos,total_centimos
  INTO v_id,v_fecha,v_cliente,v_base,v_iva,v_total
  FROM documentos WHERE origen=p_origen AND documento=p_documento FOR UPDATE;
 IF v_fecha<>p_fecha OR BINARY v_cliente<>BINARY p_cliente OR v_base<>p_base OR v_iva<>p_iva OR v_total<>p_total THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Documento existente con otros datos';
 END IF;
 IF v_nuevo=1 THEN
  INSERT INTO movimientos(documento_id,cuenta,debe_centimos,haber_centimos)
   VALUES(v_id,'430',p_total,0),(v_id,'700',0,p_base),(v_id,'477',0,p_iva);
 END IF;
 COMMIT;
 SELECT v_id AS identificador,(v_nuevo<>1) AS duplicada;
END//
DELIMITER ;

