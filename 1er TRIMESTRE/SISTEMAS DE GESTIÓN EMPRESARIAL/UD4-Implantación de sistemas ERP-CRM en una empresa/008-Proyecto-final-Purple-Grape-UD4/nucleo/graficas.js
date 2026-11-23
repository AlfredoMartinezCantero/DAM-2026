class GraficaSVG {

      constructor(elemento) {
        this.elemento = elemento;
        this.datos = JSON.parse(elemento.getAttribute("data"));
        this.etiquetas = JSON.parse(elemento.getAttribute("data-etiquetas") || "[]");
        this.total = this.datos.reduce((a, b) => a + b, 0);

        this.NS = "http://www.w3.org/2000/svg";

        this.colores = ["#7c3aed", "#a78bfa", "#4c1d95", "#c4b5fd", "#9670c7", "#6937aa", "#d8b4fe"];


        this.tooltip = document.querySelector(".tooltip");

        if (!this.tooltip) {
          this.tooltip = document.createElement("div");
          this.tooltip.className = "tooltip";
          document.body.appendChild(this.tooltip);
        }
      }

      // CREAR ELEMENTO SVG
      crear(etiqueta, atributos = {}) {
        let elemento = document.createElementNS(this.NS, etiqueta);

        for (let atributo in atributos) {
          elemento.setAttribute(atributo, atributos[atributo]);
        }

        return elemento;
      }

      // CREAR CONTENEDOR SVG
      crearLienzo(ancho, alto) {
        let svg = this.crear("svg", {
          width: ancho,
          height: alto,
          viewBox: `0 0 ${ancho} ${alto}`
        });

        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", this.etiquetas.map((t,i)=>t+": "+this.datos[i]).join("; "));
        this.elemento.appendChild(svg);
        return svg;
      }

      // OBTENER COLOR
      color(indice) {
        return this.colores[indice % this.colores.length];
      }

      // CREAR TEXTO SVG
      texto(svg, contenido, x, y, color = "#333") {
        let texto = this.crear("text", {
          x: x,
          y: y,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          fill: color
        });

        texto.textContent = contenido;
        svg.appendChild(texto);
        return texto;
      }

      // TOOLTIP
      activarTooltip(figura, dato, indice) {
        const title = this.crear("title");
        title.textContent = (this.etiquetas[indice] || "Elemento") + ": " + new Intl.NumberFormat("es-ES").format(dato);
        figura.appendChild(title);
        figura.addEventListener("mousemove", (evento) => {

          let porcentaje = this.total > 0
            ? (dato / this.total * 100).toFixed(1)
            : "0.0";

          this.tooltip.replaceChildren();
          const titulo = document.createElement("strong");
          titulo.textContent = this.etiquetas[indice] || `Elemento ${indice + 1}`;
          const valor = document.createElement("div");
          valor.textContent = `Valor: ${new Intl.NumberFormat("es-ES").format(dato)}`;
          const proporcion = document.createElement("div");
          proporcion.textContent = `Porcentaje: ${porcentaje}%`;
          this.tooltip.append(titulo, valor, proporcion);


          this.tooltip.style.display = "block";

          let x = evento.clientX + 15;
          let y = evento.clientY + 15;

          if (x + this.tooltip.offsetWidth > window.innerWidth) {
            x = evento.clientX - this.tooltip.offsetWidth - 15;
          }

          if (y + this.tooltip.offsetHeight > window.innerHeight) {
            y = evento.clientY - this.tooltip.offsetHeight - 15;
          }

          this.tooltip.style.left = x + "px";
          this.tooltip.style.top = y + "px";
        });

        figura.addEventListener("mouseleave", () => {
          this.tooltip.style.display = "none";
        });
      }

      // GRÁFICA DE BARRAS
      formatear(dato) {
        return new Intl.NumberFormat("es-ES", Math.abs(dato) >= 1000000
          ? {notation: "compact", maximumFractionDigits: 1}
          : {maximumFractionDigits: 2}).format(dato);
      }

      barras() {
        if (!this.datos.length) return;
        const ancho = Math.max(280, this.datos.length * 64 + 48);
        const paso = (ancho - 48) / this.datos.length;
        const maximo = Math.max(1, ...this.datos), alto = 230;
        const svg = this.crearLienzo(ancho, alto);
        this.datos.forEach((dato, indice) => {
          const x = 24 + indice * paso + paso * 0.15;
          const y = alto - dato / maximo * 175 - 20;
          const barra = this.crear("rect", {x, y, width: paso * 0.7,
            height: dato / maximo * 175, fill: this.color(indice), rx: 5});
          this.activarTooltip(barra, dato, indice); svg.appendChild(barra);
          const label = this.texto(svg, this.formatear(dato), x + paso * 0.35, y - 12);
          label.setAttribute("font-size", 13);
        });
      }

      // CALCULAR PUNTO DE CIRCUNFERENCIA
      punto(cx, cy, radio, angulo) {
        return {
          x: cx + radio * Math.cos(angulo),
          y: cy + radio * Math.sin(angulo)
        };
      }

      // CREAR SECTOR CIRCULAR O ANULAR
      sector(cx, cy, radioExterior, radioInterior, inicio, fin) {

        let p1 = this.punto(cx, cy, radioExterior, inicio);
        let p2 = this.punto(cx, cy, radioExterior, fin);

        let grande = fin - inicio > Math.PI ? 1 : 0;

        // Circunferencia completa
        if (fin - inicio >= Math.PI * 2 - 0.000001) {
          let exterior = `
            M ${cx - radioExterior} ${cy}
            a ${radioExterior} ${radioExterior} 0 1 0 ${radioExterior * 2} 0
            a ${radioExterior} ${radioExterior} 0 1 0 ${-radioExterior * 2} 0
          `;

          if (radioInterior === 0) return exterior + " Z";

          let interior = `
            M ${cx - radioInterior} ${cy}
            a ${radioInterior} ${radioInterior} 0 1 1 ${radioInterior * 2} 0
            a ${radioInterior} ${radioInterior} 0 1 1 ${-radioInterior * 2} 0
          `;

          return exterior + interior + " Z";
        }

        // Tarta
        if (radioInterior === 0) {
          return `
            M ${cx} ${cy}
            L ${p1.x} ${p1.y}
            A ${radioExterior} ${radioExterior} 0 ${grande} 1 ${p2.x} ${p2.y}
            Z
          `;
        }

        // Anillo
        let p3 = this.punto(cx, cy, radioInterior, fin);
        let p4 = this.punto(cx, cy, radioInterior, inicio);

        return `
          M ${p1.x} ${p1.y}
          A ${radioExterior} ${radioExterior} 0 ${grande} 1 ${p2.x} ${p2.y}
          L ${p3.x} ${p3.y}
          A ${radioInterior} ${radioInterior} 0 ${grande} 0 ${p4.x} ${p4.y}
          Z
        `;
      }

      // MÉTODO COMÚN PARA TARTA Y ANILLO
      circular(radioInterior = 0) {
        if (this.total <= 0) {
          this.elemento.textContent = "Sin registros para representar.";
          return;
        }

        let svg = this.crearLienzo(300, 300);

        let cx = 150;
        let cy = 150;
        let radio = 120;
        let angulo = -Math.PI / 2;

        this.datos.forEach((dato, indice) => {
          if (dato <= 0) return;

          let porcion = dato / this.total * Math.PI * 2;
          let final = angulo + porcion;

          let path = this.crear("path", {
            d: this.sector(
              cx, cy, radio, radioInterior, angulo, final
            ),
            fill: this.color(indice),
            stroke: "white",
            "stroke-width": 2,
            "fill-rule": "evenodd"
          });

          this.activarTooltip(path, dato, indice);
          svg.appendChild(path);

          let medio = angulo + porcion / 2;
          let radioTexto = (radio + radioInterior) / 2;

          if (radioInterior === 0) {
            radioTexto = radio * 0.65;
          }

          let posicion = this.punto(
            cx, cy, radioTexto, medio
          );

          this.texto(
            svg, this.formatear(dato), posicion.x, posicion.y, "white"
          );

          angulo = final;
        });

        // Texto central para el anillo
        if (radioInterior > 0) {
          let centro = this.texto(
            svg, this.formatear(this.total), cx, cy - 8, "#333"
          );

          centro.setAttribute("font-size", 28);
          centro.setAttribute("font-weight", "bold");

          this.texto(svg, "TOTAL", cx, cy + 17, "#777");
        }
      }

      // GRÁFICA DE TARTA
      tarta() {
        this.circular(0);
      }

      // GRÁFICA DE ANILLO
      anillo() {
        this.circular(65);
      }

      // DETECTAR TIPO DE GRÁFICA
      dibujar() {
        if (this.elemento.classList.contains("barras")) {
          this.barras();
        } else if (this.elemento.classList.contains("tarta")) {
          this.tarta();
        } else if (this.elemento.classList.contains("anillo")) {
          this.anillo();
        }
      }
    }
