# Basic Purple Grape

Copia sencilla de `16-darkorange`, con nombre Purple Grape, color violeta (`#7c3aed`) e icono de uvas. Mantiene las dos columnas de navegación, las tablas, los formularios y los botones nativos del navegador.

## Arranque

Desde esta carpeta:

```bash
php -S 127.0.0.1:8082
```

Abre **http://127.0.0.1:8082/index.html**. También puedes servir la carpeta mediante Apache con PHP. No abras el HTML con `file://`: las consultas necesitan ejecutar la API PHP.

Requisitos: PHP con la extensión SQLite3 y un navegador con JavaScript.

## Uso

1. Selecciona una tabla en la columna de entidades.
2. Pulsa **Nuevo registro** para añadir datos.
3. Pulsa **Editar** para modificar una fila y guardar los cambios.
4. Pulsa **Eliminar** y confirma para borrar una fila.

Se conservan las siete tablas y los datos de `16-darkorange`. La base independiente es **`data/purplegrape.db`** y puede abrirse manualmente con un visor SQLite. No se modifican las bases de los otros proyectos.

Como en el original, los nombres de módulos de la primera columna son etiquetas; la selección de tablas se hace en la segunda columna. Los campos se muestran directamente con sus nombres de base de datos y los formularios utilizan entradas de texto.

`instalador.html` conserva el instalador por modelo de texto. Puedes añadir una tabla indicando su nombre y escribiendo sus campos con un guion delante:

```text
contactos
-nombre
-email
```

La tabla tendrá un identificador `id` y columnas de texto. El instalador utiliza `CREATE TABLE IF NOT EXISTS`, por lo que no sustituye la estructura de tablas existentes. La aplicación ya incluye su base y no requiere ejecutar el instalador para empezar.

`servicios/salida.php` conserva la exportación JSON del original. El nombre y el color se editan en `data/config.php`.

La estructura procede de `16-darkorange`. Además del cambio de marca, se fijaron las rutas PHP con `__DIR__` y se corrigió el botón de edición para admitir textos con apóstrofos o comillas. El CRUD sigue siendo el del proyecto básico; los campos numéricos y las relaciones se introducen manualmente.

## Comprobación realizada

71 comprobaciones correctas sobre una copia temporal: consulta, creación, edición y eliminación en las siete tablas, configuración, instalador y exportación JSON. Se comprobaron también la sintaxis PHP/JavaScript y la integridad de SQLite. Los archivos originales y la base entregada se conservaron. La revisión visual en navegador queda pendiente.
