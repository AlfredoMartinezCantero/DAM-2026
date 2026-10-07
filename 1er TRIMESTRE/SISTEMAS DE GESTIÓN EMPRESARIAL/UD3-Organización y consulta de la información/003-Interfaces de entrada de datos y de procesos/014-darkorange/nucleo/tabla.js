// Componente reutilizable: cabeceras y filas dinámicas, incluso sin registros.
class Tabla {
  constructor(contenedor, columnas, editar, eliminar) {
    this.columnas = columnas;
    this.editar = editar;
    this.eliminar = eliminar;
    const envoltorio = document.createElement("div");
    envoltorio.className = "tabla-contenedor";
    this.tabla = document.createElement("table");
    const cabecera = this.tabla.createTHead().insertRow();
    [...columnas.map(columna => columna.name), "Acciones"].forEach(nombre => {
      const celda = document.createElement("th");
      celda.scope = "col";
      celda.textContent = nombre;
      cabecera.appendChild(celda);
    });
    this.cuerpo = this.tabla.createTBody();
    envoltorio.appendChild(this.tabla);
    contenedor.appendChild(envoltorio);
  }

  actualizar(registros) {
    this.cuerpo.replaceChildren();
    if (registros.length === 0) {
      const celda = this.cuerpo.insertRow().insertCell();
      celda.colSpan = this.columnas.length + 1;
      celda.textContent = "Todavía no hay registros.";
      return;
    }
    registros.forEach(registro => {
      const fila = this.cuerpo.insertRow();
      this.columnas.forEach(columna => {
        fila.insertCell().textContent = registro[columna.name] ?? "";
      });
      const acciones = fila.insertCell();
      acciones.className = "acciones";
      const editar = document.createElement("button");
      editar.type = "button";
      editar.textContent = "Editar";
      editar.onclick = () => this.editar(registro);
      const eliminar = document.createElement("button");
      eliminar.type = "button";
      eliminar.className = "eliminar";
      eliminar.textContent = "Eliminar";
      eliminar.onclick = () => this.eliminar(registro);
      acciones.append(editar, eliminar);
    });
  }
}
