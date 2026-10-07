async function solicitar(ruta, opciones) {
  const respuesta = await fetch(ruta, opciones);
  const datos = await respuesta.json();
  if (!respuesta.ok || datos.ok === false) {
    throw new Error(datos.error || "No se ha podido completar la petición");
  }
  return datos;
}

function api(ruta, tabla) {
  return "api/superapi.php?ruta=" + ruta + "&tabla=" + encodeURIComponent(tabla);
}

async function modificar(ruta, tabla, id, datos = {}) {
  return solicitar(api(ruta, tabla), {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({tabla, id, datos})
  });
}

let cargaActual = 0;

async function cargarEntidad(nombre) {
  const carga = ++cargaActual;
  const seccion = document.querySelector("section");
  seccion.textContent = "Cargando…";
  try {
    const datos = await solicitar(api("tabla", nombre));
    if (carga !== cargaActual) return;
    seccion.replaceChildren();
    const titulo = document.createElement("h2");
    titulo.textContent = nombre;
    seccion.appendChild(titulo);
    const vigente = () => carga === cargaActual;
    const refrescar = async () => {
      const nuevosDatos = await solicitar(api("tabla", nombre));
      if (vigente()) tabla.actualizar(nuevosDatos.registros);
    };
    const formulario = new Formulario(seccion, datos.columnas, async (valores, registro) => {
      await modificar(registro === null ? "crear" : "actualizar", nombre,
        registro === null ? null : registro[datos.clavePrimaria], valores);
      await refrescar();
    });
    const tabla = new Tabla(seccion, datos.columnas,
      registro => formulario.editar(registro),
      async registro => {
        if (!confirm("¿Eliminar este registro?")) return;
        try {
          await modificar("eliminar", nombre, registro[datos.clavePrimaria]);
          await refrescar();
          if (formulario.registro === registro) formulario.nuevo();
        } catch (error) {
          alert(error.message);
        }
      });
    tabla.actualizar(datos.registros);
  } catch (error) {
    if (carga === cargaActual) seccion.textContent = error.message;
  }
}

async function iniciar() {
  try {
    const [configuracion, modulos, entidades] = await Promise.all([
      solicitar("data/config.php"),
      solicitar(api("modulos", "")),
      solicitar(api("entidades", ""))
    ]);
    document.querySelector("h1").textContent = configuracion.nombre;
    document.documentElement.style.setProperty("--color_corporativo", configuracion.color);
    modulos.forEach(nombre => {
      const enlace = document.createElement("a");
      enlace.href = "#";
      enlace.textContent = nombre;
      enlace.onclick = evento => evento.preventDefault();
      document.querySelector("#modulos").appendChild(enlace);
    });
    entidades.forEach(nombre => {
      const enlace = document.createElement("a");
      enlace.href = "#";
      enlace.textContent = nombre;
      enlace.onclick = evento => {
        evento.preventDefault();
        document.querySelectorAll("#entidades a").forEach(a => a.classList.remove("activo"));
        enlace.classList.add("activo");
        cargarEntidad(nombre);
      };
      document.querySelector("#entidades").appendChild(enlace);
    });
  } catch (error) {
    document.querySelector("section").textContent = error.message;
  }
}

iniciar();
