/* El historial permanece en memoria: no se guarda en localStorage. */
(() => {
  "use strict";
  const camposCliente = ["nombre", "apellidos", "email", "telefono", "empresa", "observaciones"];

  class DictadoIU {
    constructor(entrada, boton, estado, informacion, alCambiar) {
      Object.assign(this, { entrada, boton, estado, informacion, alCambiar });
      this.API = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.disponible = typeof this.API === "function";
      this.sesion = null;
      this.bloqueado = false;
      if (!this.disponible) {
        this.informacion.textContent += " Este navegador no admite SpeechRecognition; puedes escribir el mensaje.";
      }
      this.boton.addEventListener("click", () => this.activo ? this.detener() : this.iniciar());
      window.addEventListener("pagehide", () => this.cancelar());
      this.actualizar();
    }

    get activo() { return this.sesion !== null; }

    informar(texto) {
      this.estado.textContent = texto;
      this.estado.hidden = !texto;
    }

    actualizar() {
      this.boton.disabled = !this.disponible || this.bloqueado || Boolean(this.sesion?.parando);
      this.boton.setAttribute("aria-pressed", String(this.activo));
      this.boton.querySelector("span").textContent = this.sesion?.parando ? "Deteniendo…" : this.activo ? "Detener" : "Dictar";
      const etiqueta = !this.disponible ? "Este navegador no admite el dictado de voz" :
        this.activo ? "Detener el dictado" : "Dictar mensaje con el micrófono";
      this.boton.setAttribute("aria-label", etiqueta);
      this.boton.title = etiqueta;
    }

    componer(sesion, texto) {
      if (!texto.trim()) return sesion.original;
      const unir = (a, b) => a && b && !/\s$/.test(a) && !/^\s/.test(b) ? `${a} ${b}` : a + b;
      let dictado = texto.trim();
      let valor = unir(unir(sesion.antes, dictado), sesion.despues);
      const maximo = this.entrada.maxLength > 0 ? this.entrada.maxLength : 4000;
      while (valor.length > maximo && dictado.length) {
        sesion.limitado = true;
        dictado = dictado.slice(0, Math.max(0, dictado.length - (valor.length - maximo))).replace(/[\uD800-\uDBFF]$/, "");
        valor = dictado ? unir(unir(sesion.antes, dictado), sesion.despues) : sesion.original;
      }
      return valor;
    }

    iniciar() {
      if (!this.disponible || this.bloqueado || this.activo) return;
      const inicio = this.entrada.selectionStart ?? this.entrada.value.length;
      const fin = this.entrada.selectionEnd ?? inicio;
      if (this.entrada.value.length - (fin - inicio) >= this.entrada.maxLength) {
        this.informar("No queda espacio para dictar. El mensaje admite un máximo de 4000 caracteres.");
        return;
      }
      const sesion = {
        original: this.entrada.value, antes: this.entrada.value.slice(0, inicio),
        despues: this.entrada.value.slice(fin), confirmado: "", parando: false, aviso: "",
      };
      this.sesion = sesion;
      try {
        const reconocimiento = new this.API();
        sesion.reconocimiento = reconocimiento;
        reconocimiento.lang = "es-ES";
        reconocimiento.continuous = true;
        reconocimiento.interimResults = true;
        reconocimiento.maxAlternatives = 1;
        reconocimiento.onstart = () => {
          if (this.sesion === sesion) this.informar("Escuchando… Habla en español y pulsa Detener cuando termines.");
        };
        reconocimiento.onresult = (evento) => {
          if (this.sesion !== sesion) return;
          const definitivos = [], provisionales = [];
          for (const resultado of Array.from(evento.results)) {
            const texto = resultado[0]?.transcript || "";
            (resultado.isFinal ? definitivos : provisionales).push(texto);
          }
          sesion.confirmado = definitivos.join(" ").trim();
          this.entrada.value = this.componer(sesion, [...definitivos, ...provisionales].join(" "));
          this.entrada.scrollTop = this.entrada.scrollHeight;
          if (sesion.limitado || this.entrada.value.length >= this.entrada.maxLength) {
            sesion.aviso = "Se ha alcanzado el límite de 4000 caracteres. Revisa el texto antes de enviarlo.";
            this.detener();
          }
        };
        reconocimiento.onerror = (evento) => {
          if (this.sesion !== sesion) return;
          const errores = {
            "not-allowed": "El navegador no permite usar el micrófono. Revisa los permisos de este sitio y ábrelo mediante localhost o HTTPS.",
            "service-not-allowed": "El navegador no permite usar el servicio de reconocimiento de voz.",
            "audio-capture": "No se ha podido acceder al micrófono. Comprueba que esté conectado y disponible.",
            "no-speech": "No se ha detectado voz. Pulsa Dictar para intentarlo de nuevo.",
            "network": "No se pudo conectar con el servicio de dictado del navegador. Comprueba la conexión.",
            "language-not-supported": "El servicio de dictado no admite español en este navegador.",
            "aborted": "Dictado cancelado. Puedes volver a intentarlo.",
          };
          this.finalizar(sesion, errores[evento.error] || "No se pudo completar el dictado. Puedes escribir el mensaje o volver a intentarlo.");
          try { reconocimiento.abort(); } catch { /* Puede haber terminado ya. */ }
        };
        reconocimiento.onend = () => {
          if (this.sesion === sesion) this.finalizar(sesion, sesion.aviso || (sesion.confirmado
            ? "Dictado terminado. Revisa el texto y pulsa Enviar cuando quieras."
            : "No se ha reconocido texto. Puedes volver a dictar o escribir el mensaje."));
        };
        this.informar("Activando micrófono…");
        this.actualizar();
        this.alCambiar();
        reconocimiento.start();
      } catch (error) {
        this.finalizar(sesion, error.name === "NotAllowedError"
          ? "El navegador ha bloqueado el micrófono. Revisa los permisos de este sitio."
          : "No se ha podido iniciar el dictado. Puedes escribir el mensaje o volver a intentarlo.");
        try { sesion.reconocimiento?.abort(); } catch { /* No llegó a iniciarse. */ }
      }
    }

    detener() {
      const sesion = this.sesion;
      if (!sesion || sesion.parando) return;
      sesion.parando = true;
      this.actualizar();
      this.informar(sesion.aviso || "Terminando dictado…");
      try { sesion.reconocimiento.stop(); }
      catch { this.cancelar(); }
    }

    finalizar(sesion, texto, devolverFoco = true) {
      if (this.sesion !== sesion) return;
      this.entrada.value = this.componer(sesion, sesion.confirmado);
      this.sesion = null;
      this.informar(texto);
      this.actualizar();
      this.alCambiar();
      if (devolverFoco && document.activeElement === this.boton) this.entrada.focus();
    }

    cancelar() {
      const sesion = this.sesion;
      if (!sesion) { this.informar(""); return; }
      this.finalizar(sesion, "", false);
      try { sesion.reconocimiento?.abort(); } catch { /* Ya estaba detenido. */ }
    }
  }

  class ChatIU {
    constructor() {
      this.panel = document.querySelector("#chatPanel");
      this.abrir = document.querySelector("#chatAbrir");
      this.cabecera = this.panel.querySelector(".ju-chat-header");
      this.controles = document.querySelector("#chatControles");
      this.anclaBoton = document.createComment("Posición del botón flotante del asistente");
      this.abrir.before(this.anclaBoton);
      this.tituloBoton = this.abrir.title;
      this.formulario = document.querySelector("#chatFormulario");
      this.entrada = document.querySelector("#chatMensaje");
      this.mensajes = document.querySelector("#chatMensajes");
      this.estado = document.querySelector("#chatEstado");
      this.error = document.querySelector("#chatError");
      this.enviarBoton = document.querySelector("#chatEnviar");
      this.cancelarBoton = document.querySelector("#chatCancelar");
      this.historial = [];
      this.peticion = null;
      this.dictado = new DictadoIU(this.entrada, document.querySelector("#chatMicrofono"),
        document.querySelector("#chatVozEstado"), document.querySelector("#chatVozInfo"), () => this.actualizarControles());
      this.abrir.addEventListener("click", (evento) => {
        if (this.suprimirClic && evento.detail !== 0) {
          evento.preventDefault();
          this.suprimirClic = false;
          return;
        }
        this.suprimirClic = false;
        this.mostrar(this.panel.hidden);
      });
      this.iniciarPosicion();
      document.querySelector("#chatCerrar").addEventListener("click", () => this.mostrar(false));
      document.querySelector("#chatNuevo").addEventListener("click", () => this.reiniciar());
      this.cancelarBoton.addEventListener("click", () => this.peticion?.abort());
      this.formulario.addEventListener("submit", (evento) => {
        evento.preventDefault();
        this.enviar();
      });
      this.entrada.addEventListener("keydown", (evento) => {
        if (evento.key === "Enter" && !evento.shiftKey && !evento.isComposing) {
          evento.preventDefault();
          this.formulario.requestSubmit();
        }
      });
      this.panel.addEventListener("keydown", (evento) => {
        if (evento.key === "Escape") {
          evento.stopPropagation();
          this.mostrar(false);
        }
      });
    }

    mostrar(abierto) {
      if (this.arrastre) this.terminarArrastre({ pointerId: this.arrastre.id }, true);
      this.abrir.setAttribute("aria-expanded", String(abierto));
      if (abierto) {
        if (this.panel.hidden) {
          this.anclaPanel = this.abrir.getBoundingClientRect();
          this.panel.hidden = false;
          this.controles.prepend(this.abrir);
          this.abrir.classList.add("is-docked");
          this.abrir.title = "Minimizar asistente";
        }
        this.ajustarPanel();
        this.entrada.focus();
      } else {
        this.dictado.cancelar();
        // Conserva las coordenadas visibles antes de sacar el botón de la cabecera.
        const ubicacionBoton = this.panel.hidden ? null : this.abrir.getBoundingClientRect();
        if (!this.panel.hidden) {
          const ubicacionPanel = this.panel.getBoundingClientRect();
          this.colocarPanel(ubicacionPanel.left, ubicacionPanel.top);
          this.guardarPosicion("panel");
        }
        this.anclaBoton.after(this.abrir);
        this.abrir.classList.remove("is-docked");
        this.abrir.title = this.tituloBoton;
        this.panel.hidden = true;
        if (ubicacionBoton) {
          this.colocarBoton(ubicacionBoton.left, ubicacionBoton.top);
          this.guardarPosicion();
        } else this.restaurarPosicion();
        this.abrir.focus();
      }
    }

    iniciarPosicion() {
      this.clavePosicion = "Alfredo.iu.chat.posicion.v1";
      this.clavePanel = "Alfredo.iu.chat.panel.v1";
      this.posicion = null;
      this.posicionPanel = null;
      for (const [clave, propiedad] of [[this.clavePosicion, "posicion"], [this.clavePanel, "posicionPanel"]]) {
        try {
          const guardada = JSON.parse(window.localStorage.getItem(clave));
          if (guardada && [guardada.x, guardada.y].every((valor) =>
            typeof valor === "number" && Number.isFinite(valor) && valor >= 0 && valor <= 1)) {
            this[propiedad] = { x: guardada.x, y: guardada.y };
          }
        } catch { /* La posición sigue siendo ajustable sin almacenamiento. */ }
      }
      this.restaurarPosicion();

      const comenzar = (evento, tipo, asa) => {
        if (evento.button !== 0 || evento.isPrimary === false || this.arrastre) return;
        if (tipo === "boton" && !this.panel.hidden) return;
        if (tipo === "panel" && evento.target.closest("button, a, input, textarea, select")) return;
        const objetivo = tipo === "panel" ? this.panel : this.abrir;
        const posicion = tipo === "panel" ? this.posicionPanel : this.posicion;
        const rect = objetivo.getBoundingClientRect();
        this.suprimirClic = false;
        this.arrastre = {
          tipo, objetivo, asa,
          id: evento.pointerId, x: evento.clientX, y: evento.clientY,
          izquierda: rect.left, arriba: rect.top, movido: false,
          anterior: posicion ? { ...posicion } : null,
        };
        asa.setPointerCapture?.(evento.pointerId);
      };
      this.abrir.addEventListener("pointerdown", (evento) => comenzar(evento, "boton", this.abrir));
      this.cabecera.addEventListener("pointerdown", (evento) => comenzar(evento, "panel", this.cabecera));
      window.addEventListener("pointermove", (evento) => {
        const arrastre = this.arrastre;
        if (!arrastre || arrastre.id !== evento.pointerId) return;
        const dx = evento.clientX - arrastre.x, dy = evento.clientY - arrastre.y;
        if (!arrastre.movido && Math.hypot(dx, dy) < 6) return;
        evento.preventDefault();
        arrastre.movido = true;
        this.suprimirClic = arrastre.tipo === "boton";
        arrastre.objetivo.classList.add("is-dragging");
        if (arrastre.tipo === "panel") this.colocarPanel(arrastre.izquierda + dx, arrastre.arriba + dy);
        else this.colocarBoton(arrastre.izquierda + dx, arrastre.arriba + dy);
      });
      window.addEventListener("pointerup", (evento) => this.terminarArrastre(evento));
      window.addEventListener("pointercancel", (evento) => this.terminarArrastre(evento, true));
      this.abrir.addEventListener("lostpointercapture", (evento) => this.terminarArrastre(evento, true));
      this.cabecera.addEventListener("lostpointercapture", (evento) => this.terminarArrastre(evento, true));
      window.addEventListener("blur", () => {
        if (this.arrastre) this.terminarArrastre({ pointerId: this.arrastre.id }, true);
      });
      const teclado = (evento, tipo) => {
        if ((tipo === "boton" && !this.panel.hidden) ||
            (tipo === "panel" && evento.target !== this.cabecera)) return;
        const movimientos = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (evento.key === "Home") {
          evento.preventDefault();
          if (tipo === "panel") this.posicionPanel = null;
          else {
            this.posicion = null;
            this.olvidarPosicionPanel();
            for (const propiedad of ["left", "top", "right", "bottom"]) this.abrir.style.removeProperty(propiedad);
          }
          try { window.localStorage.removeItem(tipo === "panel" ? this.clavePanel : this.clavePosicion); } catch { /* Preferencia opcional. */ }
          this.ajustarPanel();
        } else if (movimientos[evento.key]) {
          evento.preventDefault();
          const rect = (tipo === "panel" ? this.panel : this.abrir).getBoundingClientRect();
          const [dx, dy] = movimientos[evento.key], paso = evento.shiftKey ? 50 : 10;
          if (tipo === "panel") this.colocarPanel(rect.left + dx * paso, rect.top + dy * paso);
          else {
            this.colocarBoton(rect.left + dx * paso, rect.top + dy * paso);
            this.olvidarPosicionPanel();
          }
          this.guardarPosicion(tipo);
        }
      };
      this.abrir.addEventListener("keydown", (evento) => teclado(evento, "boton"));
      this.cabecera.addEventListener("keydown", (evento) => teclado(evento, "panel"));
      window.addEventListener("resize", () => {
        if (this.arrastre) this.terminarArrastre({ pointerId: this.arrastre.id }, true);
        this.restaurarPosicion();
        this.ajustarPanel();
      });
    }

    limitesElemento(elemento) {
      const rect = elemento.getBoundingClientRect();
      const ancho = window.innerWidth, alto = window.innerHeight;
      const margenX = Math.min(8, Math.max(0, (ancho - rect.width) / 2));
      const margenY = Math.min(8, Math.max(0, (alto - rect.height) / 2));
      return { minX: margenX, minY: margenY,
        maxX: Math.max(margenX, ancho - rect.width - margenX),
        maxY: Math.max(margenY, alto - rect.height - margenY) };
    }

    colocarBoton(x, y) {
      const { minX, minY, maxX, maxY } = this.limitesElemento(this.abrir);
      x = Math.max(minX, Math.min(x, maxX));
      y = Math.max(minY, Math.min(y, maxY));
      this.posicion = { x: maxX === minX ? 0 : (x - minX) / (maxX - minX),
        y: maxY === minY ? 0 : (y - minY) / (maxY - minY) };
      Object.assign(this.abrir.style, { left: `${x}px`, top: `${y}px`, right: "auto", bottom: "auto" });
    }

    colocarPanel(x, y) {
      const { minX, minY, maxX, maxY } = this.limitesElemento(this.panel);
      x = Math.max(minX, Math.min(x, maxX));
      y = Math.max(minY, Math.min(y, maxY));
      this.posicionPanel = { x: maxX === minX ? 0 : (x - minX) / (maxX - minX),
        y: maxY === minY ? 0 : (y - minY) / (maxY - minY) };
      Object.assign(this.panel.style, { left: `${x}px`, top: `${y}px`, right: "auto", bottom: "auto" });
    }

    restaurarPosicion(tipo = "boton") {
      const posicion = tipo === "panel" ? this.posicionPanel : this.posicion;
      if (!posicion || (tipo === "boton" && !this.panel.hidden)) return;
      const { minX, minY, maxX, maxY } = this.limitesElemento(tipo === "panel" ? this.panel : this.abrir);
      const x = minX + posicion.x * (maxX - minX), y = minY + posicion.y * (maxY - minY);
      if (tipo === "panel") this.colocarPanel(x, y);
      else this.colocarBoton(x, y);
    }

    guardarPosicion(tipo = "boton") {
      try { window.localStorage.setItem(tipo === "panel" ? this.clavePanel : this.clavePosicion,
        JSON.stringify(tipo === "panel" ? this.posicionPanel : this.posicion)); }
      catch { /* Un fallo al guardar no impide mover ni abrir el asistente. */ }
    }

    olvidarPosicionPanel() {
      // Mover el botón cerrado establece el lugar desde el que se abrirá el chat.
      this.posicionPanel = null;
      try { window.localStorage.removeItem(this.clavePanel); }
      catch { /* La apertura sigue funcionando aunque no se pueda guardar la preferencia. */ }
    }

    terminarArrastre(evento, cancelar = false) {
      const arrastre = this.arrastre;
      if (!arrastre || arrastre.id !== evento.pointerId) return;
      this.arrastre = null;
      arrastre.objetivo.classList.remove("is-dragging");
      if (arrastre.movido) {
        if (cancelar) {
          if (arrastre.tipo === "panel") {
            this.colocarPanel(arrastre.izquierda, arrastre.arriba);
            this.posicionPanel = arrastre.anterior;
          } else {
            this.posicion = arrastre.anterior;
            if (this.posicion) this.restaurarPosicion();
            else for (const propiedad of ["left", "top", "right", "bottom"]) this.abrir.style.removeProperty(propiedad);
          }
        } else {
          if (arrastre.tipo === "boton") this.olvidarPosicionPanel();
          this.guardarPosicion(arrastre.tipo);
        }
      }
      if (arrastre.asa.hasPointerCapture?.(evento.pointerId)) arrastre.asa.releasePointerCapture(evento.pointerId);
    }

    ajustarPanel() {
      if (this.panel.hidden) return;
      if (this.posicionPanel) {
        this.restaurarPosicion("panel");
        return;
      }
      const boton = this.anclaPanel, panel = this.panel.getBoundingClientRect();
      const margen = 8, separacion = 12;
      const limitarX = (x) => Math.max(margen, Math.min(x, window.innerWidth - panel.width - margen));
      const limitarY = (y) => Math.max(margen, Math.min(y, window.innerHeight - panel.height - margen));
      let x = limitarX(boton.right - panel.width), y = boton.top - panel.height - separacion;
      if (y < margen) {
        y = boton.bottom + separacion;
        if (y + panel.height > window.innerHeight - margen) {
          y = limitarY(boton.top - panel.height / 2);
          if (boton.left - separacion - panel.width >= margen) x = boton.left - separacion - panel.width;
          else if (boton.right + separacion + panel.width <= window.innerWidth - margen) x = boton.right + separacion;
        }
      }
      Object.assign(this.panel.style, { left: `${limitarX(x)}px`, top: `${limitarY(y)}px`, right: "auto", bottom: "auto" });
    }

    ocupado(valor) {
      this.actualizarControles();
      this.cancelarBoton.hidden = !valor;
      this.estado.textContent = valor ? "Preparando respuesta… La primera consulta puede tardar más." : "";
    }

    actualizarControles() {
      const ocupado = Boolean(this.peticion || this.dictado?.activo);
      this.entrada.readOnly = ocupado;
      this.enviarBoton.disabled = ocupado;
      if (this.dictado) {
        this.dictado.bloqueado = Boolean(this.peticion);
        this.dictado.actualizar();
      }
    }

    agregar(rol, texto) {
      const mensaje = document.createElement("article");
      mensaje.className = `ju-chat-mensaje ju-chat-${rol}`;
      const autor = document.createElement("strong");
      autor.textContent = rol === "user" ? "Tú" : "Asistente";
      const contenido = document.createElement("p");
      contenido.textContent = texto;
      mensaje.append(autor, contenido);
      this.mensajes.appendChild(mensaje);
      this.mensajes.scrollTop = this.mensajes.scrollHeight;
      return mensaje;
    }

    reiniciar() {
      this.dictado.cancelar();
      this.peticion?.abort();
      this.peticion = null;
      this.historial = [];
      this.mensajes.replaceChildren();
      this.entrada.value = "";
      this.error.hidden = true;
      this.ocupado(false);
      this.estado.textContent = "Nueva conversación iniciada.";
      this.entrada.focus();
    }

    validarAccion(accion) {
      if (accion == null) return null;
      const datos = accion.datos;
      if (accion.tipo !== "preparar_cliente" || !datos || typeof datos !== "object" ||
          Array.isArray(datos) || Object.keys(datos).length !== camposCliente.length ||
          camposCliente.some((campo) => typeof datos[campo] !== "string" ||
            datos[campo].length > (campo === "observaciones" ? 4000 : 1000))) {
        throw new Error("El asistente devolvió un borrador incorrecto. Vuelve a intentarlo.");
      }
      return Object.fromEntries(camposCliente.map((campo) => [campo, datos[campo].trim()]));
    }

    agregarBorrador(nodo, datos) {
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "ju-btn secondary ju-chat-revisar";
      boton.textContent = "Revisar nuevo cliente";
      boton.addEventListener("click", () => {
        try {
          const app = window.Alfredo.iu.aplicacion;
          if (!app?.estado.modulos.clientes) throw new Error("Espera a que termine de cargar la aplicación y vuelve a intentarlo.");
          if (document.querySelector("#juDrawer.abierto, #juModal.abierto")) {
            throw new Error("Termina o cierra el formulario abierto antes de revisar este borrador.");
          }
          this.mostrar(false);
          app.cambiarModulo("clientes");
          app.drawer.abrirCrear();
          const formulario = document.querySelector("#juDrawerForm");
          for (const campo of camposCliente) {
            const valor = campo === "telefono" ? window.Alfredo.iu.Utilidades.formatearTelefono(datos[campo]) : datos[campo];
            formulario.elements.namedItem(campo).value = valor;
          }
          const aviso = document.createElement("p");
          aviso.className = "ju-form-full ju-chat-borrador";
          aviso.textContent = "Borrador preparado por IA. Revisa los datos y completa los campos obligatorios antes de guardar. Todavía no se ha creado ningún cliente.";
          formulario.prepend(aviso);
          formulario.querySelector('[type="submit"]').textContent = "Guardar cliente";
          document.querySelector("#juDrawerMode").textContent = "BORRADOR IA";
          boton.disabled = true;
          boton.textContent = "Borrador abierto para revisión";
        } catch (error) {
          this.error.textContent = error.message;
          this.error.hidden = false;
        }
      });
      nodo.appendChild(boton);
    }

    async enviar() {
      if (this.peticion) return;
      if (this.dictado.activo) { this.dictado.detener(); return; }
      const mensaje = this.entrada.value.trim();
      if (!mensaje) return;
      this.error.hidden = true;
      if (mensaje.length > 4000) {
        this.error.textContent = "El mensaje admite un máximo de 4000 caracteres.";
        this.error.hidden = false;
        return;
      }
      const controlador = new AbortController();
      this.peticion = controlador;
      const nodoUsuario = this.agregar("user", mensaje);
      this.ocupado(true);
      const limite = window.setTimeout(() => controlador.abort(), 190000);
      try {
        const respuesta = await fetch("api/chat.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mensaje, historial: this.historial }),
          signal: controlador.signal,
        });
        const tipo = respuesta.headers.get("content-type") || "";
        if (!tipo.includes("application/json")) {
          throw new Error("El servidor no ofrece el chat. Abre la aplicación con npm start o con un servidor PHP con cURL.");
        }
        const datos = await respuesta.json();
        if (!respuesta.ok) {
          throw new Error(typeof datos.respuesta === "string" ? datos.respuesta : "No se pudo obtener la respuesta.");
        }
        if (typeof datos.respuesta !== "string" || !datos.respuesta.trim()) {
          throw new Error("El servidor devolvió una respuesta vacía o incorrecta.");
        }
        if (this.peticion !== controlador) return;
        const borrador = this.validarAccion(datos.accion);
        this.historial.push({ role: "user", content: mensaje }, { role: "assistant", content: datos.respuesta });
        this.historial = this.historial.slice(-12);
        const nodoRespuesta = this.agregar("assistant", datos.respuesta);
        if (borrador) this.agregarBorrador(nodoRespuesta, borrador);
        while (this.mensajes.children.length > 12) this.mensajes.firstElementChild.remove();
        this.entrada.value = "";
      } catch (error) {
        if (this.peticion !== controlador) return;
        nodoUsuario.remove();
        this.error.textContent = controlador.signal.aborted
          ? "Consulta cancelada o tiempo de espera agotado. Puedes volver a enviar el mensaje."
          : error instanceof TypeError
            ? "No se pudo contactar con el servidor del chat. Comprueba que la aplicación sigue abierta con npm start o PHP."
            : error.message;
        this.error.hidden = false;
      } finally {
        window.clearTimeout(limite);
        if (this.peticion === controlador) {
          this.peticion = null;
          this.ocupado(false);
          if (!this.panel.hidden && !this.panel.closest("[inert]") &&
              this.panel.contains(document.activeElement)) this.entrada.focus();
        }
      }
    }
  }

  window.Alfredo.iu.DictadoIU = DictadoIU;
  window.Alfredo.iu.ChatIU = ChatIU;
  document.addEventListener("DOMContentLoaded", () => {
    if (document.querySelector("#chatPanel")) window.Alfredo.iu.chat = new ChatIU();
  });
})();
