/**
 * Alfredo | iu
 * Control principal de la interfaz mediante programación orientada a objetos.
 *
 * Nota sobre el namespace:
 * JavaScript no admite "|" dentro de un identificador. Por ello el namespace
 * técnico equivalente es `Alfredo.iu`.
 */
window.Alfredo = window.Alfredo || {};
window.Alfredo.iu = window.Alfredo.iu || {};

(() => {
  "use strict";

  class DOM {
    static uno(selector, contexto = document) {
      return contexto.querySelector(selector);
    }

    static todos(selector, contexto = document) {
      return [...contexto.querySelectorAll(selector)];
    }
  }

  class Utilidades {
    static hashTexto(texto) {
      let hash = 0;

      for (const caracter of texto) {
        hash = caracter.charCodeAt(0) + ((hash << 5) - hash);
      }

      return Math.abs(hash);
    }

    static colorTexto(texto) {
      return `hsl(${Utilidades.hashTexto(texto) % 360},55%,45%)`;
    }

    static escapar(valor) {
      return String(valor ?? "").replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    }

    static formatearTelefono(valor) {
      const texto = valor.trim();
      const compacto = texto.replace(/[\s().-]/g, "");
      const partes = compacto.match(/^(\+34|0034)?(\d{3})(\d{3})(\d{3})$/);
      // Agrupamos los nueve dígitos nacionales sin añadir un prefijo que no se haya escrito.
      // Otros formatos internacionales o números incompletos se conservan.
      if (!partes) return texto;
      return `${partes[1] ? "+34 " : ""}${partes[2]} ${partes[3]} ${partes[4]}`;
    }
  }

  class OrigenDatos {
    static async cargarJSON(url) {
      const respuesta = await fetch(url);

      if (!respuesta.ok) {
        throw new Error(url);
      }

      return respuesta.json();
    }
  }

  class ModuloDatos {
    constructor(id, origen) {
      this.id = id;
      this.titulo = origen.titulo;
      this.singular = origen.singular;
      this.columnas = origen.columnas;
      this.campos = origen.campos;
      this.registros = origen.registros ?? origen.datos;
      this.clave = `Alfredo.iu.${id}.v1`;
      this.aviso = "";
      try {
        const guardado = window.localStorage.getItem(this.clave);
        if (guardado !== null) {
          const registros = JSON.parse(guardado);
          this.validarRegistros(registros);
          this.registros = registros;
        }
      } catch (error) {
        this.aviso = `No se pudieron recuperar los ${id} guardados. Se muestran los datos iniciales; la copia guardada se conserva hasta que guardes cambios.`;
      }
      this.registros = this.registros.map(registro => this.normalizarRegistro(registro));
    }

    normalizarRegistro(registro) {
      const normalizado = { ...registro };
      for (const campo of this.campos) {
        if (campo.tipo === "tel" && typeof normalizado[campo.nombre] === "string") {
          normalizado[campo.nombre] = Utilidades.formatearTelefono(normalizado[campo.nombre]);
        }
      }
      return normalizado;
    }

    validar(registro) {
      if (!registro || typeof registro !== "object" || Array.isArray(registro)) {
        throw new Error("El registro no es válido.");
      }
      if (!Number.isSafeInteger(registro.id) || registro.id < 1) {
        throw new Error("El identificador no es válido.");
      }
      for (const campo of this.campos) {
        if (campo.nombre === "id") continue;
        const valor = registro[campo.nombre];
        const vacio = valor === undefined || valor === null || valor === "";
        if (campo.requerido && (vacio || (typeof valor === "string" && !valor.trim()))) {
          throw new Error(`Completa el campo ${campo.etiqueta}.`);
        }
        if (vacio) continue;
        if (campo.tipo === "number") {
          if (typeof valor !== "number" || !Number.isFinite(valor) ||
              (campo.min !== undefined && valor < campo.min) ||
              (campo.paso && Math.abs(valor / campo.paso - Math.round(valor / campo.paso)) > 0.000001)) {
            throw new Error(`Revisa ${campo.etiqueta}: introduce un número válido${campo.min !== undefined ? `, como mínimo ${campo.min}` : ""}.`);
          }
        } else if (campo.tipo === "checkbox") {
          if (typeof valor !== "boolean") throw new Error(`Revisa ${campo.etiqueta}.`);
        } else {
          if (typeof valor !== "string") throw new Error(`Revisa ${campo.etiqueta}.`);
          if (campo.tipo === "select" && !campo.opciones.includes(valor)) throw new Error(`Selecciona ${campo.etiqueta}.`);
          if (campo.tipo === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) throw new Error("Introduce un email válido.");
          if (campo.tipo === "url") {
            let url;
            try { url = new URL(valor); } catch { throw new Error("Introduce una dirección web completa (https://...)."); }
            if (!["http:", "https:"].includes(url.protocol)) throw new Error("La web debe empezar por http:// o https://.");
          }
        }
      }
    }

    validarRegistros(registros) {
      if (!Array.isArray(registros)) throw new Error("Los datos guardados no son una lista.");
      const ids = new Set();
      for (const registro of registros) {
        this.validar(registro);
        if (ids.has(registro.id)) throw new Error("Hay identificadores repetidos.");
        ids.add(registro.id);
      }
    }

    guardar(registros) {
      registros = registros.map(registro => this.normalizarRegistro(registro));
      this.validarRegistros(registros);
      this.antesGuardar?.(registros);
      try {
        window.localStorage.setItem(this.clave, JSON.stringify(registros));
      } catch {
        throw new Error("No se han guardado los cambios. Comprueba que el navegador permita el almacenamiento local y tenga espacio disponible.");
      }
      this.registros = registros;
    }

    guardarRegistro(valores, id = null) {
      const anterior = id === null ? null : this.registros.find(registro => registro.id === id);
      if (id !== null && !anterior) throw new Error("El registro ya no existe.");
      const registro = this.normalizarRegistro({
        ...anterior, ...valores,
        id: id ?? Math.max(0, ...this.registros.map(item => item.id)) + 1
      });
      this.guardar(id === null ? [...this.registros, registro] : this.registros.map(item => item.id === id ? registro : item));
      return registro;
    }

    eliminar(id) {
      if (!this.registros.some(registro => registro.id === id)) throw new Error("El registro ya no existe.");
      this.antesEliminar?.(id);
      this.guardar(this.registros.filter(registro => registro.id !== id));
    }
  }

  class EstadoIU {
    constructor() {
      this.menu = [];
      this.entidades = [];
      this.modulos = {};
      this.moduloActivo = "clientes";
      this.seleccion = "Listado";
    }

    get modulo() { return this.modulos[this.moduloActivo] ?? null; }
  }

  class FichaIU {
    static completar(elemento, texto) {
      const ficha = DOM.uno(".ficha", elemento);
      const etiqueta = DOM.uno(".etiqueta", elemento);

      ficha.textContent = texto.charAt(0).toUpperCase();
      ficha.style.background = Utilidades.colorTexto(texto);
      etiqueta.textContent = texto;
    }
  }

  class ToastIU {
    constructor(selectorPila = "#toastStack") {
      this.selectorPila = selectorPila;
      this.iconos = {
        success: "✓",
        info: "i",
        warning: "!",
        danger: "×"
      };
    }

    obtenerPila() {
      let pila = DOM.uno(this.selectorPila);

      if (!pila) {
        pila = document.createElement("div");
        pila.id = this.selectorPila.replace(/^#/, "");
        pila.className = "ju-toast-stack";
        document.body.appendChild(pila);
      }

      return pila;
    }

    mostrar(tipo = "info", titulo = "Información", texto = "Operación realizada") {
      const pila = this.obtenerPila();
      const toast = document.createElement("article");

      toast.className = `ju-toast is-${tipo}`;
      toast.innerHTML = `
        <div class="ju-toast-icon">${this.iconos[tipo] || "i"}</div>
        <div>
          <p class="ju-toast-title">${Utilidades.escapar(titulo)}</p>
          <p class="ju-toast-text">${Utilidades.escapar(texto)}</p>
        </div>
        <button class="ju-toast-close" type="button">×</button>
      `;

      const cerrar = () => {
        toast.classList.add("is-leaving");
        setTimeout(() => toast.remove(), 240);
      };

      DOM.uno("button", toast).addEventListener("click", cerrar);
      pila.appendChild(toast);
      setTimeout(cerrar, 5000);
    }
  }

  class ModalIU {
    constructor() {
      this.capa = DOM.uno("#juModal");
      this.titulo = DOM.uno("#juModalTitle");
      this.cuerpo = DOM.uno("#juModalBody");
      DOM.todos("[data-modal-close]", this.capa).forEach((nodo) => nodo.addEventListener("click", () => this.cerrar()));
    }
    abrir(titulo, contenido) {
      this.titulo.textContent = titulo;
      this.cuerpo.innerHTML = contenido;
      this.capa.classList.add("abierto");
      this.capa.setAttribute("aria-hidden", "false");
    }
    cerrar() {
      this.capa.classList.remove("abierto");
      this.capa.setAttribute("aria-hidden", "true");
    }
  }

  class DrawerIU {
    constructor(aplicacion) {
      this.aplicacion = aplicacion;
      this.panel = DOM.uno("#juDrawer");
      this.overlay = DOM.uno("#juDrawerOverlay");
      this.cuerpo = DOM.uno("#juDrawerBody");
      this.modo = DOM.uno("#juDrawerMode");
      this.titulo = DOM.uno("#juDrawerTitle");
      this.resizer = DOM.uno("#juDrawerResizer");
      this.anchoMinimo = 300;
      // El máximo real se calcula siempre como el 50% del viewport.
      this.anchoMaximo = () => Math.max(this.anchoMinimo, window.innerWidth * 0.5);
      DOM.uno("#juDrawerClose").addEventListener("click", () => this.cerrar());
      this.overlay.addEventListener("click", () => this.cerrar());
      this.resizer.addEventListener("pointerdown", (e) => this.iniciarRedimension(e));
      window.addEventListener("resize", () => this.ajustarAlViewport());
      this.actualizarColumnasFormulario();
    }
    abrirCrear() { this.renderFormulario("create", null); }
    abrirActualizar(registro) { this.renderFormulario("update", registro); }
    renderFormulario(modo, registro) {
      const modulo = this.aplicacion.estado.modulo;
      if (!modulo) return;
      if (modulo.id === "pedidos") {
        new window.Alfredo.iu.FormularioPedido(this, modulo, registro).render();
        return;
      }
      const esCrear = modo === "create";
      this.modo.textContent = esCrear ? "CREAR" : "ACTUALIZAR";
      this.titulo.textContent = esCrear ? `Nuevo ${modulo.singular}` : `Editar ${registro.nombre || "registro"}`;
      const campos = modulo.campos;
      this.cuerpo.innerHTML = `<article class="ju-card"><form id="juDrawerForm" class="ju-form-grid">${campos.map(c => this.campoHTML(c, registro)).join("")}<p id="juFormError" class="ju-form-full ju-form-error" role="alert" hidden></p><div class="ju-form-full ju-button-row"><button class="ju-btn" type="submit">${esCrear ? "Crear" : "Guardar cambios"}</button><button class="ju-btn secondary" type="button" id="juDrawerCancel">Cancelar</button>${esCrear ? "" : '<button class="ju-btn danger" type="button" id="juDrawerDelete">Eliminar</button>'}</div></form></article>`;
      DOM.uno("#juDrawerCancel").addEventListener("click", () => this.cerrar());
      DOM.uno("#juDrawerDelete")?.addEventListener("click", () => this.aplicacion.confirmarEliminar(registro, modulo));
      DOM.uno("#juDrawerForm").addEventListener("change", evento => {
        if (evento.target.type === "tel") {
          evento.target.value = Utilidades.formatearTelefono(evento.target.value);
        }
      });
      DOM.uno("#juDrawerForm").addEventListener("submit", (e) => {
        e.preventDefault();
        if (!e.currentTarget.reportValidity()) return;
        const fd = new FormData(e.currentTarget);
        const nuevo = {};
        campos.forEach(c => {
          if (c.nombre === "id") return;
          if (c.tipo === "checkbox") nuevo[c.nombre] = fd.has(c.nombre);
          else if (c.tipo === "number") nuevo[c.nombre] = fd.get(c.nombre) === "" ? "" : Number(fd.get(c.nombre));
          else nuevo[c.nombre] = String(fd.get(c.nombre) ?? "").trim();
        });
        try {
          modulo.guardarRegistro(nuevo, esCrear ? null : registro.id);
          this.aplicacion.mostrarListado();
          this.aplicacion.toast.mostrar("success", esCrear ? "Registro creado" : "Cambios guardados", `El ${modulo.singular} se ha guardado en este navegador.`);
          this.cerrar();
        } catch (error) {
          const mensaje = DOM.uno("#juFormError");
          mensaje.textContent = error.message;
          mensaje.hidden = false;
        }
      });
      this.mostrar();
    }
    mostrar() {
      this.ajustarAlViewport();
      this.actualizarColumnasFormulario();
      this.panel.classList.add("abierto"); this.overlay.classList.add("abierto");
      this.panel.setAttribute("aria-hidden", "false"); this.overlay.setAttribute("aria-hidden", "false");
      setTimeout(() => DOM.uno("input,select,textarea", this.cuerpo)?.focus(), 320);
    }
    campoHTML(c, registro) {
      const valor = registro ? registro[c.nombre] ?? "" : c.defecto ?? "";
      const esc = Utilidades.escapar;
      const nombre = esc(c.nombre);
      const etiqueta = esc(c.etiqueta);
      const requerido = c.requerido ? " required" : "";
      if (c.nombre === "id") return `<label><span>ID</span><input value="${registro ? esc(registro.id) : "Automático"}" readonly></label>`;
      if (c.tipo === "textarea") return `<label class="ju-form-full"><span>${etiqueta}</span><textarea name="${nombre}"${requerido}>${esc(valor)}</textarea></label>`;
      if (c.tipo === "select") return `<label><span>${etiqueta}</span><select name="${nombre}"${requerido}><option value="">Selecciona…</option>${(c.opciones||[]).map(o=>`<option value="${esc(o)}"${o===valor?' selected':''}>${esc(o)}</option>`).join("")}</select></label>`;
      if (c.tipo === "checkbox") return `<label class="ju-check ju-form-full"><input type="checkbox" name="${nombre}"${valor?' checked':''}><span>${etiqueta}</span></label>`;
      const limites = `${c.min !== undefined ? ` min="${c.min}"` : ""}${c.paso !== undefined ? ` step="${c.paso}"` : ""}`;
      return `<label><span>${etiqueta}</span><input name="${nombre}" type="${esc(c.tipo || 'text')}" value="${esc(valor)}"${requerido}${limites}></label>`;
    }
    cerrar() { this.panel.classList.remove("abierto"); this.overlay.classList.remove("abierto"); this.panel.setAttribute("aria-hidden","true"); this.overlay.setAttribute("aria-hidden","true"); }
    iniciarRedimension(e) {
      e.preventDefault(); const inicio=e.clientX, anchoInicial=this.panel.getBoundingClientRect().width;
      this.resizer.setPointerCapture(e.pointerId); document.body.classList.add("redimensionando-drawer"); this.panel.style.transition="none";
      const mover=(ev)=>{
        const ancho=Math.min(this.anchoMaximo(),Math.max(this.anchoMinimo,anchoInicial+(inicio-ev.clientX)));
        this.panel.style.setProperty("--drawer-width",`${ancho}px`);
        this.actualizarColumnasFormulario(ancho);
      };
      const fin=()=>{ this.resizer.removeEventListener("pointermove",mover); this.panel.style.transition=""; document.body.classList.remove("redimensionando-drawer"); };
      this.resizer.addEventListener("pointermove",mover); this.resizer.addEventListener("pointerup",fin,{once:true}); this.resizer.addEventListener("pointercancel",fin,{once:true});
    }
    actualizarColumnasFormulario(ancho = this.panel.getBoundingClientRect().width) {
      // <= 25% del navegador: una columna. > 25% y hasta 50%: dos columnas.
      this.panel.classList.toggle("ju-drawer-dos-columnas", ancho > window.innerWidth * 0.25);
    }
    ajustarAlViewport() {
      const actual = this.panel.getBoundingClientRect().width;
      const maximo = this.anchoMaximo();
      if (actual > maximo) {
        this.panel.style.setProperty("--drawer-width", `${maximo}px`);
        this.actualizarColumnasFormulario(maximo);
      } else {
        this.actualizarColumnasFormulario(actual);
      }
    }
  }

  class GestorColumnas {
    constructor() {
      this.anchoMinimo = 100;
      this.anchoMaximo = 600;
    }

    activar() {
      this.activarMinimizacion();
      this.activarSeparadores();
    }

    activarMinimizacion() {
      DOM.todos(".minimizar").forEach((boton) => {
        const columna = boton.closest("nav,section");
        columna.dataset.ancho = columna.getBoundingClientRect().width;

        boton.addEventListener("click", () => {
          this.alternarColumna(columna, boton);
        });
      });
    }

    alternarColumna(columna, boton) {
      if (columna.classList.contains("compacto")) {
        const ancho = parseFloat(columna.dataset.ancho) || 250;

        columna.classList.remove("compacto");
        columna.style.flexBasis = `${ancho}px`;
        columna.style.width = `${ancho}px`;
        boton.textContent = "◀";
        return;
      }

      columna.dataset.ancho = columna.getBoundingClientRect().width;
      columna.style.flexBasis = `${columna.dataset.ancho}px`;
      columna.style.width = `${columna.dataset.ancho}px`;

      void columna.offsetWidth;

      columna.classList.add("compacto");
      boton.textContent = "▶";
    }

    activarSeparadores() {
      DOM.todos(".separador").forEach((separador) => {
        separador.addEventListener("pointerdown", (evento) => {
          this.iniciarRedimension(separador, evento);
        });
      });
    }

    iniciarRedimension(separador, evento) {
      evento.preventDefault();

      const columna = separador.previousElementSibling;

      if (!columna || columna.classList.contains("compacto")) {
        return;
      }

      const inicio = evento.clientX;
      const anchoInicial = columna.getBoundingClientRect().width;

      columna.style.transition = "none";
      document.body.classList.add("redimensionando");
      separador.setPointerCapture(evento.pointerId);

      const mover = (eventoMovimiento) => {
        const ancho = Math.min(
          this.anchoMaximo,
          Math.max(this.anchoMinimo, anchoInicial + eventoMovimiento.clientX - inicio)
        );

        columna.style.width = `${ancho}px`;
        columna.style.flexBasis = `${ancho}px`;
        columna.dataset.ancho = ancho;
      };

      const terminar = () => {
        separador.removeEventListener("pointermove", mover);
        columna.style.transition = "";
        document.body.classList.remove("redimensionando");
      };

      separador.addEventListener("pointermove", mover);
      separador.addEventListener("pointerup", terminar, { once: true });
      separador.addEventListener("pointercancel", terminar, { once: true });
    }
  }

  class AplicacionIU {
    constructor() {
      this.estado = new EstadoIU();
      this.toast = new ToastIU();
      this.columnas = new GestorColumnas();
      this.modal = null;
      this.drawer = null;
    }

    async iniciar() {
      try {
        const [menu, entidades, clientes, productos, pedidos] = await Promise.all([
          OrigenDatos.cargarJSON("data/menu.json"),
          OrigenDatos.cargarJSON("data/entidades.json"),
          OrigenDatos.cargarJSON("data/clientes.json"),
          OrigenDatos.cargarJSON("data/productos.json"),
          OrigenDatos.cargarJSON("data/pedidos.json")
        ]);
        this.estado.menu = menu;
        this.estado.entidades = entidades;
        this.estado.modulos = {
          clientes: new ModuloDatos("clientes", clientes),
          productos: new ModuloDatos("productos", productos)
        };
        this.estado.modulos.pedidos = new window.Alfredo.iu.ModuloPedidos(
          pedidos, this.estado.modulos.clientes, this.estado.modulos.productos
        );
        this.modal = new ModalIU();
        this.drawer = new DrawerIU(this);
        this.columnas.activar();
        this.activarEventos();
        this.cambiarModulo(window.location.hash.slice(1) || "clientes");
        Object.values(this.estado.modulos).forEach(modulo => {
          if (modulo.aviso) this.toast.mostrar("warning", "Revisa el almacenamiento", modulo.aviso);
        });
      } catch (error) {
        DOM.uno("#escenario").innerHTML = `
          <div class="panel">
            <h2>No se pudieron cargar los orígenes de datos</h2>
            <p>Sirve esta carpeta mediante HTTP, por ejemplo: <code>python3 -m http.server 8000</code></p>
            <pre>${Utilidades.escapar(error.message)}</pre>
          </div>
        `;
      }
    }

    cambiarModulo(id) {
      if (!this.estado.menu.some(item => item.id === id)) id = "clientes";
      this.drawer.cerrar();
      this.modal.cerrar();
      this.estado.moduloActivo = id;
      this.estado.seleccion = "Listado";
      const modulo = this.estado.modulo;
      const buscador = DOM.uno("#buscador");
      buscador.value = "";
      buscador.disabled = !modulo;
      buscador.placeholder = modulo ? `Buscar en ${id}…` : "Búsqueda no disponible";
      buscador.setAttribute("aria-label", buscador.placeholder);
      const nuevo = DOM.uno("#nuevo");
      nuevo.disabled = !modulo;
      nuevo.textContent = modulo ? `+ Nuevo ${modulo.singular}` : "+ Nuevo";
      document.title = `Alfredo | ${this.estado.menu.find(item => item.id === id).texto}`;
      this.renderMenu();
      this.renderEntidades();
      if (modulo) this.mostrarTabla();
      else this.mostrarInformacion();
    }

    mostrarListado() {
      this.estado.seleccion = "Listado";
      this.renderEntidades();
      this.mostrarTabla(DOM.uno("#buscador").value);
    }

    mostrarInformacion() {
      const escenario = DOM.uno("#escenario");
      escenario.innerHTML = `<article class="ju-card"><h2>Configuración · Almacenamiento</h2><p>Los cambios de Clientes, Productos y Pedidos se guardan en este navegador. Al recargar se recuperan automáticamente.</p><p>${Object.values(this.estado.modulos).map(modulo => `${Utilidades.escapar(modulo.titulo)}: <strong>${modulo.registros.length}</strong>`).join(" · ")}</p><p>Los archivos JSON aportan los datos iniciales. Los cambios locales no modifican esos archivos ni se comparten con otros navegadores.</p><p>Los pedidos confirmados reservan unidades del stock total. Cancelarlos, pasarlos a pendiente o eliminarlos libera esas unidades.</p></article>`;
    }

    confirmarEliminar(registro, modulo = this.estado.modulo) {
      if (!modulo) return;
      this.modal.abrir(`Eliminar ${modulo.singular}`, `<p>¿Quieres eliminar <strong>${Utilidades.escapar(registro.nombre)}</strong> (ID ${registro.id})?</p><p>Esta acción no se puede deshacer.</p><p id="juDeleteError" role="alert" class="ju-form-error" hidden></p><div class="ju-button-row"><button type="button" class="ju-btn secondary" id="juDeleteCancel">Cancelar</button><button type="button" class="ju-btn danger" id="juDeleteConfirm">Eliminar</button></div>`);
      DOM.uno("#juDeleteCancel").addEventListener("click", () => this.modal.cerrar());
      DOM.uno("#juDeleteConfirm").addEventListener("click", () => {
        try {
          modulo.eliminar(registro.id);
          this.drawer.cerrar();
          this.modal.cerrar();
          this.mostrarListado();
          this.toast.mostrar("success", "Registro eliminado", `El ${modulo.singular} se ha eliminado.`);
        } catch (error) {
          const mensaje = DOM.uno("#juDeleteError");
          mensaje.textContent = error.message;
          mensaje.hidden = false;
        }
      });
      DOM.uno("#juDeleteCancel").focus();
    }

    renderMenu() {
      const contenedor = DOM.uno("#navegacion .contenido-columna");
      contenedor.innerHTML = "";

      this.estado.menu.forEach((elemento, indice) => {
        const nodo = DOM.uno("#tpl-nav").content.cloneNode(true);
        const enlace = DOM.uno("a", nodo);

        FichaIU.completar(enlace, elemento.texto);
        enlace.href = elemento.url;
        enlace.classList.toggle("activo", elemento.id === this.estado.moduloActivo);
        if (elemento.id === this.estado.moduloActivo) enlace.setAttribute("aria-current", "page");
        enlace.dataset.indice = indice;

        enlace.addEventListener("click", (evento) => {
          evento.preventDefault();
          if (window.location.hash === elemento.url) this.cambiarModulo(elemento.id);
          else window.location.hash = elemento.url;
        });

        contenedor.appendChild(nodo);
      });
    }

    renderEntidades() {
      const contenedor = DOM.uno("#entidades .contenido-columna");
      contenedor.innerHTML = "";
      if (!this.estado.modulo) return;

      this.estado.entidades.forEach((elemento, indice) => {
        const nodo = DOM.uno("#tpl-card").content.cloneNode(true);
        const articulo = DOM.uno("article", nodo);

        FichaIU.completar(articulo, elemento.texto);
        articulo.classList.toggle("activo", elemento.texto === this.estado.seleccion);
        articulo.dataset.indice = indice;
        articulo.tabIndex = 0;
        articulo.setAttribute("role", "button");
        articulo.setAttribute("aria-label", elemento.texto);

        articulo.addEventListener("click", () => {
          if (elemento.texto === "Nuevo registro") {
            this.drawer.abrirCrear();
            return;
          }
          this.estado.seleccion = elemento.texto;
          this.renderEntidades();
          this.mostrarVista(elemento.texto);
        });

        articulo.addEventListener("keydown", evento => {
          if (evento.key === "Enter" || evento.key === " ") {
            evento.preventDefault();
            articulo.click();
          }
        });

        articulo.addEventListener("dragstart", (evento) => {
          evento.dataTransfer.setData("text/plain", elemento.texto);
        });

        contenedor.appendChild(nodo);
      });
    }

    mostrarVista(vista) {
      if (vista === "Nuevo registro") {
        this.mostrarListado();
        this.drawer.abrirCrear();
      } else if (vista === "Elemento" || vista === "Formulario") {
        this.mostrarFormularioUI();
      } else if (vista === "Login") {
        this.mostrarLoginDemo();
      } else if (vista === "Toasts") {
        this.mostrarToastsDemo();
      } else if (vista === "Modal / paneles") {
        this.mostrarModalPanelesDemo();
      } else {
        this.mostrarListado();
      }
    }

    mostrarTabla(filtro = "") {
      const datos = this.estado.modulo;
      if (!datos) return;
      const registros = datos.registros.filter((registro) =>
        JSON.stringify(registro)
          .toLowerCase()
          .includes(filtro.toLowerCase())
      );
      const escenario = DOM.uno("#escenario");
      const tabla = document.createElement("table");

      escenario.innerHTML = "";
      tabla.innerHTML = `
        <caption>${Utilidades.escapar(datos.titulo)}</caption>
        <thead>
          <tr>${datos.columnas.map((columna) => `<th scope="col">${Utilidades.escapar(columna.etiqueta)}</th>`).join("")}<th scope="col">Acciones</th></tr>
        </thead>
        <tbody></tbody>
        <tfoot>
          <tr>
            <th colspan="${datos.columnas.length}" scope="row">Total${filtro ? " de resultados" : ""}</th>
            <td>${registros.length}</td>
          </tr>
        </tfoot>
      `;

      const cuerpo = DOM.uno("tbody", tabla);
      if (!registros.length) {
        const fila = cuerpo.insertRow();
        const celda = fila.insertCell();
        celda.colSpan = datos.columnas.length + 1;
        celda.textContent = filtro ? "No hay resultados para esta búsqueda." : `Todavía no hay ${datos.id}. Añade el primero con el botón Nuevo.`;
      }

      registros.forEach((registro) => {
        const fila = DOM.uno("#tpl-fila").content.cloneNode(true).querySelector("tr");

        datos.columnas.forEach((columna) => {
          const celda = document.createElement("td");
          let valor = registro[columna.campo];
          if (datos.id === "productos" && this.estado.modulos.pedidos) {
            if (columna.campo === "reservado") valor = this.estado.modulos.pedidos.reservado(registro.id);
            if (columna.campo === "stock_disponible") valor = this.estado.modulos.pedidos.disponible(registro.id);
          }
          celda.textContent = columna.formato === "moneda" && typeof valor === "number"
            ? new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(valor)
            : typeof valor === "boolean" ? (valor ? "Sí" : "No") : valor ?? "";
          fila.appendChild(celda);
        });

        fila.classList.add("ju-row-editable");
        fila.title = "Clic para editar en el panel lateral";
        fila.addEventListener("click", () => this.drawer.abrirActualizar(registro));
        const acciones = document.createElement("td");
        const botones = document.createElement("div");
        botones.className = "ju-table-actions";
        for (const accion of ["Editar", "Eliminar"]) {
          const boton = document.createElement("button");
          boton.type = "button";
          boton.className = `ju-btn ${accion === "Eliminar" ? "danger" : "secondary"}`;
          boton.textContent = accion;
          boton.setAttribute("aria-label", `${accion} ${registro.nombre} (ID ${registro.id})`);
          boton.addEventListener("click", evento => {
            evento.stopPropagation();
            if (accion === "Editar") this.drawer.abrirActualizar(registro);
            else this.confirmarEliminar(registro);
          });
          botones.appendChild(boton);
        }
        acciones.appendChild(botones);
        fila.appendChild(acciones);
        cuerpo.appendChild(fila);
      });

      escenario.appendChild(tabla);
    }

    mostrarFormularioUI() {
      const escenario = DOM.uno("#escenario");

      escenario.innerHTML = `
        <article class="ju-card">
          <h2>Librería · Formularios</h2>
          <p>Controles reutilizables con el lenguaje visual alfredo-iu.</p>
          <form id="demoForm" class="ju-form-grid">
            <label>
              <span>Nombre</span>
              <input name="nombre" required>
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" required>
            </label>
            <label>
              <span>Tipo</span>
              <select name="tipo">
                <option>Cliente</option>
                <option>Proveedor</option>
                <option>Alumno</option>
              </select>
            </label>
            <label>
              <span>Fecha</span>
              <input name="fecha" type="date">
            </label>
            <label class="ju-form-full">
              <span>Descripción</span>
              <textarea name="descripcion"></textarea>
            </label>
            <label class="ju-check ju-form-full">
              <input type="checkbox" name="activo">
              <span>Registro activo</span>
            </label>
            <div class="ju-form-full ju-button-row">
              <button class="ju-btn" type="submit">Guardar</button>
              <button class="ju-btn secondary" type="reset">Limpiar</button>
            </div>
          </form>
        </article>
      `;

      DOM.uno("#demoForm").addEventListener("submit", (evento) => {
        evento.preventDefault();
        this.toast.mostrar(
          "success",
          "Formulario guardado",
          "El evento submit se ha capturado correctamente."
        );
      });
    }

    mostrarLoginDemo() {
      const escenario = DOM.uno("#escenario");

      escenario.innerHTML = `
        <div class="ju-login-layout" style="margin:auto">
          <article class="ju-login-side">
            <div class="ju-login-brand">
              <img src="img/alfredo.svg" alt="">
              <h1 class="ju-login-product-title">Alfredo | interfaz integrada</h1>
              <p>Pantalla de acceso basada en alfredo-iu.</p>
            </div>
          </article>
          <article class="ju-login-card">
            <h2>Iniciar sesión</h2>
            <form id="loginDemo" class="ju-form-grid">
              <label class="ju-form-full">
                <span>Email</span>
                <input type="email" required>
              </label>
              <label class="ju-form-full">
                <span>Contraseña</span>
                <input type="password" required>
              </label>
              <label class="ju-check ju-form-full">
                <input type="checkbox">
                <span>Mantener sesión</span>
              </label>
              <div class="ju-form-full ju-login-actions">
                <button class="ju-btn">Entrar</button>
                <a class="ju-text-link" href="login.html">Abrir pantalla completa</a>
              </div>
            </form>
          </article>
        </div>
      `;

      DOM.uno("#loginDemo").addEventListener("submit", (evento) => {
        evento.preventDefault();
        this.toast.mostrar(
          "success",
          "Acceso simulado",
          "Login capturado como componente reutilizable."
        );
      });
    }

    mostrarToastsDemo() {
      const escenario = DOM.uno("#escenario");

      escenario.innerHTML = `
        <article class="ju-card">
          <h2>Librería · Toasts</h2>
          <p>Mensajes emergentes reutilizables con autocierre y cierre manual.</p>
          <div class="ju-button-row">
            <button class="ju-btn" data-t="success">Éxito</button>
            <button class="ju-btn secondary" data-t="info">Información</button>
            <button class="ju-btn secondary" data-t="warning">Aviso</button>
            <button class="ju-btn secondary" data-t="danger">Error</button>
          </div>
        </article>
      `;

      const titulos = {
        success: "Correcto",
        info: "Información",
        warning: "Revisar",
        danger: "Error"
      };

      DOM.todos("[data-t]", escenario).forEach((boton) => {
        boton.addEventListener("click", () => {
          this.toast.mostrar(
            boton.dataset.t,
            titulos[boton.dataset.t],
            "Ejemplo de mensaje emergente de la librería."
          );
        });
      });
    }

    mostrarModalPanelesDemo() {
      const escenario = DOM.uno("#escenario");
      escenario.innerHTML = `<article class="ju-card"><h2>Librería · Modal y panel lateral</h2><p>Dos patrones reutilizables para acciones que no deben sustituir el contenido del escenario.</p><div class="ju-showcase-grid"><div class="ju-showcase-box"><h3>Ventana modal</h3><p>Bloquea temporalmente la interfaz para confirmaciones, avisos o contenido focal.</p><button class="ju-btn" id="demoModal">Abrir modal</button></div><div class="ju-showcase-box"><h3>Panel lateral</h3><p>Entra desde la derecha, mantiene visible el contexto y puede redimensionarse arrastrando su borde izquierdo.</p><button class="ju-btn" id="demoDrawer">Abrir panel de creación</button></div></div></article>`;
      DOM.uno("#demoModal").addEventListener("click", () => {
        this.modal.abrir("Ejemplo de ventana modal", `<p>Esta es la nueva ventana modal reutilizable de <strong>Alfredo | iu</strong>.</p><p>Se puede cerrar con el botón ×, haciendo clic fuera o pulsando Escape.</p><div class="ju-button-row"><button class="ju-btn" id="modalAceptar">Aceptar</button></div>`);
        DOM.uno("#modalAceptar").addEventListener("click", () => this.modal.cerrar());
      });
      DOM.uno("#demoDrawer").addEventListener("click", () => this.drawer.abrirCrear());
    }

    activarEventos() {
      window.addEventListener("hashchange", () => this.cambiarModulo(window.location.hash.slice(1)));
      DOM.uno("#buscador").addEventListener("input", (evento) => {
        if (!this.estado.modulo) return;
        this.estado.seleccion = "Listado";
        this.renderEntidades();
        this.mostrarTabla(evento.target.value);
      });

      DOM.uno("#nuevo").addEventListener("click", () => {
        this.drawer.abrirCrear();
      });

      const escenario = DOM.uno("#escenario");

      escenario.addEventListener("dragover", (evento) => {
        evento.preventDefault();
        escenario.classList.add("drag-over");
      });

      escenario.addEventListener("dragleave", () => {
        escenario.classList.remove("drag-over");
      });

      escenario.addEventListener("drop", (evento) => {
        evento.preventDefault();
        escenario.classList.remove("drag-over");

        const vista = evento.dataTransfer.getData("text/plain");
        if (!this.estado.modulo || !this.estado.entidades.some(item => item.texto === vista)) return;
        this.estado.seleccion = vista;
        this.renderEntidades();
        this.mostrarVista(vista);
      });

      document.addEventListener("keydown", (evento) => {
        if (evento.key === "Escape") {
          this.drawer?.cerrar();
          this.modal?.cerrar();
        }
      });
    }
  }

  window.Alfredo.iu.DOM = DOM;
  window.Alfredo.iu.Utilidades = Utilidades;
  window.Alfredo.iu.OrigenDatos = OrigenDatos;
  window.Alfredo.iu.ModuloDatos = ModuloDatos;
  window.Alfredo.iu.EstadoIU = EstadoIU;
  window.Alfredo.iu.FichaIU = FichaIU;
  window.Alfredo.iu.ToastIU = ToastIU;
  window.Alfredo.iu.ModalIU = ModalIU;
  window.Alfredo.iu.DrawerIU = DrawerIU;
  window.Alfredo.iu.GestorColumnas = GestorColumnas;
  window.Alfredo.iu.AplicacionIU = AplicacionIU;

  document.addEventListener("DOMContentLoaded", () => {
    window.Alfredo.iu.aplicacion = new AplicacionIU();
    window.Alfredo.iu.aplicacion.iniciar();
  });
})();
