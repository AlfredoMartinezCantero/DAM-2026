# Alfredo · Interfaz de usuario 0.3

Espacio de gestión de clientes, productos y pedidos. HTML, CSS y JavaScript sin dependencias de ejecución ni recursos externos.

## Abrir la aplicación

Desde esta carpeta, con Node.js instalado:

```powershell
npm start
```

Si PowerShell bloquea `npm.ps1`, utiliza `npm.cmd start` (y `npm.cmd test` para las pruebas).

Abre **http://127.0.0.1:8765**. El servidor solo escucha en el equipo local e incluye el puente para Ollama. Un servidor exclusivamente estático permite usar la gestión, pero no el chat. La carga de JSON utiliza `fetch`: no abras `index.html` mediante `file://`.

## Asistente con Ollama

1. Ejecuta Ollama en el mismo equipo que el servidor de la aplicación. El modelo configurado es **`phi4-mini:latest`**. Si falta, descárgalo con `ollama pull phi4-mini:latest`.
2. Arranca la aplicación con `npm start` y pulsa **Asistente IA** en la esquina inferior derecha.
3. Escribe y pulsa Enter o Enviar; Mayús + Enter añade una línea. La primera respuesta puede tardar mientras se carga el modelo. Puedes cancelar la espera y volver a enviar el texto.

### Dictado de voz

Pulsa el botón de micrófono **Dictar**, permite el acceso al micrófono cuando lo solicite el navegador y habla en español. El texto aparece en el campo de mensaje; pulsa **Detener**, revisa lo reconocido y después **Enviar**. No se envía automáticamente. El dictado se inserta en el cursor o sustituye el texto seleccionado y conserva el resto del mensaje. Mientras escucha, el campo queda en modo lectura para evitar sobrescribir correcciones. Se respeta el límite de 4000 caracteres.

La integración detecta `SpeechRecognition` y su variante `webkitSpeechRecognition`. Si no están disponibles, desactiva el micrófono y permite seguir escribiendo. Los errores de permisos, ausencia de voz, micrófono o conexión se explican sin perder el texto escrito. Cerrar el panel, iniciar una nueva conversación o salir de la página detiene el reconocimiento; los resultados tardíos no vuelven a insertar texto. No se inicia el micrófono automáticamente ni se reactiva al terminar.

El reconocimiento depende del navegador y puede enviar el audio al servicio de su proveedor, por lo que el dictado puede necesitar conexión a Internet aunque Ollama se ejecute en local. La aplicación no guarda audio ni lo envía a Ollama; al pulsar Enviar se utiliza el texto reconocido. Consulta la [documentación de SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) para sus límites de compatibilidad.

### Panel y conversación

Con el chat cerrado puedes **arrastrar el botón Asistente IA** con ratón o con el dedo. Al abrirlo, el botón pasa a la cabecera, junto a la ×, y permite minimizarlo. Para mover la ventana abierta, **arrastra su cabecera**; el texto de la conversación sigue pudiéndose seleccionar y desplazar. Al cerrar o minimizar, el botón queda flotando en el lugar que ocupaba en la cabecera del chat, sin volver al punto desde el que lo abriste. Al reabrir, la ventana conserva su última posición, salvo que hayas movido el botón flotante: en ese caso se abre junto a su nueva ubicación. Ambas posiciones se guardan en este navegador (`Alfredo.iu.chat.posicion.v1` y `Alfredo.iu.chat.panel.v1`) y se adaptan al tamaño de la ventana. Con el botón flotante o la cabecera enfocados, las flechas mueven el elemento, Mayús permite pasos mayores e Inicio restablece su posición.

El historial conserva los últimos **6 intercambios** en memoria y se reenvía a `/api/chat` de Ollama cuando la consulta requiere el modelo. Cerrar el panel conserva la conversación; **Nueva conversación** o recargar la página la borra. No se guarda en disco ni en `localStorage`. Los mensajes admiten 4000 caracteres. La aplicación limita la generación a 1024 tokens para ayuda y 2048 para borradores, y espera hasta 180 segundos por consulta. **Información de IA** reúne las instrucciones de uso en un desplegable.

El asistente conoce las pantallas reales de Alfredo y puede resolver dudas o **preparar un borrador de alta de cliente**. No consulta tus registros ni guarda, modifica o elimina datos directamente. Solo recibe el texto que envías y el historial de esa conversación. Las respuestas se muestran como texto, sin ejecutar HTML. Se comprueban el método, el JSON, los tipos, el tamaño, los roles del historial, el estado HTTP y la respuesta de Ollama.

Las preguntas generales se responden como conversación normal, sin el esquema de alta de cliente. La extracción estructurada se activa únicamente para peticiones explícitas de preparar o crear un cliente, o para completar sus datos a continuación. Las preguntas sobre las capacidades del asistente y las solicitudes de consulta de stock o registros tienen respuestas verificadas sobre sus límites. Un ID como `#001` después de preguntar por stock no habilita ninguna búsqueda. Puedes copiar cifras en la conversación para pedir una explicación o un cálculo.

### Preparar un nuevo cliente

Escribe, por ejemplo: «Crea un cliente llamado Nora Sánchez, email nora@example.com, teléfono 612345678, empresa Ejemplo SL».

1. La IA extrae nombre, apellidos, email, teléfono, empresa y observaciones siguiendo un esquema JSON. Los campos ausentes quedan vacíos. La extracción puede contener errores y debe revisarse.
2. Pulsa **Revisar nuevo cliente** en la respuesta. Se abre el formulario habitual de Clientes con esos datos y sus validaciones. No se sustituye ningún formulario que ya esté abierto.
3. Corrige los campos, completa los obligatorios (nombre y email) y pulsa **Guardar cliente**. Solo entonces se crea el registro en el almacenamiento local del navegador. Cancelar descarta el borrador.

El método de pago, la fecha de creación y los datos adicionales se conservan en **Observaciones**. La fecha de creación no se usa como fecha de nacimiento. Los demás controles mantienen los valores iniciales del formulario; la IA no puede asignar un ID. Cada botón abre su borrador una vez; para preparar otro, vuelve a solicitarlo en el chat. Los borradores desaparecen al iniciar una conversación nueva o recargar.

Esta versión no automatiza ediciones, eliminaciones ni operaciones con productos o pedidos. Una petición de «nuevo usuario» se interpreta como un borrador de cliente: la aplicación no gestiona cuentas reales.

La configuración compartida está en `api/ollama.json` (modelo, URL de Ollama, tiempo de espera e instrucciones), `api/chat-formato.json` (estructura permitida de los borradores) y `api/chat-politica.json` (capacidades verificadas, selección entre ayuda y borrador, y respuestas sobre acceso a registros). Las reglas verificadas se añaden a las instrucciones personalizadas para mantener claros los límites de la aplicación. Reinicia Node después de cambiarla. El navegador llama únicamente a `api/chat.php`: con `npm start`, Node atiende esa ruta mediante `api/chat.cjs`; con Apache/XAMPP se ejecuta `api/chat.php`. Ambos validan la acción y los campos permitidos; nunca ejecutan código del modelo.

### Alternativa con PHP / XAMPP

Usa PHP 7.4 o superior con cURL activado. Desde esta carpeta puedes iniciar el servidor integrado:

```powershell
C:\xampp\php\php.exe -S 127.0.0.1:8765
```

Después abre la misma dirección. Utiliza un solo servidor en ese puerto. En Apache/XAMPP también puedes servir esta carpeta como sitio. Un editor con Live Server no ejecuta PHP. El `127.0.0.1` de la configuración de Ollama apunta al equipo donde corre Node/PHP; si despliegas en otro equipo, necesitarás Ollama accesible desde allí.

Referencia de la API: [chat de Ollama](https://docs.ollama.com/api/chat).

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
- `js/chat.js`: panel del asistente, posición, historial, dictado de voz, cancelación y errores.
- `api/chat.php` / `api/chat.cjs`: puente con Ollama para PHP y Node, respectivamente.
- `api/ollama.json`: configuración compartida del modelo local.
- `api/chat-formato.json`: esquema de los borradores de clientes.
- `api/chat-politica.json`: contexto verificado, selección de modo y límites de acceso del asistente.
- `css/estilo.css`: variables y componentes del sistema visual, adaptación a móvil e impresión.
- `servidor.cjs`: servidor de desarrollo y ruta del chat sin dependencias.

## Pruebas

Node.js 20.19+, 22.13+ o 24+. Para instalar la única dependencia de desarrollo y ejecutar todas las pruebas:

```powershell
npm ci
npm test
```

Las pruebas incluyen persistencia, validaciones, reservas, precios históricos, analítica, CSV, el puente de Ollama con respuestas simuladas, historial, cancelación y flujos de la interfaz mediante jsdom. El dictado se comprueba con eventos de reconocimiento simulados: resultados provisionales y finales, selección de texto, permisos, errores, límite de caracteres y cancelación de sesiones. No necesitan Ollama activo ni acceso al micrófono. Las pruebas DOM no sustituyen la revisión visual ni la prueba de audio real en un navegador compatible.

Sin instalar dependencias puedes ejecutar las pruebas de negocio y analítica:

```powershell
node --test tests/modulos.test.cjs tests/pedidos.test.cjs tests/vistas.test.cjs
```
