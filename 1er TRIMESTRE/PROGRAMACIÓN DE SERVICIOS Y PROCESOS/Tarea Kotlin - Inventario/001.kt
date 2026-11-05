fun main() {
    val stock = listOf(25, 0, 8, -3, 50, 3)
    val proveedor: String? = null

    var agotados = 0
    var stockBajo = 0
    var total = 0
    var productosValidos = 0

    println("Proveedor: ${proveedor ?: "Sin proveedor"}")

    for ((indice, unidades) in stock.withIndex()) {
        val numeroProducto = indice + 1

        if (unidades < 0) {
            println("Producto $numeroProducto: Dato erróneo")
            continue
        }

        val estado = when (unidades) {
            0 -> {
                agotados++
                "Agotado"
            }
            in 1..9 -> {
                stockBajo++
                "Stock bajo"
            }
            in 10..29 -> "Stock normal"
            else -> "Stock alto"
        }

        total += unidades
        productosValidos++
        println("Producto $numeroProducto: $unidades uds ($estado)")
    }

    // La media es entera, como en el ejemplo, y excluye los datos erróneos.
    val media = if (productosValidos > 0) total / productosValidos else 0
    val pedido = if (agotados > 0 || stockBajo > 0) {
        "Hay que hacer un pedido"
    } else {
        "No hace falta pedido"
    }

    println("Agotados: $agotados. Stock bajo: $stockBajo. Total: $total uds. Media: $media. $pedido.")
}