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
