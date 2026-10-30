const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");
const raiz = path.join(__dirname, "..");

async function abrir(t) {
  const errores = [];
  const consola = new VirtualConsole();
  consola.on("jsdomError", (error) => errores.push(error));
  const dom = new JSDOM(
    fs.readFileSync(path.join(raiz, "index.html"), "utf8"),
    {
      url: "http://localhost/",
      runScripts: "outside-only",
      pretendToBeVisual: true,
      virtualConsole: consola,
    },
  );
  t.after(() => {
    dom.window.close();
    assert.deepEqual(errores, []);
  });
  await new Promise((resolve) =>
    dom.window.addEventListener("load", resolve, { once: true }),
  );
  const estilos = dom.window.document.createElement("style");
  estilos.textContent = fs.readFileSync(
    path.join(raiz, "css/estilo.css"),
    "utf8",
  );
  dom.window.document.head.appendChild(estilos);
  dom.window.fetch = async (ruta) => ({
    ok: true,
    json: async () =>
      JSON.parse(fs.readFileSync(path.join(raiz, ruta), "utf8")),
  });
  for (const nombre of ["componentes", "pedidos", "vistas"])
    dom.window.eval(
      fs.readFileSync(path.join(raiz, `js/${nombre}.js`), "utf8"),
    );
  const app = new dom.window.Alfredo.iu.AplicacionIU();
  await app.iniciar();
  return {
    app,
    w: dom.window,
    d: dom.window.document,
    iu: dom.window.Alfredo.iu,
  };
}

test("abre el resumen y todas las rutas, con manual integrado y componentes separados", async (t) => {
  const { app, d } = await abrir(t);
  assert.equal(d.querySelector("h1").textContent, "Resumen");
  assert.equal(d.querySelectorAll(".stats-grid .stat-card").length, 4);
  assert.equal(d.querySelectorAll(".chart").length, 1);
  for (const [ruta, titulo] of [
    ["clientes", "Clientes"],
    ["productos", "Productos"],
    ["pedidos", "Pedidos"],
    ["identidad", "Manual de identidad"],
    ["configuracion", "Configuración"],
  ]) {
    app.cambiarModulo(ruta);
    assert.equal(d.querySelector("h1").textContent, titulo);
    assert.equal(
      d.querySelector('#navegacion [aria-current="page"]').dataset.id,
      ruta,
    );
  }
  app.cambiarModulo("componentes");
  assert.equal(d.querySelectorAll("#entidades article").length, 4);
  assert.equal(d.querySelector("#entidades").hidden, false);
  app.mostrarVista("Toasts");
  assert.ok(d.querySelector("[data-t]"));
  app.cambiarModulo("clientes");
  assert.equal(d.querySelector("#entidades").hidden, true);
});

test("crea, edita, busca y exporta clientes mediante los controles reales del DOM", async (t) => {
  const { app, d, w, iu } = await abrir(t);
  app.cambiarModulo("clientes");
  d.querySelector("#nuevo").click();
  assert.equal(d.querySelector("#juDrawer").inert, false);
  assert.equal(d.querySelector(".workspace").inert, true);
  let form = d.querySelector("#juDrawerForm");
  form.elements.nombre.value = "Mónica";
  form.elements.email.value = "monica@example.com";
  form.elements.empresa.value = "Estudio Sur";
  form.dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  assert.equal(app.estado.modulo.registros.length, 3);
  assert.equal(d.querySelector("#juDrawer").inert, true);
  const busqueda = d.querySelector("#buscador");
  busqueda.value = "monica";
  busqueda.dispatchEvent(new w.Event("input", { bubbles: true }));
  assert.equal(d.querySelectorAll("tbody tr").length, 1);
  d.querySelector("tbody button").click();
  form = d.querySelector("#juDrawerForm");
  form.elements.nombre.value = "Mónica López";
  form.dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  assert.ok(d.querySelector("tbody").textContent.includes("Mónica López"));
  let descarga;
  iu.Descargas.guardar = (nombre, contenido) => {
    descarga = { nombre, contenido };
  };
  d.querySelector("#exportarCSV").click();
  assert.equal(descarga.nombre, "alfredo-clientes.csv");
  assert.ok(descarga.contenido.includes("Mónica López"));
  assert.ok(!descarga.contenido.includes("Laura"));
  busqueda.value = "sin coincidencias";
  busqueda.dispatchEvent(new w.Event("input"));
  assert.ok(
    d
      .querySelector(".empty-state")
      .textContent.includes("No encontramos resultados"),
  );
  d.querySelector("#accionVacio").click();
  assert.equal(d.querySelectorAll("tbody tr").length, 3);
});

test("pagina, ordena y filtra sin perder filas y exporta todas las coincidencias", async (t) => {
  const { app, d, w, iu } = await abrir(t);
  const clientes = app.estado.modulos.clientes;
  for (let i = 0; i < 24; i++)
    clientes.guardarRegistro({
      nombre: `Contacto ${i}`,
      email: `c${i}@example.com`,
      empresa: "QA",
    });
  app.cambiarModulo("clientes");
  assert.equal(d.querySelectorAll("tbody tr").length, 10);
  d.querySelector("#siguientePagina").click();
  assert.equal(d.querySelectorAll("tbody tr").length, 10);
  d.querySelector("#siguientePagina").click();
  assert.equal(d.querySelectorAll("tbody tr").length, 6);
  const filtro = d.querySelector("#filtroTabla");
  filtro.value = "QA";
  filtro.dispatchEvent(new w.Event("change"));
  assert.equal(app.tablas.clientes.pagina, 1);
  let contenido;
  iu.Descargas.guardar = (_, csv) => {
    contenido = csv;
  };
  d.querySelector("#exportarCSV").click();
  assert.equal(contenido.split("\r\n").length, 25);
  d.querySelector('[data-sort="nombre"]').click();
  assert.equal(
    d.querySelector('[aria-sort="ascending"] button').dataset.sort,
    "nombre",
  );
  assert.ok(d.querySelector("tbody").textContent.includes("Contacto 0"));
});

test("confirma un pedido desde el formulario, actualiza reservas y los datos de las gráficas", async (t) => {
  const { app, d, w } = await abrir(t);
  app.cambiarModulo("pedidos");
  d.querySelector("#nuevo").click();
  const form = d.querySelector("#juPedidoForm");
  form.elements.cliente_id.value = "1";
  form.elements.estado.value = "confirmado";
  form.elements.fecha.value = "2026-10-28";
  d.querySelector(".ju-order-line select").value = "1";
  d.querySelector(".ju-order-line input").value = "2";
  form.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert.ok(
    d
      .querySelector("#juPedidoTotal")
      .textContent.replaceAll(".", "")
      .includes("1499,98"),
  );
  form.dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  assert.equal(app.estado.modulos.pedidos.reservado(1), 2);
  app.mesResumen = "2026-10";
  app.cambiarModulo("resumen");
  assert.ok(
    d
      .querySelector(".chart-data tbody")
      .textContent.replaceAll(".", "")
      .includes("1499,98"),
  );
  assert.ok(d.querySelector(".legend").textContent.includes("Confirmados1"));
});

test("guarda preferencias, exporta identidad y Escape cierra solo el diálogo superior", async (t) => {
  const { app, d, w, iu } = await abrir(t);
  app.cambiarModulo("configuracion");
  const compactas = d.querySelector("#tablasCompactas");
  compactas.click();
  assert.equal(d.body.classList.contains("compact-tables"), true);
  assert.equal(
    JSON.parse(w.localStorage.getItem("Alfredo.iu.preferencias.v1")).compacta,
    true,
  );
  app.cambiarModulo("identidad");
  let archivo;
  iu.Descargas.guardar = (_, contenido) => {
    archivo = JSON.parse(contenido);
  };
  d.querySelector("#descargarIdentidad").click();
  assert.equal(archivo.marca, "Alfredo");
  assert.equal(
    archivo.colores.find((c) => c.token === "--color").valor,
    "#6842a6",
  );
  assert.equal(d.querySelectorAll(".swatch").length, 6);
  app.cambiarModulo("clientes");
  d.querySelector("#nuevo").click();
  app.modal.abrir("Prueba", '<button type="button">Cerrar</button>');
  d.dispatchEvent(
    new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal(d.querySelector("#juModal").inert, true);
  assert.equal(d.querySelector("#juDrawer").inert, false);
  d.dispatchEvent(
    new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal(d.querySelector("#juDrawer").inert, true);
  assert.equal(d.querySelector(".workspace").inert, false);
});
