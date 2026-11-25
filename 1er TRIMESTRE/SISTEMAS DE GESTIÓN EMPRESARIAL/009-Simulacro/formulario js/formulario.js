"use strict";
class Formulario {
  constructor(contenedor, columnas, guardar, relaciones = {}) {
    this.columnas = columnas; this.guardar = guardar; this.registro = null;
    this.formulario = document.createElement("form"); this.formulario.className = "formulario";
    this.titulo = document.createElement("h3"); this.formulario.append(this.titulo);
    for (const c of columnas) {
      if (c.readonly || c.pk) continue;
      const wrapper = document.createElement("div"); wrapper.className = "control";
      const label = document.createElement("label"); label.htmlFor = "campo-" + c.name;
      label.textContent = c.titulo + (c.required ? " *" : "");
      const input = document.createElement(["select","relacion"].includes(c.tipo) ? "select" : c.tipo === "textarea" ? "textarea" : "input");
      if (input.tagName === "INPUT") input.type = c.tipo === "number" ? "number" : c.tipo === "checkbox" ? "checkbox" : ["date","email","tel"].includes(c.tipo) ? c.tipo : "text";
      input.id = label.htmlFor; input.name = c.name; input.required = !!c.required;
      if (c.tipo === "number") { input.step = c.step || "1"; input.min = c.min ?? 0; if (c.max !== undefined) input.max = c.max; }
      if (["select","relacion"].includes(c.tipo)) {
        const opciones = c.tipo === "relacion" ? relaciones[c.relacion] || [] : c.opciones.map(v => ({value:v,label:v}));
        input.add(new Option("Selecciona…", ""));
        for (const op of opciones) input.add(new Option(op.label,String(op.value)));
      }
      if (!["number","relacion","checkbox","date","select"].includes(c.tipo)) input.maxLength = c.tipo === "textarea" ? 4000 : 255;
      wrapper.append(label,input); this.formulario.append(wrapper);
    }
    this.error = document.createElement("div"); this.error.className = "error"; this.error.setAttribute("role","alert");
    const acciones = document.createElement("div"); acciones.className = "acciones-formulario";
    this.boton = document.createElement("button"); this.boton.type = "submit";
    const cancelar = document.createElement("button"); cancelar.type = "button"; cancelar.className = "secundario"; cancelar.textContent = "Nuevo / Cancelar edición"; cancelar.onclick = () => this.nuevo();
    acciones.append(this.boton,cancelar); this.formulario.append(this.error,acciones);
    this.formulario.onsubmit = async e => {
      e.preventDefault(); this.boton.disabled = true; this.error.textContent = "";
      try {
        const datos = Object.fromEntries(new FormData(this.formulario));
        for (const c of columnas) if (c.tipo === "checkbox" && !c.readonly) datos[c.name] = this.formulario.elements.namedItem(c.name).checked ? 1 : 0;
        await guardar(datos,this.registro); this.nuevo();
      } catch (error) { this.error.textContent = error.message; }
      finally { this.boton.disabled = false; }
    };
    contenedor.append(this.formulario); this.nuevo();
  }
  nuevo() {
    this.registro = null; this.formulario.reset(); this.error.textContent = "";
    this.titulo.textContent = "Nuevo registro"; this.boton.textContent = "Crear registro";
    for (const c of this.columnas) {
      const input = this.formulario.elements.namedItem(c.name);
      if (!input || c.readonly) continue;
      if (c.tipo === "checkbox") input.checked = !!c.defecto;
      else if (c.defecto !== undefined) input.value = c.defecto;
    }
  }
  editar(registro) {
    this.nuevo(); this.registro = registro;
    for (const c of this.columnas) {
      const input = this.formulario.elements.namedItem(c.name);
      if (!input || c.readonly) continue;
      if (c.tipo === "checkbox") input.checked = !!registro[c.name]; else input.value = registro[c.name] ?? "";
    }
    this.titulo.textContent = "Editar registro " + registro.identificador; this.boton.textContent = "Guardar cambios";
    this.formulario.querySelector("input,select,textarea")?.focus();
  }
}

