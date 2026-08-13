// SOLO LECTURA. Mide `/admin/usuarios` con su pestaña nueva en los anchos de
// Daniel (390 iPhone · 834 iPad vertical · 1024 iPad horizontal · 1440
// escritorio), contra el BUILD DE PRODUCCIÓN y con datos de producción.
//
// Qué mide, por pestaña:
//   A. ARRASTRE de la página (y de los contenedores con scroller propio).
//   B. RECORTADOS — contenido más ancho que un ancestro `overflow:hidden|clip`.
//      Es lo grave: el dato no se alcanza ni arrastrando.
//   C. BLANCOS TÁCTILES < 44 px dentro del contenido (el cromo global —barra
//      lateral y AppHeader— se excluye: es de otro lote).
//   D. TEXTOS < 12 px.
// Y además:
//   E. Que `/admin/data-health` (la dirección vieja) ATERRICE en la pestaña.
//   F. Que la pestaña de Data Health muestre sus piezas (KPI, checks, mapa 30d):
//      medir 0 px sobre una pantalla vacía no prueba nada.
//
// 🔴 NO TOCA NADA QUE ESCRIBA: solo se hace clic en las PESTAÑAS. Ni "Nuevo
// Usuario", ni "Correr checks ahora", ni Revocar, ni Editar.
//
// Gotchas de medición de la casa (no tocar sin leer):
//   1. Sembrar la cookie firmada Y `sessionStorage.cxc_role`: si no, `useAuth`
//      redirige al login DESPUÉS de hidratar y uno mide la pantalla de ingreso.
//   2. `delete Navigator.prototype.serviceWorker` ANTES de navegar: bloquear el
//      SW de otra forma mata la hidratación y se mide una página muerta.
//
//   BASE=http://localhost:3181 node scripts/_medir-usuarios-data-health.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3181";
const ETIQUETA = process.env.ETIQUETA ?? "rama";
const SALIDA = `/tmp/usuarios-dh-${ETIQUETA}`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];

const PANTALLAS = [
  { id: "usuarios", url: "/admin/usuarios" },
  { id: "data-health", url: "/admin/usuarios?tab=data-health" },
  // La dirección vieja: tiene que llegar sola a la pestaña.
  { id: "redirect-viejo", url: "/admin/data-health" },
];

const SONDA = `(() => {
  const de = document.documentElement;
  const VW = de.clientWidth, VH = de.clientHeight;
  const txt = (el) => (el.innerText || el.textContent || "").trim().replace(/\\s+/g," ").slice(0,40);
  const cls = (el) => { const c = el.className; return (c && c.baseVal !== undefined ? c.baseVal : String(c||"")).slice(0,70); };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const todos = Array.from(document.querySelectorAll("body *"));

  // A. ARRASTRE
  const arrastrePagina = de.scrollWidth - de.clientWidth;
  const scrollers = [];
  for (const el of todos) {
    const ox = getComputedStyle(el).overflowX;
    if (ox !== "auto" && ox !== "scroll") continue;
    const exceso = el.scrollWidth - el.clientWidth;
    if (exceso <= 1 || !visible(el)) continue;
    scrollers.push({ px: exceso, clase: cls(el), muestra: txt(el) });
  }

  // B. RECORTADOS — sin umbral: un umbral de 100px reportó 0 donde recortaba 92.
  const recortados = [];
  for (const el of todos) {
    const cs = getComputedStyle(el);
    if (cs.overflowX !== "hidden" && cs.overflowX !== "clip") continue;
    const exceso = el.scrollWidth - el.clientWidth;
    if (exceso <= 2 || !visible(el)) continue;
    if (/swipeable-row/.test(cls(el))) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 80 || r.height < 24) continue;
    const unaLinea = cs.textOverflow === "ellipsis" || cs.whiteSpace === "nowrap";
    if (unaLinea && !el.querySelector("table") && el.children.length <= 1) continue; // truncado ≠ recorte
    recortados.push({ px: exceso, clase: cls(el), muestra: txt(el) });
  }

  // C. TÁCTILES < 44 (solo contenido)
  const chicos = [], vistos = new Set();
  for (const el of document.querySelectorAll("button, a[href], [role=button], input, select, textarea, [role=tab], summary")) {
    if (!visible(el)) continue;
    if (el.closest("nav, aside, header, [data-cromo-global]")) continue;
    const cab = el.closest("div.w-full.border-b.bg-white");
    if (cab && cab.getBoundingClientRect().top < 120) continue;
    const r = el.getBoundingClientRect();
    if (r.top > VH * 4) continue;
    if (r.height >= 44 && r.width >= 44) continue;
    // El cuadradito nativo mide 16x16 y no se puede agrandar: su área táctil la
    // pone la <label> que lo envuelve (patrón de la casa, ya verificado).
    if (el.type === "hidden" || el.type === "checkbox" || el.type === "radio") continue;
    const t = txt(el) || el.getAttribute("aria-label") || el.getAttribute("title") || el.tagName.toLowerCase();
    const k = t + "|" + Math.round(r.height) + "|" + Math.round(r.width);
    if (vistos.has(k)) continue;
    vistos.add(k);
    chicos.push({ t: t.slice(0,34), alto: Math.round(r.height), ancho: Math.round(r.width) });
  }

  // D. TEXTOS < 12 px. \`sr-only\` se excluye: no se ve, es para lectores.
  const textosChicos = [];
  for (const el of todos) {
    if (el.children.length || !(el.textContent || "").trim()) continue;
    if (el.closest(".sr-only") || /sr-only/.test(cls(el))) continue;
    if (el.closest("nav, aside, header")) continue;
    if (!visible(el)) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px && px < 12) textosChicos.push({ px, t: txt(el) });
  }

  // F. Qué se ve (para que "0 px" no sea el 0 de una pantalla vacía)
  const cuerpo = document.body.innerText || "";
  return {
    url: location.pathname + location.search,
    VW,
    arrastrePagina,
    arrastreMax: Math.max(arrastrePagina, ...scrollers.map(s => s.px), 0),
    scrollers: scrollers.sort((a,b)=>b.px-a.px).slice(0,3),
    nRecortados: recortados.length,
    recortados: recortados.sort((a,b)=>b.px-a.px).slice(0,3),
    nChicos: chicos.length, chicos: chicos.slice(0,10),
    nTextosChicos: textosChicos.length, textosChicos: textosChicos.slice(0,6),
    pestanas: Array.from(document.querySelectorAll('[role="tab"]')).map(t => t.textContent.trim()),
    pestanaActiva: (document.querySelector('[role="tab"][data-state="active"]') || {}).textContent,
    veUsuarios: /Nuevo Usuario/.test(cuerpo),
    veChecks: /Estado actual por check/.test(cuerpo),
    veMapa30d: /Historial 30 d/.test(cuerpo),
    veCorrerChecks: /Correr checks ahora/.test(cuerpo),
    nFilasCheck: document.querySelectorAll('[data-medir="dh-checks"] [data-vista] li, [data-medir="dh-checks"] tbody tr').length,
  };
})()`;

mkdirSync(SALIDA, { recursive: true });
const nav = await chromium.launch();
let fallas = 0;

for (const ancho of ANCHOS) {
  const alto = ancho >= 1200 ? 900 : ancho >= 1000 ? 768 : ancho >= 700 ? 1112 : 844;
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200 });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_is_owner", "1");
    sessionStorage.setItem("fg_user_name", "daniel");
  });
  const page = await ctx.newPage();

  for (const p of PANTALLAS) {
    await page.goto(`${BASE}${p.url}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6500);
    const m = await page.evaluate(SONDA);
    await page.screenshot({ path: `${SALIDA}/${p.id}-${ancho}.png`, fullPage: false });

    const ok = m.arrastreMax === 0 && m.nRecortados === 0 && m.nChicos === 0 && m.nTextosChicos === 0;
    if (!ok) fallas += 1;
    console.log(`\n═══ ${ancho}px · ${p.id} → ${m.url} ${ok ? "🟢" : "🔴"}`);
    console.log(`    arrastre ${m.arrastreMax} · recortados ${m.nRecortados} · táctiles<44 ${m.nChicos} · textos<12 ${m.nTextosChicos}`);
    console.log(`    pestañas [${m.pestanas.join(" | ")}] activa=${(m.pestanaActiva||"").trim()}`);
    console.log(`    se ve: usuarios=${m.veUsuarios} checks=${m.veChecks}(${m.nFilasCheck} filas) mapa30d=${m.veMapa30d} correr=${m.veCorrerChecks}`);
    if (!ok) console.log(JSON.stringify({ scrollers: m.scrollers, recortados: m.recortados, chicos: m.chicos, textosChicos: m.textosChicos }, null, 2));
  }
  await ctx.close();
}

await nav.close();
console.log(`\n${fallas === 0 ? "🟢 TODO EN CERO" : `🔴 ${fallas} combinaciones con hallazgos`} — capturas en ${SALIDA}`);
