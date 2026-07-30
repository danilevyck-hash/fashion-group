// ¿EL ENCABEZADO CAMBIÓ DE ALTO al agrandar sus targets a 44 px? Debe ser NO.
//
// 🩸 POR QUÉ EXISTE. Agrandar un control a 44 px es fácil; hacerlo SIN empujar
// el contenido de las 54 pantallas hacia abajo, no. La barra de migas mide
// 26 px y sus botones tienen que medir 44: el área táctil crece hacia afuera y
// un margen negativo la reabsorbe. El número exacto del margen (`-my-[13px]`,
// que es (44-26)/2 hacia cada lado) NO se adivina — se mide acá. Con `-my-3`
// la barra crecía 2 px y todo el contenido bajaba 2 px en escritorio.
//
// Regla de la casa: escritorio NO puede empeorar. `primerContenidoY` es el
// número que lo prueba — dónde empieza el <h1> de la página.
//
// Solo lectura: no se hace click en nada.
//
//   node scripts/_probe-alto-encabezado.mjs
import { chromium } from "playwright";
import { readFileSync } from "fs";
const COOKIE = readFileSync("/tmp/fg-cookie.txt","utf8").trim();
const BASE="http://localhost:3173";
const nav = await chromium.launch();
for (const W of [390,834,1024,1440]) {
  const ctx = await nav.newContext({ viewport:{width:W,height:W>=1200?900:1194}, hasTouch:W<1200 });
  await ctx.addCookies([{name:"cxc_session",value:COOKIE,url:BASE}]);
  await ctx.addInitScript(()=>{delete Navigator.prototype.serviceWorker;});
  await ctx.addInitScript(()=>{sessionStorage.setItem("cxc_role","admin");sessionStorage.setItem("fg_user_name","Daniel Levy");sessionStorage.setItem("fg_user_id","10948974-05bb-4e58-b708-a450cfd45d6c");sessionStorage.setItem("fg_is_owner","1");sessionStorage.setItem("fg_modules",JSON.stringify(["caja","cheques","prestamos","cxc","ventas","admin"]));});
  const p = await ctx.newPage();
  await p.goto(BASE+"/caja",{waitUntil:"domcontentloaded"});
  await p.waitForTimeout(7000);
  const r = await p.evaluate(()=>{
    const cab = document.querySelector("div.sticky.top-0");
    const fila = cab?.querySelector("div.h-11");
    const migas = cab ? [...cab.querySelectorAll("div")].find(d=>d.textContent.trim().startsWith("Inicio") && d.querySelectorAll("button").length>0) : null;
    const h1 = document.querySelector("h1");
    return {
      encabezado: cab ? Math.round(cab.getBoundingClientRect().height) : null,
      filaSuperior: fila ? Math.round(fila.getBoundingClientRect().height) : null,
      barraMigas: migas ? Math.round(migas.getBoundingClientRect().height) : null,
      primerContenidoY: h1 ? Math.round(h1.getBoundingClientRect().top) : null,
    };
  });
  console.log(String(W).padStart(4), JSON.stringify(r));
  await ctx.close();
}
await nav.close();
