# Manual de identidad corporativa

**Alfredo | interfaz integrada**  
Versión 2.0 · 28 de octubre de 2026

El apartado **Manual de identidad** de la aplicación muestra los colores actuales, permite copiar sus códigos y descargar el símbolo y una ficha JSON. El [manual web completo](manual-identidad.html) incorpora muestras visuales y formato de impresión.

## 1. Marca

| Elemento     | Definición                               |
| ------------ | ---------------------------------------- |
| Nombre       | Alfredo                                  |
| Denominación | Alfredo \| interfaz integrada            |
| Actividad    | Gestión de clientes, productos y pedidos |
| Personalidad | Profesional, sobria, clara y cercana     |
| Ámbito       | Aplicación web académica de uso local    |

Se escribe Alfredo con inicial mayúscula en textos. La firma gráfica del menú utiliza «alfredo» en minúsculas. El descriptor «interfaz integrada» se escribe en minúsculas. Purple Grape es la referencia cromática original, no el nombre del producto.

## 2. Símbolo

![Símbolo de Alfredo: ventana de aplicación con panel lateral](img/alfredo.svg)

El [SVG original](img/alfredo.svg) representa una ventana con barra superior y panel lateral. Tiene proporción 1:1 y un área de 64 × 64 unidades. Utiliza ciruela `#211331`, blanco y lavanda `#C4AFE6`.

- Menú: 34 × 34 px. Pantalla de acceso: 56 × 56 px.
- Favicon: símbolo sin texto, preparado para 16–32 px.
- Espacio libre recomendado: al menos una octava parte de su ancho.
- No deformar, girar, recortar, añadir efectos ni cambiar el símbolo en cada pantalla.
- El avatar representa al usuario. El recurso histórico `img/uva.svg` se conserva en las demostraciones.

## 3. Color

Las variables de [css/estilo.css](css/estilo.css) son la referencia. El apartado integrado las consulta al abrirse.

| Color       | HEX       | Variable    | Uso                                    |
| ----------- | --------- | ----------- | -------------------------------------- |
| Ciruela     | `#211331` | `--color0`  | Marca y firma de acceso                |
| Violeta     | `#6842A6` | `--color`   | Acción principal, selección y gráficas |
| Lavanda     | `#F0EAF8` | `--color2`  | Fondos de selección y estados suaves   |
| Fondo       | `#F6F7F9` | `--color3`  | Área de trabajo                        |
| Blanco      | `#FFFFFF` | `--color4`  | Menú, cabecera y paneles               |
| Tinta       | `#252932` | `--tinta`   | Texto principal                        |
| Secundario  | `#626975` | `--muted`   | Descripciones y etiquetas              |
| Borde       | `#E4E6EB` | `--borde`   | Separadores                            |
| Éxito       | `#276749` | `--success` | Confirmaciones                         |
| Advertencia | `#8A5A12` | `--warning` | Stock bajo y pendientes                |
| Error       | `#AA3545` | `--danger`  | Errores y eliminación                  |

Los fondos neutros ocupan la mayor parte de la interfaz. Los estados incluyen texto para que el color no sea la única señal. Las gráficas de estados combinan violeta, ámbar `#BC8A3E` y gris `#B7BEC9`, con leyenda y recuentos. No se inventan valores cuando faltan registros.

## 4. Tipografía

```css
font-family: "Segoe UI", Arial, sans-serif;
```

| Uso                  | Tamaño                | Peso    |
| -------------------- | --------------------- | ------- |
| Título de página     | 30 px; 25 px en móvil | 650     |
| Título de sección    | 16 px                 | 650     |
| Texto de interfaz    | 14 px                 | 400     |
| Tablas y controles   | 12 px                 | 400–550 |
| Información auxiliar | 10–12 px              | 400     |

Se utiliza la fuente del sistema sin descargas. Los indicadores e importes emplean cifras tabulares. La jerarquía se consigue mediante tamaño, peso y separación.

## 5. Componentes

El menú reúne Resumen, Clientes, Productos, Pedidos, Manual de identidad, Componentes y Configuración. El módulo activo utiliza fondo lavanda y texto violeta. En móvil se abre con un botón que anuncia su estado expandido.

- **Acción principal:** violeta con texto blanco.
- **Acción secundaria:** blanco, borde neutro y texto oscuro.
- **Eliminación:** texto rojo y fondo rosado, con confirmación previa.
- **Formularios:** etiquetas visibles, validación y panel lateral adaptable.
- **Tablas:** cabecera gris clara, ordenación, filtros, paginación y desplazamiento horizontal en pantallas pequeñas.
- **Gráficas:** etiquetas, unidades y tabla alternativa para la evolución mensual.

Paneles con esquinas de 8 px; controles con esquinas de 5–6 px. Base de espaciado de 4 px con ajustes ópticos. Los paneles tienen 24 px de relleno en escritorio y los formularios separan campos 18 px. Se evitan los recortes diagonales y los efectos decorativos intensos.

## 6. Accesibilidad

Blanco sobre violeta alcanza un contraste calculado de 7,20:1. Mantener etiquetas, foco visible y explicaciones textuales. Este cálculo no equivale a una auditoría completa de accesibilidad.

Los diálogos contienen el foco, desactivan el fondo y recuperan el contexto al cerrarse. Escape cierra el diálogo superior. Existe un enlace para saltar al contenido y se respeta la preferencia de movimiento reducido.

## 7. Mensajes

Español claro y directo. Las etiquetas describen operaciones y los errores orientan sobre cómo continuar.

| Situación          | Ejemplo                                            |
| ------------------ | -------------------------------------------------- |
| Guardado           | Cambios guardados.                                 |
| Campo obligatorio  | Completa el nombre del cliente.                    |
| Stock insuficiente | Quedan 3 unidades disponibles. Reduce la cantidad. |
| Borrado            | ¿Quieres eliminar este producto?                   |
| Sin coincidencias  | Prueba con otro término o limpia los filtros.      |
| Sin pedidos        | Añade tu primer pedido para empezar.               |

## 8. Mantenimiento

Las nuevas pantallas reutilizan las variables y componentes compartidos. Una modificación de paleta, nombre, símbolo o tipografía debe reflejarse en este documento y en el manual web. La ficha JSON se obtiene de los estilos activos.

La versión 2.0 unifica símbolo e interfaz, integra el manual y reorganiza la gestión. No define papelería ni otras aplicaciones impresas de marca.
