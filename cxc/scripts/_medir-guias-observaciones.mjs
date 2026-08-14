// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA. Mide los TRES anchos (+ el iPad acostado) de la caja de
// observaciones en la pantalla donde se despacha, con guías REALES:
//   · GT-137 — la nota más larga de producción (83 caracteres)
//   · GT-188 — la de Nova Lux (65)
//   · GT-194 — una corta (22)
//   · GT-124 — la basura real: "|"
//   · GT-201 — SIN observación: no se dibuja nada
//
// 🔴 NO TOCA "Despachar" ni ningún botón que guarde. Solo abre, mide y saca
//    capturas.
//
//   BASE=http://localhost:3113 node scripts/_medir-guias-observaciones.mjs
//
// Gotchas de medición de la casa:
//   · sembrar `sessionStorage.cxc_role`, si no `useAuth` redirige al login;
//   · `delete Navigator.prototype.serviceWorker` ANTES de navegar;
//   · 🩸 el rótulo lleva `uppercase` POR CSS: `innerText` lo devuelve en
//     MAYÚSCULAS, así que compararlo tal cual da SIEMPRE false y el chequeo
//     pasaría en verde sin haber mirado nada.
//
// El script FALLA si no encuentra lo que vino a medir.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3113";
const SALIDA = "/tmp/guias-observaciones";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];

const GUIAS = [
  { id: "378d7e7f-ee26-4853-99ed-5b1ecfb2e0a4", nombre: "GT-137-mas-larga", nota: "Se entrega Zona Sur Dutty Free en America CLasic Fac 2969  4 Bultos, con el caballo" },
  { id: "d104fc55-aa5d-488b-925c-6763cb0accc4", nombre: "GT-188-nova-lux", nota: "NOVA LUX 17 PANELES - PLAZA LOS ANGELES 3 MUEBLES DE CALVIN KLEIN" },
  { id: "b4de85b2-6a06-4270-88d3-843baa5b3487", nombre: "GT-194-corta", nota: "Pasillo del dinosaurio" },
  { id: "93a804de-642c-4811-98c7-fffe8c49408c", nombre: "GT-124-basura", nota: "|" },
  { id: "e3ff3f8f-5275-4a8c-85a1-63827c1a3d95", nombre: "GT-201-sin-nota", nota: null },
];

mkdirSync(SALIDA, { recursive: true });

const MEDIR = () => {
  const de = document.documentElement;
  const arrastrePagina = Math.max(0, de.scrollWidth - de.clientWidth);

  const recortados = [...document.querySelectorAll("body div *")]
    .filter((e) => {
      const s = getComputedStyle(e);
      if (s.overflowX === "auto" || s.overflowX === "scroll") return false;
      return e.clientWidth > 1 && e.scrollWidth - e.clientWidth > 2;
    })
    .map((e) => ({ tag: e.tagName, cls: (e.className || "").toString().slice(0, 40), extra: e.scrollWidth - e.clientWidth }));

  const chicos = [...document.querySelectorAll("button, a, input, select, textarea")]
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44);
    })
    .map((e) => {
      const r = e.getBoundingClientRect();
      return { t: (e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 28), w: Math.round(r.width), h: Math.round(r.height) };
    });

  const letraChica = [...document.querySelectorAll("*")]
    .filter((e) => e.children.length === 0 && (e.textContent || "").trim())
    .map((e) => parseFloat(getComputedStyle(e).fontSize))
    .filter((n) => n && n < 12).length;

  // La caja de observaciones, por su rótulo. ⚠️ `uppercase` por CSS.
  const rotulo = [...document.querySelectorAll("span")].find(
    (s) => (s.textContent || "").trim().toUpperCase() === "OBSERVACIONES",
  );
  const caja = rotulo ? rotulo.parentElement : null;
  const p = caja ? caja.querySelector("p") : null;
  const r = caja ? caja.getBoundingClientRect() : null;
  const rp = p ? p.getBoundingClientRect() : null;

  return {
    arrastrePagina,
    recortados,
    chicos,
    letraChica,
    hayCaja: !!caja,
    texto: p ? (p.textContent || "").trim() : null,
    // ¿Se ve ENTERO? `scrollHeight` mayor que el alto pintado = está cortado.
    textoCortado: p ? p.scrollHeight - p.clientHeight > 1 : false,
    altoCaja: r ? Math.round(r.height) : 0,
    anchoTexto: rp ? Math.round(rp.width) : 0,
    editable: caja ? !!caja.querySelector("input, textarea, button") : false,
    // La placa: la caja tiene que ir ANTES.
    obsAntesDePlaca: (() => {
      const placa = document.getElementById("despacho-placa");
      if (!caja || !placa) return null;
      return !!(caja.compareDocumentPosition(placa) & Node.DOCUMENT_POSITION_FOLLOWING);
    })(),
  };
};

const informe = {};
const problemas = [];

const nav = await chromium.launch();
for (const ancho of ANCHOS) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200 });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_is_owner", "1");
  });
  const page = await ctx.newPage();

  for (const g of GUIAS) {
    await page.goto(`${BASE}/guias/${g.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(7000);
    const m = await page.evaluate(MEDIR);
    informe[`${g.nombre}@${ancho}`] = m;
    await page.screenshot({ path: `${SALIDA}/${g.nombre}-${ancho}.png` });

    if (g.nota === null) {
      if (m.hayCaja) problemas.push(`🔴 ${ancho} ${g.nombre}: dibuja la caja SIN observación`);
    } else {
      if (!m.hayCaja) problemas.push(`🔴 ${ancho} ${g.nombre}: no se encontró la caja de observaciones`);
      else {
        if (m.texto !== g.nota) problemas.push(`🔴 ${ancho} ${g.nombre}: el texto no coincide — "${m.texto}"`);
        if (m.textoCortado) problemas.push(`🔴 ${ancho} ${g.nombre}: el texto sale CORTADO`);
        if (m.editable) problemas.push(`🔴 ${ancho} ${g.nombre}: la observación es editable acá`);
      }
    }
    if (m.arrastrePagina > 0) problemas.push(`${ancho} ${g.nombre}: ${m.arrastrePagina} px de arrastre`);
  }
  await ctx.close();
}
await nav.close();

writeFileSync(`${SALIDA}/informe.json`, JSON.stringify(informe, null, 2));

console.log("\n═══ LOS 3 ANCHOS (+ iPad acostado) ═══");
for (const [k, v] of Object.entries(informe)) {
  console.log(
    `${k.padEnd(28)} arrastre ${String(v.arrastrePagina).padStart(3)} px · recortados ${String(v.recortados.length).padStart(2)} · táctiles<44 ${String(v.chicos.length).padStart(2)} · texto<12 ${v.letraChica} · caja ${v.hayCaja ? `${v.altoCaja}px alto / ${v.anchoTexto}px texto` : "—"}`,
  );
  if (v.recortados.length) console.log("     recortados:", v.recortados.map((r) => `${r.tag}.${r.cls}(${r.extra}px)`).join(" · "));
}

console.log(`\ncapturas en ${SALIDA}`);
if (problemas.length) {
  console.log("\n🔴 PROBLEMAS:");
  for (const p of problemas) console.log("  -", p);
  process.exit(1);
}
console.log("\n🟢 sin problemas");
