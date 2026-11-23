# Evidencias del Resultado de Aprendizaje 4

Supuesto empresarial: una empresa del sector aeronáutico gestiona clientes, productos, pedidos, proveedores, componentes y empleados. La nueva unidad incorpora seguimiento comercial, adaptación del modelo, análisis e intercambio de facturas con un sistema contable independiente.

| Criterio | Adaptación implementada | Evidencia y demostración |
| --- | --- | --- |
| a) Posibilidades de adaptación | Catálogo de módulos; tablas propias; campos tipados; informes y tarjetas configurables. Necesidades comerciales, de almacén, personas y facturación. | Adaptación: seleccionar módulos y consultar estructura. api/metadatos.php y api/procesos.php. |
| b) Campos, tablas y vistas | Clientes: segmento y activo. Pedidos: prioridad, notas y fecha de entrega. Componentes: stock mínimo. Nuevas oportunidades, facturas, ajustes, campos personalizados y registros. Cuatro vistas SQL e índices. Altas de tablas y campos sin reemplazar datos. | data/migracion-ud4.sql, data/schema.sql y util/migrar.php. Crear un campo y comprobarlo en formulario, tabla e informe. |
| c) Consultas | Búsqueda, campo y operador parametrizados, intervalo de fechas, ordenación permitida y paginación; consultas agregadas y relaciones. | Consultas y vistas: v_pedidos_detalle, v_ventas_cliente, v_stock_alertas, v_facturas_estado. Función listado() de api/metadatos.php. |
| d) Interfaces y procesos | Metadatos, selects de relaciones, estados, fechas, números, booleanos y textos largos. Validación equivalente en servidor. Emisión y sincronización de facturas. Tabla y calendario mensual. | nucleo/formulario.js, nucleo/tabla.js, codigo.js y api/procesos.php. |
| e) Informes personalizados | Título, entidad o vista, columnas y filtros guardados. Informe completo con gráficos UD3. CSV y PDF mediante impresión. | Informes: crear consulta guardada, abrir e imprimir. nucleo/reporting.*. |
| f) Paneles de control | Cuatro KPI y tarjetas con fuentes de la base real. Barras/tarta/anillo/tabla, ancho y título; persistencia en servidor. IA propone cambios revisables y permite deshacerlos. | Vista general y Asistente IA. datosPanel(), validarPanel() y tabla ajustes. |
| g) Procedimientos almacenados | MySQL 8: rutina nativa sp_contabilizar_factura, adaptada al documento del ERP y a las cuentas 430/700/477. Transacción, manejador de errores, bloqueo, validación e idempotencia. El adaptador ejecuta CALL. | sql/mysql/contabilidad.sql, rama MySQL de integraciones/contabilidad/api.php y tests/verificar_mysql.py. Activar el modo MySQL como indica MYSQL.md. SQLite usa triggers, no rutinas nativas. |
| h) Pruebas | HTTP sobre copias: CRUD, tipos, errores, relaciones, filtros, esquema, panel, informes, CSV, facturación, inmutabilidad, contabilidad e idempotencia. MySQL: concurrencia y rollback. Ollama real. | tests/verificar.py y tests/verificar_mysql.py. Resultados en PRUEBAS-E-INCIDENCIAS.md. |
| i) Documentación e incidencias | Arranque, arquitectura, migración, configuración, API, limitaciones, incidencias y pruebas. Auditoría persistente de operaciones y registro de integraciones. | README, docs/, Operaciones e Integración contable. |
| j) Integración empresarial | Dos procesos PHP y dos almacenamientos independientes. HTTP autenticado de facturas y asientos equilibrados; reconciliación por referencia e idempotencia. | Emitir, sincronizar, comprobar documento y saldos, reenviar sin duplicar. Receptor SQLite o MySQL. |

## Guion para la defensa

1. Mostrar la carpeta y explicar los orígenes: funcionalidad UD3 e identidad Purple Grape.
2. Mostrar los indicadores y los tres gráficos. Configurar una tarjeta y recargar para comprobar su persistencia.
3. Crear una tabla propia; añadir un campo a clientes; demostrar el control tipado y un error de validación.
4. Abrir una vista SQL y filtrarla. Pasar a Pedidos y abrir el calendario de un mes con datos.
5. Guardar y abrir un informe con columnas seleccionadas e imprimirlo.
6. Emitir una factura y sincronizarla con el segundo sistema. Ver el asiento y repetir el envío.
7. Activar MySQL para ejecutar la rutina nativa; mostrar el SQL y la prueba de rollback.
8. Consultar phi4-mini:latest y revisar una propuesta de panel antes de aplicarla.
9. Mostrar el registro de operaciones y los resultados de pruebas.

Para acreditar la ejecución del criterio g, el receptor debe mostrar **mysql** y **sp_contabilizar_factura**. El arranque básico con SQLite permite demostrar el resto del flujo, pero no ejecuta una rutina nativa MySQL.

