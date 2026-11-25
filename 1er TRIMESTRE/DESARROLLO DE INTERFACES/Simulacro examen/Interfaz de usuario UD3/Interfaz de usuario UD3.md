# Interfaz de usuario UD3

# 1- Introducción

Imaginemos que una persona gestiona un pequeño negocio y necesita saber que pedidos tiene pendientes, para eso he creado esta interfaz de usuario, cuando esa información está en listas separadas resulta mucho más dificil mantenerla actualizada y por culpa de ello se pueden comprometer la información. 
Este proyecto intenta arreglar esa dificultad y propone reunir las tareas en un mismo espacio de gestión, con información clara y controles que ayudan a evitar errores.
En esta versión se mantiene la misma interfaz y se ha añadido un asistente de IA y reconocimiento de voz para poder hacer consultas escribiendo o dictando el mensaje.

# 2- ¿Para que sirve?

La aplicación permite crear, consultar, editar y eliminar clientes y productos además de gestionar pedidos.
Los importes confirmados y las existencias disponibles están a disposición total para que la persona no tenga que calcularlos por separado, también permite exportar los resultados en CSV.
Un ejemplo de una de las funcionalidades sería: si un producto tiene diez unidades y se confirma un pedido de tres, quedan siete, al cancelarlo, esas unidades vuelven a su "sitio" y vuelven a estar disponibles las diez.

Además, el asistente permite resolver dudas sobre la aplicación y preparar un borrador para crear un cliente a partir de los datos que se le indiquen, por ejemplo: pedirle que prepare un cliente con su nombre, correo y teléfono, después se pulsa "Revisar nuevo cliente" y se abre el formulario con esos datos para comprobarlos y guardar.
La IA no crea el cliente directamente ni consulta, modifica o elimina los registros por su cuenta.

El reconocimiento de voz permite pulsar el botón de dictar, para ello hay que dar permiso al micrófono (será solicitado cuándo se pulse el botón) y hablar en español para que el mensaje aparezca escrito en el chat, al terminar se pulsa "Detener", se revisa el texto y después se envía, no se manda automáticamente, por lo que se puede corregir lo que no haya entendido bien antes de preguntarle a la IA.

# 3- Cuestiones técnicas

Se ha utilizado HTML, CSS y JS sin un framework para la interfaz, esto permite trabajar directamente los componentes de una interfaz y mantener el prototipo ligero a cambio de gestionar el modelo de objetos del documento y sus eventos.

Para la IA se ha utilizado Ollama con el modelo phi4-mini:latest ejecutándose en el equipo local, el navegador envía el texto a un servidor de Node.js que hace de puente con Ollama. 
Para utilizar el asistente hay que tener Ollama funcionando con el modelo instalado y arrancar el servidor de la aplicación.

Para el reconocimiento de voz se utiliza SpeechRecognition o webkitSpeechRecognition, según el navegador.
Esta función convierte la voz en texto, si no estuviera disponible, se puede seguir escribiendo. La aplicación no guarda el audio ni se lo envía a Ollama, solo utiliza el texto al pulsar "Enviar".

# 4- Despedida, cierre y resumen

El resultado es un prototipo que reune clientes, productos y pedidos y permite consultar la disponibilidad sin calcular el stock por separado, operaciones como confirmar y cancelar pedidos, conservar precios y recuperar cambios guardados.
Ahora también permite utilizar un asistente de IA para resolver dudas y preparar borradores de clientes, además de dictar los mensajes mediante el micrófono sin tener que escribirlos enteros.
Su "fallo" o limitación principal  es que depende del almacenamiento de un navegador y que está pensado para una sola pestaña, sin sincronización ni control de acceso real (todavía), sería algo a implementar en un futuro, por eso las siguientes mejoras serían la de incorporar almacenamiento compartido con autenticación y recuperación de copias para que la información se mantenga y proteja dentro de un uso real.

En las nuevas funcionalidades también hay limitaciones, la IA puede equivocarse y sus borradores deben revisarse antes de guardar, además necesita que Ollama esté funcionando y el reconocimiento de voz depende de la compatibilidad y los permisos del navegador.
