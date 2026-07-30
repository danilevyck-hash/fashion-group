// Geometría EXACTA de los contenedores que recortan, sin umbrales.
//
// 🩸 POR QUÉ. El censo (`_medir-scroll-lateral.mjs`) usa un umbral de 100 px para
// separar "una tabla recortada" de "un texto con puntos suspensivos". Ese umbral
// es correcto para un barrido de 26 pantallas, pero ESCONDE los recortes chicos:
// Multifashion › Clientes a 834 px reportaba 0 y en realidad recorta ~57 px. Para
// arreglar una pantalla hace falta el número crudo, no el clasificado.
//
// Reporta, por pantalla y por ancho: cada elemento que recorta o scrollea, su
// ancho visible, el que pide, el ancho ÚTIL de la página (lo que queda después
// de la barra lateral) y si adentro hay una grilla de ancho fijo.
//
// GOTCHAS heredados: sembrar la cookie + sessionStorage (si no, todo al login) y
// `delete Navigator.prototype.serviceWorker` antes de navegar.
//
// Solo lectura.
//
//   node scripts/_diag-recorte-exacto.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3175";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const PANTALLAS = [
  { id: "multifashion-clientes", url: "/multifashion?subtab=clientes", espera: 12000 },
  { id: "multifashion-vendedoras", url: "/multifashion?subtab=vendedoras", espera: 12000 },
  { id: "proveedores", url: "/proveedores", espera: 10000 },
  { id: "clientes", url: "/clientes", espera: 10000 },
];
const ANCHOS = [390, 834, 1024, 1440];

const SONDA = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra <= 1) continue;
    if (!visible(el)) continue;
    if (el.children.length === 0) continue;          // texto truncado, no es esto
    const cs = getComputedStyle(el);
    if (cs.overflowX === "visible") continue;
    out.push({
      etiqueta: el.tagName.toLowerCase() + "." + String(el.className).trim().replace(/\\s+/g, ".").slice(0, 70),
      modo: cs.overflowX === "auto" || cs.overflowX === "scroll" ? "ARRASTRA" : "RECORTA",
      sobra: Math.round(sobra),
      visible: el.clientWidth,
      pide: el.scrollWidth,
      // La grilla de ancho fijo adentro es la causa habitual.
      grilla: (() => {
        const g = el.querySelector('[class*="grid-cols-["]') ?? (String(el.className).includes("grid-cols-[") ? el : null);
        if (!g) return null;
        return getComputedStyle(g).gridTemplateColumns;
      })(),
    });
  }
  out.sort((a, b) => b.sobra - a.sobra);

  // Ancho ÚTIL: lo que de verdad le queda al contenido después de la barra
  // lateral. Es el número que decide si una tabla puede entrar o no.
  const main = document.querySelector("main") ?? document.body;
  return {
    ventana: innerWidth,
    util: main.clientWidth,
    recortes: out.slice(0, 6),
  };
})()`;

const navegador = await chromium.launch();
for (const p of PANTALLAS) {
  console.error(`\n=== ${p.id} ===`);
  for (const ancho of ANCHOS) {
    const ctx = await navegador.newContext({
      viewport: { width: ancho, height: ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844 },
      deviceScaleFactor: 1,
      hasTouch: ancho < 1200,
    });
    await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
    await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
    await ctx.addInitScript(() => {
      sessionStorage.setItem("cxc_role", "admin");
      sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
      sessionStorage.setItem("fg_is_owner", "1");
    });
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + p.url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(p.espera);
      const r = await page.evaluate(SONDA);
      console.error(`  @${ancho}  útil=${r.util}px`);
      if (!r.recortes.length) console.error("      (nada recorta ni arrastra)");
      for (const x of r.recortes) {
        console.error(`      ${x.modo} ${String(x.sobra).padStart(4)}px  ve ${x.visible} pide ${x.pide}  ${x.etiqueta.slice(0, 56)}`);
        if (x.grilla) console.error(`             grilla: ${x.grilla.slice(0, 110)}`);
      }
    } catch (e) {
      console.error(`  @${ancho}  ERROR ${String(e.message).slice(0, 90)}`);
    }
    await ctx.close();
  }
}
await navegador.close();
