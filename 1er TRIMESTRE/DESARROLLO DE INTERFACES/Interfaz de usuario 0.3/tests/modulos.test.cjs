const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const raiz = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(raiz, "js/componentes.js"), "utf8");
const leer = (nombre) =>
  JSON.parse(
    fs.readFileSync(path.join(raiz, "data", `${nombre}.json`), "utf8"),
  );

function entorno(almacen = new Map()) {
  const localStorage = {
    getItem: (clave) => almacen.get(clave) ?? null,
    setItem: (clave, valor) => almacen.set(clave, valor),
  };
  const contexto = {
    window: { localStorage },
    URL,
    document: { addEventListener() {} },
  };
  vm.runInNewContext(script, contexto);
  vm.runInNewContext(
    fs.readFileSync(path.join(raiz, "js/pedidos.js"), "utf8"),
    contexto,
  );
  return {
    ...contexto.window.Alfredo.iu,
    namespace: contexto.window.Alfredo.iu,
    localStorage,
    almacen,
    documento: contexto.document,
  };
}

test("cada módulo carga su esquema y sus registros originales", () => {
  const { ModuloDatos } = entorno();
  const clientes = new ModuloDatos("clientes", leer("clientes"));
  const productos = new ModuloDatos("productos", leer("productos"));
  assert.equal(clientes.registros.length, 2);
  assert.equal(productos.registros.length, 5);
  assert.ok(clientes.campos.some((campo) => campo.nombre === "empresa"));
  clientes.validarRegistros(clientes.registros);
  productos.validarRegistros(productos.registros);
});

test("crear, editar y recargar conserva datos, ID y campos de empresa", () => {
  const { ModuloDatos, almacen } = entorno();
  const clientes = new ModuloDatos("clientes", leer("clientes"));
  const nuevo = clientes.guardarRegistro({
    nombre: "Ana",
    email: "ana@example.com",
    empresa: "Empresa de prueba",
  });
  assert.equal(nuevo.id, 3);
  const editado = clientes.guardarRegistro({ nombre: "Ana María" }, nuevo.id);
  assert.equal(editado.id, 3);
  assert.equal(editado.empresa, "Empresa de prueba");
  const recarga = entorno(almacen);
  const recuperado = new recarga.ModuloDatos("clientes", leer("clientes"));
  assert.equal(recuperado.registros[2].nombre, "Ana María");
  assert.equal(recuperado.registros[2].email, "ana@example.com");
});

test("el teléfono se formatea al crear, editar y recuperar clientes guardados", () => {
  const { ModuloDatos, almacen } = entorno();
  const clientes = new ModuloDatos("clientes", leer("clientes"));
  const nuevo = clientes.guardarRegistro({
    nombre: "Ana",
    email: "ana@example.com",
    telefono: "+34123456789",
  });
  assert.equal(nuevo.telefono, "+34 123 456 789");
  assert.equal(
    JSON.parse(almacen.get(clientes.clave))[2].telefono,
    "+34 123 456 789",
  );
  const editado = clientes.guardarRegistro(
    { telefono: "0034 (612) 345-678" },
    nuevo.id,
  );
  assert.equal(editado.telefono, "+34 612 345 678");
  const anteriores = JSON.parse(almacen.get(clientes.clave));
  anteriores[0].telefono = "+34123456789";
  almacen.set(clientes.clave, JSON.stringify(anteriores));
  const recargado = new ModuloDatos("clientes", leer("clientes"));
  assert.equal(recargado.registros[0].telefono, "+34 123 456 789");
  assert.equal(recargado.registros[2].telefono, "+34 612 345 678");
});

test("el formato telefónico conserva números extranjeros e incompletos y admite el campo vacío", () => {
  const { Utilidades } = entorno();
  for (const [entrada, esperado] of [
    ["612345678", "612 345 678"],
    ["+34 612 345 678", "+34 612 345 678"],
    ["+33 1 23 45 67 89", "+33 1 23 45 67 89"],
    ["+34 612", "+34 612"],
    ["+34 612345678 ext. 12", "+34 612345678 ext. 12"],
    ["", ""],
    ["   ", ""],
  ])
    assert.equal(Utilidades.formatearTelefono(entrada), esperado);
});

test("Clientes y Productos mantienen almacenes independientes", () => {
  const { ModuloDatos, almacen } = entorno();
  const clientes = new ModuloDatos("clientes", leer("clientes"));
  const productos = new ModuloDatos("productos", leer("productos"));
  productos.guardarRegistro({
    nombre: "Ratón",
    categoria: "Periféricos",
    precio: 19.95,
    stock: 0,
    disponible: false,
  });
  clientes.eliminar(1);
  assert.equal(
    new ModuloDatos("clientes", leer("clientes")).registros.length,
    1,
  );
  assert.equal(
    new ModuloDatos("productos", leer("productos")).registros.length,
    6,
  );
  assert.equal(almacen.size, 2);
});

test("eliminar todos los registros conserva la lista vacía al recargar", () => {
  const { ModuloDatos } = entorno();
  const clientes = new ModuloDatos("clientes", leer("clientes"));
  clientes.eliminar(1);
  clientes.eliminar(2);
  assert.equal(
    new ModuloDatos("clientes", leer("clientes")).registros.length,
    0,
  );
  assert.equal(
    clientes.guardarRegistro({ nombre: "Nuevo", email: "nuevo@example.com" })
      .id,
    1,
  );
});

test("valida nombre, email, precio y stock sin guardar entradas inválidas", () => {
  const { ModuloDatos, almacen } = entorno();
  const clientes = new ModuloDatos("clientes", leer("clientes"));
  assert.throws(
    () => clientes.guardarRegistro({ nombre: "  ", email: "ana@example.com" }),
    /Nombre/,
  );
  assert.throws(
    () => clientes.guardarRegistro({ nombre: "Ana", email: "incorrecto" }),
    /email/,
  );
  const productos = new ModuloDatos("productos", leer("productos"));
  const valido = {
    nombre: "Prueba",
    categoria: "Oficina",
    precio: 12.5,
    stock: 0,
  };
  for (const cambios of [
    { precio: -1 },
    { precio: 1.001 },
    { precio: NaN },
    { stock: 1.5 },
    { stock: -1 },
    { categoria: "Otra" },
  ]) {
    assert.throws(() => productos.guardarRegistro({ ...valido, ...cambios }));
  }
  assert.equal(almacen.size, 0);
  assert.equal(productos.guardarRegistro(valido).precio, 12.5);
});

test("los ID automáticos son únicos y no se pueden editar desde los valores", () => {
  const { ModuloDatos } = entorno();
  const clientes = new ModuloDatos("clientes", leer("clientes"));
  assert.equal(
    clientes.guardarRegistro({ id: 1, nombre: "Eva", email: "eva@example.com" })
      .id,
    3,
  );
  assert.equal(
    clientes.guardarRegistro({ id: 2, nombre: "Laura nueva" }, 1).id,
    1,
  );
  assert.throws(
    () => clientes.guardarRegistro({ nombre: "No existe" }, 99),
    /no existe/,
  );
  assert.throws(() => clientes.eliminar(99), /no existe/);
});

test("un fallo de almacenamiento no cambia ni la tabla ni los datos guardados", () => {
  const { ModuloDatos, localStorage, almacen } = entorno();
  const clientes = new ModuloDatos("clientes", leer("clientes"));
  clientes.guardarRegistro({ nombre: "Ana", email: "ana@example.com" });
  const antes = JSON.stringify(clientes.registros);
  const guardado = almacen.get(clientes.clave);
  localStorage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  assert.throws(
    () => clientes.guardarRegistro({ nombre: "Cambio" }, 1),
    /No se han guardado/,
  );
  assert.throws(() => clientes.eliminar(1), /No se han guardado/);
  assert.equal(JSON.stringify(clientes.registros), antes);
  assert.equal(almacen.get(clientes.clave), guardado);
});

test("los datos guardados corruptos generan aviso y conservan la copia", () => {
  for (const copia of [
    "{",
    "null",
    '[{"id":1}]',
    JSON.stringify([
      leer("clientes").registros[0],
      leer("clientes").registros[0],
    ]),
  ]) {
    const { ModuloDatos, almacen } = entorno(
      new Map([["Alfredo.iu.clientes.v1", copia]]),
    );
    const clientes = new ModuloDatos("clientes", leer("clientes"));
    assert.equal(clientes.registros.length, 2);
    assert.ok(clientes.aviso);
    assert.equal(almacen.get(clientes.clave), copia);
  }
});

test("el formulario admite decimales, muestra IDs de solo lectura y escapa texto", () => {
  const { DrawerIU } = entorno();
  const campoHTML = DrawerIU.prototype.campoHTML;
  const precio = leer("productos").campos.find(
    (campo) => campo.nombre === "precio",
  );
  assert.match(campoHTML(precio, null), /step="0.01"/);
  assert.match(campoHTML(precio, null), /min="0"/);
  assert.match(campoHTML(precio, null), /required/);
  assert.match(campoHTML({ nombre: "id" }, { id: 3 }), /readonly/);
  const nombre = campoHTML(
    { nombre: "nombre", etiqueta: "Nombre" },
    { nombre: '<img src=x onerror="alert(1)">' },
  );
  assert.ok(!nombre.includes("<img"));
  assert.match(nombre, /&lt;img/);
});

test("la navegación conecta Clientes, Productos y Pedidos y desactiva acciones en Configuración", () => {
  const { AplicacionIU, ModuloDatos, ModuloPedidos, documento, namespace } =
    entorno();
  const controles = {
    "#buscador": {
      value: "Laura",
      setAttribute() {},
      closest() {
        return {};
      },
    },
    "#nuevo": {},
    "#nombreModulo": {},
    "#menuMovil": { setAttribute() {} },
    "#escenario": {},
  };
  documento.body = { classList: { remove() {} } };
  documento.querySelector = (selector) => controles[selector];
  const app = new AplicacionIU();
  app.estado.menu = leer("menu");
  app.estado.modulos = {
    clientes: new ModuloDatos("clientes", leer("clientes")),
    productos: new ModuloDatos("productos", leer("productos")),
  };
  app.estado.modulos.pedidos = new ModuloPedidos(
    leer("pedidos"),
    app.estado.modulos.clientes,
    app.estado.modulos.productos,
  );
  let vista;
  app.drawer = app.modal = { cerrar() {} };
  app.renderMenu = app.renderEntidades = () => {};
  app.mostrarTabla = () => {
    vista = app.estado.modulo.id;
  };
  app.mostrarInformacion = () => {
    vista = "informacion";
  };
  // La ruta inicial ahora es el resumen del espacio.
  namespace.PanelIU = class {
    render() {
      vista = "resumen";
    }
  };
  app.cambiarModulo("productos");
  assert.equal(vista, "productos");
  assert.equal(controles["#nuevo"].textContent, "+ Nuevo producto");
  assert.equal(controles["#buscador"].value, "");
  assert.equal(controles["#buscador"].disabled, false);
  app.cambiarModulo("pedidos");
  assert.equal(vista, "pedidos");
  assert.equal(controles["#nuevo"].textContent, "+ Nuevo pedido");
  assert.equal(controles["#nuevo"].disabled, false);
  assert.equal(controles["#buscador"].disabled, false);
  app.cambiarModulo("configuracion");
  assert.equal(app.estado.modulo, null);
  assert.equal(vista, "informacion");
  assert.equal(controles["#nuevo"].disabled, true);
  assert.equal(controles["#buscador"].disabled, true);
  app.cambiarModulo("clientes");
  assert.equal(vista, "clientes");
  assert.equal(controles["#nuevo"].disabled, false);
  assert.equal(app.estado.modulo.registros[0].nombre, "Laura");
  assert.equal(controles["#nuevo"].hidden, false);
  app.cambiarModulo("desconocido");
  assert.equal(vista, "resumen");
  assert.equal(controles["#nuevo"].hidden, true);
});

test("cancelar el borrado conserva el registro y confirmar lo elimina del módulo elegido", () => {
  const { AplicacionIU, ModuloDatos, documento } = entorno();
  const eventos = {};
  documento.querySelector = (selector) => ({
    addEventListener: (evento, callback) => {
      eventos[selector] = callback;
    },
    focus() {},
  });
  const app = new AplicacionIU();
  const clientes = new ModuloDatos("clientes", leer("clientes"));
  const productos = new ModuloDatos("productos", leer("productos"));
  let cierre = 0;
  app.modal = {
    abrir() {},
    cerrar() {
      cierre++;
    },
  };
  app.drawer = { cerrar() {} };
  app.toast = { mostrar() {} };
  app.mostrarListado = () => {};
  app.confirmarEliminar(clientes.registros[0], clientes);
  assert.equal(clientes.registros.length, 2);
  eventos["#juDeleteCancel"]();
  assert.equal(clientes.registros.length, 2);
  assert.equal(cierre, 1);
  app.confirmarEliminar(productos.registros[0], productos);
  eventos["#juDeleteConfirm"]();
  assert.equal(productos.registros.length, 4);
  assert.equal(clientes.registros.length, 2);
  assert.equal(cierre, 2);
});
