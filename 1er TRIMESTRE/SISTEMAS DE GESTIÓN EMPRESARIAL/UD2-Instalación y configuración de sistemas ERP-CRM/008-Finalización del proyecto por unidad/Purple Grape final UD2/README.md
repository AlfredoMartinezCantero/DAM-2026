# Purple Grape

ERP-CRM académico para un pequeño estudio tecnológico. Proyecto final de SGE, UD2, DAM. La identidad Purple Grape combina una marca de uvas, un menú ciruela y una paleta lavanda y violeta. La aplicación incluye una web de presentación (`estudio.html`) y un panel de gestión (`index.html`).

[Justificación completa y respuesta a los criterios a–f](JUSTIFICACION-Y-CRITERIOS-UD2.md).

## Empezar

La base nueva ya está creada con datos ficticios y el perfil completo:

**`data/darkorange_alfredo.sqlite`**

Abre ese archivo manualmente con tu visor de SQLite. Se conserva su nombre técnico tras el cambio de identidad a Purple Grape. El archivo antiguo `data/darkorange.db` se conserva y la aplicación nueva no lo utiliza. `schema.sql` y `demo.sql` corresponden al nuevo esquema.

Desde una terminal situada en esta carpeta:

```bash
php -S 127.0.0.1:8080 utilidades/router.php
```

Abre **http://127.0.0.1:8080/index.html**. Para detener el servidor, pulsa Ctrl+C. Este arranque utiliza PHP como servidor de desarrollo. El router impide descargar directamente la base, el esquema y las utilidades.

No abras `index.html` con `file://` ni con un servidor exclusivamente estático: la API necesita PHP. Requisitos: PHP 8.1 o posterior con PDO SQLite y SQLite3; navegador moderno con JavaScript. No hacen falta npm ni paquetes de Composer. Python 3 y Node.js solo se utilizan en las comprobaciones opcionales.

## Qué puedes hacer

- Vista general: clientes, pedidos en marcha, facturas pendientes de cobro, alertas de existencias e historial.
- Clientes: contactos y estado de la relación.
- Ventas: pedidos y líneas; total calculado a partir de cantidades y precios.
- Inventario: productos, precios, existencias y umbral de aviso.
- Compras: proveedores y componentes relacionados.
- Equipo: empleados, departamentos, puestos y salario anual.
- Facturación: una factura por pedido, IVA fijo del 21 % y estado del cobro.
- Ajustes: nombre del estudio, color de acento y perfil de módulos.
- CRUD con búsqueda, filtro por estado, paginación y formularios con validación.
- Exportación JSON de las entidades del perfil activo.

Flujo recomendado: cliente → producto → pedido → líneas de pedido → factura → pago. Las líneas conservan el precio acordado. Un pedido facturado y sus líneas quedan bloqueados en la API; para corregirlo hay que eliminar su factura primero. El stock es manual y no se descuenta al vender.

## Apertura manual de SQLite

1. En DB Browser for SQLite u otro visor, selecciona «Abrir base de datos».
2. Elige `data/darkorange_alfredo.sqlite`.
3. Revisa las tablas y las vistas `resumen_pedidos` y `resumen_facturas`.
4. Si vas a modificar datos manualmente, detén antes la aplicación y activa las claves foráneas en esa conexión:

```sql
PRAGMA foreign_keys = ON;
SELECT * FROM resumen_pedidos;
SELECT * FROM resumen_facturas;
PRAGMA integrity_check;
PRAGMA foreign_key_check;
```

Las reglas de formularios y el bloqueo de pedidos facturados pertenecen a la API. Una edición directa con un visor puede saltarse esas reglas. Las claves foráneas y los `CHECK` del esquema siguen protegiendo las relaciones y rangos cuando están habilitados. Mantén los pedidos facturados sin modificar también al trabajar manualmente.

## Instalaciones reproducibles

La instalación nunca sobrescribe un archivo existente. Para conservar la base de entrega, usa otro archivo. En Linux, desde esta carpeta:

```bash
DARKORANGE_DB=/tmp/darkorange-vacia.sqlite php utilidades/instalar.php --vacia --perfil=comercial
DARKORANGE_DB=/tmp/darkorange-taller.sqlite php utilidades/instalar.php --perfil=taller
```

Para instalar mediante web en un archivo nuevo:

```bash
DARKORANGE_DB=/tmp/darkorange-web.sqlite php -S 127.0.0.1:8081 utilidades/router.php
```

Abre http://127.0.0.1:8081/instalador.html y elige nombre, color, perfil y si quieres datos de ejemplo. El archivo seleccionado con `DARKORANGE_DB` será el utilizado por ese servidor; la interfaz describe la ubicación estándar del proyecto. Si una de esas rutas ya existe, elige un nombre nuevo.

| Perfil | Módulos | Supuesto |
| --- | --- | --- |
| Completo | Clientes, ventas, inventario, compras, equipo, facturación | Estudio con administración y taller |
| Comercial | Clientes, ventas, inventario, facturación | Oficina que vende equipos |
| Taller | Clientes, inventario, compras, equipo | Taller que gestiona personas y piezas |

Los perfiles activan módulos; no son roles de usuario. Al cambiar de perfil se conservan los datos. Las referencias necesarias para relacionar entidades pueden leerse aunque su módulo esté inactivo.

## Apache en Linux

El despliegue objetivo es Linux + Apache + PHP + SQLite. Es una variante de la arquitectura LAMP; LAMP clásico utilizaría MySQL. El usuario que ejecuta Apache necesita escribir en **la base y su carpeta**, porque SQLite crea archivos auxiliares.

Se incluye una configuración lista para revisar en `docs/apache-darkorange.conf`. Su ruta corresponde a este proyecto. Si lo mueves, adapta la ruta. La configuración crea el alias local `/darkorange`, permite `.htaccess`, desactiva los listados y limita el acceso al equipo local.

En Debian/Ubuntu, con administración del sistema:

```bash
sudo apt install apache2 php libapache2-mod-php php-sqlite3
sudo chgrp www-data data data/darkorange_alfredo.sqlite
sudo chmod 2770 data
sudo chmod 660 data/darkorange_alfredo.sqlite
sudo cp docs/apache-darkorange.conf /etc/apache2/conf-available/darkorange.conf
sudo a2enconf darkorange
sudo apache2ctl configtest
sudo systemctl reload apache2
```

Después abre **http://localhost/darkorange/index.html** y verifica que **http://localhost/darkorange/data/darkorange_alfredo.sqlite** devuelva 403. Si `configtest` falla, corrige el error antes de recargar. No se han cambiado archivos de `/etc/apache2` durante la realización del proyecto.

En el equipo inspeccionado, Apache declara `www-data` y `AllowOverride None` para `/var/www/`: sin habilitar la configuración incluida, ignora los `.htaccess`. El comando de desarrollo con PHP funciona sin modificar Apache.

La aplicación es un prototipo académico para uso local. La sesión se utiliza para la protección CSRF y no equivale a iniciar sesión como usuario. No incluye autenticación, permisos por persona, fiscalidad completa ni automatización de almacén.

## Estructura

```text
index.html / estilo.css / codigo.js     Interfaz de gestión
estudio.html / marca.svg / uvas.svg     Presentación e identidad
instalador.html / instalador.js         Instalación web
api/modulos.php                        Catálogo de módulos y perfiles
api/nucleo.php                         Conexión, instalación, configuración y sesión
api/superapi.php                        Lecturas, CRUD, resumen y exportación
api/instalar.php                        API del instalador
utilidades/instalar.php                 Instalación CLI
utilidades/router.php                   Protección del servidor de desarrollo
servicios/entrada.php                   Alias de la exportación JSON
servicios/salida.php                    Respuesta explícita: importación no disponible
data/schema.sql / demo.sql              Esquema y datos nuevos
data/darkorange_alfredo.sqlite          Base de entrega
data/darkorange.db                      Base anterior conservada
docs/                                  Memoria, verificación y configuración Apache
tests/verificar.py                      Pruebas de integración aisladas
```

`data/config.php` conserva un lector PHP de compatibilidad, pero la interfaz usa la API y la configuración almacenada en SQLite. El directorio `data` se protege frente a lecturas web directas.

## Comprobación

```bash
python3 tests/verificar.py
node --check codigo.js
node --check instalador.js
```

Las pruebas crean bases temporales, levantan un servidor PHP en localhost y lo detienen al acabar. No modifican la base entregada. Detalle de resultados y pruebas pendientes en `docs/VERIFICACION.md`; explicación de los criterios a–f en `docs/MEMORIA-UD2.md`.

Referencias técnicas: [PDO SQLite](https://www.php.net/pdo-sqlite), [claves foráneas de SQLite](https://www.sqlite.org/foreignkeys.html) y [configuración de .htaccess en Apache](https://httpd.apache.org/docs/2.4/howto/htaccess.html).
