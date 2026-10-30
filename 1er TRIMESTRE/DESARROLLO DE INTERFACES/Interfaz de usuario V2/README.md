# Alfredo · Interfaz de usuario V2

Espacio de gestión de clientes, productos y pedidos. HTML, CSS y JavaScript sin dependencias de ejecución ni recursos externos.

## Abrir la aplicación

Desde esta carpeta, con Node.js instalado:

```powershell
npm start
```

Abre **http://127.0.0.1:8765**. El servidor solo escucha en el equipo local. También puedes utilizar cualquier servidor estático. La carga de JSON utiliza `fetch`: no abras `index.html` mediante `file://`.

## Vistas y funciones

- **Resumen:** indicadores, gráfica de importes confirmados por mes con periodo seleccionable, distribución de estados, últimos pedidos y existencias por categoría. Los datos proceden de los registros actuales; no se simulan ventas. La gráfica ofrece una tabla de datos alternativa.
- **Clientes:** alta, edición y eliminación con confirmación; búsqueda sin distinción de tildes o mayúsculas y filtro por empresa. Los teléfonos españoles se agrupan automáticamente.
- **Productos:** catálogo, precios, reservas y disponibilidad; filtro por categoría y avisos de stock bajo.
- **Pedidos:** cliente, varias líneas de productos, cantidades enteras, total en euros, notas y estados pendiente, confirmado y cancelado. Filtro por estado.
- **Tablas:** ordenación por columnas, paginación de 10/25/50 filas y exportación CSV de todos los resultados filtrados, respetando el orden. El CSV incluye protección contra fórmulas al abrirlo en una hoja de cálculo.
- **Manual de identidad:** marca, tipografía, componentes, colores obtenidos del CSS, copia de códigos, descarga del símbolo SVG y exportación de identidad a JSON. El [manual completo](manual-identidad.html) permite imprimir o guardar como PDF desde el navegador.
- **Configuración:** tablas compactas, umbral de stock bajo y copia JSON de los registros. La copia es de consulta; esta versión no incluye importación.
- **Componentes:** demostraciones de formularios, acceso, notificaciones y modales, separadas de la gestión diaria.

El diseño adapta la navegación a móvil y mantiene las tablas con desplazamiento horizontal. Los diálogos gestionan el foco, bloquean el fondo y se cierran con Escape. Pulsa `/` o `Ctrl K` (también `Cmd K`) para buscar dentro de un módulo.

## Pedidos y existencias

El **stock total** se introduce en Productos. El **reservado** es la suma de unidades de pedidos confirmados. El **disponible** es la diferencia. Los pendientes no reservan y se comprueban al guardar y al confirmar.

Cancelar un pedido, pasarlo a pendiente o eliminarlo libera la reserva. Editar uno confirmado sustituye la anterior. El stock total no puede bajar del reservado.

Los pedidos conservan los nombres y precios de sus líneas al guardarse. Cambiar el catálogo no cambia los precios históricos. Los importes se calculan en céntimos y no incluyen impuestos ni descuentos. El importe confirmado del resumen no representa cobros ni facturas.

No se pueden eliminar clientes o productos asociados a pedidos, incluidos los cancelados. Para retirar un producto de la venta, desmarca «Disponible».

## Almacenamiento

Los JSON aportan los datos iniciales. Los cambios se guardan en `localStorage` con las claves `Alfredo.iu.clientes.v1`, `Alfredo.iu.productos.v1` y `Alfredo.iu.pedidos.v1`. Se conservan las claves de la versión anterior. Las preferencias utilizan `Alfredo.iu.preferencias.v1`.

Las reservas se derivan de los pedidos; cada guardado requiere una sola escritura. Si falla el almacenamiento, la operación no modifica los registros en memoria. Las preferencias tampoco se aplican si no pueden guardarse.

Los cambios no modifican los archivos JSON ni se comparten entre navegadores. Está pensado para una sola pestaña; no incluye servidor de datos, sincronización entre usuarios ni autenticación. La página de acceso identifica expresamente este modo de demostración.

## Organización del código

- `js/componentes.js`: datos de Clientes y Productos, navegación, editores, modales y notificaciones.
- `js/pedidos.js`: reglas de pedidos, reservas y formulario de líneas.
- `js/vistas.js`: tablas, analítica, descargas, resumen, identidad y configuración.
- `css/estilo.css`: variables y componentes del sistema visual, adaptación a móvil e impresión.
- `servidor.cjs`: servidor estático de desarrollo sin dependencias.

## Pruebas

Node.js 20.19+, 22.13+ o 24+. Para instalar la única dependencia de desarrollo y ejecutar todas las pruebas:

```powershell
npm ci
npm test
```

Las pruebas incluyen persistencia, validaciones, reservas, precios históricos, analítica, CSV y flujos de la interfaz mediante jsdom. Las pruebas DOM no sustituyen la revisión visual en un navegador real.

Sin instalar dependencias puedes ejecutar las pruebas de negocio y analítica:

```powershell
node --test tests/modulos.test.cjs tests/pedidos.test.cjs tests/vistas.test.cjs
```
