# Purple Grape — Justificación del proyecto y criterios de evaluación

**Autor:** Alfredo  
**Asignatura:** Sistemas de Gestión Empresarial  
**Unidad:** UD2 — Instalación y configuración de sistemas ERP-CRM  
**Proyecto:** Purple Grape · Estudio Alfredo  
**Fecha:** 14 de octubre de 2026

## 1. Objetivo y necesidades del proyecto

Purple Grape es un ERP-CRM académico para un pequeño estudio tecnológico que vende equipos y organiza su taller. El supuesto requiere mantener contactos, preparar pedidos, consultar existencias, relacionar componentes con proveedores, organizar al equipo y registrar facturas y cobros.

La parte CRM se centra en los clientes y su relación con el estudio. La parte ERP conecta ventas, inventario, compras, equipo y facturación. Ambas utilizan la misma base de datos: un cliente registrado puede seleccionarse en un pedido, y ese pedido puede utilizarse para generar una factura.

El proyecto incluye una web de presentación, `estudio.html`, y una aplicación de gestión, `index.html`. Esta separación permite explicar la identidad del estudio y, en otro espacio, realizar las operaciones de administración.

La solución se ha dimensionado para una entrega académica y una instalación local. Las decisiones priorizan que el código sea comprensible, que la instalación se pueda repetir y que la base de datos pueda abrirse manualmente.

## 2. Justificación de las tecnologías y de la organización

### 2.1. Tecnologías empleadas y alternativas consideradas

| Tecnología | Uso en el proyecto | Justificación |
| --- | --- | --- |
| **HTML5** | Estructura del panel, la web de presentación y el instalador | Permite utilizar encabezados, navegación, tablas, formularios y diálogos con una estructura reconocible y etiquetas accesibles. |
| **CSS3** | Diseño, distribución de elementos y adaptación a distintos anchos | Centraliza el estilo en `estilo.css`. Grid, Flexbox y las consultas de medios permiten adaptar el contenido a escritorio y móvil. |
| **JavaScript** | Menús, formularios, búsqueda, filtros, paginación y peticiones a la API | Actualiza el contenido sin recargar toda la página. `fetch` comunica el navegador con PHP y muestra los resultados de las operaciones. |
| **PHP** | API, instalación, validación, configuración y acceso a los datos | Encaja con el entorno Apache previsto y permite construir el backend sin incorporar otro servidor de aplicación ni dependencias de Composer. |
| **PDO SQLite** | Conexión y consultas desde PHP | Proporciona consultas preparadas y transacciones, necesarias para guardar operaciones relacionadas y gestionar los errores. |
| **SQLite** | Almacenamiento relacional | Guarda la base en un archivo que puede entregarse, copiarse y abrirse con un visor. No exige instalar un servicio de bases de datos independiente. |
| **JSON** | Intercambio entre frontend y backend y exportación | JavaScript y PHP pueden procesarlo directamente. Separa los datos de su presentación en pantalla. |
| **SVG** | Logotipo e ilustración de uvas | Mantiene la marca nítida al cambiar de tamaño y permite guardar los recursos visuales dentro del proyecto. |
| **Apache** | Servidor web previsto para el despliegue local | Se entrega una plantilla con alias, restricciones de acceso y soporte para `.htaccess`. Su aplicación al servidor del sistema está pendiente. |
| **Linux** | Entorno de desarrollo y servidor objetivo | Es el entorno utilizado durante la realización del proyecto y permite ejecutar PHP, las utilidades de consola y las comprobaciones. |
| **Node.js** | Comprobación de sintaxis con `node --check` | Se emplea como herramienta de desarrollo. El backend está implementado en PHP, por lo que Node.js no es necesario para ejecutar la aplicación. |
| **Python 3** | Pruebas de integración en `tests/verificar.py` | Automatiza peticiones HTTP, instalaciones y comprobaciones con bases temporales. No forma parte del funcionamiento habitual del ERP-CRM. |
| **MySQL** | Alternativa relacional considerada | Sería una opción para una instalación LAMP clásica y otro escenario de concurrencia. No se utiliza en esta entrega; su incorporación requeriría adaptar el esquema, las vistas y la conexión. |
| **PostgreSQL** | Alternativa relacional considerada | Podría utilizarse en una evolución con necesidades distintas de administración y concurrencia. Para este supuesto, añadir un servicio adicional no aporta una ventaja necesaria. |
| **MongoDB** | Alternativa NoSQL considerada | Los datos principales tienen relaciones claras entre clientes, pedidos, productos y facturas. Se ha elegido un modelo relacional para expresar y proteger esas relaciones. MongoDB no está implementado. |

La propuesta tecnológica se ha interpretado como un conjunto de opciones. La selección efectiva para ejecutar la aplicación es **HTML5 + CSS3 + JavaScript + PHP + SQLite**. Apache y Linux constituyen el entorno de despliegue previsto. Las otras herramientas y bases se distinguen de las tecnologías utilizadas en funcionamiento.

### 2.2. Arquitectura cliente-servidor y relación con LAMP

El recorrido de una operación es:

**Navegador → petición HTTP con `fetch` → API PHP → SQLite → respuesta JSON → interfaz.**

Esta separación evita que el navegador tenga que conocer las consultas SQL o acceder al archivo de la base de datos. El servidor valida las entradas y aplica las reglas antes de guardar los cambios. Por ejemplo, modificar el HTML del formulario no permite introducir una cantidad negativa si la API la rechaza.

El despliegue previsto utiliza Linux, Apache y PHP, con SQLite para los datos. Comparte la organización de LAMP, pero **LAMP clásico utiliza MySQL**: la entrega actual es una variante con SQLite.

El cliente utiliza un navegador moderno con JavaScript, lo que facilita su utilización desde Windows, Linux y macOS. La compatibilidad visual en esos tres sistemas no se ha comprobado y se mantiene como revisión manual pendiente.

### 2.3. Separación entre núcleo, módulos y datos

| Parte | Archivos principales | Motivo de la separación |
| --- | --- | --- |
| Interfaz de gestión | `index.html`, `estilo.css`, `codigo.js` | Permite modificar la presentación sin mezclarla con las consultas a la base. |
| Núcleo | `api/nucleo.php` | Reúne conexión, sesión, instalación, configuración e historial. |
| Catálogo de módulos | `api/modulos.php` | Declara entidades, campos, tipos, relaciones y perfiles en un lugar común. |
| API de gestión | `api/superapi.php` | Resuelve consultas, CRUD, resumen y exportación mediante un punto de entrada. |
| Instalación | `instalador.html`, `instalador.js`, `api/instalar.php`, `utilidades/instalar.php` | Ofrece canales web y consola que comparten la creación del esquema. |
| Modelo y ejemplos | `data/schema.sql`, `data/demo.sql` | Separa la estructura de la base de los datos ficticios opcionales. |
| Comprobación y documentación | `tests/`, `docs/`, `README.md` | Conserva instrucciones y evidencias junto al código. |

Los módulos forman parte del código del proyecto y se activan por perfil. Esta modularidad permite adaptar las funciones visibles al supuesto sin mantener varias aplicaciones distintas.

### 2.4. Diseño, relaciones y protección de las operaciones

La identidad **Purple Grape** utiliza un racimo de uvas, menú ciruela, fondos lavanda y acentos violeta. La paleta común une el panel, el instalador y la web de presentación. «Estudio Alfredo» mantiene la firma personal del proyecto. Los recursos visuales y las fuentes del sistema permiten mostrar la interfaz sin descargar recursos externos.

Las claves primarias identifican registros; las claves foráneas relacionan entidades. Las restricciones `UNIQUE` evitan correos o números de factura duplicados y los `CHECK` delimitan estados y valores numéricos. Los índices del esquema apoyan las búsquedas por relaciones.

Las vistas `resumen_pedidos` y `resumen_facturas` calculan los importes desde las líneas. Así, el total no depende de un valor introducido por separado. Cada línea guarda el precio acordado para que una modificación posterior del precio del producto no cambie ese importe.

La API utiliza un catálogo cerrado de entidades y campos y consultas preparadas para los valores. Las escrituras requieren POST y un token CSRF asociado a la sesión. La interfaz escapa los textos antes de incorporarlos al HTML. Estas medidas cubren problemas concretos de entrada y presentación de datos; la sesión no implementa autenticación de usuarios.

Las operaciones de escritura y su registro en el historial se ejecutan en una transacción. Ante un error se revierten los cambios, evitando que aparezca como realizada una operación que no se guardó.

## 3. Criterio a) Identificación de los módulos del ERP-CRM

Se han identificado seis módulos, con ocho entidades de negocio:

| Módulo | Entidades | Función y razón de su inclusión |
| --- | --- | --- |
| **Clientes / CRM** | `clientes` | Guarda contacto, ciudad y estado de la relación. Es necesario para identificar a quién se vende y distinguir clientes activos, potenciales e inactivos. |
| **Ventas** | `pedidos`, `lineaspedido` | Relaciona cada pedido con un cliente y sus productos. Separa la cabecera de las líneas para admitir varios productos en una misma venta. |
| **Inventario** | `productos` | Mantiene catálogo, precio, existencias y stock mínimo. Permite consultar disponibilidad y detectar productos que necesitan atención. |
| **Compras** | `proveedores`, `componentes` | Identifica proveedores y relaciona con ellos las piezas del taller. El alcance actual no incluye órdenes de compra. |
| **Equipo / RR. HH.** | `empleados` | Registra personas, departamentos, puestos y salario anual para organizar el equipo. No incorpora nóminas. |
| **Facturación** | `facturas` | Relaciona una factura con un pedido y registra si está pendiente o pagada. Permite conocer los importes pendientes de cobro. |

Las tablas `configuracion`, `modulos` y `actividad` dan soporte al conjunto de la aplicación. El panel de resumen consulta los datos de los módulos activos; no constituye otro módulo de negocio independiente.

**Evidencia:** [catálogo de módulos](api/modulos.php) y [esquema relacional](data/schema.sql). La lectura actual de SQLite confirma los seis módulos activos en el perfil completo.

## 4. Criterio b) Realización de diferentes tipos de instalaciones

Se han desarrollado y probado dos canales de instalación:

- **Consola:** `utilidades/instalar.php`, con opciones para nombre, perfil e instalación vacía.
- **Web:** `instalador.html`, que envía las opciones a `api/instalar.php` mediante JavaScript.

También se ofrecen dos modalidades de datos:

- **Vacía:** crea las tablas, las vistas y la configuración, sin cargar registros comerciales.
- **Con demostración:** añade los contactos, productos, pedidos y facturas ficticios de `demo.sql`.

La verificación funcional previa realizó instalaciones vacías por consola con los perfiles comercial, taller y completo, y una instalación web con demostración. Además, comprobó que una instalación repetida rechazara sobrescribir la base y que una instalación con opciones inválidas se revirtiera.

La base entregada se creó por consola con demostración y el perfil completo. Mantiene el nombre técnico `data/darkorange_alfredo.sqlite` después del cambio de identidad. El archivo anterior `data/darkorange.db` se conserva como referencia y no es la base utilizada por la aplicación.

Para reproducir las variantes desde la carpeta del proyecto, utilizando rutas nuevas:

```bash
# Instalación comercial sin datos de ejemplo.
DARKORANGE_DB=/tmp/purplegrape-comercial.sqlite php utilidades/instalar.php --vacia --perfil=comercial

# Instalación de taller con demostración.
DARKORANGE_DB=/tmp/purplegrape-taller.sqlite php utilidades/instalar.php --perfil=taller

# Servidor para una instalación web independiente.
DARKORANGE_DB=/tmp/purplegrape-web.sqlite php -S 127.0.0.1:8081 utilidades/router.php
```

En el último caso se abre `http://127.0.0.1:8081/instalador.html`. Las rutas deben estar libres: el instalador protege los archivos existentes. `DARKORANGE_DB` conserva su nombre técnico por compatibilidad y permite elegir una base distinta sin modificar el código.

Apache dispone de un procedimiento de instalación y configuración documentado, pero no se ha instalado ni configurado de nuevo el Apache del sistema durante este trabajo. La verificación HTTP se realizó con el servidor de desarrollo PHP.

**Evidencia:** [instalador CLI](utilidades/instalar.php), [API de instalación](api/instalar.php) y [pruebas de integración](tests/verificar.py).

## 5. Criterio c) Configuración de los módulos instalados

La configuración tiene dos niveles: la identidad y el perfil del estudio, modificables desde Ajustes, y las reglas de los campos, definidas en el catálogo de módulos y el esquema.

| Configuración | Valor o regla | Justificación |
| --- | --- | --- |
| Nombre | `Purple Grape` | Identifica la aplicación y se mantiene después de recargar. |
| Color de acento | `#7c3aed` | Aplica la identidad violeta a los elementos principales. |
| Perfil actual | `completo` | Habilita los seis módulos del supuesto de entrega. |
| Clientes | Activo, Potencial e Inactivo | Permite representar distintos momentos de la relación comercial. |
| Pedidos | Pendiente, Confirmado, Entregado y Cancelado | Expresa el estado de la venta. |
| Facturas | Pendiente y Pagada | Diferencia los importes pendientes de cobro. |
| Inventario | Existencias y mínimo por producto | Ajusta el aviso de reposición a cada producto. |
| Relaciones | Selectores de clientes, productos, proveedores y pedidos | Facilita seleccionar registros válidos frente a introducir identificadores manualmente. |
| Cantidades e importes | Cantidades positivas; precios, stock y salarios no negativos | Evita valores que no encajan en el supuesto. |

Nombre, color y perfil se guardan en `configuracion`; la activación se guarda en `modulos`. Al cambiar de perfil, el menú se actualiza y la API rechaza el CRUD de entidades cuyo módulo esté inactivo. Los registros se conservan, y las referencias necesarias para relacionar entidades siguen siendo legibles.

Se han comprobado previamente los cambios entre perfiles y, en esta revisión, los valores persistidos en la base entregada. Las reglas del catálogo son configuración del código; la interfaz no ofrece un editor de esquema o de estados.

**Evidencia:** [núcleo de configuración](api/nucleo.php), [interfaz de Ajustes](codigo.js) y tablas `configuracion` y `modulos` de SQLite.

## 6. Criterio d) Instalaciones adaptadas a diferentes supuestos

Se han definido tres perfiles en función de necesidades concretas:

| Supuesto | Perfil y módulos | Justificación de la adaptación |
| --- | --- | --- |
| **Estudio con venta, taller y administración** | Completo: clientes, ventas, inventario, compras, equipo y facturación | Necesita coordinar los contactos, las ventas, los materiales, las personas y los cobros. |
| **Oficina comercial que vende equipos** | Comercial: clientes, ventas, inventario y facturación | Su actividad principal es gestionar clientes, preparar pedidos y registrar su facturación. |
| **Taller técnico con atención al cliente** | Taller: clientes, inventario, compras y equipo | Necesita conocer sus contactos, equipos, piezas, proveedores y personal; no utiliza el flujo de venta y facturación de esta aplicación. |

La configuración reduce las funciones visibles a las necesarias para cada supuesto. La misma estructura de datos facilita cambiar de perfil sin tener que importar los registros a otra aplicación.

Las pruebas previas crearon bases independientes con los tres perfiles y comprobaron su número de módulos: seis en completo y cuatro en cada una de las otras variantes. También probaron el bloqueo de entidades inactivas y la conservación de clientes al cambiar de perfil.

Los perfiles son variantes funcionales, no permisos por usuario. El supuesto de taller cubre personas y componentes; no se atribuyen funciones de reparación que no estén implementadas.

**Evidencia:** función `perfiles()` en [api/modulos.php](api/modulos.php) y escenarios de [tests/verificar.py](tests/verificar.py).

## 7. Criterio e) Verificación del funcionamiento del ERP-CRM

### 7.1. Verificación funcional previa

La suite de integración obtuvo **84 comprobaciones correctas** durante la implementación inicial. Trabaja con bases temporales, inicia un servidor PHP en localhost y lo detiene al acabar, por lo que no modifica los datos de entrega.

| Aspecto verificado | Resultado observado |
| --- | --- |
| Instalación y repetición | Creación correcta y rechazo de sobrescritura. |
| Consulta de entidades | Listados disponibles para las ocho entidades de negocio. |
| Flujo de venta | Creación de cliente, producto, pedido, línea y factura. |
| Actualización y cobro | Edición de cliente y cambio de factura a Pagada. |
| Total del pedido | Tres unidades a 10,25 € producen una base de 30,75 €. |
| IVA de demostración | La factura del caso anterior calcula un total de 37,21 € con el 21 %. |
| Validación | Rechazo de cantidades negativas, fechas inexistentes y correos duplicados. |
| Integridad referencial | Rechazo de referencias inexistentes y de borrados de registros todavía utilizados. |
| Pedido facturado | La API bloquea modificaciones del pedido y de sus líneas. |
| Borrado en cascada | Al borrar un pedido sin factura se eliminan sus líneas. |
| Protección de escrituras | Rechazo de peticiones sin token válido o realizadas con un método incorrecto. |
| Perfiles y exportación | Activación correcta, conservación de datos y descarga JSON. |
| Archivos internos | Respuesta 403 en las rutas protegidas comprobadas con el router PHP. |

### 7.2. Revisión actual de la base de Purple Grape

Para redactar este documento se ha abierto la base en modo de solo lectura y se han comprobado su configuración, los módulos y las relaciones:

```sql
PRAGMA integrity_check;       -- Resultado: ok.
PRAGMA foreign_key_check;     -- Resultado: sin filas de errores.
SELECT clave, valor FROM configuracion;
SELECT id, activo FROM modulos;
SELECT id, total FROM resumen_pedidos ORDER BY id;
```

La base conserva 5 clientes, 6 productos, 2 proveedores, 3 componentes, 3 empleados, 4 pedidos, 7 líneas y 2 facturas. Los totales sin IVA de los pedidos son **1.476 €, 676 €, 447 € y 807 €**. El perfil es completo, el nombre es Purple Grape y el color es `#7c3aed`.

El panel, con estos datos, calcula 5 clientes, 3 pedidos en marcha, 817,96 € pendientes de cobro y 2 avisos de stock. El recuento de clientes incluye todos sus estados; los pedidos en marcha son los pendientes y confirmados.

Tras el cambio visual se revisaron la sintaxis de los archivos modificados, los recursos locales, los dos SVG y la integridad de SQLite. **Las 84 comprobaciones corresponden a la ejecución funcional previa; no se han vuelto a ejecutar para elaborar este documento.**

Siguen pendientes la revisión visual e interacción en navegador, la comprobación en Windows/Linux/macOS y la aplicación y prueba de la configuración Apache. Estos límites se distinguen de las comprobaciones realizadas.

**Evidencia:** [informe de verificación](docs/VERIFICACION.md), [suite reproducible](tests/verificar.py) y consultas de SQLite indicadas arriba.

## 8. Criterio f) Documentación de operaciones e incidencias

### 8.1. Operaciones documentadas

| Operación | Documentación o registro |
| --- | --- |
| Identificar módulos y relaciones | `api/modulos.php`, `data/schema.sql` y apartado a) de este documento. |
| Instalar por consola y web | Utilidades de instalación, README y apartado b). |
| Elegir perfiles y personalizar | Tabla `configuracion`, tabla `modulos` y apartados c) y d). |
| Gestionar datos | API CRUD y tabla `actividad`, que conserva acción, entidad, fecha y detalle. |
| Cambiar a Purple Grape | Marca SVG, ilustración, CSS, configuración persistida y evento de personalización. |
| Verificar funcionamiento | `tests/verificar.py`, `docs/VERIFICACION.md` y apartado e). |
| Exportar y conservar datos | Exportación JSON de entidades activas; apertura y copia del archivo SQLite descritas en README. |

El historial registra instalaciones, configuraciones y cambios realizados. Los errores SQL se envían al registro del servidor. Un error rechazado no se registra como una operación completada.

### 8.2. Incidencias y resolución

| Incidencia o necesidad detectada | Medida adoptada | Estado |
| --- | --- | --- |
| El menú inicial no organizaba las tablas por funciones | Catálogo con seis módulos y sus entidades. | Implementado. |
| El instalador inicial generaba SQL desde texto libre | Esquema controlado, validación y transacción de instalación. | Implementado. |
| Los importes podían quedar separados de las líneas | Vistas calculadas y bloqueo desde la API de pedidos facturados. | Implementado. |
| Era necesario conservar la base anterior | Base independiente `darkorange_alfredo.sqlite`; archivo anterior conservado. | Realizado. |
| La identidad visual seguía siendo Darkorange | Cambio a Purple Grape en páginas, recursos, textos y configuración. | Realizado; los nombres técnicos heredados y el historial anterior se conservan. |
| El entorno de ejecución restringía los sockets de las pruebas HTTP | Ejecución autorizada de la suite previa con un servidor temporal en localhost. | Resuelto para aquella verificación. |
| Apache se inspeccionó con `AllowOverride None` | Plantilla con `AllowOverride All` y protección de archivos mediante `.htaccess`. | Preparada; pendiente de aplicar y verificar en Apache. |
| Apache usa `www-data` y la base se creó como `alfredo` | Procedimiento de grupo y escritura en la base y su carpeta explicado en README. | Pendiente al desplegar mediante Apache. |
| Al cambiar la carpeta a «Purple Grape final UD2», la plantilla Apache apuntaba a la ruta anterior | Actualización de las rutas de la plantilla incluida en `docs/`. | Corregido en el archivo del proyecto; no aplicado al servidor del sistema. |
| La revisión automatizada no cubre la presentación en navegador | Relación de pruebas manuales pendientes en `docs/VERIFICACION.md`. | Pendiente. |

Esta documentación permite repetir la instalación y consultar qué se ha realizado, qué problemas se han encontrado y qué tareas quedan para el despliegue objetivo.

## 9. Alcance y documentación de apoyo

Purple Grape cubre el supuesto descrito como prototipo académico local. El stock se mantiene manualmente; los pedidos no descuentan existencias. Las facturas utilizan un IVA de ejemplo fijo del 21 % y no constituyen un sistema fiscal completo. No se incluyen autenticación, permisos por persona, nóminas, PDF de facturas ni órdenes completas de compra o reparación.

La edición directa de SQLite puede saltarse las reglas de la API, como el bloqueo de un pedido facturado. Al trabajar con un visor deben respetarse esas reglas y habilitarse las claves foráneas en la conexión. Para copiar la base como respaldo, conviene detener antes la aplicación y cerrar las conexiones de escritura. La exportación JSON contiene las entidades del perfil activo; la copia del archivo SQLite conserva la base completa.

Archivos de apoyo:

- [README: arranque, instalación y Apache](README.md).
- [Memoria de UD2](docs/MEMORIA-UD2.md).
- [Resultados y límites de verificación](docs/VERIFICACION.md).
- [Plantilla de configuración Apache](docs/apache-darkorange.conf).
- [Modelo relacional ejecutable](data/schema.sql).
- [Pruebas de integración](tests/verificar.py).
