/* QA en Chromium sobre copia temporal. Playwright solo es dependencia de desarrollo. */
"use strict";
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs=require("node:fs/promises"),os=require("node:os"),path=require("node:path");
const {spawn}=require("node:child_process"),net=require("node:net"),assert=require("node:assert/strict");
const ROOT=path.resolve(__dirname,"..");
async function port(){return new Promise((resolve,reject)=>{const s=net.createServer();s.on("error",reject);s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});});}
let count=0;
function check(condition,text){assert.ok(condition,text);console.log("OK UI "+String(++count).padStart(2,"0")+" · "+text);}
(async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),"pg-ui-")),project=path.join(tmp,"proyecto"),processes=[],errors=[],httpErrors=[];let browser;
 const evidence=path.join(ROOT,"docs","capturas");await fs.mkdir(evidence,{recursive:true});
 try{
  await fs.cp(ROOT,project,{recursive:true});
  await fs.rm(path.join(project,"var"),{recursive:true,force:true});await fs.mkdir(path.join(project,"var"));
  const p1=await port(),p2=await port(),base="http://127.0.0.1:"+p1;
  const env={...process.env,PURPLE_DB:path.join(project,"data/purplegrape.db"),CONTABILIDAD_DB:path.join(project,"var/contabilidad.sqlite"),CONTABILIDAD_MYSQL_DSN:"",CONTABILIDAD_URL:"http://127.0.0.1:"+p2+"/integraciones/contabilidad/api.php"};
  for(const p of [p1,p2])processes.push(spawn("php",["-S","127.0.0.1:"+p,"router.php"],{cwd:project,env,stdio:"ignore"}));
  for(let i=0;i<60;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const page=await browser.newPage({viewport:{width:1440,height:1000},locale:"es-ES"});
  page.on("pageerror",e=>errors.push(e.message));
  page.on("response",r=>{if(r.status()>=400)httpErrors.push(r.status()+" "+r.url());});
  page.on("dialog",d=>d.accept());
  await page.goto(base);await page.getByRole("heading",{name:"Vista general",exact:true}).waitFor();
  check(await page.locator(".tarjeta").count()===4,"Panel con cuatro tarjetas");
  check(await page.locator(".grafica svg").count()===3,"Gráficos SVG de barras, anillo y tarta");
  await page.screenshot({path:path.join(evidence,"01-panel.png"),fullPage:true});
  const card=page.locator(".tarjeta").first();await card.getByRole("button",{name:"Configurar",exact:true}).click();
  await card.getByLabel("Título",{exact:true}).fill("Pedidos por mes · UI");
  await card.getByRole("button",{name:"Guardar",exact:true}).click();await page.getByRole("heading",{name:"Pedidos por mes · UI",exact:true}).waitFor();
  await page.reload();await page.getByRole("heading",{name:"Pedidos por mes · UI",exact:true}).waitFor();
  check(true,"Configuración de tarjeta persiste al recargar");
  await page.locator('#modulos a[href="#modulo/ventas"]').click();await page.getByRole("heading",{name:"Clientes",exact:true}).waitFor();
  check(await page.locator("tbody tr").count()===30,"Tabla paginada de clientes");
  await page.getByText("Crear / editar registro",{exact:true}).click();
  const form=page.locator("form.formulario");
  await form.getByLabel("Nombre *",{exact:true}).fill("ZZ UI O'Connor <script>");
  await form.getByLabel("Email",{exact:true}).fill("ui@example.test");
  await form.getByRole("button",{name:"Crear registro",exact:true}).click();
  await page.getByRole("status").filter({hasText:"Registro guardado."}).waitFor();
  check((await page.locator("tbody").innerText()).includes("ZZ UI O'Connor <script>"),"Alta desde formulario y texto escapado");
  await page.locator("tbody tr").first().getByRole("button",{name:"Editar",exact:true}).click();
  await form.getByLabel("Nombre *",{exact:true}).fill("ZZ UI editado");
  await form.getByRole("button",{name:"Guardar cambios",exact:true}).click();
  await page.getByText("ZZ UI editado",{exact:true}).waitFor();
  check(true,"Edición desde la tabla");
  await page.screenshot({path:path.join(evidence,"02-clientes.png"),fullPage:true});
  await page.locator('#modulos a[href="#adaptacion"]').click();await page.getByRole("heading",{name:"Adaptar a tu empresa",exact:true}).waitFor();
  const field=page.locator("section").filter({has:page.getByRole("heading",{name:"Añadir un campo",exact:true})});
  await field.getByLabel("Tabla",{exact:true}).selectOption("clientes");
  await field.getByLabel("Nombre SQL del campo",{exact:true}).fill("contacto_web");
  await field.getByLabel("Etiqueta en el formulario",{exact:true}).fill("Contacto web");
  await field.getByLabel("Tipo",{exact:true}).selectOption("email");
  await field.getByRole("button",{name:"Añadir campo",exact:true}).click();await page.getByText("Campo añadido; ya está disponible en clientes.",{exact:true}).waitFor();
  await page.locator('#modulos a[href="#modulo/ventas"]').click();await page.getByRole("heading",{name:"Clientes",exact:true}).waitFor();await page.getByText("Crear / editar registro",{exact:true}).click();
  check(await page.getByLabel("Contacto web",{exact:true}).getAttribute("type")==="email","Campo personalizado genera control tipado");
  await page.locator('#entidades a[href="#entidad/pedidos"]').click();await page.getByRole("heading",{name:"Pedidos",exact:true}).waitFor();
  await page.getByRole("button",{name:"Calendario mensual",exact:true}).click();await page.getByLabel("Mes",{exact:true}).fill("2026-01");
  await page.getByText("1 pedidos con fecha en este mes.",{exact:true}).waitFor();
  check(await page.locator(".evento").count()===1,"Calendario mensual con datos reales");
  await page.locator('#modulos a[href="#informes"]').click();await page.getByRole("heading",{name:"Informes a tu medida",exact:true}).waitFor();
  await page.getByLabel("Título del informe",{exact:true}).fill("Informe UI de clientes");
  await page.getByLabel("Origen de los datos",{exact:true}).selectOption("clientes");
  await page.getByRole("button",{name:"Guardar informe",exact:true}).click();
  const link=page.getByRole("link",{name:"Informe UI de clientes",exact:true});await link.waitFor();
  await link.click();await page.getByRole("heading",{name:"Informe UI de clientes",exact:true}).waitFor();await page.getByRole("button",{name:"Imprimir / Guardar PDF",exact:true}).waitFor({state:"visible"});
  check(await page.locator(".entidad tbody tr").count()===62,"Informe personalizado muestra consulta actual");
  await page.pdf({path:path.join(evidence,"informe-ejemplo.pdf"),format:"A4",landscape:true,printBackground:true});
  await page.goto(base+"/nucleo/reporting.html");await page.waitForFunction(()=>!document.querySelector("#imprimir").disabled);
  check(await page.locator("#graficas svg").count()===3,"Informe completo conserva los tres gráficos UD3");
  await page.screenshot({path:path.join(evidence,"03-informe.png"),fullPage:true});
  await page.goto(base+"/#vistas");await page.getByRole("heading",{name:"Consultas y vistas",exact:true}).waitFor();await page.getByLabel("Vista de base de datos",{exact:true}).selectOption("v_stock_alertas");
  await page.waitForFunction(()=>document.querySelector("thead")?.textContent.includes("Stock minimo"));
  check(await page.locator("tbody tr").count()>=1,"Vista SQL de alertas accesible");
  await page.goto(base+"/#integracion");await page.getByRole("heading",{name:"Integración contable",exact:true}).waitFor();
  check((await page.locator("#contenido").innerText()).includes("Conectado · sqlite"),"Integración contable conectada desde interfaz");
  await page.goto(base+"/#ia");await page.getByRole("heading",{name:"Asistente de empresa",exact:true}).waitFor();
  check(!await page.getByLabel("Permitir una propuesta para reorganizar el panel",{exact:true}).isChecked(),"IA inicia en modo de análisis");
  const panelAnterior=await page.evaluate(async()=>await (await fetch("api/superapi.php?ruta=panel")).json());
  const propuestaCards=structuredClone(panelAnterior.tarjetas);propuestaCards[0].titulo="Propuesta revisada UI";
  await page.route("**/api/superapi.php?ruta=ia",route=>{
   const peticion=route.request().postDataJSON();
   return route.fulfill({json:{ok:true,modelo:"phi4-mini:latest",respuesta:"Interpretación de prueba; comprobar los indicadores verificados.",referencia:[{indicador:"Clientes",valor:"62"}],tarjetas:peticion.proponer?propuestaCards:[]}});
  });
  await page.getByLabel("Tu consulta",{exact:true}).fill("Analiza los indicadores");
  await page.getByRole("button",{name:"Consultar IA",exact:true}).click();
  await page.getByRole("heading",{name:"Datos verificados de esta consulta",exact:true}).waitFor();
  check(await page.getByRole("heading",{name:"Interpretación de la IA",exact:true}).count()===1,"Interfaz muestra indicadores verificados junto a la interpretación");
  await page.getByRole("button",{name:"Cambia la tarjeta",exact:false}).click();
  check(await page.getByLabel("Permitir una propuesta para reorganizar el panel",{exact:true}).isChecked(),"Ejemplo de cambio habilita propuestas");
  await page.getByRole("button",{name:"Consultar IA",exact:true}).click();
  await page.getByRole("button",{name:"Aplicar propuesta",exact:true}).waitFor();
  check((await page.evaluate(async()=>await (await fetch("api/superapi.php?ruta=panel")).json())).tarjetas[0].titulo!=="Propuesta revisada UI","La propuesta no se aplica automáticamente");
  await page.getByRole("button",{name:"Aplicar propuesta",exact:true}).click();
  await page.getByText("Propuesta aplicada. Puedes abrir Vista general para comprobarla.",{exact:true}).waitFor();
  check((await page.evaluate(async()=>await (await fetch("api/superapi.php?ruta=panel")).json())).tarjetas[0].titulo==="Propuesta revisada UI","Aplicar propuesta persiste el panel en el servidor");
  await page.getByRole("button",{name:"Deshacer cambio del panel",exact:true}).click();
  await page.getByText("Panel anterior restaurado.",{exact:true}).waitFor();
  check((await page.evaluate(async()=>await (await fetch("api/superapi.php?ruta=panel")).json())).tarjetas[0].titulo===panelAnterior.tarjetas[0].titulo,"Deshacer restaura la configuración anterior");
  await page.screenshot({path:path.join(evidence,"04-ia.png"),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.goto(base+"/#panel");await page.getByRole("heading",{name:"Vista general",exact:true}).waitFor();
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Panel adaptable a móvil sin desbordamiento");
  await page.screenshot({path:path.join(evidence,"05-movil.png"),fullPage:true});
  check(errors.length===0,"Sin errores JavaScript: "+errors.join("; "));
  check(httpErrors.length===0,"Sin respuestas HTTP fallidas: "+httpErrors.join("; "));
  console.log("RESULTADO UI: "+count+" comprobaciones correctas.");
 }catch(error){
  console.error("Errores JS:",errors);
  console.error("Errores HTTP:",httpErrors);
  if(browser){for(const ctx of browser.contexts())for(const p of ctx.pages())await p.screenshot({path:path.join(evidence,"error-ui.png"),fullPage:true}).catch(()=>{});}
  throw error;
 }finally{
  await browser?.close();
  for(const p of processes)p.kill();
  await fs.rm(tmp,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});

