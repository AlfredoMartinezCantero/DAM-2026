# Operaciones, pruebas e incidencias

Verificación realizada el **23 de noviembre de 2026**. Todas las pruebas de escritura utilizaron copias temporales; la base entregada permanece con los datos iniciales.

## Resultados observados

| Comprobación | Resultado |
| --- | --- |
| HTTP + SQLite + Ollama real | **122 comprobaciones correctas**, salida 0 de tests/verificar.py --ia-real. |
| HTTP con receptor MySQL | **115 comprobaciones correctas**, salida 0 del flujo lanzado por tests/verificar_mysql.py. |
| Procedimiento MySQL nativo | Instalación, asiento equilibrado, reintento idempotente, conflictos/rollback y cinco envíos simultáneos: correctos. Apagado de la instancia temporal correcto. |
| Navegador Chromium | **21 comprobaciones correctas**, sin errores JavaScript ni respuestas HTTP fallidas en los flujos probados. |
| Sintaxis | PHP y JavaScript comprobados sin errores. |
| Reconstrucción desde SQL | schema.sql + demo.sql generan una base nueva íntegra, con 61 clientes y sin errores de claves foráneas. |
| Migración repetida sobre una copia UD3 | Primera aplicación correcta; segunda aplicación no repite cambios. Una oportunidad y una entrada de migración, sin duplicados. |
| Preservación UD3 | Se compararon todas las columnas heredadas y sus identificadores de las siete tablas. Coinciden; los totales de pedidos se recalculan expresamente desde las líneas. |
| Integridad | PRAGMA integrity_check = ok; PRAGMA foreign_key_check sin resultados. SHA-256 de la base entregada idéntico antes y después de las pruebas. |

Entorno de la verificación: PHP 8.5.4, SQLite mediante PDO, MySQL 8.4.11, Node 24.16.0 y Chromium de Playwright. El modelo real consultado es phi4-mini:latest en el Ollama configurado.

Las cifras de las distintas baterías incluyen comprobaciones repetidas del mismo flujo. No representan funciones independientes.

## Qué se probó

- Catálogos y estructura de las entidades; conservación de registros; paginación.
- Protección de datos/configuración y exigencia de CSRF en las escrituras.
- Altas, edición y borrado; Unicode, apóstrofos y texto con apariencia de HTML.
- Rechazo de emails y fechas incorrectos, cantidades negativas y relaciones inexistentes.
- Campos personalizados date y select; opciones válidas; nombres SQL no permitidos y campos repetidos.
- Tablas propias y selección persistente de módulos.
- Recálculo del importe al insertar y actualizar líneas; rechazo de escritura manual del total.
- Vistas SQL, filtro por campo, calendario y ordenación validada.
- KPI de datos reales y persistencia de tarjetas; rechazo de fuentes y tamaños no permitidos.
- Informes con columnas y filtros; informe completo de UD3; CSV UTF-8 y neutralización de fórmulas.
- Factura con base, IVA y total en céntimos; emisión idempotente y bloqueo de cambios posteriores.
- Token del receptor, envío HTTP, referencia externa, reintentos y asientos equilibrados en tres cuentas.
- Procedimiento MySQL real: datos conflictivos, descuadres y nulos sin documentos parciales; concurrencia.
- Disponibilidad e inferencia real de Ollama, modelo exacto, respuesta JSON e indicadores de referencia.
- Interfaz: crear/editar, campo tipado, calendario, informes y PDF, panel persistente y móvil sin desbordamiento.
- Propuestas de IA en la interfaz: revisión previa, aplicación, persistencia y restauración del panel anterior.

La prueba de interfaz intercepta únicamente la respuesta de inferencia para hacer reproducibles los casos de aplicar/deshacer propuestas; las operaciones posteriores usan la API PHP y SQLite reales de la copia. La conexión e inferencia auténticas se verifican aparte en la batería HTTP.

## Evidencias

- [Panel inicial](capturas/01-panel.png).
- [Formulario y tabla](capturas/02-clientes.png).
- [Informe completo](capturas/03-informe.png).
- [Interfaz de IA y propuesta](capturas/04-ia.png).
- [Vista móvil](capturas/05-movil.png).
- [PDF de ejemplo de informe personalizado](capturas/informe-ejemplo.pdf).
- [Última respuesta de prueba del modelo real](../tests/ultima-respuesta-ia.txt).

Las capturas y el PDF proceden de la copia de QA. Pueden mostrar un cliente adicional, una tarjeta renombrada y una respuesta de prueba; esos cambios no están en la base entregada.

## Incidencias observadas y resolución

| Incidencia | Resolución |
| --- | --- |
| El instalador heredado concatenaba SQL y creaba todos los campos como texto. | Se sustituye por altas controladas de tablas/campos mediante API, metadatos y transacciones. El endpoint antiguo devuelve 410. |
| Los archivos demo y schema de UD3 no coincidían exactamente con la base actual, que ya tenía apellidos importados. | Se genera un esquema completo y un seed con columnas explícitas desde la nueva base; se verifica la reconstrucción. |
| Totales editables sin relación garantizada con las líneas. | Cálculo mediante triggers y total no editable desde la API. |
| Confusión entre triggers SQLite y procedimientos almacenados. | Se separan y documentan. El modo MySQL ejecuta una rutina nativa mediante CALL y tiene pruebas propias. |
| URL inicial de contabilidad incompatible con el arranque desde la raíz. | Se corrige la ruta completa a integraciones/contabilidad/api.php. Se prueba con dos servidores separados. |
| Control de concurrencia del calendario inicializaba una secuencia no numérica. | Secuencia local inicializada a cero; prueba del calendario con datos de enero. |
| Selectores con etiquetas que incluían el texto de todas sus opciones. | Etiquetas explícitas mediante for/id; prueba de controles por nombre accesible. |
| Los importes grandes se solapaban en las barras. | Etiquetas compactas, margen y ancho calculados; leyendas y tooltip con valor completo. |
| El modelo proponía tarjetas en una petición de solo análisis. | Modo de análisis con esquema sin tarjetas. Para propuestas se exige un booleano explícito y se mantiene la revisión previa. |
| El modelo confundió cifras y una dimensión de tarjeta con dinero. | Se retiran tarjetas del contexto de análisis, se formatean importes y se proporciona el máximo mensual calculado. Cada respuesta muestra indicadores verificados del ERP separados del texto generado. La exactitud del texto sigue requiriendo revisión. |
| Las señales del sistema no permitían detener mysqld en la primera prueba temporal. | La batería usa SHUTDOWN por SQL y espera su cierre. Se repite con salida 0. |
| El sandbox impedía sockets y las descargas de herramientas de QA. | Las pruebas se ejecutan con permisos de red local; Playwright y Chromium se instalan únicamente en /tmp. No son dependencias del ERP. |
| Git contiene un objeto vacío y HEAD no se puede leer. | No se repara ni altera .git. El trabajo se entrega en una carpeta nueva y se verifica por archivos, comparación de datos y hashes. |

## Repetir las pruebas

Desde la carpeta de esta versión:

~~~bash
python3 -u tests/verificar.py
python3 -u tests/verificar.py --ia-real
python3 -u tests/verificar_mysql.py
~~~

La segunda orden utiliza el Ollama configurado. La tercera necesita mysqld y mysql de MySQL 8; crea su propia instancia temporal y no usa la del equipo.

Para la prueba de navegador, Playwright es una herramienta de desarrollo opcional. No lo necesita la aplicación:

~~~bash
npm install --prefix /tmp/purple-grape-browser --cache /tmp/purple-grape-npm-cache playwright
PLAYWRIGHT_BROWSERS_PATH=/tmp/purple-grape-browsers node /tmp/purple-grape-browser/node_modules/playwright/cli.js install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/purple-grape-browsers PLAYWRIGHT_MODULE=/tmp/purple-grape-browser/node_modules/playwright node tests/navegador.cjs
~~~

Las pruebas esperan los datos iniciales de la entrega. Si ya has añadido datos o personalizado el esquema, utiliza una copia de la entrega inicial como fixture.

## Límites de la comprobación

El arranque de referencia se verifica con el servidor PHP y router.php. No se modifica la configuración Apache del equipo ni se certifica su AllowOverride. La clave contable predeterminada y la ausencia de autenticación corresponden a un ejercicio local.

El modo SQLite no ejecuta el procedimiento MySQL: para demostrar el criterio g en vivo hay que activar ese motor. El test aislado sí ejecutó el SQL y el flujo completo con el procedimiento.

La prueba real de Ollama verifica comunicación e inferencia, no certifica la exactitud financiera o semántica del texto. Las cifras de referencia del ERP son el punto de comparación. Las propuestas se validan estructuralmente y se revisan antes de aplicarlas.

La entrega conserva el supuesto aeronáutico y un IVA fijo del 21 %. No se han probado un proveedor comercial de ERP, despliegue público, alta carga ni autorización multiusuario.

