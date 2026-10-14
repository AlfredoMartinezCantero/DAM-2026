document.querySelector("#imprimir").onclick = () => window.print();

async function cargarInforme() {
  const estado = document.querySelector("#estado");
  try {
    const respuesta = await fetch("reporting.php");
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || "Error al cargar el informe");
    // La configuración es opcional para que el informe pueda mostrarse igualmente.
    try {
      const configuracion = await fetch("../data/config.php").then(r => r.json());
      document.querySelector("#empresa").textContent = configuracion.nombre + " · Reporting";
    } catch (_) {}
    document.querySelector("#fecha").textContent = "Generado: " + new Intl.DateTimeFormat("es-ES", {
      dateStyle: "long", timeStyle: "short"
    }).format(new Date());
    const graficas = document.querySelector("#graficas");
    const valores = datos.tablas.map(entidad => entidad.registros.length);
    const etiquetas = datos.tablas.map(entidad => entidad.nombre);
    graficas.replaceChildren();
    if (datos.tablas.length) {
      const titulo = document.createElement("h2");
      titulo.textContent = "Registros por tabla";
      graficas.appendChild(titulo);
      let paleta;
      for (const [tipo, nombre] of [["barras", "Barras"], ["tarta", "Tarta"], ["anillo", "Anillo"]]) {
        const figura = document.createElement("figure");
        const leyenda = document.createElement("figcaption");
        leyenda.textContent = nombre;
        const lienzo = document.createElement("div");
        lienzo.className = "contenedor " + tipo;
        lienzo.setAttribute("data", JSON.stringify(valores));
        lienzo.setAttribute("data-etiquetas", JSON.stringify(etiquetas));
        figura.append(leyenda, lienzo);
        graficas.appendChild(figura);
        const grafica = new GraficaSVG(lienzo);
        grafica.dibujar();
        paleta = grafica.colores;
      }
      const leyenda = document.createElement("ul");
      leyenda.className = "leyenda-graficas";
      etiquetas.forEach((nombre, indice) => {
        const entrada = document.createElement("li");
        const muestra = document.createElement("span");
        muestra.style.backgroundColor = paleta[indice % paleta.length];
        entrada.append(muestra, document.createTextNode(`${nombre}: ${valores[indice]}`));
        leyenda.appendChild(entrada);
      });
      graficas.appendChild(leyenda);
    }
    const contenedor = document.querySelector("#tablas");
    let total = 0;
    datos.tablas.forEach(entidad => {
      const seccion = document.createElement("section");
      seccion.className = "entidad";
      const titulo = document.createElement("h2");
      titulo.textContent = entidad.nombre;
      const recuento = document.createElement("p");
      recuento.className = "recuento";
      recuento.textContent = `${entidad.registros.length} registros · ${entidad.columnas.length} columnas`;
      seccion.append(titulo, recuento);
      // Reutilizamos la tabla dinámica sin acciones de edición en el informe.
      const tabla = new Tabla(seccion, entidad.columnas);
      const leyenda = tabla.tabla.createCaption();
      leyenda.textContent = entidad.nombre;
      leyenda.hidden = true;
      tabla.tabla.setAttribute("aria-label", entidad.nombre);
      tabla.actualizar(entidad.registros);
      contenedor.appendChild(seccion);
      total += entidad.registros.length;
    });
    estado.textContent = datos.tablas.length
      ? `${datos.tablas.length} tablas · ${total} registros en total`
      : "La base de datos no contiene tablas.";
    document.querySelector("#imprimir").disabled = false;
  } catch (error) {
    estado.textContent = error.message;
  }
}

cargarInforme();
