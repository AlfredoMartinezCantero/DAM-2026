const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const contexto = {
  window: { Alfredo: { iu: { Utilidades: { escapar: String } } } },
};
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "../js/vistas.js"), "utf8"),
  contexto,
);
const { Analitica, Descargas } = contexto.window.Alfredo.iu;
const plano = (dato) => JSON.parse(JSON.stringify(dato));

test("la gráfica cruza de año, agrega en céntimos y excluye pendientes y cancelados", () => {
  const meses = Analitica.meses(
    [
      { fecha: "2025-12-15", estado: "confirmado", total: 0.1 },
      { fecha: "2025-12-31", estado: "confirmado", total: 0.2 },
      { fecha: "2026-01-10", estado: "confirmado", total: 89.5 },
      { fecha: "2026-01-11", estado: "pendiente", total: 1000 },
      { fecha: "2026-01-12", estado: "cancelado", total: 500 },
      { fecha: "2026-03-01", estado: "confirmado", total: 50 },
    ],
    "2026-02",
  );
  assert.deepEqual(plano(meses.map((m) => m.clave)), [
    "2025-09",
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
  ]);
  assert.equal(meses[3].total, 0.3);
  assert.equal(meses[3].pedidos, 2);
  assert.equal(meses[4].total, 89.5);
  assert.equal(meses[5].total, 0);
});

test("la gráfica sin pedidos ofrece seis meses con importes cero", () => {
  const meses = Analitica.meses([], "2026-10");
  assert.equal(meses.length, 6);
  assert.ok(meses.every((m) => m.total === 0 && m.pedidos === 0));
});

test("la búsqueda ignora tildes, espacios exteriores y mayúsculas y se combina con filtros", () => {
  const datos = [
    { id: 1, nombre: "Mónica", empresa: "Álamo" },
    { id: 2, nombre: "MONICA", empresa: "Sur" },
  ];
  assert.equal(Analitica.filtrar(datos, " monica ", "empresa", "").length, 2);
  assert.equal(Analitica.filtrar(datos, "monica", "empresa", "Álamo")[0].id, 1);
  assert.equal(Analitica.filtrar(datos, "alamo", "empresa", "Sur").length, 0);
});

test("ordena números y texto sin modificar los registros originales", () => {
  const datos = [
    { id: 10, nombre: "Artículo 10", stock_disponible: 2 },
    { id: 2, nombre: "Artículo 2", stock_disponible: 12 },
  ];
  assert.deepEqual(
    plano(Analitica.ordenar(datos, "id", 1).map((r) => r.id)),
    [2, 10],
  );
  assert.equal(Analitica.ordenar(datos, "nombre", 1)[0].id, 2);
  assert.equal(Analitica.ordenar(datos, "stock_disponible", -1)[0].id, 2);
  assert.equal(datos[0].id, 10);
});

test("el CSV conserva comillas, saltos, separadores y protege las fórmulas", () => {
  const csv = Descargas.csv(
    [
      { campo: "nombre", etiqueta: "Nombre" },
      { campo: "nota", etiqueta: "Nota" },
    ],
    [
      { nombre: 'Ana; "Sur"', nota: "Línea 1\nLínea 2" },
      { nombre: "=1+1", nota: " +SUM(A1:A2)" },
      { nombre: "@SUM(A1)", nota: "+34 612 345 678" },
    ],
  );
  assert.ok(csv.startsWith('\uFEFF"Nombre";"Nota"\r\n'));
  assert.ok(csv.includes('"Ana; ""Sur""";"Línea 1\nLínea 2"'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"\' +SUM(A1:A2)"'));
  assert.ok(csv.includes('"\'@SUM(A1)"'));
});
