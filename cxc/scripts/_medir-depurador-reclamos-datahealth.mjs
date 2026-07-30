// Medición REAL en navegador de las 6 pantallas del lote
// "Depurador + Reclamos + Data Health", en los 3 anchos de Daniel
// (390 iPhone / 834 iPad vertical / 1440 escritorio).
//
// ── 🩸 POR QUÉ EXISTE ────────────────────────────────────────────────────────
//
// Del censo del 30-jul-2026 (build de producción, datos reales). Px de arrastre
// horizontal, 390 / 834:
//
//   Depurador › barra de pestañas ..... 295 / 75   ← 3 de 6 pestañas invisibles
//   Data Health › Panel ............... 448 / 228  ← 1 de 5 columnas; mapa 7/31 días
//   Depurador › Historial ............. 437 / 217  ← 75 filas
//   Reclamos › Detalle ................ 310 / 138  ← PRECIO, SUBTOTAL, MOTIVO, FACTURA, PO
//   Guías › Imprimir .................. 158 /   0
//   Reclamos › Por empresa ............   0 / 107  ← columna ACCIONES
//
// El ancho que decide NO es el viewport: la barra lateral se lleva ~223px, así
// que 834 deja ~562px útiles. Por eso varias pantallas están sanas en iPhone y
// rotas SOLO en iPad.
//
// ── QUÉ MIDE ─────────────────────────────────────────────────────────────────
//
//   A. ARRASTRE  — cuerpo y contenedores `overflow-x:auto` con exceso.
//   B. RECORTE   — contenido más ancho que un ancestro `overflow:hidden|clip`
//                  (el dato NO se alcanza de ninguna forma). Es lo grave.
//   C. TAP < 44  — controles bajo el mínimo táctil, dentro del CONTENIDO
//                  (se excluye el cromo global: header y barra lateral, que
//                  son de otro lote).
//   D. HUELLA    — la lista de números/datos que la pantalla muestra dentro de
//                  cada región `[data-medir]`. Es el candado de "ningún número
//                  cambia": se compara la huella de 390 contra la de 1440.
//
// 🩸 LA TRAMPA QUE YA NOS COSTÓ UNA CORRIDA: si la huella se buscara por la
// clase de breakpoint (`.md\:hidden`, `.lg\:hidden`) y uno mueve el corte, el
// selector devuelve VACÍO y la comparación pasa comparando nada contra nada.
// Por eso las regiones se marcan con `data-medir="<nombre>"`, que es un
// atributo FIJO que no depende de ningún breakpoint, y el script FALLA si una
// región esperada no aparece.
//
// GOTCHAS de medición (heredados, no tocar sin leer):
//   1. Sembrar la COOKIE firmada + sessionStorage (`cxc_role`) o TODO redirige
//      al login DESPUÉS de hidratar y uno mide la pantalla de ingreso.
//   2. `delete Navigator.prototype.serviceWorker` ANTES de navegar: bloquear el
//      SW por ruteo mata la hidratación y se mide una página muerta.
//   3. Esperar a que el texto deje de crecer Y un piso fijo: los overlays
//      pintan esqueleto sobre un fondo ya estable y el loop salía antes.
//
// SOLO LECTURA: navega y abre pestañas. No guarda, no borra, no envía, no
// sincroniza. El Depurador escribe precios y Reclamos cambia estados: acá no se
// toca ni un botón que ejecute.
//
//   ETAPA=antes   node scripts/_medir-depurador-reclamos-datahealth.mjs
//   ETAPA=despues node scripts/_medir-depurador-reclamos-datahealth.mjs
//   node scripts/_medir-depurador-reclamos-datahealth.mjs --comparar

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3174";
const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp/lote74";
const ETAPA = process.env.ETAPA ?? "antes";
const SOLO = process.env.SOLO ? process.env.SOLO.split(",") : null;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

// 1024 (iPad horizontal / laptop chica) va SIEMPRE: es el ancho donde las dos
// salidas posibles se separan y donde un corte mal puesto deja arrastre
// residual. En Caja › Períodos quedaban 16 px justo ahí.
const TAMANOS = [
  { nombre: "390", width: 390, height: 844, touch: true },
  { nombre: "834", width: 834, height: 1112, touch: true },
  { nombre: "1024", width: 1024, height: 768, touch: true },
  { nombre: "1440", width: 1440, height: 900, touch: false },
];

// IDs verificados contra producción.
const ID_GUIA = "4048a77f-c1b3-4cf8-853d-e27323f096cd";
const RECLAMO = "empresa=Vistana+International&view=detail&id=0ba1ab3c-dfd3-44ae-b1b6-b00522e470c7";

/** `abrir`: clicks SEGUROS (solo pestañas). Ninguno ejecuta nada. */
const PANTALLAS = [
  { mod: "Depurador",   pant: "Pestañas",   url: "/productos/cargar" },
  { mod: "Depurador",   pant: "Historial",  url: "/productos/cargar", abrir: ["Historial"], regionEsperada: "depurador-historial" },
  { mod: "Depurador",   pant: "Fórmulas",   url: "/productos/cargar", abrir: ["Fórmulas por marca"] },
  { mod: "Data Health", pant: "Panel",      url: "/admin/data-health" },
  { mod: "Reclamos",    pant: "Detalle",    url: `/reclamos?${RECLAMO}` },
  { mod: "Reclamos",    pant: "PorEmpresa", url: "/reclamos?empresa=Vistana+International" },
  { mod: "Guías",       pant: "Imprimir",   url: `/guias/${ID_GUIA}/imprimir` },
];

const SONDA = `(() => {
  const VW = document.documentElement.clientWidth;
  const VH = document.documentElement.clientHeight;
  const txt = (el) => (el.innerText || el.textContent || "").trim().replace(/\\s+/g," ").slice(0,44);
  const cls = (el) => { const c = el.className; return (c && c.baseVal !== undefined ? c.baseVal : String(c||"")).slice(0,70); };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const todos = Array.from(document.querySelectorAll("body *"));

  // ── A. ARRASTRE ────────────────────────────────────────────────────────────
  const arrastreCuerpo = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  const arrastrables = [];
  for (const el of todos) {
    const ox = getComputedStyle(el).overflowX;
    if (ox !== "auto" && ox !== "scroll") continue;
    const exceso = el.scrollWidth - el.clientWidth;
    if (exceso <= 1 || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.left > VW || r.right < 0) continue;
    arrastrables.push({ px: exceso, ancho: Math.round(r.width), clase: cls(el), muestra: txt(el) });
  }
  arrastrables.sort((a,b)=>b.px-a.px);

  // ── B. RECORTE ─────────────────────────────────────────────────────────────
  const recortados = [];
  for (const el of todos) {
    const cs = getComputedStyle(el);
    if (cs.overflowX !== "hidden" && cs.overflowX !== "clip") continue;
    // SIN UMBRAL a propósito: un umbral de 100px reportaba 0 donde recortaba 92.
    // Para arreglar una pantalla hace falta el número crudo, no el clasificado.
    const exceso = el.scrollWidth - el.clientWidth;
    if (exceso <= 2 || !visible(el)) continue;
    if (/swipeable-row/.test(cls(el))) continue;          // recorte intencional
    const r = el.getBoundingClientRect();
    if (r.width < 80 || r.height < 24) continue;
    const tabla = el.querySelector("table");
    const hijos = Array.from(el.children);
    const unaLinea = cs.textOverflow === "ellipsis" || cs.whiteSpace === "nowrap";
    if (unaLinea && !tabla && hijos.length <= 1) continue; // eso es truncado, no recorte
    recortados.push({ px: exceso, ancho: Math.round(r.width), clase: cls(el), muestra: txt(el) });
  }
  recortados.sort((a,b)=>b.px-a.px);

  // ── C. TAP < 44 (solo CONTENIDO; el cromo global es de otro lote) ──────────
  const SEL = "button, a[href], [role=button], input, select, textarea, [role=menuitem], [role=tab], summary";
  const chicos = [];
  const vistos = new Set();
  for (const el of document.querySelectorAll(SEL)) {
    if (!visible(el)) continue;
    // El CROMO GLOBAL no es de este lote: la barra lateral (aside/nav) y el
    // AppHeader (buscador ⌘K 28px, campana 24x24, migas 18px) los está tocando
    // otro agente. Se excluyen por estructura, no por texto: el AppHeader y su
    // barra de migas son los div.w-full.border-b.bg-white de arriba de todo.
    if (el.closest("nav, aside, header, [data-cromo-global]")) continue;
    if (el.closest("[data-medir-ignora-tap]")) continue;
    const cab = el.closest("div.w-full.border-b.bg-white");
    if (cab && cab.getBoundingClientRect().top < 120) continue;
    const r = el.getBoundingClientRect();
    if (r.top > VH * 4) continue;
    if (r.height >= 44 && r.width >= 44) continue;
    if (el.type === "hidden" || el.type === "checkbox" || el.type === "radio") continue;
    // El patrón de la casa para íconos densos y enlaces dentro de un párrafo:
    // el control se ve chico pero su ÁREA DE TOQUE llega a 44 con un ::after
    // transparente (ya usado en las miniaturas de fotos de reclamos). Medir solo
    // getBoundingClientRect lo contaría como defecto siendo correcto, así que se
    // suma el ::after y se juzga el área REAL.
    const ps = getComputedStyle(el, "::after");
    if (ps && ps.content !== "none" && ps.position === "absolute") {
      const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
      const alto = r.height - px(ps.top) - px(ps.bottom);
      const ancho = r.width - px(ps.left) - px(ps.right);
      if (alto >= 44 && ancho >= 44) continue;
    }
    const t = txt(el) || el.getAttribute("aria-label") || el.getAttribute("title") || el.tagName.toLowerCase();
    const it = { alto: Math.round(r.height), ancho: Math.round(r.width), t: t.slice(0,34), clase: cls(el) };
    const k = it.t + "|" + it.alto + "|" + it.ancho;
    if (vistos.has(k)) continue;
    vistos.add(k); chicos.push(it);
  }

  // ── D. HUELLA de datos por región [data-medir] ─────────────────────────────
  // Se toman los tokens "de dato" (números, plata, fechas, códigos) del texto
  // visible de la región. NO se busca por clase de breakpoint: data-medir es
  // fijo, así que la región existe se muestre como tabla o como tarjetas.
  const huellas = {};
  for (const reg of document.querySelectorAll("[data-medir]")) {
    const nombre = reg.getAttribute("data-medir");
    if (!visible(reg)) { huellas[nombre] = huellas[nombre] ?? null; continue; }
    const texto = (reg.innerText || "").replace(/\\u00a0/g," ");
    const tokens = (texto.match(/-?\\\$?\\d[\\d.,]*%?/g) || [])
      .map(s => s.trim())
      .filter(s => /\\d/.test(s));
    const previo = huellas[nombre];
    const lista = (previo && previo.tokens ? previo.tokens : []).concat(tokens);
    huellas[nombre] = { tokens: lista.sort(), n: lista.length };
  }

  return {
    VW,
    arrastreCuerpo,
    arrastreMax: Math.max(arrastreCuerpo, ...arrastrables.map(s=>s.px), 0),
    arrastrables: arrastrables.slice(0,4),
    recorteMax: recortados.length ? recortados[0].px : 0,
    recortados: recortados.slice(0,3),
    nChicos: chicos.length,
    chicos: chicos.slice(0,12),
    huellas,
    regiones: Object.keys(huellas),
    largoTexto: document.body.innerText.length,
    titulo: (document.querySelector("h1,h2")?.innerText||"").trim().slice(0,44),
    enLogin: !!document.querySelector('input[type=password]'),
  };
})()`;

// ── comparación antes/después ────────────────────────────────────────────────
if (process.argv.includes("--comparar")) {
  const a = JSON.parse(readFileSync(path.join(SALIDA, "antes.json"), "utf8"));
  const d = JSON.parse(readFileSync(path.join(SALIDA, "despues.json"), "utf8"));
  const k = (x) => `${x.mod} › ${x.pant}`;
  const idx = (arr) => Object.fromEntries(arr.map(x => [k(x) + "|" + x.ancho, x]));
  const A = idx(a), D = idx(d);
  console.log("PANTALLA".padEnd(26) + "ANCHO  ARRASTRE      RECORTE       TAP<44");
  let peor = 0;
  for (const key of Object.keys(D)) {
    const [nom, ancho] = key.split("|");
    const x = D[key], y = A[key];
    if (!y) continue;
    const f = (antes, desp) => `${String(antes).padStart(4)}→${String(desp).padStart(4)}${desp > antes ? " ⛔PEOR" : desp === 0 && antes > 0 ? " ✅" : ""}`;
    console.log(nom.padEnd(26) + ancho.padStart(5) + "  " + f(y.arrastreMax, x.arrastreMax) + "  " + f(y.recorteMax, x.recorteMax) + "  " + f(y.nChicos, x.nChicos));
    // Escritorio (1024 y 1440) no puede empeorar en NINGUNA de las dos medidas.
    if ((ancho === "1440" || ancho === "1024") && (x.arrastreMax > y.arrastreMax || x.recorteMax > y.recorteMax)) peor++;
  }

  // ── Candado de datos: ningún número cambió ────────────────────────────────
  // Se compara la huella de CADA ancho angosto contra la de 1440 (la vista que
  // nadie tocó). 🩸 Una región ausente o VACÍA es FALLA, no "todo bien": es
  // justo lo que pasa si uno busca por clase de breakpoint después de mover el
  // corte, y el chequeo pasaría comparando nada contra nada.
  console.log("\nHUELLA DE DATOS (mismos números en todos los anchos)");
  let fallas = 0, comparadas = 0;
  const pantallas = [...new Set(Object.keys(D).map(k => k.split("|")[0]))];
  for (const nom of pantallas) {
    const ref = D[nom + "|1440"];
    if (!ref) continue;
    const regiones = Object.keys(ref.huellas || {});
    if (!regiones.length) { console.log(`  ${nom}: (sin región data-medir)`); continue; }
    for (const reg of regiones) {
      const base = ref.huellas[reg];
      if (!base || !base.n) { console.log(`  ⛔ ${nom} › ${reg} @1440: región VACÍA o ausente — FALLA`); fallas++; continue; }
      for (const ancho of ["390", "834", "1024"]) {
        const otro = D[nom + "|" + ancho];
        const h = otro && otro.huellas ? otro.huellas[reg] : null;
        if (!h || !h.n) { console.log(`  ⛔ ${nom} › ${reg} @${ancho}: región VACÍA o ausente — FALLA`); fallas++; continue; }
        const igual = h.tokens.join("|") === base.tokens.join("|");
        comparadas++;
        if (!igual) {
          fallas++;
          const faltan = base.tokens.filter(t => !h.tokens.includes(t)).slice(0, 6);
          const sobran = h.tokens.filter(t => !base.tokens.includes(t)).slice(0, 6);
          console.log(`  ⛔ ${nom} › ${reg} @${ancho}: ${base.n} vs ${h.n} tokens · faltan[${faltan}] sobran[${sobran}]`);
        } else {
          console.log(`  ✅ ${nom} › ${reg} @${ancho}: ${h.n} números idénticos a 1440`);
        }
      }
    }
  }
  if (!comparadas) { console.log("  ⛔ NO se comparó ninguna región — FALLA (esto es el bug del selector por breakpoint)"); fallas++; }
  console.log(peor ? `\n⛔ ESCRITORIO EMPEORÓ en ${peor} pantalla(s)` : "\n✅ Escritorio no empeoró");
  console.log(fallas ? `⛔ ${fallas} falla(s) de datos` : `✅ Datos idénticos (${comparadas} comparaciones)`);
  process.exit(peor || fallas ? 1 : 0);
}

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const resultados = [];

for (const t of TAMANOS) {
  const ctx = await navegador.newContext({
    viewport: { width: t.width, height: t.height },
    deviceScaleFactor: 1, hasTouch: t.touch,
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
  });

  for (const p of PANTALLAS) {
    const clave = `${p.mod} › ${p.pant}`;
    if (SOLO && !SOLO.some(s => clave.includes(s))) continue;
    const page = await ctx.newPage();
    const r = { mod: p.mod, pant: p.pant, url: p.url, ancho: t.nombre };
    try {
      await page.goto(BASE + p.url, { waitUntil: "networkidle", timeout: 90000 });
      await page.waitForTimeout(4000);                 // piso fijo: esqueletos sobre fondo estable
      let previo = -1, iguales = 0;
      for (let i = 0; i < 30 && iguales < 3; i++) {
        await page.waitForTimeout(400);
        const n = await page.evaluate(() => document.body.innerText.length).catch(()=>0);
        if (n === previo && n > 0) iguales++; else { iguales = 0; previo = n; }
      }
      // Abrir la pestaña pedida. 🩸 Desde que las 6 pestañas son un DESPLEGABLE
      // en angosto, la opción no existe en el DOM hasta desplegarlo: hay que
      // tocar el disparador primero. Si no, el click falla, se mide la pestaña
      // por defecto y el 0 que sale no es de la pantalla que se quería medir.
      for (const etiqueta of p.abrir || []) {
        const disparador = page.locator('[aria-haspopup="listbox"][aria-label="Sección del Depurador"]');
        if (await disparador.isVisible().catch(() => false)) {
          await disparador.click({ timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(500);
        }
        const opcion = page.getByRole("option", { name: etiqueta, exact: true }).first();
        const boton = page.getByRole("button", { name: etiqueta, exact: true }).first();
        const destino = (await opcion.count().catch(() => 0)) ? opcion : boton;
        await destino.click({ timeout: 8000 }).catch(() => { r.noAbrio = etiqueta; });
        await page.waitForTimeout(2500);
      }
      // Verificación DURA: si se pidió una pestaña, su región tiene que existir.
      // Un 0 medido sobre la pestaña equivocada es peor que no medir.
      if (p.regionEsperada) {
        const hay = await page.locator(`[data-medir="${p.regionEsperada}"]`).count().catch(() => 0);
        if (!hay) r.noAbrio = r.noAbrio || `region-ausente:${p.regionEsperada}`;
      }
      Object.assign(r, await page.evaluate(SONDA));
      const nom = `${ETAPA}-${p.mod}-${p.pant}-${t.nombre}`.replace(/[^\wáéíóúñÁÉÍÓÚÑ-]+/g, "-");
      await page.screenshot({ path: path.join(SALIDA, nom + ".png") });
    } catch (e) {
      r.error = String(e.message).slice(0, 150);
    }
    resultados.push(r);
    console.error(`[${t.nombre}] ${clave.padEnd(24)} arrastre=${r.arrastreMax ?? "?"} recorte=${r.recorteMax ?? "?"} tap<44=${r.nChicos ?? "?"} regiones=${(r.regiones||[]).join(",") || "-"}${r.enLogin ? " ⚠️LOGIN" : ""}${r.noAbrio ? " ✗noAbrió:"+r.noAbrio : ""}${r.error ? " ERR:"+r.error : ""}`);
    await page.close();
  }
  await ctx.close();
}

await navegador.close();
writeFileSync(path.join(SALIDA, `${ETAPA}.json`), JSON.stringify(resultados, null, 2));
console.error(`\n✅ ${resultados.length} mediciones → ${SALIDA}/${ETAPA}.json`);
