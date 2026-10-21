const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const raiz = path.join(__dirname, "..");
const leer = nombre => JSON.parse(fs.readFileSync(path.join(raiz, "data", `${nombre}.json`), "utf8"));

function entorno(almacen = new Map()) {
  const localStorage = {
    getItem: clave => almacen.get(clave) ?? null,
    setItem: (clave, valor) => almacen.set(clave, valor)
  };
  const contexto = { window: { localStorage }, URL, document: { addEventListener() {} } };
  for (const archivo of ["componentes.js", "pedidos.js"]) {
    vm.runInNewContext(fs.readFileSync(path.join(raiz, "js", archivo), "utf8"), contexto);
  }
  const { ModuloDatos, ModuloPedidos } = contexto.window.Alfredo.iu;
  const clientes = new ModuloDatos("clientes", leer("clientes"));
  const productos = new ModuloDatos("productos", leer("productos"));
  const pedidos = new ModuloPedidos(leer("pedidos"), clientes, productos);
  return { clientes, productos, pedidos, almacen, localStorage };
}

const valores = (cambios = {}) => ({
  cliente_id: 1, fecha: "2026-10-21", estado: "pendiente", notas: "",
  lineas: [{ producto_id: 1, cantidad: 2 }], ...cambios
});

test("crear un pedido calcula su total y el pendiente no reserva existencias", () => {
  const { pedidos, almacen } = entorno();
  const pedido = pedidos.guardarRegistro(valores());
  assert.equal(pedido.id, 1);
  assert.equal(pedido.cliente, "Laura Martínez García");
  assert.equal(pedido.lineas[0].precio_centimos, 74999);
  assert.equal(pedido.total, 1499.98);
  assert.equal(pedidos.reservado(1), 0);
  assert.equal(pedidos.disponible(1), 12);
  assert.equal(JSON.parse(almacen.get(pedidos.clave))[0].total, 1499.98);
});

test("confirmar reserva, editar sustituye la reserva y cancelar la libera", () => {
  const { pedidos } = entorno();
  const pedido = pedidos.guardarRegistro(valores({ estado: "confirmado" }));
  assert.equal(pedidos.reservado(1), 2);
  assert.equal(pedidos.disponible(1), 10);
  pedidos.guardarRegistro(valores({ estado: "confirmado", lineas: [{ producto_id: 1, cantidad: 12 }] }), pedido.id);
  assert.equal(pedidos.reservado(1), 12);
  assert.equal(pedidos.disponible(1), 0);
  pedidos.guardarRegistro(valores({ estado: "cancelado", lineas: [{ producto_id: 1, cantidad: 12 }] }), pedido.id);
  assert.equal(pedidos.disponible(1), 12);
});

test("dos pedidos pendientes compiten por el stock al confirmarse", () => {
  const { pedidos } = entorno();
  const entrada = valores({ lineas: [{ producto_id: 1, cantidad: 8 }] });
  const primero = pedidos.guardarRegistro(entrada);
  const segundo = pedidos.guardarRegistro(entrada);
  pedidos.guardarRegistro({ ...entrada, estado: "confirmado" }, primero.id);
  assert.throws(() => pedidos.guardarRegistro({ ...entrada, estado: "confirmado" }, segundo.id), /Stock insuficiente/);
  assert.equal(pedidos.registros[1].estado, "pendiente");
  assert.equal(pedidos.reservado(1), 8);
});

test("cambiar de producto o pasar a pendiente libera la reserva anterior", () => {
  const { pedidos } = entorno();
  const pedido = pedidos.guardarRegistro(valores({ estado: "confirmado" }));
  pedidos.guardarRegistro(valores({ estado: "confirmado", lineas: [{ producto_id: 2, cantidad: 3 }] }), pedido.id);
  assert.equal(pedidos.reservado(1), 0);
  assert.equal(pedidos.reservado(2), 3);
  pedidos.guardarRegistro(valores({ estado: "pendiente", lineas: [{ producto_id: 2, cantidad: 3 }] }), pedido.id);
  assert.equal(pedidos.reservado(2), 0);
});

test("eliminar un pedido confirmado libera stock y la recarga conserva el borrado", () => {
  const { pedidos, almacen } = entorno();
  const pedido = pedidos.guardarRegistro(valores({ estado: "confirmado" }));
  pedidos.eliminar(pedido.id);
  const recarga = entorno(almacen);
  assert.equal(recarga.pedidos.registros.length, 0);
  assert.equal(recarga.pedidos.disponible(1), 12);
});

test("guardar, recargar y editar mantiene precios históricos", () => {
  const { pedidos, productos, almacen } = entorno();
  const pedido = pedidos.guardarRegistro(valores({ estado: "confirmado" }));
  productos.guardarRegistro({ precio: 999.99, nombre: "Nombre actualizado" }, 1);
  const recarga = entorno(almacen);
  assert.equal(recarga.pedidos.disponible(1), 10);
  const editado = recarga.pedidos.guardarRegistro(valores({ estado: "confirmado" }), pedido.id);
  assert.equal(editado.total, 1499.98);
  assert.equal(editado.lineas[0].nombre, "Portátil ProBook 15");
  const nuevo = recarga.pedidos.guardarRegistro(valores());
  assert.equal(nuevo.total, 1999.98);
});

test("los importes se suman en céntimos", () => {
  const { pedidos, productos } = entorno();
  productos.guardarRegistro({ precio: 0.10 }, 1);
  productos.guardarRegistro({ precio: 0.20 }, 2);
  const pedido = pedidos.guardarRegistro(valores({ lineas: [{ producto_id: 1, cantidad: 1 }, { producto_id: 2, cantidad: 1 }] }));
  assert.equal(pedido.total, 0.30);
});

test("rechaza referencias inexistentes, cantidades inválidas y productos repetidos", () => {
  const { pedidos, almacen } = entorno();
  for (const entrada of [
    valores({ cliente_id: 99 }), valores({ lineas: [] }),
    valores({ lineas: [{ producto_id: 99, cantidad: 1 }] }),
    ...[0, -1, 1.5, NaN].map(cantidad => valores({ lineas: [{ producto_id: 1, cantidad }] })),
    valores({ lineas: [{ producto_id: 1, cantidad: 8 }, { producto_id: 1, cantidad: 8 }] }),
    valores({ estado: "otro" }), valores({ fecha: "2026-02-30" })
  ]) assert.throws(() => pedidos.guardarRegistro(entrada));
  assert.equal(pedidos.registros.length, 0);
  assert.equal(almacen.size, 0);
});

test("rechaza productos fuera de venta y cantidades superiores al stock", () => {
  const { pedidos } = entorno();
  assert.throws(() => pedidos.guardarRegistro(valores({ lineas: [{ producto_id: 5, cantidad: 1 }] })), /no está disponible/);
  assert.throws(() => pedidos.guardarRegistro(valores({ lineas: [{ producto_id: 1, cantidad: 13 }] })), /Stock insuficiente/);
  assert.equal(pedidos.registros.length, 0);
});

test("se puede cancelar un pedido cuyo producto dejó de estar en venta", () => {
  const { pedidos, productos } = entorno();
  const pedido = pedidos.guardarRegistro(valores({ estado: "confirmado" }));
  productos.guardarRegistro({ disponible: false }, 1);
  pedidos.guardarRegistro(valores({ estado: "confirmado" }), pedido.id);
  pedidos.guardarRegistro(valores({ estado: "cancelado" }), pedido.id);
  assert.equal(pedidos.reservado(1), 0);
});

test("protege clientes y productos con pedidos y permite borrarlos al retirar esos pedidos", () => {
  const { pedidos, clientes, productos } = entorno();
  const pedido = pedidos.guardarRegistro(valores());
  assert.throws(() => clientes.eliminar(1), /cliente con pedidos/);
  assert.throws(() => productos.eliminar(1), /producto con pedidos/);
  assert.equal(clientes.registros.length, 2);
  assert.equal(productos.registros.length, 5);
  pedidos.eliminar(pedido.id);
  clientes.eliminar(1);
  productos.eliminar(1);
  assert.equal(clientes.registros.length, 1);
  assert.equal(productos.registros.length, 4);
});

test("el stock total no puede bajar por debajo de la reserva confirmada", () => {
  const { pedidos, productos } = entorno();
  pedidos.guardarRegistro(valores({ estado: "confirmado" }));
  assert.throws(() => productos.guardarRegistro({ stock: 1 }, 1), /unidades reservadas/);
  assert.equal(productos.registros[0].stock, 12);
  productos.guardarRegistro({ stock: 2 }, 1);
  assert.equal(pedidos.disponible(1), 0);
});

test("un fallo al confirmar o borrar no altera pedidos ni reservas", () => {
  const { pedidos, almacen, localStorage } = entorno();
  const pendiente = pedidos.guardarRegistro(valores());
  const copia = almacen.get(pedidos.clave);
  localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  assert.throws(() => pedidos.guardarRegistro(valores({ estado: "confirmado" }), pendiente.id), /No se han guardado/);
  assert.equal(pedidos.registros[0].estado, "pendiente");
  assert.equal(pedidos.reservado(1), 0);
  assert.throws(() => pedidos.eliminar(pendiente.id), /No se han guardado/);
  assert.equal(almacen.get(pedidos.clave), copia);
});
