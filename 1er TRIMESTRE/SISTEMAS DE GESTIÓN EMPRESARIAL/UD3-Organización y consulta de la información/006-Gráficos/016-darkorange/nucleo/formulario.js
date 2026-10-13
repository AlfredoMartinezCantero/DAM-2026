// Componente reutilizable: genera controles a partir del esquema del servidor.
class Formulario {
  constructor(contenedor, columnas, guardar) {
    this.columnas = columnas;
    this.guardar = guardar;
    this.registro = null;
    this.formulario = document.createElement("form");
    this.formulario.className = "formulario";
    this.titulo = document.createElement("h3");
    this.formulario.appendChild(this.titulo);

    const plantilla = document.createElement("template");
    plantilla.innerHTML = '<div class="control"><label></label><input type="text"></div>';
    columnas.forEach((columna, indice) => {
      if (columna.pk) return;
      const instancia = plantilla.content.cloneNode(true);
      const input = instancia.querySelector("input");
      input.id = "campo-" + indice;
      input.name = columna.name;
      input.required = Boolean(columna.notnull && columna.dflt_value === null);
      instancia.querySelector("label").htmlFor = input.id;
      instancia.querySelector("label").textContent = columna.name;
      this.formulario.appendChild(instancia);
    });

    const acciones = document.createElement("div");
    acciones.className = "acciones-formulario";
    this.boton = document.createElement("button");
    this.boton.type = "submit";
    const cancelar = document.createElement("button");
    cancelar.type = "button";
    cancelar.className = "secundario";
    cancelar.textContent = "Nuevo / Cancelar edición";
    cancelar.onclick = () => this.nuevo();
    acciones.append(this.boton, cancelar);
    this.formulario.appendChild(acciones);
    this.formulario.onsubmit = async evento => {
      evento.preventDefault();
      this.boton.disabled = true;
      try {
        const datos = Object.fromEntries(new FormData(this.formulario));
        // Los campos vacíos con valor predeterminado se dejan al servidor al crear.
        if (this.registro === null) {
          this.columnas.forEach(columna => {
            if (columna.dflt_value !== null && datos[columna.name] === "") {
              delete datos[columna.name];
            }
          });
        }
        await this.guardar(datos, this.registro);
        this.nuevo();
      } catch (error) {
        alert(error.message);
      } finally {
        this.boton.disabled = false;
      }
    };
    contenedor.appendChild(this.formulario);
    this.nuevo();
  }

  nuevo() {
    this.registro = null;
    this.formulario.reset();
    this.titulo.textContent = "Nuevo registro";
    this.boton.textContent = "Crear registro";
  }

  editar(registro) {
    this.nuevo();
    this.registro = registro;
    this.columnas.forEach(columna => {
      const control = this.formulario.elements.namedItem(columna.name);
      if (control && !columna.pk) control.value = registro[columna.name] ?? "";
    });
    this.titulo.textContent = "Editar registro";
    this.boton.textContent = "Guardar cambios";
    this.formulario.querySelector("input")?.focus();
  }
}
