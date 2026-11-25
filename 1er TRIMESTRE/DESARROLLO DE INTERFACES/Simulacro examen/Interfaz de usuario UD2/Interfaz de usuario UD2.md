# Interfaz de usuario UD2

# 1- Introducción

Imaginemos que una persona gestiona un pequeño negocio y necesita saber que pedidos tiene pendientes, para eso he creado esta interfaz de usuario, cuando esa información está en listas separadas resulta mucho más dificil mantenerla actualizada y por culpa de ello se pueden comprometer la información. 
Este proyecto intenta arreglar esa dificultad y propone reunir las tareas en un mismo espacio de gestión, con información clara y controles que ayudan a evitar errores.

# 2- ¿Para que sirve?

La aplicación permite crear, consultar, editar y eliminar clientes y productos además de gestionar pedidos.
Los importes confirmados y las existencias disponibles están a disposición total para que la persona no tenga que calcularlos por separado, también permite exportar los resultados en CSV.

Un ejemplo de una de las funcionalidades sería: si un producto tiene diez unidades y se confirma un pedido de tres, quedan siete, al cancelarlo, esas unidades vuelven a su "sitio" y vuelven a estar disponibles las diez.

# 3- Cuestiones técnicas

Se ha utilizado HTML, CSS y JS sin un framework ni dependecias externas, esto permite trabajar directamente los componentes de una interfaz y mantener el prototipo ligero a cambio de gestionar el modelo de objetos del documento y sus eventos.

# 4- Despedida, cierre y resumen

El resultado es un prototipo que reune clientes, productos y pedidos y permite consultar la disponibilidad sin calcular el stock por separado, operaciones como confirmar y cancelar pedidos, conservar precios y recuperar cambios guardados.
Su "fallo" o limitación principal  es que depende del almacenamiento de un navegador y que está pensado para una sola pestaña, sin sincronización ni control de acceso real (todavía), sería algo a implementar en un futuro, por eso las siguientes mejoras serían la de incorporar almacenamiento compartido con autenticación y recuperación de copias para que la información se mantenga y proteja dentro de un uso real.