const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const raiz = path.join(__dirname, "..");
const clave = "Alfredo.iu.chat.posicion.v1";
const clavePanel = "Alfredo.iu.chat.panel.v1";

async function abrir(t, guardada = null, guardadaPanel = null) {
  const dom = new JSDOM(fs.readFileSync(path.join(raiz, "index.html"), "utf8"), {
    url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document;
  await new Promise((resolve) => w.addEventListener("load", resolve, { once: true }));
  w.innerWidth = 1000;
  w.innerHeight = 800;
  if (guardada !== null) w.localStorage.setItem(clave, guardada);
  if (guardadaPanel !== null) w.localStorage.setItem(clavePanel, guardadaPanel);
  const boton = d.querySelector("#chatAbrir"), panel = d.querySelector("#chatPanel");
  const cabecera = d.querySelector(".ju-chat-header");
  const rectangulo = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  boton.getBoundingClientRect = () => boton.classList.contains("is-docked")
    ? rectangulo(panel.getBoundingClientRect().right - 188, panel.getBoundingClientRect().top + 18, 140, 40)
    : rectangulo(
    boton.style.left ? parseFloat(boton.style.left) : w.innerWidth - 164,
    boton.style.top ? parseFloat(boton.style.top) : w.innerHeight - 64,
    140, 40,
  );
  panel.getBoundingClientRect = () => rectangulo(
    parseFloat(panel.style.left) || 0, parseFloat(panel.style.top) || 0,
    Math.min(440, w.innerWidth - 32),
    w.innerHeight <= 550 ? w.innerHeight - 16 : Math.min(660, w.innerHeight - 96),
  );
  cabecera.getBoundingClientRect = () => {
    const rect = panel.getBoundingClientRect();
    return rectangulo(rect.left, rect.top, rect.width, 80);
  };
  const capturas = new Set();
  for (const asa of [boton, cabecera]) {
    asa.setPointerCapture = (id) => capturas.add(id);
    asa.hasPointerCapture = (id) => capturas.has(id);
    asa.releasePointerCapture = (id) => capturas.delete(id);
  }
  w.Alfredo = { iu: {} };
  w.eval(fs.readFileSync(path.join(raiz, "js/chat.js"), "utf8"));
  const chat = new w.Alfredo.iu.ChatIU();
  const puntero = (tipo, x, y, extra = {}) => {
    const { objetivo = boton, ...propiedades } = extra;
    const evento = new w.Event(tipo, { bubbles: true, cancelable: true });
    Object.assign(evento, { pointerId: 1, clientX: x, clientY: y, button: 0, isPrimary: true, pointerType: "mouse", ...propiedades });
    (tipo === "pointerdown" || tipo === "lostpointercapture" ? objetivo : w).dispatchEvent(evento);
  };
  const clic = () => boton.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
  return { w, d, chat, boton, panel, cabecera, puntero, clic, capturas };
}

test("arrastrar mueve el botón y el clic final no abre el chat; un clic normal sí lo abre", async (t) => {
  const { boton, panel, puntero, clic, capturas } = await abrir(t);
  puntero("pointerdown", 900, 750);
  assert.ok(capturas.has(1));
  puntero("pointermove", 300, 150);
  puntero("pointerup", 300, 150);
  assert.equal(boton.style.left, "236px");
  assert.equal(boton.style.top, "136px");
  assert.equal(capturas.size, 0);
  assert.equal(boton.classList.contains("is-dragging"), false);
  clic();
  assert.equal(panel.hidden, true);
  puntero("pointerdown", 300, 150);
  puntero("pointermove", 302, 152);
  puntero("pointerup", 302, 152);
  clic();
  assert.equal(panel.hidden, false);
});

test("el arrastre táctil se limita a la pantalla y conserva la posición al recargar y redimensionar", async (t) => {
  const primero = await abrir(t);
  primero.puntero("pointerdown", 900, 750, { pointerType: "touch" });
  primero.puntero("pointermove", 5000, 5000, { pointerType: "touch" });
  primero.puntero("pointerup", 5000, 5000, { pointerType: "touch" });
  assert.equal(primero.boton.style.left, "852px");
  assert.equal(primero.boton.style.top, "752px");
  const segundo = await abrir(t, primero.w.localStorage.getItem(clave));
  assert.equal(segundo.boton.style.left, "852px");
  segundo.w.innerWidth = 320;
  segundo.w.innerHeight = 480;
  segundo.w.dispatchEvent(new segundo.w.Event("resize"));
  const rect = segundo.boton.getBoundingClientRect();
  assert.ok(rect.left >= 8 && rect.right <= 312);
  assert.ok(rect.top >= 8 && rect.bottom <= 472);
  segundo.boton.click();
  const panel = segundo.panel.getBoundingClientRect();
  assert.ok(panel.left >= 8 && panel.right <= 312);
  assert.ok(panel.top >= 8 && panel.bottom <= 472);
});

test("cancelar el gesto recupera la posición y no guarda una preferencia parcial", async (t) => {
  const { w, boton, puntero, clic, panel } = await abrir(t);
  puntero("pointerdown", 900, 750);
  puntero("pointermove", 300, 150);
  puntero("pointercancel", 300, 150);
  assert.equal(boton.style.left, "");
  assert.equal(boton.style.top, "");
  assert.equal(w.localStorage.getItem(clave), null);
  clic();
  assert.equal(panel.hidden, true);
});

test("flechas ajustan la posición, Mayús aumenta el paso e Inicio restablece la posición original", async (t) => {
  const { w, boton } = await abrir(t);
  boton.focus();
  boton.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
  assert.equal(boton.style.left, "826px");
  boton.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(boton.style.top, "686px");
  assert.ok(w.localStorage.getItem(clave));
  boton.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
  assert.equal(boton.style.left, "");
  assert.equal(boton.style.top, "");
  assert.equal(w.localStorage.getItem(clave), null);
  boton.click();
  assert.equal(boton.getAttribute("aria-expanded"), "true");
});

test("una preferencia incorrecta o el almacenamiento bloqueado no impiden usar el botón", async (t) => {
  const { w, boton, puntero, panel } = await abrir(t, '{"x":"mal","y":5}');
  assert.equal(boton.style.left, "");
  w.Storage.prototype.setItem = () => { throw new Error("Almacenamiento bloqueado"); };
  puntero("pointerdown", 900, 750);
  puntero("pointermove", 300, 150);
  puntero("pointerup", 300, 150);
  assert.equal(boton.style.left, "236px");
  boton.click();
  assert.equal(panel.hidden, false);
});

test("al abrir, el botón pasa junto a cerrar y al minimizar permanece donde estaba en la cabecera", async (t) => {
  const { w, d, boton, panel, puntero } = await abrir(t, '{"x":0.25,"y":0.5}');
  boton.click();
  assert.equal(boton.parentElement.id, "chatControles");
  assert.equal(boton.nextElementSibling.id, "chatCerrar");
  assert.equal(boton.classList.contains("is-docked"), true);
  assert.equal(boton.getAttribute("aria-expanded"), "true");
  const inicial = { left: panel.style.left, top: panel.style.top };
  puntero("pointerdown", 900, 750);
  puntero("pointermove", 80, 40);
  puntero("pointerup", 80, 40);
  assert.equal(panel.style.left, inicial.left);
  assert.equal(panel.style.top, inicial.top);
  assert.equal(w.localStorage.getItem(clavePanel), null);
  const ubicacionActual = boton.getBoundingClientRect();
  d.querySelector("#chatCerrar").click();
  assert.equal(panel.hidden, true);
  assert.equal(boton.parentElement.className, "workspace");
  assert.equal(parseFloat(boton.style.left), ubicacionActual.left);
  assert.equal(parseFloat(boton.style.top), ubicacionActual.top);
  assert.equal(d.activeElement, boton);
  boton.click();
  boton.click();
  assert.equal(panel.hidden, true);
});

test("abrir a la izquierda, mover a la derecha y cerrar deja el botón a la derecha y conserva ambas posiciones", async (t) => {
  const primero = await abrir(t, '{"x":0,"y":0.5}');
  const { w, d, boton, panel, cabecera, puntero } = primero;
  const posicionInicial = boton.getBoundingClientRect();
  boton.click();
  const panelInicial = panel.getBoundingClientRect();
  puntero("pointerdown", panelInicial.left + 20, panelInicial.top + 20, { objetivo: cabecera });
  puntero("pointermove", 950, panelInicial.top + 20);
  puntero("pointerup", 950, panelInicial.top + 20);
  const panelMovido = panel.getBoundingClientRect();
  const botonEnCabecera = boton.getBoundingClientRect();
  assert.ok(botonEnCabecera.left > posicionInicial.left + 400);
  d.querySelector("#chatCerrar").click();
  assert.equal(boton.getBoundingClientRect().left, botonEnCabecera.left);
  assert.equal(boton.getBoundingClientRect().top, botonEnCabecera.top);
  boton.click();
  assert.equal(panel.getBoundingClientRect().left, panelMovido.left);
  assert.equal(panel.getBoundingClientRect().top, panelMovido.top);
  // También se conserva al minimizar con el propio botón y al recargar.
  boton.click();
  const guardada = w.localStorage.getItem(clave), guardadaPanel = w.localStorage.getItem(clavePanel);
  const segundo = await abrir(t, guardada, guardadaPanel);
  assert.equal(segundo.boton.getBoundingClientRect().left, botonEnCabecera.left);
  segundo.boton.click();
  assert.equal(segundo.panel.getBoundingClientRect().left, panelMovido.left);
});

test("mover el botón cerrado al lado opuesto abre el chat allí, incluso tras recargar", async (t) => {
  for (const [nombre, xInicial, destino, direccion] of [["derecha", 0, 10000, 1], ["izquierda", 1, -10000, -1]]) {
    await t.test(nombre, async (t) => {
      const primero = await abrir(t, JSON.stringify({ x: xInicial, y: 0.5 }));
      primero.boton.click();
      const panelAnterior = primero.panel.getBoundingClientRect();
      primero.boton.click();
      assert.ok(primero.w.localStorage.getItem(clavePanel));
      const rect = primero.boton.getBoundingClientRect();
      primero.puntero("pointerdown", rect.left + 20, rect.top + 20, { pointerType: "touch" });
      primero.puntero("pointermove", destino, rect.top + 20, { pointerType: "touch" });
      primero.puntero("pointerup", destino, rect.top + 20, { pointerType: "touch" });
      assert.equal(primero.w.localStorage.getItem(clavePanel), null);
      primero.boton.click();
      const panelNuevo = primero.panel.getBoundingClientRect();
      assert.ok((panelNuevo.left - panelAnterior.left) * direccion > 100);
      const segundo = await abrir(t, primero.w.localStorage.getItem(clave), primero.w.localStorage.getItem(clavePanel));
      segundo.boton.click();
      assert.equal(segundo.panel.getBoundingClientRect().left, panelNuevo.left);
    });
  }
});

test("cancelar el arrastre del botón conserva la ubicación anterior del chat", async (t) => {
  const { w, boton, panel, puntero } = await abrir(t);
  boton.click();
  const original = panel.getBoundingClientRect();
  boton.click();
  const guardada = w.localStorage.getItem(clavePanel), rect = boton.getBoundingClientRect();
  puntero("pointerdown", rect.left + 20, rect.top + 20);
  puntero("pointermove", 50, 50);
  puntero("pointercancel", 50, 50);
  assert.equal(w.localStorage.getItem(clavePanel), guardada);
  boton.click();
  assert.equal(panel.getBoundingClientRect().left, original.left);
  assert.equal(panel.getBoundingClientRect().top, original.top);
});

test("mover o restablecer el botón con teclado actualiza también el lugar de apertura", async (t) => {
  const { w, boton, panel } = await abrir(t, '{"x":0,"y":0.5}');
  boton.click();
  const original = panel.getBoundingClientRect();
  boton.click();
  for (let i = 0; i < 15; i++) {
    boton.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true }));
  }
  assert.equal(w.localStorage.getItem(clavePanel), null);
  boton.click();
  assert.ok(panel.getBoundingClientRect().left > original.left + 100);
  boton.click();
  boton.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
  assert.equal(w.localStorage.getItem(clavePanel), null);
  assert.equal(w.localStorage.getItem(clave), null);
});

test("la ventana se arrastra desde la cabecera, conserva su posición y se adapta al tamaño de pantalla", async (t) => {
  const primero = await abrir(t);
  primero.boton.click();
  primero.puntero("pointerdown", 600, 90, { objetivo: primero.cabecera, pointerType: "touch" });
  primero.puntero("pointermove", 100, 90, { pointerType: "touch" });
  primero.puntero("pointerup", 100, 90, { pointerType: "touch" });
  const rect = primero.panel.getBoundingClientRect();
  assert.equal(rect.left, 36);
  assert.ok(rect.left >= 8 && rect.right <= 992);
  assert.ok(rect.top >= 8 && rect.bottom <= 792);
  assert.equal(primero.w.localStorage.getItem(clave), null);
  const guardada = primero.w.localStorage.getItem(clavePanel);
  assert.ok(guardada);
  primero.d.querySelector("#chatCerrar").click();
  primero.boton.click();
  assert.equal(primero.panel.style.left, "36px");
  const segundo = await abrir(t, null, guardada);
  segundo.boton.click();
  assert.equal(segundo.panel.style.left, "36px");
  segundo.w.innerWidth = 320;
  segundo.w.innerHeight = 480;
  segundo.w.dispatchEvent(new segundo.w.Event("resize"));
  const movil = segundo.panel.getBoundingClientRect();
  assert.ok(movil.left >= 8 && movil.right <= 312);
  assert.ok(movil.top >= 8 && movil.bottom <= 472);
});

test("arrastrar texto o controles no mueve el panel y un gesto cancelado en la cabecera se descarta", async (t) => {
  const { w, d, boton, panel, cabecera, puntero } = await abrir(t);
  boton.click();
  const original = { left: panel.style.left, top: panel.style.top };
  for (const objetivo of [d.querySelector("#chatMensajes"), d.querySelector("#chatMensaje"), boton, d.querySelector("#chatCerrar")]) {
    puntero("pointerdown", 600, 90, { objetivo });
    puntero("pointermove", 100, 90);
    puntero("pointerup", 100, 90);
    assert.equal(panel.style.left, original.left);
    assert.equal(panel.style.top, original.top);
  }
  puntero("pointerdown", 600, 90, { objetivo: cabecera });
  puntero("pointermove", 100, 90);
  assert.notEqual(panel.style.left, original.left);
  puntero("pointercancel", 100, 90);
  assert.equal(panel.style.left, original.left);
  assert.equal(panel.style.top, original.top);
  assert.equal(w.localStorage.getItem(clavePanel), null);
});

test("las flechas mueven la cabecera enfocada e Inicio restablece solo la posición del panel", async (t) => {
  const { w, boton, panel, cabecera } = await abrir(t, '{"x":0.5,"y":0.5}');
  const posicionBoton = w.localStorage.getItem(clave);
  boton.click();
  const original = parseFloat(panel.style.left);
  cabecera.focus();
  cabecera.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
  assert.equal(parseFloat(panel.style.left), original + 10);
  assert.ok(w.localStorage.getItem(clavePanel));
  cabecera.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
  assert.equal(parseFloat(panel.style.left), original);
  assert.equal(w.localStorage.getItem(clavePanel), null);
  assert.equal(w.localStorage.getItem(clave), posicionBoton);
});
