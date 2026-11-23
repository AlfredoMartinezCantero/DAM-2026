"use strict";
document.querySelector("#imprimir").onclick=()=>print();
async function leer(url) {const r=await fetch(url),d=await r.json();if(!r.ok||d.ok===false)throw new Error(d.error||"No se pudo cargar el informe.");return d;}
function element(tag,text,clase) {const n=document.createElement(tag);if(text)n.textContent=text;if(clase)n.className=clase;return n;}
async function cargarInforme() {
 const estado=document.querySelector("#estado");
 try{
  const id=new URLSearchParams(location.search).get("id");
  const config=await leer("../api/superapi.php?ruta=config");document.querySelector("#empresa").textContent=config.nombre;
  document.querySelector("#fecha").textContent="Generado: "+new Intl.DateTimeFormat("es-ES",{dateStyle:"long",timeStyle:"short",timeZone:"Europe/Madrid"}).format(new Date());
  let tablas;
  if(id){
   const d=await leer("../api/superapi.php?ruta=informe&id="+encodeURIComponent(id));document.querySelector("#titulo").textContent=d.informe.titulo;
   const filtros=Object.entries(d.informe.filtros).filter(([,v])=>v!=="").map(([k,v])=>k+": "+v).join(" · ");
   if(filtros)document.querySelector(".informe-cabecera").after(element("p","Consulta: "+filtros,"muted"));
   tablas=[{nombre:d.informe.tabla,...d.datos,columnas:d.datos.columnas.filter(c=>d.informe.columnas.includes(c.name))}];
  }else{
   tablas=(await leer("reporting.php")).tablas;
   const etiquetas=tablas.map(t=>t.nombre),valores=tablas.map(t=>t.total);let paleta;
   for(const [tipo,nombre] of [["barras","Barras"],["tarta","Tarta"],["anillo","Anillo"]]){
    const figura=element("figure",null,"tarjeta"),titulo=element("figcaption",nombre),g=element("div",null,"grafica "+tipo);g.setAttribute("data",JSON.stringify(valores));g.setAttribute("data-etiquetas",JSON.stringify(etiquetas));figura.append(titulo,g);document.querySelector("#graficas").append(figura);
    const chart=new GraficaSVG(g);chart.dibujar();paleta=chart.colores;
   }
   const leyenda=element("ul",null,"leyenda-graficas");etiquetas.forEach((t,i)=>{const li=element("li"),s=element("span");s.style.backgroundColor=paleta[i%paleta.length];li.append(s,document.createTextNode(t+": "+valores[i]));leyenda.append(li);});document.querySelector("#graficas").append(leyenda);
  }
  let total=0;let truncado=false;
  for(const t of tablas){
   const section=element("section",null,"entidad");section.append(element("h2",t.nombre),element("p",t.total+" registros · "+t.columnas.length+" columnas","recuento"));
   if(t.total>t.registros.length){section.append(element("p","Se muestran los primeros "+t.registros.length+" registros de "+t.total+". Acota la consulta con filtros.","error"));truncado=true;}
   const tabla=new Tabla(section,t.columnas);tabla.tabla.setAttribute("aria-label",t.nombre);tabla.actualizar(t.registros);document.querySelector("#tablas").append(section);total+=t.total;
  }
  estado.textContent=tablas.length+" entidades · "+total+" registros"+(truncado?" · Resultados limitados a 10 000 filas por entidad.":"");
  document.title=document.querySelector("#titulo").textContent+" · Purple Grape";document.querySelector("#imprimir").disabled=false;
 }catch(e){estado.textContent=e.message;estado.className="error";}
}
cargarInforme();

