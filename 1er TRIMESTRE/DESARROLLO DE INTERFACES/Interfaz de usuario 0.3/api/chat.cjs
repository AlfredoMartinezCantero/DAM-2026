// Puente para npm start. Comparte configuración y contrato con chat.php.
const configuracion = require("./ollama.json");
const formato = require("./chat-formato.json");
const politica = require("./chat-politica.json");
const MAX_BYTES = 1024 * 1024;

function fallo(estado, mensaje) {
  return Object.assign(new Error(mensaje), { estado });
}

function orientar(mensaje, historial) {
  const normalizar = (texto) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const coincide = (clave, texto) => new RegExp(politica.patrones[clave]).test(texto);
  const esAlta = (texto) => coincide("alta", texto) && coincide("cliente", texto) &&
    !coincide("explicacion", texto) && !coincide("negacionAlta", texto);
  const texto = normalizar(mensaje);
  if (coincide("capacidades", texto)) return { respuestaDirecta: politica.respuestas.capacidades };
  const usuarios = historial.filter((item) => item.role === "user").map((item) => normalizar(item.content));
  const continuacion = usuarios.length && esAlta(usuarios.at(-1)) && coincide("datosCliente", texto);
  if (esAlta(texto) || continuacion) return { modo: "borrador" };
  if (!coincide("datosCopiados", texto) && !coincide("explicacion", texto)) {
    if (coincide("stock", texto) || (coincide("soloId", texto) && usuarios.some((item) => coincide("stock", item)))) {
      return { respuestaDirecta: politica.respuestas.stock };
    }
    if (coincide("registros", texto) || (coincide("soloId", texto) && usuarios.some((item) => coincide("registros", item)))) {
      return { respuestaDirecta: politica.respuestas.registros };
    }
  }
  return { modo: "ayuda" };
}

function preparar(entrada, config) {
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada) ||
      typeof entrada.mensaje !== "string" || !entrada.mensaje.trim()) {
    throw fallo(400, "Introduce un mensaje de texto.");
  }
  const mensaje = entrada.mensaje.trim();
  if (mensaje.length > 4000) throw fallo(400, "El mensaje admite un máximo de 4000 caracteres.");
  const historial = entrada.historial ?? [];
  if (!Array.isArray(historial) || historial.length > 12 || historial.length % 2) {
    throw fallo(400, "El historial debe contener como máximo 6 intercambios completos.");
  }
  const mensajes = historial.map((item, indice) => {
    const rol = indice % 2 ? "assistant" : "user";
    if (!item || item.role !== rol || typeof item.content !== "string" ||
        !item.content.trim() || item.content.length > (rol === "user" ? 4000 : 16000)) {
      throw fallo(400, "El historial contiene un mensaje incorrecto.");
    }
    return { role: rol, content: item.content };
  });
  const ruta = orientar(mensaje, mensajes);
  if (ruta.respuestaDirecta) return ruta;
  const esBorrador = ruta.modo === "borrador";
  const instrucciones = `${config.sistema}\n${politica.reglas}\n${esBorrador ? politica.borrador : politica.ayuda}`;
  return { modo: ruta.modo, datos: {
    model: config.modelo,
    messages: [{ role: "system", content: esBorrador ? `${instrucciones}\nEsquema JSON de salida: ${JSON.stringify(formato)}` : instrucciones }, ...mensajes, { role: "user", content: mensaje }],
    ...(esBorrador ? { format: formato } : {}),
    stream: false,
    options: { num_predict: esBorrador ? 2048 : 1024, temperature: 0 },
  } };
}

function interpretar(texto) {
  let salida;
  try { salida = JSON.parse(texto); }
  catch { throw fallo(502, "La IA no devolvió un borrador o una respuesta válidos. Vuelve a intentarlo."); }
  if (!salida || typeof salida !== "object" || Array.isArray(salida) ||
      Object.keys(salida).some((clave) => !["respuesta", "accion", "cliente"].includes(clave)) ||
      typeof salida.respuesta !== "string" || !salida.respuesta.trim() || salida.respuesta.length > 4000 ||
      !["ninguna", "preparar_cliente"].includes(salida.accion) ||
      !salida.cliente || typeof salida.cliente !== "object" || Array.isArray(salida.cliente)) {
    throw fallo(502, "La IA devolvió una acción o una respuesta incorrecta. Vuelve a intentarlo.");
  }
  const campos = formato.properties.cliente.properties;
  if (Object.keys(salida.cliente).length !== Object.keys(campos).length ||
      Object.keys(campos).some((campo) =>
        typeof salida.cliente[campo] !== "string" || salida.cliente[campo].length > (campo === "observaciones" ? 4000 : 1000))) {
    throw fallo(502, "La IA devolvió campos de cliente incorrectos. Vuelve a intentarlo.");
  }
  if (salida.accion === "ninguna") return { respuesta: salida.respuesta.trim(), accion: null };
  const datos = Object.fromEntries(Object.keys(campos).map((campo) => [campo, salida.cliente[campo].trim()]));
  if (!Object.values(datos).some(Boolean)) {
    return { respuesta: politica.respuestas.altaSinDatos, accion: null };
  }
  return {
    respuesta: "He preparado un borrador de cliente. Pulsa «Revisar nuevo cliente», comprueba los campos y completa los que falten. Todavía no se ha guardado ningún registro.",
    accion: { tipo: "preparar_cliente", datos },
  };
}

function crearChat({ config = configuracion, fetchOllama = fetch } = {}) {
  return async (peticion, respuesta) => {
    const responder = (estado, texto, accion = null) => {
      if (respuesta.destroyed) return;
      respuesta.writeHead(estado, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...(estado === 405 ? { Allow: "POST" } : {}),
      });
      respuesta.end(JSON.stringify({ respuesta: texto, accion }));
    };
    if (peticion.method !== "POST") return responder(405, "Utiliza POST para enviar un mensaje.");
    if (peticion.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return responder(415, "Envía el mensaje como application/json.");
    }
    const controlador = new AbortController();
    const desconectar = () => { if (!respuesta.writableEnded) controlador.abort(); };
    respuesta.on("close", desconectar);
    let temporizador;
    try {
      const partes = [];
      let longitud = 0;
      // Se sigue drenando una entrada excesiva para poder devolver el error JSON.
      for await (const parte of peticion) {
        longitud += parte.length;
        if (longitud <= MAX_BYTES) partes.push(parte);
      }
      if (longitud > MAX_BYTES) throw fallo(413, "La petición es demasiado grande.");
      let entrada;
      try { entrada = JSON.parse(Buffer.concat(partes).toString("utf8")); }
      catch { throw fallo(400, "El JSON enviado no es válido."); }
      const solicitud = preparar(entrada, config);
      if (solicitud.respuestaDirecta) return responder(200, solicitud.respuestaDirecta);
      const datos = solicitud.datos;
      temporizador = setTimeout(() => controlador.abort(), config.timeoutSegundos * 1000);
      let resultado;
      try {
        const upstream = await fetchOllama(config.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(datos),
          signal: controlador.signal,
        });
        if (!upstream.ok) {
          await upstream.body?.cancel();
          throw fallo(502, upstream.status === 404
            ? `El modelo ${config.modelo} no está disponible en Ollama. Comprueba que esté instalado en el equipo del servidor.`
            : "Ollama no pudo generar la respuesta. Inténtalo de nuevo.");
        }
        try { resultado = await upstream.json(); }
        catch { throw fallo(502, "Ollama devolvió un JSON incorrecto."); }
      } catch (error) {
        if (error.estado) throw error;
        throw fallo(controlador.signal.aborted ? 504 : 502, controlador.signal.aborted
          ? "Ollama ha superado el tiempo de espera. Vuelve a intentarlo."
          : "No se ha podido conectar con Ollama. Comprueba que esté ejecutándose en el equipo del servidor.");
      }
      const texto = resultado?.message?.content;
      if (resultado?.error || typeof texto !== "string" || !texto.trim() || texto.length > 16000) {
        throw fallo(502, "Ollama devolvió una respuesta vacía o incorrecta.");
      }
      const salida = solicitud.modo === "borrador" ? interpretar(texto) : { respuesta: texto.trim(), accion: null };
      responder(200, salida.respuesta, salida.accion);
    } catch (error) {
      responder(error.estado || 500, error.estado ? error.message : "No se pudo procesar la consulta.");
    } finally {
      clearTimeout(temporizador);
      respuesta.off("close", desconectar);
    }
  };
}

module.exports = { crearChat };
