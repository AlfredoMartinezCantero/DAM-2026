# Manual de identidad corporativa

**Alfredo | interfaz integrada**  
Versión 1.1 · 21 de octubre de 2026

Consulta el [manual en formato web](manual-identidad.html), con muestras visuales y formato de impresión A4.

Este manual define la identidad visual básica del proyecto académico de interfaz de usuario. Sirve para mantener una presentación coherente al añadir pantallas, formularios y módulos.

La paleta toma como referencia Purple Grape. Se conserva el nombre Alfredo, su símbolo de interfaz y la distribución actual de la aplicación.

## 1. Marca y personalidad

La marca se presenta como una herramienta de gestión sencilla, formal y fácil de utilizar. Su identidad debe transmitir orden, claridad y cercanía.

| Elemento | Uso |
| --- | --- |
| Nombre | Alfredo |
| Denominación completa | Alfredo \| interfaz integrada |
| Descripción | Aplicación de gestión de clientes, productos y pedidos |
| Estilo | Profesional, sobrio y funcional |

Se escribe **Alfredo** con inicial mayúscula. El descriptor **interfaz integrada** se escribe en minúsculas y se separa del nombre mediante una barra vertical con un espacio a cada lado.

Purple Grape es la referencia cromática; no sustituye el nombre de esta aplicación.

## 2. Símbolo y composición

![Símbolo de Alfredo: una ventana de aplicación con panel lateral](img/alfredo.svg)

El símbolo representa una ventana de aplicación con barra superior, panel lateral y área de contenido. Identifica el proyecto sin repetir la inicial del nombre.

El archivo original es [img/alfredo.svg](img/alfredo.svg). Debe utilizarse ese recurso para conservar su nitidez y sus proporciones.

### Aplicaciones

- **Cabecera:** símbolo a la izquierda y denominación completa a la derecha. El tamaño actual del símbolo es de 28 × 28 px.
- **Login:** símbolo encima del nombre. El tamaño actual es de 72 × 72 px.
- **Favicon:** símbolo sin texto, preparado para visualizarse entre 16 y 32 px.

El original tiene un área cuadrada de 64 × 64 unidades. Al cambiar el tamaño, deben mantenerse iguales el ancho y el alto. Como regla de uso, se recomienda dejar alrededor un espacio libre de al menos una octava parte de su ancho.

### Usos incorrectos

- Estirar, comprimir, girar o recortar el símbolo.
- Sustituirlo por una letra A o por un icono distinto en cada pantalla.
- Añadir sombras, contornos o efectos al archivo original.
- Colocarlo sobre imágenes o fondos que dificulten su lectura.

### Imagen de perfil

El [racimo de uvas](img/uva.svg) se utiliza a 28 × 28 px junto al nombre del usuario y la acción Cerrar sesión. Es un recurso secundario en tonos violetas y lavanda; no sustituye el símbolo principal de la aplicación.

## 3. Paleta principal

Los colores de la interfaz se definen en las variables de [css/estilo.css](css/estilo.css).

| Color | HEX | RGB | Variable | Aplicación |
| --- | --- | --- | --- | --- |
| Ciruela | `#211331` | 33, 19, 49 | `--color0` | Cabecera y menú principal |
| Violeta | `#7C3AED` | 124, 58, 237 | `--color` | Acciones principales, selección y fichas |
| Lavanda | `#EDE9FE` | 237, 233, 254 | `--color2` | Paneles secundarios, cabeceras de tabla y estados suaves |
| Fondo claro | `#F5F3FA` | 245, 243, 250 | `--color3` | Área de trabajo y campos |
| Blanco | `#FFFFFF` | 255, 255, 255 | `--color4` | Tarjetas y superficies de contenido |
| Tinta | `#282039` | 40, 32, 57 | `--tinta` | Texto sobre fondos claros |
| Borde | `#E8E2F0` | 232, 226, 240 | `--borde` | Separadores y bordes discretos |

Los fondos claros deben ocupar la mayor parte del contenido. El ciruela organiza la navegación y el violeta destaca acciones concretas. No conviene llenar todas las superficies de violeta.

### Colores propios del símbolo

El SVG actual utiliza azul oscuro `#123244`, blanco `#FFFFFF` y un detalle turquesa `#8ED8D0`. Estos colores se reservan al símbolo; la interfaz utiliza la paleta principal. Cualquier futura adaptación del logo debe actualizar también este manual.

### Colores funcionales

| Función | Color actual | Aplicación |
| --- | --- | --- |
| Información | `#3B82F6` | Avisos informativos |
| Éxito | `#22C55E` | Confirmaciones de operaciones |
| Advertencia | `#F59E0B` | Situaciones que requieren revisión |
| Error | `#EF4444` | Avisos de error |
| Acción destructiva | `#A52D3A` | Botón Eliminar y mensajes de validación |

Estos colores comunican estados, no decoran el menú. Siempre deben acompañarse de texto o de un símbolo comprensible.

## 4. Tipografía

La fuente principal es **Segoe UI**, con **Arial** y la familia genérica **sans-serif** como alternativas. No se requieren fuentes externas.

```css
font-family: "Segoe UI", Arial, sans-serif;
```

| Uso | Referencia actual |
| --- | --- |
| Nombre de la aplicación en cabecera | 20 px, negrita |
| Nombre de la aplicación en login | 28 px |
| Etiquetas de formulario | 14 px |
| Texto general de la aplicación | Base de 12 px |

La jerarquía se consigue mediante tamaño, peso y separación. Se evitan las fuentes decorativas y los bloques largos en mayúsculas. Cuando un contenido necesite mayor legibilidad, puede aumentarse su tamaño sin cambiar de familia tipográfica.

## 5. Componentes de la interfaz

### Navegación

La cabecera y el menú principal utilizan ciruela. El módulo o la vista activa se destaca en violeta con texto blanco. Las opciones mantienen una estructura estable de ficha y etiqueta.

### Botones

- **Principal:** fondo violeta y texto blanco para Crear, Guardar o Confirmar.
- **Secundario:** fondo lavanda y texto oscuro para Cancelar o acciones de apoyo.
- **Destructivo:** fondo rojo oscuro y texto blanco para Eliminar, con confirmación previa.

Las etiquetas describen la acción: «Guardar pedido» resulta más claro que «Aceptar» cuando se está editando un pedido.

### Formularios y tablas

Los formularios se presentan en tarjetas blancas, con campos claros, etiquetas visibles y bordes suaves. Los errores aparecen junto al formulario con una explicación concreta.

Las tablas emplean cabeceras lavanda, texto oscuro y separadores discretos. Los precios se muestran en euros con formato español. Las acciones Editar y Eliminar mantienen el mismo aspecto en todos los módulos.

### Formas y espaciado

Se conservan los cortes diagonales presentes en tarjetas, botones y fichas. No se añaden nuevos estilos de esquina, animaciones o efectos por motivos decorativos.

El relleno base es de 12 px. Los formularios utilizan una separación habitual de 16 px entre campos. Las nuevas pantallas deben reutilizar las clases existentes antes de crear variaciones.

## 6. Legibilidad y accesibilidad

Se recomiendan estas combinaciones, cuyo contraste cromático calculado supera 4,5:1:

- Blanco sobre ciruela para navegación.
- Blanco sobre violeta para acciones principales.
- Tinta sobre lavanda o fondo claro para contenido.

El cálculo de contraste no sustituye la revisión de cada pantalla. Deben mantenerse visibles el foco de teclado, las etiquetas y los mensajes de error. Los estados no deben distinguirse únicamente mediante el color.

## 7. Tono de los mensajes

Se utiliza español claro y directo. Los mensajes explican qué ha ocurrido y, si hace falta, cómo corregirlo. Se evita mostrar al usuario detalles internos que no le ayuden a completar su tarea.

| Situación | Ejemplo |
| --- | --- |
| Operación completada | Pedido guardado. |
| Campo obligatorio | Completa el nombre del cliente. |
| Stock insuficiente | Quedan 3 unidades disponibles. Reduce la cantidad. |
| Confirmación de borrado | ¿Quieres eliminar este producto? |
| Búsqueda vacía | No hay resultados para esta búsqueda. |

## 8. Mantenimiento de la identidad

Para añadir un módulo, se reutilizan la cabecera, la navegación, los botones, las tablas y los formularios actuales. No se asigna una paleta distinta a cada módulo.

Las ampliaciones visuales deben partir de las variables del CSS. Si cambian el nombre, el logo, la paleta o la tipografía, debe actualizarse este documento para que siga describiendo los recursos utilizados.

Esta primera versión recoge una identidad básica para la aplicación web. No define todavía papelería, material impreso ni variantes adicionales del logo.
