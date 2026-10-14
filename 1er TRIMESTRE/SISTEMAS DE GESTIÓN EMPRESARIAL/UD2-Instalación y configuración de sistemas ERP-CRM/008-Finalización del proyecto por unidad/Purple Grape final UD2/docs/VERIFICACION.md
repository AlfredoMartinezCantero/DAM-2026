# Verificación · Purple Grape 2.0

Fecha: 14 de octubre de 2026. Entorno comprobado: Linux, PHP 8.3.6 con PDO SQLite/SQLite3, Node.js 24.16.0 y Python 3.12.3.

## Resultados ejecutados

| Comprobación | Resultado |
| --- | --- |
| Sintaxis de los nueve archivos PHP | Correcta, `php -l` |
| Sintaxis de `codigo.js` e `instalador.js` | Correcta, `node --check` |
| Instalación CLI vacía: comercial, taller y completo | Correcta |
| Instalación web con demostración | Correcta |
| Rechazo de sobrescritura y reversión de instalación fallida | Correcto |
| Lectura de ocho entidades | Correcta |
| CRUD, relaciones, cascada y cobro | Correctos |
| Total de pedido e IVA de factura | Correctos |
| Validación de números, fechas y duplicados | Correcta |
| POST obligatorio, CSRF y catálogo cerrado | Correctos |
| Bloqueo de pedido facturado y sus líneas | Correcto |
| Cambio de perfiles y conservación de datos | Correctos |
| Exportación JSON y registro de operaciones | Correctos |
| Bloqueo HTTP de archivos privados con router PHP | 403 en las rutas comprobadas |
| Suite de integración | **84 comprobaciones correctas** |

Las pruebas usan un directorio temporal y `DARKORANGE_DB`; no modifican la base entregada. El proceso del servidor se detiene al terminar.

Ejecutar desde la carpeta del proyecto:

```bash
python3 tests/verificar.py
```

## Archivo entregado

Archivo: `data/darkorange_alfredo.sqlite`. Perfil completo. Datos ficticios:

| Entidad | Registros |
| --- | --- |
| Clientes | 5 |
| Productos | 6 |
| Proveedores | 2 |
| Componentes | 3 |
| Empleados | 3 |
| Pedidos | 4 |
| Líneas de pedido | 7 |
| Facturas | 2 |

Panel esperado con estos datos: 5 clientes, 3 pedidos en marcha, 817,96 € pendientes de cobro y 2 avisos de stock. Las facturas pendientes incluyen IVA. Los importes de pedidos se muestran sin IVA.

Consultas de comprobación:

```sql
PRAGMA integrity_check;       -- ok
PRAGMA foreign_key_check;     -- sin filas
SELECT id, cliente, total FROM resumen_pedidos ORDER BY id;
-- 1: Luna Café / 1476.00
-- 2: Norte Creativo / 676.00
-- 3: La Huerta Digital / 447.00
-- 4: Órbita Cowork / 807.00
```

## Comprobaciones manuales pendientes

Estas pruebas necesitan un navegador o aplicar la configuración de Apache; no se presentan como realizadas:

- Revisar la presentación de escritorio y móvil, el scroll de las tablas y el color seleccionado.
- Recorrer el menú y los diálogos con teclado; comprobar foco, Escape, campos obligatorios y mensajes de error.
- Probar búsqueda, filtro de estados, paginación y precarga del precio del producto en el navegador.
- Comprobar el cliente en Windows, Linux y macOS con navegadores modernos.
- Aplicar `apache-darkorange.conf`, revisar permisos y confirmar que Apache devuelve 403 al solicitar la base.

No se ha configurado ni reiniciado el Apache del sistema. El servidor de desarrollo PHP y el router sí se han probado mediante HTTP. Las pruebas automatizadas verifican el backend y que los recursos se sirven; no sustituyen la revisión visual de la interfaz.

## Actualización de identidad: Purple Grape

Se renovaron las tres páginas, el logotipo, la ilustración, la hoja de estilos y los valores de nombre y color guardados en SQLite. La nueva identidad utiliza ciruela, lavanda y violeta. Los datos ficticios de producto y correo se adaptaron a la marca.

Se comprobó la sintaxis del PHP y JavaScript modificados, la existencia de los recursos locales, el formato de ambos SVG y la integridad y las relaciones de la base de datos. El número de registros comerciales se conserva. La suite de 84 comprobaciones corresponde a la verificación funcional previa; no se repitió para el cambio de identidad. La revisión visual en navegador sigue pendiente.
