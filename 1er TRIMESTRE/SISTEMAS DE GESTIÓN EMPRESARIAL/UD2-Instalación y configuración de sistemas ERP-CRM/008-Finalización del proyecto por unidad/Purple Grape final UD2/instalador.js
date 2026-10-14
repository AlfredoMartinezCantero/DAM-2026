'use strict';
let token='';
const status=document.querySelector('#estado-instalacion');
const campos=document.querySelector('#opciones-instalacion');
async function comprobar() {
    try {
        const r=await fetch('api/instalar.php');const datos=await r.json();
        if(!r.ok)throw new Error(datos.error);
        token=datos.csrf;campos.disabled=datos.instalado;
        status.textContent=datos.instalado?'Tu base de datos ya está creada. Entra al estudio para configurar los módulos.':'Listo. Elige una instalación adaptada a tu estudio.';
    } catch { status.textContent='No se pudo comprobar el servidor. Abre esta página mediante Apache o PHP y comprueba las extensiones SQLite.'; }
}
document.querySelector('#instalacion').onsubmit=async e=>{
    e.preventDefault();const datos=Object.fromEntries(new FormData(e.target));datos.demo=datos.demo==='on';campos.disabled=true;
    try {
        const r=await fetch('api/instalar.php',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify(datos)});const respuesta=await r.json();
        if(!r.ok)throw new Error(respuesta.error);
        document.querySelector('#error-instalacion').textContent='';await comprobar();status.textContent='Base creada correctamente. Ya puedes abrir el archivo SQLite y entrar al estudio.';
    } catch(err) { document.querySelector('#error-instalacion').textContent=err.message;await comprobar(); }
};
comprobar();
