# Interfaz de usuario · Alfredo

Abre `index.html` mediante un servidor HTTP local. La carga de los JSON utiliza `fetch`, por lo que abrir directamente el archivo con `file://` no es suficiente.

## Identidad corporativa

El [manual de identidad en formato web](manual-identidad.html) reúne las normas de marca, logo, colores, tipografía y componentes. Utiliza su propia hoja de estilos, `css/manual-identidad.css`, y permite imprimir o guardar como PDF desde el navegador. El manual también puede abrirse directamente como archivo HTML.

## Módulos

- **Clientes y Productos:** búsqueda, creación, edición y eliminación con confirmación. El teléfono español se presenta agrupado automáticamente.
- **Pedidos:** selección de cliente, varias líneas de productos, cantidades enteras, total en euros, notas y estados pendiente, confirmado y cancelado.
- **Configuración:** resumen de los registros y del almacenamiento.

## Pedidos y existencias

El **stock total** se introduce en Productos. El **reservado** es la suma de las unidades de los pedidos confirmados; el **disponible** es la diferencia. Los pedidos pendientes no reservan stock. Sus cantidades se comprueban al guardar y de nuevo al confirmar.

Cancelar un pedido, pasarlo a pendiente o eliminarlo libera su reserva. Editar un pedido confirmado sustituye su reserva anterior. No se puede reducir el stock total por debajo del reservado.

Cada pedido conserva los nombres y precios de sus líneas al guardarse. Cambiar el catálogo no modifica esos precios; los nuevos pedidos usan el precio actual. Los cálculos se realizan en céntimos y no incluyen impuestos ni descuentos.

Para conservar las relaciones, no se pueden eliminar clientes o productos asociados a pedidos, incluidos los cancelados. Se puede quitar un producto de la venta desmarcando «Disponible».

## Almacenamiento

Los JSON contienen los datos iniciales. Los cambios se guardan en `localStorage` del navegador, bajo las claves `Alfredo.iu.clientes.v1`, `Alfredo.iu.productos.v1` y `Alfredo.iu.pedidos.v1`. Los archivos del proyecto no se modifican al guardar desde la aplicación.

Las reservas se calculan desde los pedidos, de modo que guardar un pedido requiere una sola escritura. Si el almacenamiento falla, la operación no modifica los registros en memoria.

Esta versión está pensada para trabajar desde una sola pestaña. El uso simultáneo y la sincronización entre usuarios requieren un servidor y una base de datos. El login continúa siendo una demostración.

## Pruebas

Desde esta carpeta:

```powershell
node --test tests/modulos.test.cjs tests/pedidos.test.cjs
```
