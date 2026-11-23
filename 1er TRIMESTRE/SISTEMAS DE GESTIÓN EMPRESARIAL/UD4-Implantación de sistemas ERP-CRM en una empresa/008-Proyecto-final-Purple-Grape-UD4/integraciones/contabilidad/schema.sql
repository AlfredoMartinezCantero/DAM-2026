CREATE TABLE IF NOT EXISTS documentos (
 identificador INTEGER PRIMARY KEY AUTOINCREMENT,
 origen TEXT NOT NULL,documento TEXT NOT NULL,fecha TEXT NOT NULL,cliente TEXT NOT NULL,
 base_centimos INTEGER NOT NULL CHECK(base_centimos>=0),iva_centimos INTEGER NOT NULL CHECK(iva_centimos>=0),
 total_centimos INTEGER NOT NULL CHECK(total_centimos=base_centimos+iva_centimos),
 UNIQUE(origen,documento)
);
CREATE TABLE IF NOT EXISTS movimientos (
 identificador INTEGER PRIMARY KEY AUTOINCREMENT,
 documento_id INTEGER NOT NULL REFERENCES documentos(identificador),
 cuenta TEXT NOT NULL CHECK(cuenta IN('430','700','477')),
 debe_centimos INTEGER NOT NULL CHECK(debe_centimos>=0),
 haber_centimos INTEGER NOT NULL CHECK(haber_centimos>=0),
 UNIQUE(documento_id,cuenta)
);

