Crea un programa que revise el stock de los productos de una tienda a partir de una lista de unidades escrita en el código.

Requisitos:

Guarda las unidades de cada producto en una variable inmutable stock usando listOf(25, 0, 8, -3, 50, 3)
El proveedor puede guardarse en una variable inmutable proveedor. Puede o no haber proveedor de estos productos, por lo que se espera que tenga un valor por defecto.
Recorre el stock y numera los productos. Muestra el estado de cada producto: Agotado (0), Stock bajo (1-9), Stock normal (10-29) y Stock alto (30 o más).
Si un producto tiene unidades negativas, muestra "Dato erróneo" y pasa al siguiente.
Cuenta los productos agotados y los de stock bajo, y calcula el total y la media de unidades. Indica "Hay que hacer un pedido" si hay algún producto agotado o con stock bajo, o "No hace falta pedido" en caso contrario.
Posible resultado:

Proveedor: Sin proveedor
Producto 1: 25 uds (Stock normal)
Producto 2: 0 uds (Agotado)
Producto 3: 8 uds (Stock bajo)
Producto 4: Dato erróneo
Producto 5: 50 uds (Stock alto)
Producto 6: 3 uds (Stock bajo)
Agotados: 1. Stock bajo: 2. Total: 86 uds. Media: 17. Hay que hacer un pedido.