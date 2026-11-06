const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const raiz = path.join(__dirname, "..");

async function abrir(t, prefijo = "SpeechRecognition") {
  const dom = new JSDOM(fs.readFileSync(path.join(raiz, "index.html"), "utf8"), {
    url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  await new Promise((resolve) => w.addEventListener("load", resolve, { once: true }));
  const instancias = [];
  class Reconocimiento {
    constructor() { instancias.push(this); this.paradas = 0; this.cancelaciones = 0; }
    start() { this.iniciado = true; }
    stop() { this.paradas++; }
    abort() { this.cancelaciones++; }
    resultado(...partes) {
      this.onresult({ results: partes.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })) });
    }
  }
  if (prefijo) w[prefijo] = Reconocimiento;
  w.Alfredo = { iu: {} };
  w.eval(fs.readFileSync(path.join(raiz, "js/chat.js"), "utf8"));
  const chat = new w.Alfredo.iu.ChatIU();
  chat.mostrar(true);
  return { w, d: w.document, chat, instancias, microfono: w.document.querySelector("#chatMicrofono") };
}

test("el micrófono solo se activa al pulsar Dictar y configura reconocimiento en español", async (t) => {
  const { chat, instancias, microfono } = await abrir(t);
  assert.equal(instancias.length, 0);
  assert.equal(microfono.disabled, false);
  microfono.click();
  assert.equal(instancias.length, 1);
  const voz = instancias[0];
  assert.equal(voz.iniciado, true);
  assert.equal(voz.lang, "es-ES");
  assert.equal(voz.continuous, true);
  assert.equal(voz.interimResults, true);
  assert.equal(chat.entrada.readOnly, true);
  assert.equal(chat.enviarBoton.disabled, true);
  assert.equal(microfono.getAttribute("aria-pressed"), "true");
  voz.onstart();
  assert.match(chat.dictado.estado.textContent, /Escuchando/);
});

test("el dictado sustituye la selección, actualiza resultados sin duplicarlos y no envía automáticamente", async (t) => {
  const { w, chat, instancias, microfono } = await abrir(t);
  w.fetch = () => assert.fail("Dictar no debe enviar un mensaje");
  chat.entrada.value = "Consulta esto mañana";
  chat.entrada.setSelectionRange(9, 13);
  microfono.click();
  const voz = instancias[0];
  voz.resultado(["el sto", false]);
  assert.equal(chat.entrada.value, "Consulta el sto mañana");
  voz.resultado(["el stock", true], ["dispo", false]);
  assert.equal(chat.entrada.value, "Consulta el stock dispo mañana");
  microfono.click();
  assert.equal(voz.paradas, 1);
  assert.equal(microfono.disabled, true);
  voz.resultado(["el stock", true], ["disponible", true]);
  voz.onend();
  assert.equal(chat.entrada.value, "Consulta el stock disponible mañana");
  assert.equal(chat.entrada.readOnly, false);
  assert.equal(chat.enviarBoton.disabled, false);
  assert.equal(microfono.getAttribute("aria-pressed"), "false");
  assert.match(chat.dictado.estado.textContent, /Revisa el texto/);
  assert.equal(chat.historial.length, 0);
});

test("admite webkitSpeechRecognition y permite dictar otra vez al terminar", async (t) => {
  const { chat, instancias, microfono } = await abrir(t, "webkitSpeechRecognition");
  microfono.click();
  instancias[0].resultado(["Hola", true]);
  instancias[0].onend();
  chat.entrada.setSelectionRange(chat.entrada.value.length, chat.entrada.value.length);
  microfono.click();
  instancias[1].resultado(["otra vez", true]);
  instancias[1].onend();
  assert.equal(chat.entrada.value, "Hola otra vez");
});

test("si el navegador no admite reconocimiento se puede seguir escribiendo y enviando", async (t) => {
  const { w, chat, microfono } = await abrir(t, null);
  assert.equal(microfono.disabled, true);
  assert.match(microfono.title, /no admite/);
  assert.match(chat.dictado.informacion.textContent, /SpeechRecognition/);
  w.fetch = async () => Response.json({ respuesta: "Hola", accion: null });
  chat.entrada.value = "Hola";
  await chat.enviar();
  assert.equal(chat.historial.length, 2);
});

test("los errores de permiso, micrófono, red y silencio conservan el texto y permiten reintentar", async (t) => {
  const { chat, instancias, microfono } = await abrir(t);
  chat.entrada.value = "Mensaje escrito";
  for (const [codigo, patron] of [["not-allowed", /permisos/], ["audio-capture", /micrófono/], ["network", /conexión/], ["no-speech", /No se ha detectado voz/]]) {
    microfono.click();
    const voz = instancias.at(-1);
    voz.resultado(["texto provisional", false]);
    voz.onerror({ error: codigo });
    voz.onend();
    assert.equal(chat.entrada.value, "Mensaje escrito");
    assert.equal(chat.enviarBoton.disabled, false);
    assert.equal(microfono.disabled, false);
    assert.match(chat.dictado.estado.textContent, patron);
    assert.equal(voz.cancelaciones, 1);
  }
});

test("un fallo al iniciar el reconocimiento recupera todos los controles", async (t) => {
  const { w, chat, microfono } = await abrir(t);
  w.SpeechRecognition.prototype.start = () => { throw new w.DOMException("Denegado", "NotAllowedError"); };
  chat.entrada.value = "No perder";
  microfono.click();
  assert.equal(chat.dictado.activo, false);
  assert.equal(chat.entrada.value, "No perder");
  assert.equal(chat.enviarBoton.disabled, false);
  assert.equal(chat.entrada.readOnly, false);
  assert.match(chat.dictado.estado.textContent, /bloqueado/);
});

test("cerrar o reiniciar detiene el micrófono y descarta eventos tardíos", async (t) => {
  const { d, chat, instancias, microfono } = await abrir(t);
  microfono.click();
  const primera = instancias[0];
  primera.resultado(["Texto confirmado", true], ["provisional", false]);
  d.querySelector("#chatCerrar").click();
  assert.equal(primera.cancelaciones, 1);
  assert.equal(chat.entrada.value, "Texto confirmado");
  primera.resultado(["No debe reaparecer", true]);
  primera.onend();
  assert.equal(chat.entrada.value, "Texto confirmado");
  chat.mostrar(true);
  microfono.click();
  const segunda = instancias[1];
  d.querySelector("#chatNuevo").click();
  segunda.resultado(["No debe resucitar", true]);
  segunda.onend();
  assert.equal(segunda.cancelaciones, 1);
  assert.equal(chat.entrada.value, "");
  assert.equal(chat.historial.length, 0);
  assert.equal(chat.dictado.activo, false);
});

test("el dictado respeta el límite de caracteres, incluso con emoji, y se detiene", async (t) => {
  const { chat, instancias, microfono } = await abrir(t);
  chat.entrada.value = "a".repeat(3997);
  chat.entrada.setSelectionRange(3997, 3997);
  microfono.click();
  const voz = instancias[0];
  voz.resultado(["😀😀😀", true]);
  assert.equal(voz.paradas, 1);
  voz.onend();
  assert.ok(chat.entrada.value.length <= 4000);
  assert.doesNotMatch(chat.entrada.value, /[\uD800-\uDBFF]$/);
  assert.match(chat.dictado.estado.textContent, /límite/);
});

test("Enviar durante el dictado solo lo detiene; tras revisarlo se envía y bloquea el micrófono durante la petición", async (t) => {
  const { w, chat, instancias, microfono } = await abrir(t);
  let peticiones = 0, responder;
  w.fetch = () => { peticiones++; return new Promise((resolve) => { responder = resolve; }); };
  microfono.click();
  instancias[0].resultado(["¿Qué puedes hacer?", true]);
  await chat.enviar();
  assert.equal(peticiones, 0);
  assert.equal(instancias[0].paradas, 1);
  instancias[0].onend();
  const envio = chat.enviar();
  assert.equal(peticiones, 1);
  assert.equal(microfono.disabled, true);
  microfono.click();
  assert.equal(instancias.length, 1);
  responder(Response.json({ respuesta: "Puedo ayudarte con dudas.", accion: null }));
  await envio;
  assert.equal(microfono.disabled, false);
  assert.equal(chat.entrada.value, "");
});

test("salir de la página cancela el reconocimiento sin reactivarlo", async (t) => {
  const { w, chat, instancias, microfono } = await abrir(t);
  microfono.click();
  w.dispatchEvent(new w.Event("pagehide"));
  assert.equal(instancias[0].cancelaciones, 1);
  instancias[0].onend();
  assert.equal(chat.dictado.activo, false);
});
