(() => {
  "use strict";
  const { ModuloDatos, DOM, Utilidades } = window.Alfredo.iu;
  const estados = ["pendiente", "confirmado", "cancelado"];
  const moneda = valor => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(valor);

  class ModuloPedidos extends ModuloDatos {
    constructor(origen, clientes, productos) {
      super("pedidos", origen);
      this.clientes = clientes;
      this.productos = productos;
      // El stock reservado se deriva de los pedidos: cada operación escribe una sola clave.
      // Así no quedan pedidos y existencias a medias si falla el almacenamiento.
      clientes.antesGuardar = registros => {
        if (this.registros.some(pedido => !registros.some(cliente => cliente.id === pedido.cliente_id))) {
          throw new Error("No se puede eliminar un cliente con pedidos asociados.");
        }
      };
      productos.antesGuardar = registros => {
        for (const pedido of this.registros) {
          for (const linea of pedido.lineas) {
            if (!registros.some(producto => producto.id === linea.producto_id)) {
              throw new Error("No se puede eliminar un producto con pedidos asociados.");
            }
          }
        }
        for (const producto of registros) {
          if (producto.stock < this.reservado(producto.id)) {
            throw new Error(`El stock total de ${producto.nombre} no puede ser inferior a las ${this.reservado(producto.id)} unidades reservadas.`);
          }
        }
      };
    }

    validar(pedido) {
      super.validar(pedido);
      if (!Number.isSafeInteger(pedido.cliente_id) || pedido.cliente_id < 1 || typeof pedido.cliente !== "string" || !pedido.cliente.trim()) {
        throw new Error("Selecciona un cliente válido.");
      }
      if (!estados.includes(pedido.estado)) throw new Error("Selecciona un estado válido.");
      if (typeof pedido.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(pedido.fecha) ||
          !Number.isFinite(Date.parse(`${pedido.fecha}T12:00:00Z`)) ||
          new Date(`${pedido.fecha}T12:00:00Z`).toISOString().slice(0, 10) !== pedido.fecha) {
        throw new Error("Introduce una fecha válida.");
      }
      if (!Array.isArray(pedido.lineas) || !pedido.lineas.length) throw new Error("Añade al menos un producto.");
      const ids = new Set();
      let total = 0;
      for (const linea of pedido.lineas) {
        if (!linea || !Number.isSafeInteger(linea.producto_id) || linea.producto_id < 1 || typeof linea.nombre !== "string") throw new Error("Selecciona un producto válido.");
        if (ids.has(linea.producto_id)) throw new Error("No repitas un producto: ajusta su cantidad en una sola línea.");
        ids.add(linea.producto_id);
        if (!Number.isSafeInteger(linea.cantidad) || linea.cantidad < 1) throw new Error("Las cantidades deben ser números enteros mayores que cero.");
        if (!Number.isSafeInteger(linea.precio_centimos) || linea.precio_centimos < 0) throw new Error("El precio no es válido.");
        total += linea.precio_centimos * linea.cantidad;
      }
      if (!Number.isSafeInteger(total) || pedido.total !== total / 100) throw new Error("El total del pedido no es válido.");
    }

    reservado(productoId, exceptoId = null) {
      return this.registros.filter(pedido => pedido.estado === "confirmado" && pedido.id !== exceptoId)
        .reduce((total, pedido) => total + pedido.lineas.filter(linea => linea.producto_id === productoId)
          .reduce((cantidad, linea) => cantidad + linea.cantidad, 0), 0);
    }

    disponible(productoId, exceptoId = null) {
      const producto = this.productos.registros.find(item => item.id === productoId);
      return producto ? producto.stock - this.reservado(productoId, exceptoId) : 0;
    }

    precio(productoId, pedido = null) {
      const anterior = pedido?.lineas.find(linea => linea.producto_id === productoId);
      const producto = this.productos.registros.find(item => item.id === productoId);
      return anterior?.precio_centimos ?? Math.round((producto?.precio ?? 0) * 100);
    }

    guardarRegistro(valores, id = null) {
      const anterior = id === null ? null : this.registros.find(pedido => pedido.id === id);
      if (id !== null && !anterior) throw new Error("El pedido ya no existe.");
      const cliente = this.clientes.registros.find(item => item.id === valores.cliente_id);
      if (!cliente) throw new Error("Selecciona un cliente existente.");
      if (!Array.isArray(valores.lineas) || !valores.lineas.length) throw new Error("Añade al menos un producto.");
      const lineas = valores.lineas.map(linea => {
        const producto = this.productos.registros.find(item => item.id === linea.producto_id);
        if (!producto) throw new Error("Uno de los productos ya no existe.");
        const previa = anterior?.lineas.find(item => item.producto_id === producto.id);
        const mantieneReserva = anterior?.estado === "confirmado" && valores.estado === "confirmado" && linea.cantidad <= (previa?.cantidad ?? 0);
        if (valores.estado !== "cancelado") {
          if (!producto.disponible && !mantieneReserva) throw new Error(`${producto.nombre} no está disponible para nuevos pedidos.`);
          const stock = this.disponible(producto.id, id);
          if (linea.cantidad > stock) throw new Error(`Stock insuficiente de ${producto.nombre}: quedan ${stock} unidades disponibles.`);
        }
        return {
          producto_id: producto.id,
          nombre: previa?.nombre ?? producto.nombre,
          cantidad: linea.cantidad,
          precio_centimos: this.precio(producto.id, anterior)
        };
      });
      const registro = {
        nombre: `Pedido #${id ?? Math.max(0, ...this.registros.map(item => item.id)) + 1}`,
        cliente_id: cliente.id,
        cliente: anterior?.cliente_id === cliente.id ? anterior.cliente : `${cliente.nombre} ${cliente.apellidos ?? ""}`.trim(),
        fecha: valores.fecha,
        estado: valores.estado,
        notas: String(valores.notas ?? "").trim(),
        lineas,
        total: lineas.reduce((total, linea) => total + linea.precio_centimos * linea.cantidad, 0) / 100
      };
      return super.guardarRegistro(registro, id);
    }
  }

  class FormularioPedido {
    constructor(drawer, modulo, pedido) {
      this.drawer = drawer;
      this.modulo = modulo;
      this.pedido = pedido;
      const hoy = new Date();
      this.valores = pedido ? { ...pedido, lineas: pedido.lineas.map(linea => ({ ...linea })) } : {
        cliente_id: "", fecha: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`,
        estado: "pendiente", notas: "", lineas: [{ producto_id: "", cantidad: 1 }]
      };
    }

    leerFormulario() {
      const form = DOM.uno("#juPedidoForm");
      this.valores.cliente_id = Number(form.elements.namedItem("cliente_id").value);
      this.valores.fecha = form.elements.namedItem("fecha").value;
      this.valores.estado = form.elements.namedItem("estado").value;
      this.valores.notas = form.elements.namedItem("notas").value;
      this.valores.lineas = DOM.todos(".ju-order-line", form).map(fila => ({
        producto_id: Number(DOM.uno("select", fila).value),
        cantidad: Number(DOM.uno('input[type="number"]', fila).value)
      }));
    }

    actualizarTotal() {
      this.leerFormulario();
      let total = 0;
      this.valores.lineas.forEach((linea, indice) => {
        const precio = this.modulo.precio(linea.producto_id, this.pedido);
        const cantidad = Number.isSafeInteger(linea.cantidad) && linea.cantidad > 0 ? linea.cantidad : 0;
        total += precio * cantidad;
        DOM.uno(`#juLineaTotal${indice}`).textContent = `${moneda(precio / 100)} / ud. · Subtotal: ${moneda(precio * cantidad / 100)}`;
      });
      DOM.uno("#juPedidoTotal").textContent = moneda(total / 100);
    }

    render() {
      const esc = Utilidades.escapar;
      const { valores, modulo, drawer } = this;
      drawer.modo.textContent = this.pedido ? "ACTUALIZAR" : "CREAR";
      drawer.titulo.textContent = this.pedido ? `Editar pedido #${this.pedido.id}` : "Nuevo pedido";
      drawer.cuerpo.innerHTML = `<article class="ju-card"><form id="juPedidoForm" class="ju-form-grid">
        <label class="ju-form-full"><span>Cliente</span><select name="cliente_id" required><option value="">Selecciona un cliente…</option>${modulo.clientes.registros.map(cliente => `<option value="${cliente.id}"${cliente.id === valores.cliente_id ? " selected" : ""}>${esc(`${cliente.nombre} ${cliente.apellidos ?? ""}`.trim())}</option>`).join("")}</select></label>
        <label><span>Fecha</span><input name="fecha" type="date" required value="${esc(valores.fecha)}"></label>
        <label><span>Estado</span><select name="estado">${estados.map(estado => `<option value="${estado}"${estado === valores.estado ? " selected" : ""}>${estado}</option>`).join("")}</select></label>
        <p class="ju-form-full">Los pedidos confirmados reservan stock. Los pendientes no reservan unidades y se vuelven a comprobar al confirmar.</p>
        <fieldset class="ju-fieldset ju-form-full"><legend>Productos</legend>
          ${valores.lineas.map((linea, indice) => `<div class="ju-order-line">
            <label><span>Producto ${indice + 1}</span><select required aria-label="Producto ${indice + 1}"><option value="">Selecciona…</option>${modulo.productos.registros.map(producto => `<option value="${producto.id}"${producto.id === linea.producto_id ? " selected" : ""}${!producto.disponible && producto.id !== linea.producto_id ? " disabled" : ""}>${esc(producto.nombre)} · ${modulo.disponible(producto.id, this.pedido?.id)} ud.${producto.disponible ? "" : " · Fuera de venta"}</option>`).join("")}</select></label>
            <label><span>Cantidad</span><input type="number" min="1" step="1" required value="${esc(linea.cantidad)}" aria-label="Cantidad ${indice + 1}"></label>
            <small class="ju-order-subtotal" id="juLineaTotal${indice}"></small>
            <button type="button" class="ju-btn secondary" data-quitar="${indice}" aria-label="Quitar producto ${indice + 1}">Quitar</button>
          </div>`).join("")}
          <button type="button" id="juPedidoAdd" class="ju-btn secondary">+ Añadir producto</button>
        </fieldset>
        <p class="ju-form-full ju-order-total" aria-live="polite">Total: <strong id="juPedidoTotal"></strong></p>
        <label class="ju-form-full"><span>Notas</span><textarea name="notas">${esc(valores.notas)}</textarea></label>
        <p class="ju-form-full ju-form-error" id="juPedidoError" role="alert" hidden></p>
        <div class="ju-form-full ju-button-row"><button type="submit" class="ju-btn">Guardar pedido</button><button type="button" id="juPedidoCancel" class="ju-btn secondary">Cancelar</button>${this.pedido ? '<button type="button" id="juPedidoDelete" class="ju-btn danger">Eliminar</button>' : ""}</div>
      </form></article>`;
      const form = DOM.uno("#juPedidoForm");
      form.addEventListener("input", () => this.actualizarTotal());
      form.addEventListener("change", () => this.actualizarTotal());
      DOM.uno("#juPedidoAdd").addEventListener("click", () => {
        this.leerFormulario();
        this.valores.lineas.push({ producto_id: "", cantidad: 1 });
        this.render();
      });
      DOM.todos("[data-quitar]", form).forEach(boton => boton.addEventListener("click", () => {
        this.leerFormulario();
        this.valores.lineas.splice(Number(boton.dataset.quitar), 1);
        this.render();
      }));
      DOM.uno("#juPedidoCancel").addEventListener("click", () => drawer.cerrar());
      DOM.uno("#juPedidoDelete")?.addEventListener("click", () => drawer.aplicacion.confirmarEliminar(this.pedido, modulo));
      form.addEventListener("submit", evento => {
        evento.preventDefault();
        if (!form.reportValidity()) return;
        this.leerFormulario();
        try {
          modulo.guardarRegistro(this.valores, this.pedido?.id ?? null);
          drawer.aplicacion.mostrarListado();
          drawer.aplicacion.toast.mostrar("success", "Pedido guardado", "El pedido y la reserva de stock se han actualizado.");
          drawer.cerrar();
        } catch (error) {
          const mensaje = DOM.uno("#juPedidoError");
          mensaje.hidden = false;
          mensaje.textContent = error.message;
        }
      });
      this.actualizarTotal();
      drawer.mostrar();
    }
  }

  window.Alfredo.iu.ModuloPedidos = ModuloPedidos;
  window.Alfredo.iu.FormularioPedido = FormularioPedido;
})();
