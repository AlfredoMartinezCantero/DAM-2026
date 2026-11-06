/* Vistas de gestión. La persistencia y las reglas de negocio viven en los módulos. */
(() => {
  "use strict";
  const iu = window.Alfredo.iu;
  const { DOM, Utilidades } = iu;
  const esc = Utilidades.escapar;
  const moneda = (valor) =>
    new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(valor);
  const numero = (valor) => new Intl.NumberFormat("es-ES").format(valor);
  const normalizar = (valor) =>
    String(valor ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es");
  const trazos = {
    resumen:
      '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    clientes:
      '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5"/>',
    productos:
      '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10 9-5M12 13 3 8m9 5v9M7 5l9 5"/>',
    pedidos:
      '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3"/>',
    identidad:
      '<path d="M4 4h6a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H4V4Zm9 3a3 3 0 0 1 3-3h5v14h-5a3 3 0 0 0-3 3"/>',
    configuracion:
      '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="white"/><circle cx="16" cy="17" r="3" fill="white"/>',
    exportar: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
    grafica: '<path d="M4 3v18h17M8 16v-4m5 4V6m5 10V9"/>',
    componentes:
      '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 10h18M10 10v11"/>',
    aviso: '<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3v1"/>',
  };
  const icono = (id) =>
    `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${trazos[id] ?? trazos.componentes}</svg>`;
  const cabecera = (titulo, descripcion, accion = "") =>
    `<div class="page-heading"><div><span class="eyebrow">Espacio de gestión</span><h1>${esc(titulo)}</h1><p>${esc(descripcion)}</p></div>${accion}</div>`;
  const estadistica = (etiqueta, valor, nota, icon = "resumen") =>
    `<article class="stat-card"><div class="stat-label">${esc(etiqueta)}${icono(icon)}</div><strong class="stat-value">${esc(valor)}</strong><span class="stat-note">${esc(nota)}</span></article>`;

  class Descargas {
    static guardar(nombre, contenido, tipo = "application/json") {
      const url = URL.createObjectURL(
        new Blob([contenido], { type: `${tipo};charset=utf-8` }),
      );
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    static csv(columnas, registros) {
      // Las comillas protegen separadores y saltos de línea. El prefijo evita fórmulas al abrir en Excel.
      const celda = (valor) => {
        let texto = String(valor ?? "");
        if (/^[\s]*[=+@-]/.test(texto)) texto = `'${texto}`;
        return `"${texto.replaceAll('"', '""')}"`;
      };
      return (
        "\uFEFF" +
        [
          columnas.map((c) => c.etiqueta),
          ...registros.map((r) => columnas.map((c) => r[c.campo])),
        ]
          .map((fila) => fila.map(celda).join(";"))
          .join("\r\n")
      );
    }
  }

  class Analitica {
    static meses(pedidos, fin, cantidad = 6) {
      const [anio, mes] = fin.split("-").map(Number);
      return Array.from({ length: cantidad }, (_, indice) => {
        const fecha = new Date(anio, mes - cantidad + indice, 1);
        const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
        const registros = pedidos.filter(
          (p) => p.estado === "confirmado" && p.fecha.startsWith(clave),
        );
        return {
          clave,
          etiqueta: fecha.toLocaleDateString("es-ES", {
            month: "short",
            year: "2-digit",
          }),
          total:
            registros.reduce((suma, p) => suma + Math.round(p.total * 100), 0) /
            100,
          pedidos: registros.length,
        };
      });
    }

    static filtrar(registros, busqueda, campo, valor) {
      const consulta = normalizar(busqueda.trim());
      return registros.filter(
        (registro) =>
          (!valor || String(registro[campo]) === valor) &&
          (!consulta ||
            Object.values(registro).some(
              (dato) =>
                typeof dato !== "object" && normalizar(dato).includes(consulta),
            )),
      );
    }

    static ordenar(registros, campo, direccion) {
      return [...registros].sort((a, b) => {
        const x = a[campo] ?? "",
          y = b[campo] ?? "";
        return (
          (typeof x === "number" && typeof y === "number"
            ? x - y
            : String(x).localeCompare(String(y), "es", {
                numeric: true,
                sensitivity: "base",
              })) * direccion
        );
      });
    }
  }

  class TablaIU {
    constructor(app) {
      this.app = app;
    }

    get estado() {
      this.app.tablas ??= {};
      return (this.app.tablas[this.app.estado.moduloActivo] ??= {
        campo: "id",
        direccion: 1,
        pagina: 1,
        tamano: 10,
        filtro: "",
      });
    }

    registros() {
      const modulo = this.app.estado.modulo;
      return modulo.registros.map((registro) =>
        modulo.id === "productos"
          ? {
              ...registro,
              reservado: this.app.estado.modulos.pedidos.reservado(registro.id),
              stock_disponible: this.app.estado.modulos.pedidos.disponible(
                registro.id,
              ),
            }
          : registro,
      );
    }

    render(busqueda = "") {
      const modulo = this.app.estado.modulo;
      const estado = this.estado;
      const todos = this.registros();
      const campoFiltro =
        modulo.id === "pedidos"
          ? "estado"
          : modulo.id === "productos"
            ? "categoria"
            : "empresa";
      const opciones = [
        ...new Set(todos.map((r) => r[campoFiltro]).filter(Boolean)),
      ].sort();
      const filtrados = Analitica.ordenar(
        Analitica.filtrar(todos, busqueda, campoFiltro, estado.filtro),
        estado.campo,
        estado.direccion,
      );
      const paginas = Math.max(1, Math.ceil(filtrados.length / estado.tamano));
      estado.pagina = Math.min(paginas, Math.max(1, estado.pagina));
      const inicio = (estado.pagina - 1) * estado.tamano;
      const visibles = filtrados.slice(inicio, inicio + estado.tamano);
      const titulos = {
        clientes: [
          "Clientes",
          "La información de tus contactos, en un solo lugar.",
        ],
        productos: [
          "Productos",
          "Catálogo, precios y existencias disponibles.",
        ],
        pedidos: [
          "Pedidos",
          "Gestiona cada pedido y consulta el estado de sus reservas.",
        ],
      };
      const [titulo, descripcion] = titulos[modulo.id];
      const resumen =
        modulo.id === "clientes"
          ? [
              estadistica(
                "Clientes",
                numero(todos.length),
                "Contactos en tu agenda",
                "clientes",
              ),
              estadistica(
                "Empresas",
                numero(
                  new Set(todos.map((r) => r.empresa).filter(Boolean)).size,
                ),
                "Empresas diferentes",
                "clientes",
              ),
              estadistica(
                "Con teléfono",
                numero(todos.filter((r) => r.telefono).length),
                "Contacto telefónico disponible",
                "clientes",
              ),
              estadistica(
                "Con pedidos",
                numero(
                  new Set(
                    this.app.estado.modulos.pedidos.registros.map(
                      (p) => p.cliente_id,
                    ),
                  ).size,
                ),
                "Clientes con historial",
                "pedidos",
              ),
            ]
          : modulo.id === "productos"
            ? [
                estadistica(
                  "Productos",
                  numero(todos.length),
                  "Referencias en el catálogo",
                  "productos",
                ),
                estadistica(
                  "Unidades disponibles",
                  numero(todos.reduce((s, r) => s + r.stock_disponible, 0)),
                  "Stock total menos reservas",
                  "productos",
                ),
                estadistica(
                  "Valor del stock",
                  moneda(
                    todos.reduce(
                      (s, r) => s + Math.round(r.precio * 100) * r.stock,
                      0,
                    ) / 100,
                  ),
                  "A precio de catálogo",
                  "grafica",
                ),
                estadistica(
                  "Stock bajo",
                  numero(
                    todos.filter(
                      (r) => r.stock_disponible <= this.app.preferencias.umbral,
                    ).length,
                  ),
                  `Hasta ${this.app.preferencias.umbral} unidades disponibles`,
                  "aviso",
                ),
              ]
            : [
                estadistica(
                  "Pedidos",
                  numero(todos.length),
                  "Todos los estados",
                  "pedidos",
                ),
                estadistica(
                  "Confirmados",
                  numero(todos.filter((r) => r.estado === "confirmado").length),
                  "Con reserva de existencias",
                  "pedidos",
                ),
                estadistica(
                  "Pendientes",
                  numero(todos.filter((r) => r.estado === "pendiente").length),
                  "Pendientes de confirmar",
                  "pedidos",
                ),
                estadistica(
                  "Importe confirmado",
                  moneda(
                    todos
                      .filter((r) => r.estado === "confirmado")
                      .reduce((s, r) => s + Math.round(r.total * 100), 0) / 100,
                  ),
                  "Sin impuestos ni descuentos",
                  "grafica",
                ),
              ];
      const escenario = DOM.uno("#escenario");
      escenario.innerHTML =
        cabecera(
          titulo,
          descripcion,
          `<button class="ju-btn secondary" id="exportarCSV">${icono("exportar")}Exportar CSV</button>`,
        ) +
        `<div class="stats-grid">${resumen.join("")}</div><article class="panel table-panel"><div class="table-toolbar"><h2>${esc(titulo)} <small>${numero(todos.length)} registros</small></h2><div class="table-tools"><label class="field-inline">${modulo.id === "pedidos" ? "Estado" : modulo.id === "productos" ? "Categoría" : "Empresa"}<select id="filtroTabla"><option value="">${modulo.id === "pedidos" ? "Todos los estados" : modulo.id === "productos" ? "Todas las categorías" : "Todas las empresas"}</option>${opciones.map((o) => `<option value="${esc(o)}"${estado.filtro === o ? " selected" : ""}>${esc(o)}</option>`).join("")}</select></label>${estado.filtro || busqueda ? '<button id="limpiarFiltros" class="ju-btn secondary">Limpiar filtros</button>' : ""}</div></div>
        <div class="table-scroll"><table><caption class="sr-only">${esc(modulo.titulo)}</caption><thead><tr>${modulo.columnas.map((c) => `<th scope="col"${estado.campo === c.campo ? ` aria-sort="${estado.direccion === 1 ? "ascending" : "descending"}"` : ""}><button data-sort="${esc(c.campo)}">${esc(c.etiqueta)}<span aria-hidden="true">${estado.campo === c.campo ? (estado.direccion === 1 ? "↑" : "↓") : "↕"}</span></button></th>`).join("")}<th scope="col">Acciones</th></tr></thead><tbody></tbody></table></div>
        <div class="table-footer"><span role="status">${filtrados.length ? `${inicio + 1}–${Math.min(inicio + estado.tamano, filtrados.length)}` : "0"} de ${numero(filtrados.length)} registros</span><label class="field-inline">Filas por página <select id="tamanoTabla">${[10, 25, 50].map((n) => `<option${estado.tamano === n ? " selected" : ""}>${n}</option>`).join("")}</select></label><div class="pagination"><button class="ju-btn secondary" id="anteriorPagina" aria-label="Página anterior" ${estado.pagina === 1 ? "disabled" : ""}>←</button><span>${estado.pagina} / ${paginas}</span><button class="ju-btn secondary" id="siguientePagina" aria-label="Página siguiente" ${estado.pagina === paginas ? "disabled" : ""}>→</button></div></div></article>`;
      const cuerpo = DOM.uno("tbody", escenario);
      if (!visibles.length)
        cuerpo.innerHTML = `<tr><td colspan="${modulo.columnas.length + 1}"><div class="empty-state">${icono(modulo.id)}<h3>${todos.length ? "No encontramos resultados" : `Todavía no hay ${modulo.id}`}</h3><p>${todos.length ? "Prueba con otro término o limpia los filtros." : `Añade tu primer ${modulo.singular} para empezar.`}</p><button class="ju-btn secondary" id="accionVacio">${todos.length ? "Limpiar filtros" : `Crear ${modulo.singular}`}</button></div></td></tr>`;
      for (const registro of visibles) {
        const fila = document.createElement("tr");
        fila.className = "ju-row-editable";
        fila.title = `Editar ${registro.nombre ?? registro.cliente}`;
        fila.innerHTML = modulo.columnas
          .map((c) => this.celda(c, registro))
          .join("");
        fila.addEventListener("click", () =>
          this.app.drawer.abrirActualizar(registro),
        );
        const acciones = document.createElement("td");
        acciones.innerHTML =
          '<div class="ju-table-actions"><button class="ju-btn secondary" type="button">Editar</button><button class="ju-btn danger" type="button">Eliminar</button></div>';
        DOM.todos("button", acciones).forEach((boton, indice) => {
          boton.setAttribute(
            "aria-label",
            `${indice ? "Eliminar" : "Editar"} ${registro.nombre ?? registro.cliente} (ID ${registro.id})`,
          );
          boton.addEventListener("click", (evento) => {
            evento.stopPropagation();
            if (indice) this.app.confirmarEliminar(registro);
            else this.app.drawer.abrirActualizar(registro);
          });
        });
        fila.appendChild(acciones);
        cuerpo.appendChild(fila);
      }
      const actualizar = (foco) => {
        this.render(DOM.uno("#buscador").value);
        if (foco) DOM.uno(foco, escenario)?.focus();
      };
      const limpiar = () => {
        estado.filtro = "";
        estado.pagina = 1;
        DOM.uno("#buscador").value = "";
        actualizar("#filtroTabla");
      };
      DOM.uno("#filtroTabla").addEventListener("change", (e) => {
        estado.filtro = e.target.value;
        estado.pagina = 1;
        actualizar("#filtroTabla");
      });
      DOM.uno("#tamanoTabla").addEventListener("change", (e) => {
        estado.tamano = Number(e.target.value);
        estado.pagina = 1;
        actualizar("#tamanoTabla");
      });
      DOM.uno("#limpiarFiltros")?.addEventListener("click", limpiar);
      DOM.uno("#accionVacio")?.addEventListener("click", () =>
        todos.length ? limpiar() : this.app.drawer.abrirCrear(),
      );
      for (const [id, paso] of [
        ["anteriorPagina", -1],
        ["siguientePagina", 1],
      ])
        DOM.uno(`#${id}`).addEventListener("click", () => {
          estado.pagina += paso;
          actualizar(`#${id}`);
          if (DOM.uno(`#${id}`).disabled)
            DOM.uno(
              `#${paso === 1 ? "anteriorPagina" : "siguientePagina"}`,
            ).focus();
        });
      DOM.todos("[data-sort]", escenario).forEach((boton) =>
        boton.addEventListener("click", () => {
          estado.direccion =
            estado.campo === boton.dataset.sort ? -estado.direccion : 1;
          estado.campo = boton.dataset.sort;
          estado.pagina = 1;
          actualizar(`[data-sort="${estado.campo}"]`);
        }),
      );
      DOM.uno("#exportarCSV").addEventListener("click", () => {
        Descargas.guardar(
          `alfredo-${modulo.id}.csv`,
          Descargas.csv(modulo.columnas, filtrados),
          "text/csv",
        );
        this.app.toast.mostrar(
          "success",
          "CSV preparado",
          `${filtrados.length} registros exportados con los filtros y el orden actuales.`,
        );
      });
    }

    celda(columna, registro) {
      const valor = registro[columna.campo];
      if (columna.campo === "id")
        return `<td><span class="record-id">#${String(valor).padStart(3, "0")}</span></td>`;
      if (columna.campo === "nombre")
        return `<td class="primary-cell"><span class="record-name"><span class="record-avatar" aria-hidden="true">${esc(registro.nombre.slice(0, 2).toUpperCase())}</span>${esc(valor)}</span></td>`;
      if (columna.campo === "estado")
        return `<td><span class="badge ${esc(valor)}">${esc(valor.charAt(0).toUpperCase() + valor.slice(1))}</span></td>`;
      if (typeof valor === "boolean")
        return `<td><span class="badge ${valor ? "positive" : "negative"}">${valor ? "Disponible" : "Fuera de venta"}</span></td>`;
      if (columna.formato === "moneda")
        return `<td class="numeric">${moneda(valor)}</td>`;
      if (columna.campo === "stock_disponible")
        return `<td class="numeric"><span class="${valor <= this.app.preferencias.umbral ? "badge warning" : ""}">${numero(valor)}</span></td>`;
      if (columna.campo === "fecha" && valor)
        return `<td>${esc(new Date(`${valor}T12:00:00`).toLocaleDateString("es-ES"))}</td>`;
      return `<td${typeof valor === "number" ? ' class="numeric"' : ""}>${esc(valor ?? "—") || "—"}</td>`;
    }
  }

  class PanelIU {
    constructor(app) {
      this.app = app;
    }

    render() {
      const { clientes, productos, pedidos } = this.app.estado.modulos;
      const lista = pedidos.registros;
      const confirmados = lista.filter((p) => p.estado === "confirmado");
      const pendientes = lista.filter((p) => p.estado === "pendiente");
      const ahora = new Date();
      this.app.mesResumen ??= `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
      const meses = Analitica.meses(lista, this.app.mesResumen);
      const cantidades = ["confirmado", "pendiente", "cancelado"].map(
        (estado) => lista.filter((p) => p.estado === estado).length,
      );
      const colores = ["#6842a6", "#bc8a3e", "#b7bec9"];
      let acumulado = 0;
      const segmentos = cantidades.map((cantidad, i) => {
        const inicio = acumulado;
        acumulado += lista.length ? (cantidad / lista.length) * 100 : 0;
        return `${colores[i]} ${inicio}% ${acumulado}%`;
      });
      const categorias = new Map();
      productos.registros.forEach((p) =>
        categorias.set(
          p.categoria,
          (categorias.get(p.categoria) ?? 0) + pedidos.disponible(p.id),
        ),
      );
      const maxStock = Math.max(1, ...categorias.values());
      const recientes = [...lista]
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
        .slice(0, 5);
      DOM.uno("#escenario").innerHTML =
        cabecera(
          "Resumen",
          "Una vista de lo que está pasando en tu espacio.",
          `<time class="date-label" datetime="${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}">${esc(ahora.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }))}</time>`,
        ) +
        `<div class="stats-grid">${estadistica("Importe confirmado", moneda(confirmados.reduce((s, p) => s + Math.round(p.total * 100), 0) / 100), "Acumulado de pedidos confirmados", "grafica")}${estadistica("Pedidos pendientes", numero(pendientes.length), "Por revisar y confirmar", "pedidos")}${estadistica("Clientes", numero(clientes.registros.length), "Contactos en tu agenda", "clientes")}${estadistica("Productos", numero(productos.registros.length), `${productos.registros.filter((p) => p.disponible).length} disponibles para la venta`, "productos")}</div>
        <div class="dashboard-grid"><article class="panel"><div class="panel-head"><div><h2>Evolución de pedidos</h2><p>Importe confirmado por mes · EUR</p></div><label class="field-inline">Hasta<input id="mesResumen" type="month" value="${esc(this.app.mesResumen)}" min="2000-01" max="2099-12" aria-label="Último mes de la gráfica"></label></div>${this.grafica(meses)}<div class="chart-key">Pedidos confirmados · sin impuestos ni descuentos</div>${meses.every((m) => !m.total) ? '<p class="note" style="margin-top:14px">No hay importe confirmado en este periodo.</p>' : ""}<details class="chart-data"><summary>Consultar datos de la gráfica</summary><table><caption class="sr-only">Importes confirmados por mes</caption><thead><tr><th scope="col">Mes</th><th scope="col">Pedidos</th><th scope="col">Importe</th></tr></thead><tbody>${meses.map((m) => `<tr><td>${esc(m.etiqueta)}</td><td>${m.pedidos}</td><td>${moneda(m.total)}</td></tr>`).join("")}</tbody></table></details></article>
        <article class="panel"><div class="panel-head"><div><h2>Estado de los pedidos</h2><p>Distribución de todos los registros</p></div></div><div class="status-summary"><div class="donut" style="background:${lista.length ? `conic-gradient(${segmentos.join(",")})` : "#eef0f4"}" aria-hidden="true"><span>${lista.length}<small>pedidos</small></span></div><div class="legend">${["Confirmados", "Pendientes", "Cancelados"].map((e, i) => `<div><i style="--segment:${colores[i]}"></i>${e}<b>${cantidades[i]}</b></div>`).join("")}</div></div><p class="note">${lista.length ? "Los pedidos confirmados reservan existencias. Los pendientes todavía no reservan stock." : "El resumen se actualizará al crear tu primer pedido."}</p><div class="ju-button-row"><a class="ju-btn secondary" href="#pedidos">Ver pedidos →</a></div></article></div>
        <div class="dashboard-grid"><article class="panel table-panel"><div class="table-toolbar"><h2>Últimos pedidos</h2><a class="ju-text-link" href="#pedidos">Ver todos →</a></div>${recientes.length ? `<div class="table-scroll"><table><caption class="sr-only">Los cinco pedidos más recientes por fecha</caption><thead><tr><th scope="col">Pedido</th><th scope="col">Cliente</th><th scope="col">Estado</th><th scope="col">Importe</th></tr></thead><tbody>${recientes.map((p) => `<tr><td><a href="#pedidos">#${String(p.id).padStart(3, "0")}</a></td><td>${esc(p.cliente)}</td><td><span class="badge ${esc(p.estado)}">${esc(p.estado)}</span></td><td class="numeric">${moneda(p.total)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state">${icono("pedidos")}<h3>Tu primer pedido empieza aquí</h3><p>Selecciona un cliente y añade productos de tu catálogo.</p><button class="ju-btn secondary" id="primerPedido">Crear un pedido</button></div>`}</article>
        <article class="panel"><div class="panel-head"><div><h2>Existencias por categoría</h2><p>Unidades disponibles, descontando reservas</p></div><a href="#productos">Catálogo →</a></div>${categorias.size ? [...categorias].map(([nombre, cantidad]) => `<div class="stock-row"><span title="${esc(nombre)}">${esc(nombre)}</span><div class="bar-track" aria-hidden="true"><i style="--bar-width:${(cantidad / maxStock) * 100}%"></i></div><strong>${numero(cantidad)}</strong></div>`).join("") : "<p>No hay productos en el catálogo.</p>"}</article></div>`;
      DOM.uno("#mesResumen").addEventListener("change", (evento) => {
        if (!evento.target.value || !evento.target.checkValidity()) return;
        this.app.mesResumen = evento.target.value;
        this.render();
        DOM.uno("#mesResumen").focus();
      });
      DOM.uno("#primerPedido")?.addEventListener("click", () => {
        this.app.cambiarModulo("pedidos");
        history.replaceState(null, "", "#pedidos");
        this.app.drawer.abrirCrear();
      });
    }

    grafica(meses) {
      const max = Math.max(100, ...meses.map((m) => m.total));
      const techo = Math.ceil(max / 100) * 100;
      const rejilla = Array.from({ length: 4 }, (_, i) => {
        const y = 20 + i * 55;
        return `<line class="gridline" x1="65" x2="620" y1="${y}" y2="${y}"/><text x="54" y="${y + 4}" text-anchor="end">${numero(Math.round((techo * (3 - i)) / 3))}</text>`;
      }).join("");
      return `<div class="chart-scroll"><svg class="chart" viewBox="0 0 640 225" role="img" aria-label="Importe confirmado de los últimos seis meses. Los valores se pueden consultar en la tabla situada debajo.">${rejilla}${meses
        .map((m, i) => {
          const altura = (m.total / techo) * 165,
            x = 95 + i * 90;
          return `<rect class="chart-bar" x="${x}" y="${185 - altura}" width="32" height="${altura}" rx="3"><title>${esc(m.etiqueta)}: ${moneda(m.total)}, ${m.pedidos} pedidos</title></rect><text x="${x + 16}" y="212" text-anchor="middle">${esc(m.etiqueta)}</text>`;
        })
        .join("")}</svg></div>`;
    }
  }

  class IdentidadIU {
    constructor(app) {
      this.app = app;
    }

    static datos() {
      const estilos = getComputedStyle(document.documentElement);
      return {
        marca: "Alfredo",
        denominacion: "Alfredo | interfaz integrada",
        version: "2.0",
        fecha: "2026-10-28",
        actividad: "Gestión de clientes, productos y pedidos",
        tipografia: "Segoe UI, Arial, sans-serif",
        logo: "img/alfredo.svg",
        colores: [
          ["Ciruela", "--color0"],
          ["Violeta", "--color"],
          ["Lavanda", "--color2"],
          ["Fondo", "--color3"],
          ["Texto", "--tinta"],
          ["Borde", "--borde"],
        ].map(([nombre, token]) => ({
          nombre,
          token,
          valor: estilos.getPropertyValue(token).trim(),
        })),
      };
    }

    render() {
      const datos = IdentidadIU.datos();
      DOM.uno("#escenario").innerHTML =
        cabecera(
          "Manual de identidad",
          "La marca, sus recursos y las reglas que dan forma a esta interfaz.",
          '<a class="ju-btn secondary" href="manual-identidad.html">Abrir manual completo ↗</a>',
        ) +
        `<div class="section-grid"><article class="panel"><div class="panel-head"><div><h2>01 / Marca y símbolo</h2><p>Profesional, sobria y cercana.</p></div><span class="badge">v2.0</span></div><div class="brand-display"><img src="img/alfredo.svg" alt="Símbolo de Alfredo: ventana con panel lateral"><span>alfredo<small>interfaz integrada</small></span></div><dl class="definition-list"><div><dt>Nombre</dt><dd>Alfredo</dd></div><div><dt>Actividad</dt><dd>${esc(datos.actividad)}</dd></div><div><dt>Símbolo</dt><dd>Ventana de aplicación · proporción 1:1</dd></div><div><dt>Edición</dt><dd>28 de octubre de 2026</dd></div></dl><div class="ju-button-row"><a class="ju-btn secondary" href="img/alfredo.svg" download="alfredo-simbolo.svg">${icono("exportar")}Descargar símbolo SVG</a><button class="ju-btn secondary" id="descargarIdentidad">Exportar identidad JSON</button></div></article>
        <article class="panel"><h2>02 / Sistema de color</h2><p>Pulsa una muestra para copiar su código. Los valores se leen de los estilos de la aplicación.</p><div class="swatch-grid">${datos.colores.map((c) => `<button class="swatch" data-color="${esc(c.valor)}" aria-label="Copiar color ${esc(c.nombre)}: ${esc(c.valor)}"><i style="--swatch:${esc(c.valor)}" aria-hidden="true"></i><span>${esc(c.nombre)}<code>${esc(c.valor)}</code></span></button>`).join("")}</div><p class="note" style="margin-top:20px">Violeta para la acción principal y la selección. Verde, ámbar y rojo para comunicar estados, siempre acompañados de texto.</p></article></div>
        <div class="section-grid"><article class="panel"><h2>03 / Tipografía y composición</h2><p>Segoe UI · alternativa Arial y sans-serif.</p><div class="type-sample"><strong>La claridad es lo primero.</strong><p>Un espacio de trabajo sencillo, ordenado y legible.</p></div><dl class="definition-list"><div><dt>Título de página</dt><dd>30 px · seminegrita</dd></div><div><dt>Título de sección</dt><dd>16 px · seminegrita</dd></div><div><dt>Texto de interfaz</dt><dd>14 px · regular</dd></div><div><dt>Tablas y controles</dt><dd>12 px · regular</dd></div><div><dt>Espaciado y bordes</dt><dd>Base 4 px · radio 6–8 px</dd></div></dl></article>
        <article class="panel"><h2>04 / Componentes y mensajes</h2><p>Una jerarquía común en todas las vistas.</p><div class="ju-button-row"><button class="ju-btn" id="ejemploMensaje">Probar notificación</button><a class="ju-btn secondary" href="#componentes">Ver componentes</a></div><div class="ju-button-row"><span class="badge confirmado">Confirmado</span><span class="badge pendiente">Pendiente</span><span class="badge cancelado">Cancelado</span></div><ul class="rules-list"><li>Describe la acción: «Guardar pedido», «Editar cliente».</li><li>Confirma la eliminación e informa si no puede completarse.</li><li>Usa un único acento principal y evita adornos que compitan con los datos.</li><li>Conserva el foco visible y permite navegar con teclado.</li><li>Muestra estados vacíos y explica el siguiente paso.</li></ul><p class="note">El manual completo amplía composición del símbolo, tamaños mínimos, accesibilidad, tono de voz y mantenimiento.</p></article></div>`;
      DOM.uno("#descargarIdentidad").addEventListener("click", () =>
        Descargas.guardar(
          "alfredo-identidad.json",
          JSON.stringify(datos, null, 2),
        ),
      );
      DOM.uno("#ejemploMensaje").addEventListener("click", () =>
        this.app.toast.mostrar(
          "success",
          "Cambios guardados",
          "Ejemplo de confirmación de la interfaz.",
        ),
      );
      DOM.todos("[data-color]").forEach((boton) =>
        boton.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(boton.dataset.color);
            this.app.toast.mostrar(
              "success",
              "Color copiado",
              boton.dataset.color,
            );
          } catch {
            this.app.modal.abrir(
              "Copiar color",
              `<p>Selecciona y copia este código: <code>${esc(boton.dataset.color)}</code></p>`,
            );
          }
        }),
      );
    }
  }

  class ConfiguracionIU {
    constructor(app) {
      this.app = app;
    }

    render() {
      const modulos = Object.values(this.app.estado.modulos);
      const bytes = new Blob([JSON.stringify(modulos.map((m) => m.registros))])
        .size;
      DOM.uno("#escenario").innerHTML =
        cabecera(
          "Configuración",
          "Preferencias del espacio y copia de tus datos.",
        ) +
        `<div class="section-grid"><article class="panel"><h2>Visualización</h2><label class="setting-row"><span><strong>Tablas compactas</strong><p>Reduce la altura de las filas para ver más información.</p></span><input id="tablasCompactas" type="checkbox" ${this.app.preferencias.compacta ? "checked" : ""}></label><label class="setting-row"><span><strong>Umbral de stock bajo</strong><p>Avisa cuando las unidades disponibles sean iguales o inferiores.</p></span><input id="umbralStock" type="number" min="0" max="99999" step="1" value="${this.app.preferencias.umbral}"></label><p class="note" style="margin-top:20px">Atajo de búsqueda: pulsa <kbd>/</kbd> o <kbd>Ctrl K</kbd> dentro de Clientes, Productos o Pedidos.</p></article>
        <article class="panel"><h2>Datos del espacio</h2><p>Los cambios se conservan en este navegador.</p><dl class="definition-list">${modulos.map((m) => `<div><dt>${esc(m.id.charAt(0).toUpperCase() + m.id.slice(1))}</dt><dd>${m.registros.length} registros</dd></div>`).join("")}<div><dt>Tamaño de los registros</dt><dd>${numero(bytes)} bytes</dd></div><div><dt>Modo de almacenamiento</dt><dd>Local · este navegador</dd></div></dl><div class="ju-button-row"><button class="ju-btn secondary" id="copiaDatos">${icono("exportar")}Descargar copia JSON</button></div><p class="note" style="margin-top:20px">La copia incluye los registros actuales de los tres módulos. Conserva el archivo para consultar tus datos; esta versión no incluye importación.</p></article></div><article class="panel"><h2>Acerca del espacio</h2><p>Alfredo · interfaz integrada · versión 2.0</p><ul class="rules-list"><li>Los archivos JSON contienen los datos iniciales. Los cambios se guardan en localStorage y no modifican esos archivos.</li><li>Los pedidos confirmados reservan stock. Cancelarlos o pasarlos a pendiente libera su reserva.</li><li>Los precios de los pedidos se conservan aunque cambie el catálogo. Los importes no incluyen impuestos ni descuentos.</li><li>El acceso es una demostración. El espacio está pensado para una sola pestaña y no sincroniza datos entre usuarios.</li></ul><a href="#identidad" class="ju-text-link">Consultar el manual de identidad →</a></article>`;
      DOM.uno("#tablasCompactas").addEventListener("change", (e) => {
        if (!this.guardar({ compacta: e.target.checked }))
          e.target.checked = this.app.preferencias.compacta;
      });
      DOM.uno("#umbralStock").addEventListener("change", (e) => {
        if (!e.target.reportValidity() || e.target.value === "") {
          e.target.value = this.app.preferencias.umbral;
          return;
        }
        if (!this.guardar({ umbral: Number(e.target.value) }))
          e.target.value = this.app.preferencias.umbral;
      });
      DOM.uno("#copiaDatos").addEventListener("click", () =>
        Descargas.guardar(
          "alfredo-copia.json",
          JSON.stringify(
            {
              version: 1,
              exportado: new Date().toISOString(),
              ...Object.fromEntries(modulos.map((m) => [m.id, m.registros])),
            },
            null,
            2,
          ),
        ),
      );
    }

    guardar(cambios) {
      const preferencias = { ...this.app.preferencias, ...cambios };
      try {
        localStorage.setItem(
          "Alfredo.iu.preferencias.v1",
          JSON.stringify(preferencias),
        );
        this.app.preferencias = preferencias;
        document.body.classList.toggle("compact-tables", preferencias.compacta);
        this.app.toast.mostrar(
          "success",
          "Preferencias guardadas",
          "Se aplicarán también al volver a abrir el espacio.",
        );
        return true;
      } catch {
        this.app.toast.mostrar(
          "danger",
          "No se pudo guardar",
          "El navegador no permite guardar las preferencias.",
        );
        return false;
      }
    }
  }

  Object.assign(iu, {
    Descargas,
    Analitica,
    TablaIU,
    PanelIU,
    IdentidadIU,
    ConfiguracionIU,
    icono,
  });
})();
