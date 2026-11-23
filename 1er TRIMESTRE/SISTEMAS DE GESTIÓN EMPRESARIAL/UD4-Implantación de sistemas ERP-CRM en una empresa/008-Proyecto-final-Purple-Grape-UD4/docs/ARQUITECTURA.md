# Arquitectura y adaptación

## Procedencia

La aplicación mantiene la estructura PHP + SQLite + JavaScript de 017-darkorange. Se conservan datos, informe completo y componentes de formulario, tabla y gráficos, ampliados para UD4. El tema procede de Basic Purple Grape: color #7c3aed e icono marca.svg. El frontend no depende de servicios CDN.

## Capas

~~~text
Navegador
  index.html / codigo.js
  Formulario · Tabla · GraficaSVG
       |
       | JSON + sesión + CSRF en escrituras
       v
api/superapi.php
  metadatos.php: catálogo, tipos, validación y consultas
  procesos.php: adaptación, facturación, panel e integración
  ia.php: agregados → Ollama phi4-mini:latest → propuesta validada
  bootstrap.php: PDO, transacciones, auditoría y HTTP
       |
       +-- data/purplegrape.db
       |
       +-- HTTP + token --> Grape Contabilidad
                             SQLite propio (demostración)
                             o MySQL 8: CALL sp_contabilizar_factura
~~~

Los informes consumen los mismos metadatos y consultas que el ERP. Los componentes emplean textContent para insertar textos de registros en el DOM.

## Modelo

Relaciones heredadas: pedidos → clientes; líneas → pedidos y productos; componentes → proveedores.

Nuevas relaciones: oportunidades → clientes; facturas → pedidos; registro de integración → facturas. Las claves heredadas se llaman identificador.

- **v_pedidos_detalle:** cliente, fecha, entrega, estado, prioridad, total y número de líneas.
- **v_ventas_cliente:** pedidos e importe por cliente; los cancelados se excluyen del importe.
- **v_stock_alertas:** componentes cuyo stock es igual o inferior al mínimo y su proveedor.
- **v_facturas_estado:** recuento e importe agrupados por sincronización.

Los ajustes persistentes se guardan como JSON en la tabla ajustes: versión de migración, módulos, tarjetas e informes. campos_personalizados relaciona controles de interfaz con columnas nuevas. Tipos disponibles: texto, texto largo, email, fecha, número decimal no negativo, booleano y select.

Los campos nuevos son opcionales para que los datos anteriores sigan siendo válidos. Las tablas propias se crean con identificador, nombre y notas. Se pueden ampliar después. La adaptación no acepta SQL libre ni reconstruye tablas.

## Pedidos y factura

1. Las líneas validan producto, pedido, cantidad y precio.
2. Triggers de inserción, actualización y borrado recalculan los pedidos afectados.
3. La emisión exige un pedido confirmado, en fabricación o entregado con al menos una línea.
4. En una transacción se toma una instantánea del cliente, fecha e importes.
5. La relación única de factura con pedido impide emitirlo dos veces.
6. Los triggers bloquean cambios en el pedido y sus líneas después de facturarlo.

Los importes de la factura son céntimos enteros. Los precios de pedidos conservan el REAL de UD3 y se redondean a dos decimales. La factura es un documento académico; no implementa fiscalidad internacional, numeración homologada ni factura electrónica regulada.

## Sincronización contable

El ERP envía origen, número, cliente, fecha y base/IVA/total en céntimos. El receptor comprueba el equilibrio y guarda un documento con tres movimientos. La clave única (origen, documento) evita duplicados; un cambio de contenido se rechaza.

La transacción remota termina antes de marcar la factura local como sincronizada. Si se pierde la respuesta o falla la actualización local, un nuevo envío recupera la referencia existente. Los intentos registran fecha, resultado y mensaje en integraciones_log. Es un intercambio idempotente, no una transacción distribuida.

La clave HTTP se configura únicamente en el servidor. Las URLs de contabilidad y Ollama no se aceptan desde peticiones del navegador.

## API

Entrada: api/superapi.php?ruta=...

Las respuestas son JSON salvo la exportación CSV. Las escrituras requieren POST, objeto JSON, cookie de sesión y cabecera X-CSRF-Token obtenida en config.

| GET | Función |
| --- | --- |
| config | Marca, módulos, entidades, vistas, modelo y CSRF |
| entidades, modulos, vistas | Catálogos |
| estructura&tabla=... | Tipos SQL, controles y restricciones |
| tabla&tabla=... | Consulta paginada |
| opciones&tabla=... | Relaciones permitidas para selects |
| calendario&mes=AAAA-MM | Pedidos del mes |
| panel | KPI, fuentes y tarjetas |
| informes, informe&id=... | Definiciones y resultados |
| exportar&tabla=... | CSV de la consulta |
| integracion | Estado remoto, facturas e intentos |
| auditoria | Últimas 100 operaciones |
| ia_estado | Disponibilidad del modelo |

| POST | Cuerpo |
| --- | --- |
| crear, actualizar, eliminar | tabla, datos y/o id |
| tabla_crear | nombre |
| campo_crear | tabla, nombre, titulo, tipo, opciones si select |
| modulos_guardar | modulos |
| panel_guardar | tarjetas |
| informe_guardar | titulo, tabla, columnas, filtros |
| informe_eliminar | id |
| facturar | pedido_id |
| sincronizar | factura_id |
| ia | prompt y proponer (booleano; por defecto false) |

Filtros: buscar, campo, operador (=, >=, <=, LIKE), valor, desde, hasta, orden, sentido y pagina. Los valores se parametrizan. Origen, campo y orden se contrastan con el esquema permitido.

Límites: tabla de 30 filas; exportación e informe de hasta 10 000 filas por origen. Los informes avisan de resultados truncados.

Respuestas: 201 en altas; 403 por falta de CSRF; 409 en conflictos de relaciones o pedidos facturados; 422 en datos no válidos; 503 en servicios externos no disponibles. Los errores de PDO no exponen SQL al navegador.

## IA

La consulta llega a /api/chat con stream: false, el modelo exacto y un esquema de respuesta. El contexto contiene agregados y definición de tarjetas. La salida JSON se vuelve a validar; nunca se ejecutan instrucciones del modelo.

Por defecto el esquema permite solo una respuesta de análisis. Para habilitar cambios de panel se marca explícitamente la opción de propuestas. Entonces se admite respuesta y una definición completa de tarjetas. La propuesta se presenta como tabla y solo al pulsar Aplicar se invoca panel_guardar. Deshacer restaura el panel anterior desde la misma vista.

La respuesta muestra también una tabla de indicadores calculados en el servidor. La generación de texto no garantiza exactitud numérica; esta referencia permite contrastar la interpretación. Los importes del contexto se formatean en español y se calcula el mes máximo antes de consultar al modelo.

El histórico de consultas no se guarda. Aplicar cambios sí deja una operación auditada del panel.

Referencias utilizadas: [Ollama Chat API](https://docs.ollama.com/api/chat), [CREATE PROCEDURE en MySQL 8.4](https://dev.mysql.com/doc/refman/8.4/en/create-procedure.html).

## Entorno local

Se aplican validación de identificadores, consultas preparadas, CSRF, cookies HttpOnly y SameSite Strict, claves foráneas y protección de archivos internos. El CSV neutraliza textos que empiezan por caracteres de fórmula. El router y las reglas Apache bloquean datos y configuración.

La selección de módulos controla navegación, no permisos. Para un despliegue multiusuario harían falta identidad, roles y una infraestructura específica. El alcance de esta entrega es la demostración local de RA4.

