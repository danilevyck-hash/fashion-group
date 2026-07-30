// ¿QUÉ SE VE de cada fila de Préstamos › Lista, ancho por ancho?
//
// 🩸 POR QUÉ. Mover el corte de `sm` a `lg` cambia QUÉ COLUMNAS se dibujan
// entre 640 y 1023 px. Este script lo dice con datos en vez de con una
// suposición: recorre las 12 filas REALES y anota, campo por campo, qué se ve.
// Las filas se localizan por `data-empleado-fila`, NUNCA por clase de
// breakpoint — un selector `.sm\:hidden` devuelve vacío en cuanto el corte se
// mueve y el chequeo pasaría sin haber mirado nada.
//
// Solo lectura: no se hace click en nada.
import { chromium } from "playwright";
import { readFileSync } from "fs";
const BASE = process.env.BASE ?? "http://localhost:3173";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const SONDA = `(() => {
  const vis = (el) => { if(!el) return false; const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
  return [...document.querySelectorAll("[data-empleado-fila]")].filter(vis).map((f) => {
    const txt = (s) => { const e = f.querySelector(s); return vis(e) ? e.textContent.replace(/\\s+/g," ").trim() : null; };
    const barra = [...f.querySelectorAll("div")].find((d) => d.className.includes("w-36"));
    const chips = [...f.querySelectorAll("span")].filter((s) => vis(s) && /Deducida|Pendiente|pend\\.|Saldado|Archivado/.test(s.textContent));
    return {
      nombre: txt("[data-empleado-campo=nombre]"),
      saldo: (f.textContent.match(/\\$[\\d,]+\\.\\d{2}/) ?? [null])[0],
      progreso: vis(barra) ? (barra.textContent.match(/\\d+%/) ?? ["?"])[0] : null,
      chips: chips.map((s) => s.textContent.trim()).sort(),
      acciones: vis(f.querySelector("button[aria-haspopup], button")),
    };
  });
})()`;
const nav = await chromium.launch();
const porAncho = {};
for (const A of [390, 834, 1024, 1440]) {
  const ctx = await nav.newContext({ viewport: { width: A, height: A >= 1200 ? 900 : A >= 700 ? 1194 : 844 }, hasTouch: A < 1200 });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => { sessionStorage.setItem("cxc_role","admin"); sessionStorage.setItem("fg_user_id","10948974-05bb-4e58-b708-a450cfd45d6c"); sessionStorage.setItem("fg_is_owner","1"); sessionStorage.setItem("fg_modules",JSON.stringify(["prestamos","admin"])); });
  const p = await ctx.newPage();
  await p.goto(BASE + "/prestamos", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(9000);
  porAncho[A] = await p.evaluate(SONDA);
  await ctx.close();
  if (porAncho[A].length === 0) { console.error(`@${A} ❌ SIN FILAS — no se comparó nada`); process.exit(1); }
}
await nav.close();
const base = porAncho[1440];
let fallas = 0;
for (const A of [390, 834, 1024]) {
  const f = porAncho[A];
  const difs = [];
  if (f.length !== base.length) difs.push(`filas ${f.length} vs ${base.length}`);
  f.forEach((r, i) => {
    const b = base[i];
    if (r.nombre !== b.nombre) difs.push(`fila ${i}: nombre "${r.nombre}" vs "${b.nombre}"`);
    if (r.saldo !== b.saldo) difs.push(`fila ${i}: SALDO ${r.saldo} vs ${b.saldo}`);
    if (JSON.stringify(r.chips) !== JSON.stringify(b.chips)) difs.push(`fila ${i}: chips ${JSON.stringify(r.chips)} vs ${JSON.stringify(b.chips)}`);
    if (!r.acciones) difs.push(`fila ${i}: sin menú de acciones`);
  });
  const conBarra = f.filter((r) => r.progreso !== null).length;
  if (difs.length) fallas++;
  console.error(`${difs.length ? "❌" : "✅"} @${A}  ${f.length} filas · nombre/SALDO/chips/acciones ${difs.length ? difs.length + " difs" : "idénticos a 1440"} · barra de progreso visible en ${conBarra}/${f.length}`);
  difs.slice(0, 6).forEach((d) => console.error("      " + d));
}
console.error(fallas === 0 ? "\nNINGÚN DATO DE LA FILA CAMBIÓ." : `\n${fallas} ancho(s) con diferencias.`);
process.exit(fallas === 0 ? 0 : 1);
