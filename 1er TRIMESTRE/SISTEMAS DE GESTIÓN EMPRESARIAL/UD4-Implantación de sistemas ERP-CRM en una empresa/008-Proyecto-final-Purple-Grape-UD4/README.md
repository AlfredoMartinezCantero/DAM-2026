# Purple Grape · ERP / CRM · UD4

Versión independiente de **017-darkorange (UD3)** con la identidad visual de **Basic Purple Grape (UD2)**: violeta #7c3aed, icono de uvas y dos columnas de navegación. Conserva los gráficos de barras, tarta y anillo de UD3 y los adapta a indicadores empresariales.

## Arranque

Requisitos: PHP 8.1 o superior con PDO SQLite, cURL y mbstring; Python 3 para las pruebas. El navegador no necesita paquetes ni CDN.

Desde esta carpeta:

~~~bash
php -S 127.0.0.1:8084 router.php
~~~

Abre **http://127.0.0.1:8084/**. La base **data/purplegrape.db** ya está incluida y migrada. No hace falta ejecutar un instalador.

Para usar el segundo sistema contable, abre otra terminal en la misma carpeta:

~~~bash
php -S 127.0.0.1:8085 router.php
~~~

Abre **Integración contable** en el ERP para comprobar la conexión. El servicio genera su propia base en **var/contabilidad.sqlite**. Los dos servidores deben estar separados: una llamada HTTP de un servidor PHP monoproceso a sí mismo bloquearía la petición.

En Apache, esta carpeta también puede servirse con PHP. Deben aplicarse las reglas de .htaccess (mod_rewrite y AllowOverride FileInfo Options AuthConfig). El usuario del servidor necesita escribir en data/ y var/. El router bloquea esos directorios al utilizar el servidor de desarrollo. No sirvas este proyecto con un servidor estático ni con php -S sin router.php.

Es un entorno académico local. Los módulos seleccionados controlan la navegación, no constituyen permisos de usuario. No incorpora autenticación multiusuario. La integración incluye una clave de demostración para el uso local; configura INTEGRACION_CLAVE en ambos servidores si conectas un entorno propio.

## Qué se puede hacer

- **Vista general:** indicadores reales y tarjetas configurables. Cada tarjeta admite fuente, título, gráfico o tabla y ancho. Los ajustes se guardan en SQLite.
- **Ventas y CRM:** clientes, productos, pedidos, líneas y oportunidades. Las relaciones se seleccionan en listas; fechas, números, emails, booleanos y estados tienen controles y validación propios.
- **Compras y almacén:** proveedores, componentes, stock mínimo y vista de alertas.
- **Personas:** empleados y datos de su departamento.
- **Facturación:** emisión desde cada pedido confirmado, en fabricación o entregado. La factura conserva base, IVA y total en céntimos. El supuesto utiliza IVA fijo del 21 %.
- **Consultas y vistas:** búsqueda global, filtros por campo, comparación, fechas cuando proceden, ordenación, paginación y CSV de la consulta.
- **Calendario:** Pedidos → Calendario mensual. Muestra pedidos según su fecha; el mes se puede cambiar.
- **Informes:** informe completo de UD3 con sus tres gráficos e informes personalizados con título, origen, columnas y filtros guardados. Impresión y PDF desde el navegador.
- **Adaptación:** activar módulos, crear tablas propias, añadir campos tipados y consultar la estructura SQL.
- **Operaciones:** últimas 100 operaciones auditadas. La integración conserva además los intentos y errores.
- **Asistente IA:** análisis de agregados y propuestas de cambios en las tarjetas. El usuario revisa y aplica la propuesta; puede deshacer el último cambio mientras mantenga abierta esa vista.

## IA: phi4-mini:latest

El modelo está fijado a **phi4-mini:latest**. La conexión se realiza desde PHP mediante /api/chat; el navegador no llama directamente a Ollama y no necesita configurar CORS.

La configuración inicial utiliza el Ollama del entorno de trabajo: **http://10.0.2.2:11434**.

Si Ollama funciona en el mismo equipo que PHP:

~~~bash
OLLAMA_URL=http://127.0.0.1:11434 php -S 127.0.0.1:8084 router.php
~~~

Si el modelo no está instalado en tu servidor:

~~~bash
ollama pull phi4-mini:latest
~~~

En **Asistente IA**, pulsa **Comprobar conexión** y escribe la consulta. Se envían el prompt, los cuatro indicadores, los importes mensuales, el recuento por estado y la definición de las tarjetas. No se envían contactos, emails, salarios ni filas de clientes. La respuesta usa un esquema JSON y el servidor vuelve a validar cualquier propuesta de panel. Para permitir propuestas se marca la opción correspondiente. Cada respuesta se acompaña de indicadores calculados por el ERP, separados de la interpretación del modelo; contrasta las cifras con esos indicadores. La IA no dispone de SQL ni de acciones para modificar registros, facturar o contabilizar.

El tiempo máximo de inferencia es de 120 segundos. La aplicación y los gráficos funcionan sin Ollama.

## Integración y procedimientos almacenados

El segundo sistema es **Grape Contabilidad**, un ERP contable académico independiente con API HTTP y almacenamiento propio. No es un conector certificado para una marca comercial.

Flujo de demostración:

1. En Pedidos, crea un pedido confirmado y añade sus líneas. El total se recalcula automáticamente.
2. Pulsa **Emitir factura**. Emitirla de nuevo devuelve la misma factura.
3. En **Integración contable**, pulsa **Sincronizar**.
4. Comprueba el documento recibido y las cuentas 430, 700 y 477 del segundo sistema.
5. Repite el envío. No se duplican el documento ni los movimientos.

La identidad de integración es (origen, documento). Una respuesta perdida se puede reintentar. Si el receptor encuentra el mismo documento con otros datos, lo rechaza. No se mantiene abierta una transacción SQLite durante la llamada HTTP.

**SQLite no ejecuta procedimientos almacenados nativos.** El ERP mantiene el total de pedidos mediante triggers y transacciones PHP. Para el criterio **g**, se incluye un modo MySQL 8 del sistema contable que ejecuta el procedimiento real **sp_contabilizar_factura**, con transacción, validación, bloqueo de concurrencia e idempotencia. Activación y pruebas: [docs/MYSQL.md](docs/MYSQL.md). La interfaz identifica el motor y el procedimiento activos; el modo SQLite se presenta expresamente como demostración.

## Configuración

Archivo: **config/aplicacion.php**. Las claves solo se leen en el servidor.

| Variable | Valor inicial / uso |
| --- | --- |
| PURPLE_DB | data/purplegrape.db |
| OLLAMA_URL | http://10.0.2.2:11434 |
| Modelo | Fijo: phi4-mini:latest |
| CONTABILIDAD_URL | http://127.0.0.1:8085/integraciones/contabilidad/api.php |
| INTEGRACION_CLAVE | Clave local de demostración, igual en ambos servidores |
| CONTABILIDAD_DB | var/contabilidad.sqlite |
| CONTABILIDAD_MYSQL_DSN | Vacío: SQLite. Si se configura: PDO MySQL |
| CONTABILIDAD_MYSQL_USUARIO | Usuario de la base MySQL dedicada |
| CONTABILIDAD_MYSQL_CLAVE | Contraseña de ese usuario |

Los importes de facturas y asientos se guardan en céntimos enteros. Los precios y totales de pedidos mantienen los tipos REAL heredados de UD3; se redondean a dos decimales. Los nombres de entidad, columna y ordenación se validan contra listas y metadatos; los valores usan parámetros SQL.

Las tablas muestran 30 filas por página. Exportaciones e informes incluyen hasta 10 000 filas por entidad; los informes avisan cuando se supera ese límite. La exportación usa los filtros aplicados a la tabla, no los cambios que aún no has aplicado.

## Datos y actualización

La nueva base parte de los siete conjuntos de datos de 017-darkorange: **61 clientes, 8 productos, 10 empleados, 6 proveedores, 9 componentes, 8 pedidos y 8 líneas**. Conserva sus identificadores. Añade campos de UD4, una oportunidad de demostración y tablas de configuración, facturación y auditoría. No modifica versiones anteriores.

**util/migrar.php** aplica la migración de forma transaccional e idempotente sobre una copia UD3 indicada con PURPLE_DB. La base entregada ya la tiene aplicada:

~~~bash
php util/migrar.php
~~~

La migración recalcula los totales desde las líneas. Los pedidos cancelados se excluyen del importe comercial. Los pedidos facturados y sus líneas quedan bloqueados mediante triggers. No se reconstruyen ni vacían tablas existentes al añadir campos.

**data/schema.sql** contiene el esquema completo de esta entrega; **data/demo.sql**, los datos iniciales de las entidades empresariales con columnas explícitas. Sirven para estudiar o reconstruir una base nueva; no se ejecutan sobre una base con datos.

Para importar clientes desde otro SQLite con campos nombre, apellidos y email:

~~~bash
php data/importar-clientes.php /ruta/clientes.sqlite
~~~

El origen se abre en modo de solo lectura y la importación se valida en una transacción. Se evitan duplicados por email normalizado. No se ejecuta automáticamente.

## Pruebas y documentación

~~~bash
python3 -u tests/verificar.py
python3 -u tests/verificar.py --ia-real
python3 -u tests/verificar_mysql.py
~~~

Las pruebas copian el proyecto a un directorio temporal y levantan servidores de prueba. La base entregada se comprueba mediante SHA-256 antes y después. El test MySQL inicializa una instancia aislada en /tmp, sin conectar con la base del equipo.

- [Guía de uso, módulos y tecnologías](Explicación.md).
- [Matriz de los diez criterios RA4](docs/RA4.md).
- [Arquitectura, modelo y API](docs/ARQUITECTURA.md).
- [Activación del procedimiento MySQL](docs/MYSQL.md).
- [Operaciones, incidencias y resultados de verificación](docs/PRUEBAS-E-INCIDENCIAS.md).

