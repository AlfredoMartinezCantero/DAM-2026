"use strict";
class Tabla {
  constructor(contenedor, columnas, editar, eliminar, extra) {
    this.columnas = columnas; this.editar = editar; this.eliminar = eliminar; this.extra = extra;
    this.conAcciones = !!(editar || eliminar || extra);
    const wrap = document.createElement("div"); wrap.className = "tabla-contenedor";
    this.tabla = document.createElement("table"); const head = this.tabla.createTHead().insertRow();
    [...columnas.map(c => c.titulo || c.name), ...(this.conAcciones ? ["Acciones"] : [])].forEach(n => {
      const th = document.createElement("th"); th.scope = "col"; th.textContent = n; head.append(th);
    });
    this.cuerpo = this.tabla.createTBody(); wrap.append(this.tabla); contenedor.append(wrap);
  }
  actualizar(registros) {
    this.cuerpo.replaceChildren();
    if (!registros.length) { const td = this.cuerpo.insertRow().insertCell(); td.colSpan = this.columnas.length + Number(this.conAcciones); td.textContent = "No hay registros para esta consulta."; return; }
    for (const r of registros) {
      const tr = this.cuerpo.insertRow();
      for (const c of this.columnas) {
        const value = r[c.name]; const td = tr.insertCell();
        if (c.tipo === "checkbox") td.textContent = value ? "Sí" : "No";
        else if (c.name.endsWith("_centimos") && value !== null) td.textContent = new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"}).format(Number(value)/100);
        else if (typeof value === "number" && /precio|total|salario|importe|valor/.test(c.name)) td.textContent = new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:2}).format(value);
        else td.textContent = value ?? "—";
      }
      if (this.conAcciones) {
        const acciones = tr.insertCell(); acciones.className = "acciones";
        for (const [text,fn,clase] of [["Editar",this.editar,"secundario"],["Eliminar",this.eliminar,"eliminar"]]) {
          if (!fn) continue;
          const b = document.createElement("button"); b.type = "button"; b.className = clase; b.textContent = text; b.onclick = () => fn(r); acciones.append(b);
        }
        this.extra?.(acciones,r);
      }
    }
  }
}

