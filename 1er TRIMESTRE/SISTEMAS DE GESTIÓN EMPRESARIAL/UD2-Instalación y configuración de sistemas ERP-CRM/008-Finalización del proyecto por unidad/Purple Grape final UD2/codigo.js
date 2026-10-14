'use strict';
const $ = (selector) => document.querySelector(selector);
const contenido = $('#contenido');
const state = { config: {}, modulos: {}, csrf: '', vista: 'inicio', tabla: '', registros: [], meta: {}, opciones: {}, filtro: '', estado: '', pagina: 1 };
let revision = 0;
let toastTimer;
let editando = null;
let tablaEditor = '';
const escapar = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dinero = v => new Intl.NumberFormat('es-ES', {style:'currency',currency:'EUR'}).format(Number(v));
const fecha = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Intl.DateTimeFormat('es-ES').format(new Date(v + 'T12:00:00')) : v;
const codigo = id => '#' + String(id).padStart(4,'0');
const detalleActividad = a => a.entidad === 'sistema' && a.accion === 'Configuración' ? 'Ajustes de identidad y perfil actualizados.' : a.detalle;
const badge = v => `<span class="badge ${{Activo:'green',Pagada:'green',Entregado:'green',Confirmado:'blue',Pendiente:'',Potencial:'',Cancelado:'red',Inactivo:'gray'}[v] || ''}">${escapar(v)}</span>`;
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
async function api(ruta, datos, parametros = {}) {
    const query = new URLSearchParams({ruta, ...parametros});
    const res = await fetch(`api/superapi.php?${query}`, datos ? {method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.csrf},body:JSON.stringify(datos)} : {});
    let json;
    try { json = await res.json(); } catch { throw new Error('El servidor no devuelve JSON. Abre el proyecto mediante Apache o el servidor PHP.'); }
    if (!res.ok || json.ok === false) throw new Error(json.error || 'No se pudo completar la operación.');
    return json;
}
function aviso(texto) { $('#aviso').textContent = texto; $('#aviso').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#aviso').classList.remove('show'),4000); }
function aplicarConfig() {
    $('#nombre-estudio').textContent = state.config.nombre;
    document.title = state.config.nombre === 'Purple Grape' ? 'Purple Grape · Mi estudio' : `Purple Grape · ${state.config.nombre}`;
    document.querySelector('meta[name="theme-color"]').content = state.config.color;
    document.documentElement.style.setProperty('--accent', state.config.color);
}
function menu() {
    $('#modulos').innerHTML = '<button class="nav-item" data-vista="inicio"><span>▧</span>Vista general</button>' + Object.entries(state.modulos).map(([id,m])=>`<button class="nav-item" data-vista="${id}"><span aria-hidden="true">${m.icono}</span>${escapar(m.nombre)}</button>`).join('');
}
async function iniciar(vista='inicio') {
    try {
        const inicio = await api('inicio');
        Object.assign(state, inicio);
        aplicarConfig(); menu();
        state.opciones = await api('opciones');
        await navegar(vista);
    } catch(e) { errorPantalla(e); }
}
function errorPantalla(e) {
    contenido.innerHTML = `<div class="error-card"><p class="eyebrow">NO SE PUDO CONECTAR</p><h1>Vamos a ponerlo en marcha.</h1><p>${escapar(e.message)}</p><a class="button primary" href="instalador.html">Abrir instalador ↗</a> <button class="button secondary" data-reintentar>Reintentar</button></div>`;
}
function cabecera(titulo, descripcion, accion='') { return `<div class="page-heading"><div><p class="eyebrow">MI ESTUDIO / ${escapar(state.config.nombre)}</p><h1>${escapar(titulo)}</h1><p class="subheading">${escapar(descripcion)}</p></div>${accion}</div>`; }
async function navegar(vista) {
    const ticket = ++revision;
    state.vista = vista; state.filtro=''; state.estado=''; state.pagina=1;
    document.querySelectorAll('[data-vista]').forEach(b=>{b.classList.toggle('activo',b.dataset.vista===vista); if(b.dataset.vista===vista)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    $('#ruta-actual').textContent = state.modulos[vista]?.nombre || {inicio:'Vista general',ajustes:'Ajustes del estudio',ayuda:'Guía del proyecto'}[vista];
    contenido.innerHTML='<div class="cargando">Preparando tu espacio…</div>';
    try {
        if(vista==='inicio') { const resumen=await api('resumen'); if(ticket===revision) pintarResumen(resumen); }
        else if(vista==='ajustes') ajustes();
        else if(vista==='ayuda') ayuda();
        else if(state.modulos[vista]) await cargarTabla(Object.keys(state.modulos[vista].entidades)[0],ticket);
    } catch(e) { if(ticket===revision) errorPantalla(e); }
}
function pintarResumen(d) {
    const defs = {clientes:['Clientes del estudio','Relaciones activas y potenciales','◎'],pedidos:['Pedidos en marcha','Pendientes y confirmados','↗'],cobros:['Pendiente de cobro','Facturas pendientes · IVA incluido','€'],stock:['Avisos de stock','Productos en el mínimo o por debajo','▦']};
    contenido.innerHTML=cabecera('Todo conectado. Todo a punto.','Tu actividad, tus clientes y tus próximas ideas, en el mismo lugar.', '<button class="button secondary" data-exportar>↓ Exportar datos</button>') +
    `<section class="hero" aria-label="Bienvenida"><div><p class="eyebrow">PURPLE GRAPE / IDEAS QUE CRECEN</p><h2>Dale espacio a lo que<br>estás construyendo.</h2><p>Cada cliente, cada pedido, cada nueva idea.<br>Todo empieza a conectar en Purple Grape.</p></div><div class="hero-art" aria-hidden="true"><img class="grape-illustration" src="uvas.svg" alt="" width="320" height="320"><span class="art-label">CRECER, A MI MANERA ↗</span></div></section>` +
    `<div class="kpis">${Object.entries(d.kpis).map(([k,v])=>`<article class="kpi ${k==='cobros'?'accent':''}"><span class="kpi-icon" aria-hidden="true">${defs[k][2]}</span><p class="kpi-title">${defs[k][0]}</p><div class="kpi-value">${k==='cobros'?dinero(v):v}</div><p class="kpi-foot">${defs[k][1]}</p></article>`).join('')}</div>` +
    `<div class="dashboard-grid"><div>${state.modulos.ventas?`<section class="card"><div class="card-head"><h2>Últimos pedidos</h2><button class="text-link" data-vista="ventas">Ver todos ↗</button></div>${d.pedidos.length?`<div class="table-wrap"><table><thead><tr><th>Pedido / cliente</th><th>Fecha</th><th>Estado</th><th>Importe sin IVA</th></tr></thead><tbody>${d.pedidos.map(p=>`<tr><td><span class="mono">${codigo(p.id)}</span><br><span class="primary-cell">${escapar(p.cliente)}</span></td><td>${fecha(p.fecha)}</td><td>${badge(p.estado)}</td><td class="primary-cell">${dinero(p.total)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">Tu primer pedido empieza en el módulo Ventas.</p>'}</section>`:''}
    <section class="card"><div class="card-head"><h2>Así se mueve el estudio</h2><small>Últimas operaciones</small></div><ul class="activity-list">${d.actividad.map(a=>`<li><span class="activity-dot"></span><div><strong>${escapar(a.accion)} · ${escapar(a.entidad)}<br>${escapar(detalleActividad(a))}</strong><small>${escapar(new Date(a.fecha).toLocaleString('es-ES'))}</small></div></li>`).join('') || '<li class="empty">Aquí aparecerán las operaciones del estudio.</li>'}</ul></section></div>
    <div class="dashboard-side">${state.modulos.inventario?`<section class="card"><div class="card-head"><h2>Ojo con las existencias</h2><span class="badge red">${d.kpis.stock} avisos</span></div><div class="stock-list">${d.stock.map(p=>`<div class="stock-row"><div><strong>${escapar(p.nombre)}</strong><small>Mínimo recomendado: ${p.stock_minimo}</small></div><span class="stock-count">${p.stock}<small>unidades</small></span></div>`).join('') || '<p class="empty">Todo en orden. No hay productos bajo mínimos.</p>'}</div></section>`:''}<aside class="note-card"><p class="eyebrow">EL ESPÍRITU PURPLE GRAPE</p><h3>Buenas ideas. Buenas raíces.</h3><p>Un proyecto propio que crece con lo aprendido en DAM. Personas, productos y decisiones que comparten el mismo espacio.</p><button class="text-link" data-vista="ayuda">Explorar el proyecto ↗</button></aside></div></div>`;
}
async function cargarTabla(tabla, ticket=++revision) {
    const d = await api('tabla',null,{tabla});
    if(ticket!==revision)return;
    state.tabla=tabla; state.registros=d.registros; state.meta=d.meta; state.filtro='';state.estado='';state.pagina=1;
    const mod=state.modulos[state.vista];
    contenido.innerHTML=cabecera(mod.nombre,mod.descripcion,`<button class="button primary" data-nuevo>+ Nuevo ${escapar(d.meta.singular)}</button>`) +
    `<nav class="tabs" aria-label="Entidades de ${escapar(mod.nombre)}">${Object.entries(mod.entidades).map(([t,m])=>`<button class="tab ${t===tabla?'activo':''}" data-tabla="${t}" ${t===tabla?'aria-current="page"':''}>${escapar(m.nombre)}</button>`).join('')}</nav>` +
    `<section class="card"><div class="toolbar"><div class="filters"><input class="search" id="buscar" type="search" aria-label="Buscar registros" placeholder="Buscar en ${escapar(d.meta.nombre.toLowerCase())}…">${d.meta.campos.estado?`<select id="filtro-estado" aria-label="Filtrar por estado"><option value="">Todos los estados</option>${d.meta.campos.estado.options.map(v=>`<option>${v}</option>`).join('')}</select>`:''}</div><span class="table-info" id="cantidad-registros"></span></div><div id="tabla-datos"></div><div class="pagination"><span id="pagina-info"></span><div><button class="button secondary" id="anterior" aria-label="Página anterior">←</button> <button class="button secondary" id="siguiente" aria-label="Página siguiente">→</button></div></div></section><p class="subheading">${{pedidos:'Añade sus productos en «Líneas de pedido». El total se calcula automáticamente, sin IVA.',facturas:'IVA fijo del 21 %. Al facturar se bloquean las modificaciones del pedido y sus líneas.',productos:'Las existencias se gestionan manualmente; los pedidos no descuentan stock.',lineaspedido:'El precio de cada línea conserva el importe acordado con el cliente.'}[tabla] || 'Los cambios se guardan en SQLite y quedan registrados en el historial.'}</p>`;
    $('#buscar').addEventListener('input',e=>{state.filtro=e.target.value;state.pagina=1;pintarFilas();});
    $('#filtro-estado')?.addEventListener('change',e=>{state.estado=e.target.value;state.pagina=1;pintarFilas();});
    $('#anterior').onclick=()=>{state.pagina--;pintarFilas();}; $('#siguiente').onclick=()=>{state.pagina++;pintarFilas();};
    pintarFilas();
}
function valorCelda(k,v) {
    const info=state.meta.campos[k];
    if(k==='id')return `<span class="mono">${codigo(v)}</span>`;
    if(k==='estado')return badge(v);
    if(['precio','precio_unitario','salario','total','base','iva'].includes(k))return dinero(v);
    if(info?.type==='date')return fecha(v);
    if(info?.type==='relation')return escapar(state.opciones[info.table]?.find(o=>o.id===Number(v))?.nombre || codigo(v));
    return escapar(v);
}
function pintarFilas() {
    const filtro=state.filtro.toLocaleLowerCase('es');
    const registros=state.registros.filter(r=>(!state.estado||r.estado===state.estado)&&Object.entries(r).some(([k,v])=>{
        const info=state.meta.campos[k];
        const texto=info?.type==='relation' ? state.opciones[info.table]?.find(o=>o.id===Number(v))?.nombre : v;
        return String(texto??'').toLocaleLowerCase('es').includes(filtro);
    }));
    const paginas=Math.max(1,Math.ceil(registros.length/8)); state.pagina=Math.min(state.pagina,paginas);
    const campos={id:{label:'Ref.'},...state.meta.campos};
    if(state.tabla==='pedidos')campos.total={label:'Total sin IVA'};
    if(state.tabla==='facturas')Object.assign(campos,{base:{label:'Base'},iva:{label:'IVA 21 %'},total:{label:'Total'}});
    $('#cantidad-registros').textContent=`${registros.length} registro${registros.length===1?'':'s'}`;
    $('#tabla-datos').innerHTML=registros.length?`<div class="table-wrap"><table><thead><tr>${Object.values(campos).map(c=>`<th scope="col">${c.label}</th>`).join('')}<th scope="col">Acciones</th></tr></thead><tbody>${registros.slice((state.pagina-1)*8,state.pagina*8).map(r=>`<tr>${Object.keys(campos).map(k=>`<td class="${k==='nombre'?'primary-cell':''}">${valorCelda(k,r[k])}</td>`).join('')}<td><div class="row-actions"><button data-editar="${r.id}" aria-label="Editar registro ${r.id}">Editar</button><button class="remove" data-eliminar="${r.id}" aria-label="Eliminar registro ${r.id}">Eliminar</button></div></td></tr>`).join('')}</tbody></table></div>`:`<p class="empty">${state.registros.length?'No hay resultados para esta búsqueda.':'Todavía no hay registros. Crea el primero con el botón de arriba.'}</p>`;
    $('#pagina-info').textContent=`Página ${state.pagina} de ${paginas}`;
    $('#anterior').disabled=state.pagina<=1;$('#siguiente').disabled=state.pagina>=paginas;
}
async function abrirEditor(registro=null) {
    try { state.opciones=await api('opciones'); } catch(e) { aviso(e.message);return; }
    editando=registro;tablaEditor=state.tabla;
    $('#titulo-editor').textContent=`${registro?'Editar':'Nuevo'} ${state.meta.singular}`;
    $('#error-formulario').textContent='';
    $('#campos').innerHTML=Object.entries(state.meta.campos).map(([k,info])=>{
        const v=registro?.[k]??(info.type==='date'?hoy():info.type==='number'||info.type==='integer'?(k==='cantidad'?1:0):'');
        const attr=`name="${k}" id="campo-${k}" ${info.required?'required':''}`;
        let input;
        if(info.type==='select'||info.type==='relation') {
            const options=info.type==='relation'?(state.opciones[info.table]||[]).map(o=>[o.id,o.nombre]):info.options.map(o=>[o,o]);
            input=`<select ${attr}>${info.type==='relation'?'<option value="">Selecciona una opción</option>':''}${options.map(([value,label])=>`<option value="${escapar(value)}" ${String(value)===String(v)?'selected':''}>${escapar(label)}</option>`).join('')}</select>`;
        } else if(info.type==='textarea') input=`<textarea ${attr} maxlength="2000">${escapar(v)}</textarea>`;
        else input=`<input ${attr} type="${info.type==='integer'?'number':info.type}" value="${escapar(v)}" ${['number','integer'].includes(info.type)?`min="${info.min}" max="1000000000" step="${info.type==='integer'?'1':'.01'}"`:'maxlength="2000"'}>`;
        return `<label class="field ${info.type==='textarea'?'wide':''}" for="campo-${k}">${escapar(info.label)}${info.required?' *':''}${input}</label>`;
    }).join('');
    if(tablaEditor==='lineaspedido') $('#campo-producto_id').addEventListener('change',async e=>{
        if(editando)return;
        const selected=e.target.value;
        try { const d=await api('tabla',null,{tabla:'productos'}); if($('#campo-producto_id')?.value===selected) $('#campo-precio_unitario').value=d.registros.find(p=>p.id===Number(selected))?.precio??0; }
        catch { /* El precio puede introducirse manualmente si inventario está desactivado. */ }
    });
    $('#editor').showModal();
}
$('#formulario').addEventListener('submit',async e=>{
    e.preventDefault(); const boton=$('#guardar');boton.disabled=true;
    try {
        const datos=Object.fromEntries(new FormData(e.target));
        await api(editando?'actualizar':'crear',{tabla:tablaEditor,id:editando?.id,datos});
        $('#editor').close();aviso('Registro guardado. Un paso más para tu estudio.');
        state.opciones=await api('opciones');await cargarTabla(tablaEditor);
    } catch(err) { $('#error-formulario').textContent=err.message; }
    finally { boton.disabled=false; }
});
$('#cerrar-editor').onclick=$('#cancelar-editor').onclick=()=>$('#editor').close();
$('#cancelar-eliminar').onclick=()=>$('#confirmacion').close();
function confirmarEliminar(id) {
    const tabla=state.tabla;$('#error-eliminar').textContent='';$('#confirmacion').showModal();
    $('#confirmar-eliminar').onclick=async()=>{
        $('#confirmar-eliminar').disabled=true;
        try { await api('eliminar',{tabla,id});$('#confirmacion').close();aviso('Registro eliminado.');state.opciones=await api('opciones');await cargarTabla(tabla); }
        catch(e) { $('#error-eliminar').textContent=e.message; }
        finally { $('#confirmar-eliminar').disabled=false; }
    };
}
function ajustes() {
    contenido.innerHTML=cabecera('Hazlo tuyo.','Nombre, color y módulos adaptados a tu forma de trabajar.') +
    `<form id="configuracion" class="card settings-card"><p class="eyebrow">IDENTIDAD Y CONFIGURACIÓN</p><div class="form-grid"><label class="field wide">Nombre del estudio<input name="nombre" required minlength="3" maxlength="100" value="${escapar(state.config.nombre)}"></label><label class="field">Color de acento<input name="color" type="color" value="${escapar(state.config.color)}" required></label><label class="field">Perfil de módulos<select name="perfil">${['completo','comercial','taller'].map(v=>`<option value="${v}" ${v===state.config.perfil?'selected':''}>${{completo:'Estudio completo · 6 módulos',comercial:'Oficina comercial · 4 módulos',taller:'Taller técnico · 4 módulos'}[v]}</option>`).join('')}</select></label></div><p class="install-info">Completo: todos los módulos. Comercial: clientes, ventas, inventario y facturación. Taller: clientes, inventario, compras y equipo. Al cambiar de perfil se conservan los datos.</p><p id="error-config" class="form-error" role="alert"></p><button class="button primary" type="submit">Guardar configuración ↗</button></form><div class="note-card" style="max-width:740px"><h3>Tu base de datos, a mano.</h3><p>Archivo: <strong>data/darkorange_alfredo.sqlite</strong>. Puedes abrirlo con DB Browser for SQLite. Para probar una instalación vacía, sigue los pasos de la guía del proyecto.</p></div>`;
    $('#configuracion').onsubmit=async e=>{
        e.preventDefault(); const button=e.target.querySelector('button[type=submit]');button.disabled=true;
        try { await api('configurar',Object.fromEntries(new FormData(e.target)));await iniciar('ajustes');aviso('El estudio ya tiene tu toque.'); }
        catch(err) { $('#error-config').textContent=err.message;button.disabled=false; }
    };
}
function ayuda() {
    contenido.innerHTML=cabecera('Cada decisión tiene un porqué.','Guía rápida del ERP-CRM y de la entrega de UD2.') +
    `<div class="help-grid"><article class="help-item"><p class="eyebrow">01 / MÓDULOS</p><h2>Un estudio conectado</h2><p>Clientes para el CRM; ventas para pedidos y líneas; inventario para productos; compras para proveedores y componentes; equipo para empleados; facturación para cobros.</p></article><article class="help-item"><p class="eyebrow">02 / INSTALACIÓN</p><h2>Vacía o con demostración</h2><p>El instalador web y la utilidad de consola crean el mismo esquema. Hay tres perfiles de módulos. La instalación rechaza sobrescribir una base existente.</p><a href="instalador.html">Ver el instalador ↗</a></article><article class="help-item"><p class="eyebrow">03 / TECNOLOGÍAS</p><h2>Cliente y servidor, cada uno a lo suyo</h2><p>HTML5, CSS3 y JavaScript en el navegador. PHP con PDO en el servidor. SQLite para guardar los datos. Apache y Linux como entorno objetivo. Sin compilación ni paquetes externos.</p></article><article class="help-item"><p class="eyebrow">04 / FLUJO DE VENTA</p><h2>De cliente a factura</h2><ol><li>Crea un cliente y un producto.</li><li>Crea un pedido en Ventas.</li><li>Añade productos en Líneas de pedido.</li><li>Emite la factura y registra su pago.</li></ol><p>Stock manual e IVA fijo del 21 %. Es un prototipo académico para uso local.</p></article><article class="help-item"><p class="eyebrow">05 / BASE DE DATOS</p><h2>Abre SQLite manualmente</h2><p>Abre <code>data/darkorange_alfredo.sqlite</code> con tu visor. Las vistas <code>resumen_pedidos</code> y <code>resumen_facturas</code> calculan los importes. Activa <code>PRAGMA foreign_keys = ON</code> si modificas datos desde otra herramienta.</p></article><article class="help-item"><p class="eyebrow">06 / DOCUMENTACIÓN</p><h2>Preparado para revisar</h2><p>Consulta <a href="README.md">README.md</a>, <a href="docs/MEMORIA-UD2.md">la memoria de UD2</a> y <a href="docs/VERIFICACION.md">la verificación</a>. Incluyen decisiones, instalaciones, supuestos y criterios a–f.</p><p>La exportación JSON se descarga desde la vista general. La copia del archivo SQLite conserva toda la base.</p></article></div>`;
}
document.addEventListener('click',e=>{
    const vista=e.target.closest('[data-vista]');if(vista){navegar(vista.dataset.vista);return;}
    const tab=e.target.closest('[data-tabla]');if(tab){cargarTabla(tab.dataset.tabla).catch(errorPantalla);return;}
    if(e.target.closest('[data-nuevo]'))abrirEditor();
    const editar=e.target.closest('[data-editar]');if(editar)abrirEditor(state.registros.find(r=>r.id===Number(editar.dataset.editar)));
    const borrar=e.target.closest('[data-eliminar]');if(borrar)confirmarEliminar(Number(borrar.dataset.eliminar));
    if(e.target.closest('[data-exportar]'))window.location.href='api/superapi.php?ruta=exportar';
    if(e.target.closest('[data-reintentar]'))iniciar();
});
$('#fecha-hoy').textContent=new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'long',year:'numeric'}).format(new Date());
iniciar();
