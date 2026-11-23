"use strict";
let configuracion, vistaActual = "", generacion = 0, controlId = 0, timeoutAviso;
const contenido = document.querySelector("#contenido");
const euros = n => new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n);
const nombres = {clientes:"Clientes",productos:"Productos",pedidos:"Pedidos",lineaspedido:"Líneas de pedido",oportunidades:"Oportunidades",proveedores:"Proveedores",componentes:"Componentes",empleados:"Empleados",facturas:"Facturas"};
function nodo(tag,text="",clase="") { const n=document.createElement(tag); if(text!=="")n.textContent=text; if(clase)n.className=clase; return n; }
function boton(text,fn,clase="") { const b=nodo("button",text,clase);b.type="button";b.onclick=()=>accion(b,fn);return b; }
function enlace(text,href,clase="") { const a=nodo("a",text,clase);a.href=href;return a; }
function campo(titulo,tipo="text",valor="") { const wrap=nodo("div","","control"),l=nodo("label",titulo),i=nodo(tipo==="textarea"?"textarea":"input");if(i.tagName==="INPUT")i.type=tipo;i.value=valor;i.id="control-"+(++controlId);l.htmlFor=i.id;wrap.append(l,i);return [wrap,i]; }
function seleccion(titulo,opciones,valor) {
 const wrap=nodo("div","","control"),l=nodo("label",titulo),s=nodo("select");s.id="control-"+(++controlId);l.htmlFor=s.id;
 for(const o of opciones) {const v=typeof o==="string"?{value:o,label:o}:o;s.add(new Option(v.label,String(v.value)));}
 if(valor!==undefined)s.value=valor;wrap.append(l,s);return [wrap,s];
}
function aviso(text) { document.querySelector("#notificaciones").textContent=text;clearTimeout(timeoutAviso);timeoutAviso=setTimeout(()=>document.querySelector("#notificaciones").textContent="",7000); }
async function accion(b,fn) { b.disabled=true;try{await fn();}catch(e){aviso(e.message);}finally{b.disabled=false;} }
function direccion(ruta,params={}) { return "api/superapi.php?"+new URLSearchParams({ruta,...params}); }
async function api(ruta,params={},datos,signal) {
 const r=await fetch(direccion(ruta,params),datos===undefined?{signal}:{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":configuracion.csrf},body:JSON.stringify(datos),signal});
 let d;try{d=await r.json();}catch{throw new Error("El servidor no devolvió JSON. Comprueba que PHP está activo.");}
 if(!r.ok||d.ok===false)throw new Error(d.error||"No se pudo completar la operación.");
 return d;
}
function cabecera(titulo,descripcion) { const h=nodo("div","","intro"),c=nodo("div");c.append(nodo("h1",titulo),nodo("p",descripcion));h.append(c);return h; }
function seccion(titulo) {const s=nodo("section","","panel");s.append(nodo("h2",titulo));return s;}
function simpleTabla(parent,rows) {
 if(!rows.length){parent.append(nodo("p","Sin registros.","muted"));return;}
 const cols=Object.keys(rows[0]).map(name=>({name}));
 const t=new Tabla(parent,cols);t.actualizar(rows);return t;
}
function menu() {
 const m=document.querySelector("#modulos"),e=document.querySelector("#entidades");m.replaceChildren();e.replaceChildren();
 m.append(enlace("Vista general","#panel",vistaActual==="panel"?"activo":""));
 m.append(nodo("div","MÓDULOS","nav-titulo"));
 for(const id of configuracion.modulos) {
  const cat=configuracion.catalogo[id];m.append(enlace(cat.titulo,"#modulo/"+id,vistaActual==="modulo/"+id || cat.entidades.some(t=>vistaActual==="entidad/"+t)?"activo":""));
 }
 const custom=configuracion.entidades.filter(t=>!Object.values(configuracion.catalogo).some(m=>m.entidades.includes(t)));
 if(custom.length)m.append(enlace("Tablas propias","#modulo/propias",vistaActual==="modulo/propias"||custom.some(t=>vistaActual==="entidad/"+t)?"activo":""));
 m.append(nodo("div","HERRAMIENTAS","nav-titulo"));
 for(const [id,title] of [["informes","Informes"],["vistas","Consultas y vistas"],["adaptacion","Adaptación"],["integracion","Integración contable"],["ia","Asistente IA"],["auditoria","Operaciones"]])m.append(enlace(title,"#"+id,vistaActual===id?"activo":""));
 const mod=Object.entries(configuracion.catalogo).find(([,v])=>v.entidades.some(t=>vistaActual==="entidad/"+t))?.[0] || (vistaActual.startsWith("modulo/")?vistaActual.split("/")[1]:null);
 if(mod || vistaActual.startsWith("entidad/")) {
  const ts=configuracion.catalogo[mod]?.entidades||custom;
  e.append(nodo("span","ENTIDADES","nav-titulo"));
  for(const t of ts)e.append(enlace(nombres[t]||t,"#entidad/"+t,vistaActual==="entidad/"+t?"activo":""));
 } else {
  e.append(nodo("span","PURPLE GRAPE","nav-titulo"));
  e.append(nodo("p","Ventas, compras, personas y facturación en una misma aplicación.","nav-titulo"));
  e.append(enlace("Configurar módulos","#adaptacion"));
 }
}
async function navegar() {
 const numero=++generacion;vistaActual=decodeURIComponent(location.hash.slice(1))||"panel";menu();
 contenido.replaceChildren(nodo("p","Cargando…","muted"));
 try{
  let vista;
  if(vistaActual==="panel")vista=await vistaPanel();
  else if(vistaActual.startsWith("modulo/")) {
   const id=vistaActual.split("/")[1];const t=configuracion.catalogo[id]?.entidades[0]||configuracion.entidades.find(t=>!Object.values(configuracion.catalogo).some(m=>m.entidades.includes(t)));
   if(!t)throw new Error("No hay entidades en este módulo.");location.hash="entidad/"+t;return;
  } else if(vistaActual.startsWith("entidad/"))vista=await vistaEntidad(vistaActual.split("/")[1]);
  else if(vistaActual==="adaptacion")vista=await vistaAdaptacion();
  else if(vistaActual==="informes")vista=await vistaInformes();
  else if(vistaActual==="vistas")vista=await vistaConsultas();
  else if(vistaActual==="integracion")vista=await vistaIntegracion();
  else if(vistaActual==="ia")vista=vistaIA();
  else if(vistaActual==="auditoria") {vista=nodo("div");vista.append(cabecera("Operaciones realizadas","Últimas 100 operaciones. Las fechas de auditoría se guardan en UTC."));simpleTabla(vista,await api("auditoria"));}
  else throw new Error("Vista no encontrada.");
  if(numero!==generacion)return;contenido.replaceChildren(vista);
 }catch(error){if(numero===generacion)contenido.replaceChildren(nodo("h1","No se pudo cargar esta vista"),nodo("p",error.message,"error"),boton("Reintentar",navegar));}
}
function dibujarGrafica(parent,tipo,datos) {
 if(!datos.length){parent.append(nodo("p","Sin datos para esta consulta.","vacio"));return;}
 if(tipo==="tabla"){simpleTabla(parent,datos.map(d=>({Categoría:d.label,Valor:d.value})));return;}
 const g=nodo("div","","grafica "+tipo);g.setAttribute("data",JSON.stringify(datos.map(x=>Number(x.value))));g.setAttribute("data-etiquetas",JSON.stringify(datos.map(x=>x.label)));parent.append(g);
 const chart=new GraficaSVG(g);chart.dibujar();
 const ul=nodo("ul","","leyenda");
 for(const [i,d] of datos.entries()){const li=nodo("li"),sw=nodo("span","","muestra");sw.style.background=chart.colores[i%chart.colores.length];li.append(sw,document.createTextNode(d.label+": "+new Intl.NumberFormat("es-ES").format(d.value)));ul.append(li);}
 parent.append(ul);
}
async function vistaPanel() {
 const d=await api("panel"),v=nodo("div"),h=cabecera("Vista general","Indicadores calculados a partir de los datos del ERP. Personaliza las tarjetas según las necesidades de tu empresa.");
 h.append(boton("Añadir tarjeta",async()=>{
  if(d.tarjetas.length>=12)throw new Error("Máximo 12 tarjetas.");
  d.tarjetas.push({id:"card"+Date.now(),titulo:"Nuevo indicador",fuente:"ventas_cliente",tipo:"barras",ancho:1});
  await api("panel_guardar",{}, {tarjetas:d.tarjetas});await navegar();
 }));v.append(h);
 const kpis=nodo("div","","kpis");
 for(const [t,val] of [["Clientes",d.kpis.clientes],["Cartera de pedidos",euros(d.kpis.cartera)],["Oportunidades abiertas",d.kpis.oportunidades],["Alertas de stock",d.kpis.alertas]]){const k=nodo("article","","kpi");k.append(nodo("p",t),nodo("strong",String(val)));kpis.append(k);}v.append(kpis);
 const grid=nodo("div","","cuadricula-panel");
 for(const c of d.tarjetas){
  const card=nodo("article","","tarjeta ancho-"+c.ancho),head=nodo("div","","tarjeta-cabecera"),body=nodo("div"),config=nodo("div","","config-tarjeta");config.hidden=true;
  const toggle=boton("Configurar",()=>{body.hidden=!body.hidden;config.hidden=!config.hidden;toggle.textContent=config.hidden?"Configurar":"Ver tarjeta";});head.append(nodo("h2",c.titulo),toggle);card.append(head,body,config);
  dibujarGrafica(body,c.tipo,d.fuentes[c.fuente]);
  const [lt,t]=campo("Título","text",c.titulo);t.maxLength=100;t.required=true;
  const [lf,f]=seleccion("Datos",[{value:"ventas_mes",label:"Ventas por mes"},{value:"pedidos_estado",label:"Estado de pedidos"},{value:"registros",label:"Registros por entidad"},{value:"stock",label:"Stock bajo"},{value:"ventas_cliente",label:"Ventas por cliente"}],c.fuente);
  const [lv,tipo]=seleccion("Visualización",["barras","tarta","anillo","tabla"],c.tipo),[la,a]=seleccion("Columnas",["1","2","3"],c.ancho);
  const ac=nodo("div","","acciones");ac.append(boton("Guardar",async()=>{Object.assign(c,{titulo:t.value,fuente:f.value,tipo:tipo.value,ancho:Number(a.value)});await api("panel_guardar",{}, {tarjetas:d.tarjetas});await navegar();}),boton("Eliminar tarjeta",async()=>{await api("panel_guardar",{}, {tarjetas:d.tarjetas.filter(x=>x.id!==c.id)});await navegar();},"eliminar"));
  config.append(lt,lf,lv,la,ac);grid.append(card);
 }
 v.append(grid);return v;
}
function filtrosConsulta(schema,onChange,inicial={},formularioPropio=true) {
 const f=nodo(formularioPropio?"form":"div","","toolbar");
 const [lb,buscar]=campo("Buscar","search",inicial.buscar||"");
 const [lc,c]=seleccion("Campo",[{value:"",label:"Todos"},...schema.columnas.map(c=>({value:c.name,label:c.titulo}))],inicial.campo||"");
 const [lo,o]=seleccion("Condición",["=",">=","<=","LIKE"],inicial.operador||"=");
 const [lv,val]=campo("Valor","text",inicial.valor||"");
 const [lord,ord]=seleccion("Ordenar por",schema.columnas.map(c=>({value:c.name,label:c.titulo})),inicial.orden||schema.columnas[0].name);
 const [ls,sen]=seleccion("Sentido",[{value:"DESC",label:"Descendente"},{value:"ASC",label:"Ascendente"}],inicial.sentido||"DESC");
 f.append(lb,lc,lo,lv,lord,ls);
 let desde,hasta;
 if(schema.columnas.some(c=>["fecha","fecha_cierre"].includes(c.name))) {
  const [ld,d]=campo("Desde","date",inicial.desde||""),[lh,h]=campo("Hasta","date",inicial.hasta||"");desde=d;hasta=h;f.append(ld,lh);
 }
 const valores=()=>({buscar:buscar.value,campo:c.value,operador:o.value,valor:val.value,orden:ord.value,sentido:sen.value,...(desde?{desde:desde.value,hasta:hasta.value}:{})});
 const submit=nodo("button","Aplicar consulta");submit.type="submit";f.append(submit);
 if(formularioPropio)f.onsubmit=e=>{e.preventDefault();accion(submit,()=>onChange(valores()));};
 else {submit.type="button";submit.onclick=()=>accion(submit,()=>onChange(valores()));}
 return {elemento:f,valores};
}
async function vistaEntidad(nombre) {
 const d=await api("tabla",{tabla:nombre}),v=nodo("div");
 const localVista=vistaActual;const h=cabecera(nombres[nombre]||nombre,d.soloLectura?"Registros de consulta. Las facturas se emiten desde Pedidos.":"Gestiona los registros con controles adaptados a sus tipos y relaciones.");
 v.append(h);let filtros={},pagina=1,solicitud=0;const cont=nodo("div"),pie=nodo("div","","paginacion"),estado=nodo("p","","muted");
 async function refrescar() {
  const seq=++solicitud;const nuevos=await api("tabla",{tabla:nombre,...filtros,pagina});
  if(seq!==solicitud||vistaActual!==localVista)return;
  tabla.actualizar(nuevos.registros);pintarPie(nuevos);
 }
 const consulta=filtrosConsulta(d,async valores=>{filtros=valores;pagina=1;await refrescar();});
 v.append(consulta.elemento);
 const acciones=nodo("div","","toolbar");acciones.append(boton("Exportar consulta CSV",()=>{location.href=direccion("exportar",{tabla:nombre,...filtros});},"secundario"));
 if(nombre==="pedidos")acciones.append(boton("Calendario mensual",async()=>{cal.hidden=!cal.hidden;if(!cal.hidden)await calendario(cal);},"secundario"));
 v.append(acciones,estado);
 let formulario;
 if(!d.soloLectura){
  const relaciones={};
  await Promise.all([...new Set(d.columnas.filter(c=>c.relacion).map(c=>c.relacion))].map(async t=>{relaciones[t]=await api("opciones",{tabla:t});}));
  const det=nodo("details","","panel"),summary=nodo("summary","Crear / editar registro");det.append(summary);
  formulario=new Formulario(det,d.columnas,async(datos,registro)=>{await api(registro?"actualizar":"crear",{}, {tabla:nombre,id:registro?.identificador,datos});aviso("Registro guardado.");await refrescar();},relaciones);
  v.append(det);formulario.abrir=()=>{det.open=true;};
 }
 const cal=nodo("section","","panel");cal.hidden=true;v.append(cal,cont,pie);
 const tabla=new Tabla(cont,d.columnas,formulario?r=>{formulario.abrir();formulario.editar(r);}:null,formulario?async r=>{
  if(!confirm("¿Eliminar el registro "+r.identificador+"?"))return;
  try{await api("eliminar",{}, {tabla:nombre,id:r.identificador});formulario.nuevo();await refrescar();aviso("Registro eliminado.");}catch(e){aviso(e.message);}
 }:null,["pedidos","facturas"].includes(nombre)?(cell,r)=>{
  if(nombre==="pedidos")cell.append(boton("Emitir factura",async()=>{const res=await api("facturar",{}, {pedido_id:r.identificador});aviso((res.duplicada?"Ya existe la factura ":"Factura emitida: ")+res.factura.numero);}));
  else cell.append(boton(r.estado==="Sincronizada"?"Comprobar envío":"Enviar a contabilidad",async()=>{await api("sincronizar",{}, {factura_id:r.identificador});aviso("Factura contabilizada.");await refrescar();},"secundario"));
 }:null);
 function pintarPie(d) {
  estado.textContent=d.total+" registros · página "+d.pagina+" de "+Math.max(1,Math.ceil(d.total/d.limite));
  pie.replaceChildren();const ant=boton("Anterior",async()=>{pagina--;await refrescar();},"secundario"),sig=boton("Siguiente",async()=>{pagina++;await refrescar();},"secundario");
  ant.disabled=pagina<=1;sig.disabled=pagina*d.limite>=d.total;pie.append(ant,sig);
 }
 tabla.actualizar(d.registros);pintarPie(d);return v;
}
async function calendario(parent) {
 parent.replaceChildren(nodo("h2","Calendario de pedidos"));
 const mesInicial=new Date().toLocaleDateString("sv-SE").slice(0,7);
 const [lm,mes]=campo("Mes","month",mesInicial),grid=nodo("div","","calendario"),status=nodo("p","","muted");
 let seq=0;
 parent.append(lm,status,grid);
 async function actualizar(){
  const request=++seq;
  try {
   const rows=await api("calendario",{mes:mes.value});if(request!==seq)return;
   grid.replaceChildren();status.textContent=rows.length+" pedidos con fecha en este mes.";
   for(const dia of ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"])grid.append(nodo("div",dia,"dia-nombre"));
   const [y,m]=mes.value.split("-").map(Number),inicio=new Date(y,m-1,1),offset=(inicio.getDay()+6)%7,total=new Date(y,m,0).getDate();
   for(let i=0;i<offset;i++)grid.append(nodo("div","","dia vacio"));
   for(let i=1;i<=total;i++){const celda=nodo("div","","dia");celda.append(nodo("strong",String(i)));const fecha=mes.value+"-"+String(i).padStart(2,"0");for(const r of rows.filter(r=>r.fecha===fecha))celda.append(nodo("span","#"+r.identificador+" · "+r.cliente+" · "+r.estado,"evento"));grid.append(celda);}
  }catch(e){if(request===seq)status.textContent=e.message;}
 }
 mes.onchange=actualizar;await actualizar();
}
async function vistaConsultas() {
 const v=nodo("div");v.append(cabecera("Consultas y vistas","Vistas SQL con relaciones, agregaciones y alertas. Puedes filtrarlas, ordenarlas y exportarlas."));
 const [ls,s]=seleccion("Vista de base de datos",configuracion.vistas.map(value=>({value,label:value}))),area=nodo("div");
 v.append(ls,area);let seq=0;
 async function cargar(){
  const request=++seq;const d=await api("tabla",{tabla:s.value});if(request!==seq)return;
  area.replaceChildren();const rows=nodo("div"),status=nodo("p","","muted"),pagination=nodo("div","","paginacion");let filtros={},pagina=1,requestTable=0;
  const tabla=new Tabla(rows,d.columnas);
  async function buscar(){const req=++requestTable;const r=await api("tabla",{tabla:s.value,...filtros,pagina});if(req!==requestTable||request!==seq)return;tabla.actualizar(r.registros);pintar(r);}
  function pintar(r){status.textContent=r.total+" registros";pagination.replaceChildren();const ant=boton("Anterior",async()=>{pagina--;await buscar();},"secundario"),sig=boton("Siguiente",async()=>{pagina++;await buscar();},"secundario");ant.disabled=pagina<=1;sig.disabled=pagina*r.limite>=r.total;pagination.append(ant,sig);}
  const f=filtrosConsulta(d,async val=>{filtros=val;pagina=1;await buscar();});area.append(f.elemento,boton("Exportar vista CSV",()=>{location.href=direccion("exportar",{tabla:s.value,...filtros});},"secundario"),status,rows,pagination);
  tabla.actualizar(d.registros);pintar(d);
 }
 s.onchange=()=>cargar().catch(e=>aviso(e.message));await cargar();return v;
}
async function vistaAdaptacion() {
 const v=nodo("div");v.append(cabecera("Adaptar a tu empresa","Selecciona módulos y amplía el modelo de datos. Los campos nuevos se incorporan al formulario, la tabla, las consultas y los informes."));
 const mod=seccion("Módulos de trabajo"),f=nodo("form","","stack"),checks=nodo("div","","lista-check");
 for(const [id,c] of Object.entries(configuracion.catalogo)){const l=nodo("label","","check"),i=nodo("input");i.type="checkbox";i.name=id;i.checked=configuracion.modulos.includes(id);l.append(i,document.createTextNode(c.titulo));checks.append(l);}
 const guardar=nodo("button","Guardar módulos");guardar.type="submit";f.append(checks,guardar);
 f.onsubmit=e=>{e.preventDefault();accion(guardar,async()=>{await api("modulos_guardar",{}, {modulos:[...checks.querySelectorAll("input:checked")].map(x=>x.name)});configuracion=await api("config");menu();aviso("Módulos actualizados.");});};mod.append(f);v.append(mod);
 const dos=nodo("div","","dos-columnas"),tabla=seccion("Crear una tabla"),ft=nodo("form","","stack"),[ln,tn]=campo("Nombre SQL de la tabla","text");tn.required=true;tn.pattern="[a-z][a-z0-9_]{0,47}";ft.append(ln,nodo("small","Se crean identificador, nombre y notas. Después puedes añadir campos."));
 const bt=nodo("button","Crear tabla");bt.type="submit";ft.append(bt);ft.onsubmit=e=>{e.preventDefault();accion(bt,async()=>{await api("tabla_crear",{}, {nombre:tn.value});configuracion=await api("config");menu();await navegar();aviso("Tabla creada.");});};tabla.append(ft);
 const campos=seccion("Añadir un campo"),fc=nodo("form","","stack"),[le,ent]=seleccion("Tabla",configuracion.entidades.filter(t=>t!=="facturas")), [lc,n]=campo("Nombre SQL del campo"),[ll,titulo]=campo("Etiqueta en el formulario"),[ltype,tipo]=seleccion("Tipo",[{value:"text",label:"Texto"},{value:"textarea",label:"Texto largo"},{value:"email",label:"Email"},{value:"date",label:"Fecha"},{value:"number",label:"Número decimal"},{value:"checkbox",label:"Sí / No"},{value:"select",label:"Lista de opciones"}]),[lop,ops]=campo("Opciones separadas por comas");
 n.required=true;n.pattern="[a-z][a-z0-9_]{0,47}";titulo.required=true;lop.hidden=true;tipo.onchange=()=>{lop.hidden=tipo.value!=="select";ops.required=tipo.value==="select";};
 const bc=nodo("button","Añadir campo");bc.type="submit";fc.append(le,lc,ll,ltype,lop,nodo("small","Los campos añadidos son opcionales para conservar los registros existentes. Nombres en minúsculas, sin espacios ni acentos."),bc);
 fc.onsubmit=e=>{e.preventDefault();accion(bc,async()=>{await api("campo_crear",{}, {tabla:ent.value,nombre:n.value,titulo:titulo.value,tipo:tipo.value,opciones:ops.value});aviso("Campo añadido; ya está disponible en "+ent.value+".");n.value="";titulo.value="";});};campos.append(fc);dos.append(tabla,campos);v.append(dos);
 const esquema=seccion("Estructura y tipos de campo"),[lt,t]=seleccion("Consultar estructura",configuracion.entidades),area=nodo("div");esquema.append(lt,area);let seq=0;
 const actualizar=async()=>{const request=++seq;const d=await api("estructura",{tabla:t.value});if(request!==seq)return;area.replaceChildren();simpleTabla(area,d.columnas.map(c=>({Campo:c.name,"Tipo SQL":c.type,Control:c.tipo,Obligatorio:c.required?"Sí":"No",Editable:c.readonly?"No":"Sí"})));};
 t.onchange=()=>actualizar().catch(e=>aviso(e.message));await actualizar();v.append(esquema);return v;
}
async function vistaInformes() {
 const informes=await api("informes"),v=nodo("div");const h=cabecera("Informes a tu medida","Guarda consultas con un título, columnas y filtros propios. Los resultados se actualizan al abrir el informe.");
 h.append(enlace("Informe completo · UD3","nucleo/reporting.html","boton secundario"));v.append(h);
 const saved=seccion("Informes guardados");
 if(!informes.length)saved.append(nodo("p","Todavía no hay informes personalizados.","muted"));
 for(const r of informes){const item=nodo("div","","toolbar");item.append(enlace(r.titulo,"nucleo/reporting.html?id="+r.id),nodo("span",r.tabla,"badge"),boton("Eliminar",async()=>{if(!confirm("¿Eliminar el informe guardado?"))return;await api("informe_eliminar",{}, {id:r.id});await navegar();},"eliminar"));saved.append(item);}v.append(saved);
 const crear=seccion("Crear informe personalizado"),[le,ent]=seleccion("Origen de los datos",[...configuracion.entidades,...configuracion.vistas]),form=nodo("form","","stack"),[lt,titulo]=campo("Título del informe"),columns=nodo("div","","lista-check"),filtroArea=nodo("div"),status=nodo("p","","muted");
 titulo.required=true;titulo.maxLength=100;form.append(le,lt,nodo("h3","Columnas incluidas"),columns,filtroArea,status);
 let filtros,seq=0;
 async function actualizar(){const request=++seq;const d=await api("estructura",{tabla:ent.value});if(request!==seq)return;columns.replaceChildren();for(const c of d.columnas){const l=nodo("label","","check"),i=nodo("input");i.type="checkbox";i.value=c.name;i.checked=true;l.append(i,document.createTextNode(c.titulo));columns.append(l);}filtroArea.replaceChildren();filtros=filtrosConsulta(d,async f=>{const r=await api("tabla",{tabla:ent.value,...f});status.textContent=r.total+" registros coinciden con la consulta.";},{},false);filtroArea.append(filtros.elemento);};
 const save=nodo("button","Guardar informe");save.type="submit";
 form.append(save);form.onsubmit=e=>{e.preventDefault();accion(save,async()=>{await api("informe_guardar",{}, {titulo:titulo.value,tabla:ent.value,columnas:[...columns.querySelectorAll("input:checked")].map(i=>i.value),filtros:filtros.valores()});await navegar();aviso("Informe guardado.");});};
 ent.onchange=()=>actualizar().catch(e=>aviso(e.message));await actualizar();
 crear.append(form);v.append(crear);return v;
}
async function vistaIntegracion() {
 const d=await api("integracion"),v=nodo("div");v.append(cabecera("Integración contable","Emite una factura desde Pedidos y envíala al segundo sistema. Cada documento se contabiliza una sola vez, incluso si repites el envío."));
 const estado=seccion("Grape Contabilidad");
 estado.append(nodo("span",d.servicio.ok?"Conectado · "+d.servicio.motor:"Sin conexión","badge "+(d.servicio.ok?"ok":"error")),nodo("p",d.servicio.ok?"Motor activo: "+d.servicio.procedimiento:d.servicio.mensaje),nodo("p","La integración genera un asiento equilibrado: clientes (430), ventas (700) e IVA repercutido (477). IVA fijo del 21 % para el supuesto académico.","muted"));
 if(!d.servicio.ok)estado.append(nodo("pre","php -S 127.0.0.1:8085 router.php","pre"),nodo("p","Inicia ese segundo servidor desde esta carpeta. El servicio usa una base independiente. Consulta README.md para activar el procedimiento almacenado de MySQL.","muted"));
 estado.append(boton("Actualizar estado",navegar,"secundario"));v.append(estado);
 const fac=seccion("Facturas del ERP");const cols=["numero","cliente","fecha","total_centimos","estado","referencia_externa"].map(name=>({name}));
 const t=new Tabla(fac,cols,null,null,(cell,r)=>cell.append(boton("Sincronizar",async()=>{const r2=await api("sincronizar",{}, {factura_id:r.identificador});aviso("Asiento "+r2.referencia+(r2.duplicada?" ya existente.":" registrado."));await navegar();})));t.actualizar(d.facturas);v.append(fac);
 if(d.servicio.ok){const externos=seccion("Documentos en el sistema contable");simpleTabla(externos,d.servicio.documentos);const saldos=seccion("Saldos contables en céntimos");simpleTabla(saldos,d.servicio.saldos);v.append(externos,saldos);}
 const log=seccion("Historial de sincronización");simpleTabla(log,d.historial);v.append(log);return v;
}
function vistaIA() {
 const v=nodo("div");v.append(cabecera("Asistente de empresa","Analiza los indicadores del ERP o pide una propuesta para reorganizar el panel de control."));
 const p=seccion("Ollama · phi4-mini:latest"),estado=nodo("p","Conexión pendiente de comprobar.","muted"),[lp,prompt]=campo("Tu consulta","textarea");
 prompt.required=true;prompt.maxLength=2000;prompt.placeholder="Analiza la evolución de los pedidos y señala qué datos faltan para tomar una decisión.";
 const f=nodo("form","","stack"),acciones=nodo("div","","toolbar"),respuesta=nodo("div"),propuesta=nodo("div"),enviar=nodo("button","Consultar IA");enviar.type="submit";
 const permitir=nodo("label","","check"),proponer=nodo("input");proponer.type="checkbox";permitir.append(proponer,document.createTextNode("Permitir una propuesta para reorganizar el panel"));
 let controller,previo;
 const cancelar=boton("Cancelar",()=>controller?.abort(),"secundario");cancelar.hidden=true;
 const undo=boton("Deshacer cambio del panel",async()=>{if(!previo)return;await api("panel_guardar",{}, {tarjetas:previo});previo=null;undo.hidden=true;aviso("Panel anterior restaurado.");},"secundario");undo.hidden=true;
 acciones.append(enviar,cancelar,undo);f.append(lp,permitir,acciones);p.append(boton("Comprobar conexión",async()=>{const d=await api("ia_estado");estado.textContent=d.instalado?"Conectado. phi4-mini:latest está instalado.":"Ollama responde; falta instalar phi4-mini:latest.";},"secundario"),estado);
 p.append(nodo("p","Se envían tu consulta, indicadores agregados y configuración de tarjetas al Ollama configurado en el servidor. Las respuestas pueden contener errores: revisa la propuesta antes de aplicarla.","muted"),f);
 const ejemplos=nodo("div","","toolbar");for(const s of ["Analiza la evolución mensual de los pedidos sin cambiar el panel.","Cambia la tarjeta de estados de pedidos a barras y ocupa dos columnas."])ejemplos.append(boton(s,()=>{prompt.value=s;proponer.checked=s.startsWith("Cambia");prompt.focus();},"secundario"));p.append(ejemplos,respuesta,propuesta);v.append(p);
 f.onsubmit=async e=>{
  e.preventDefault();enviar.disabled=true;cancelar.hidden=false;controller=new AbortController();respuesta.replaceChildren();propuesta.replaceChildren();estado.className="muted";estado.textContent="Consultando phi4-mini:latest… Puede tardar hasta dos minutos.";
  try {
   const d=await api("ia",{}, {prompt:prompt.value,proponer:proponer.checked},controller.signal);respuesta.append(nodo("h3","Datos verificados de esta consulta"));simpleTabla(respuesta,d.referencia);respuesta.append(nodo("h3","Interpretación de la IA"),nodo("div",d.respuesta,"ai-respuesta"));estado.textContent="Respuesta recibida de "+d.modelo+".";
   if(d.tarjetas.length){propuesta.append(nodo("h3","Propuesta para el panel"));simpleTabla(propuesta,d.tarjetas);propuesta.append(boton("Aplicar propuesta",async()=>{previo=(await api("panel")).tarjetas;await api("panel_guardar",{}, {tarjetas:d.tarjetas});undo.hidden=false;propuesta.replaceChildren(nodo("p","Propuesta aplicada. Puedes abrir Vista general para comprobarla.","badge ok"));aviso("Panel actualizado.");}),boton("Descartar",()=>propuesta.replaceChildren(),"secundario"));}
  }catch(err){estado.textContent=err.name==="AbortError"?"Consulta cancelada.":err.message;estado.className="error";}
  finally{enviar.disabled=false;cancelar.hidden=true;controller=null;}
 };return v;
}
async function iniciar(){
 try {configuracion=await api("config");document.documentElement.style.setProperty("--color_corporativo",configuracion.color);addEventListener("hashchange",navegar);await navegar();}
 catch(e){contenido.replaceChildren(nodo("h1","No se pudo iniciar Purple Grape"),nodo("p",e.message,"error"));}
}
iniciar();

