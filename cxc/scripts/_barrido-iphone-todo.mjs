// ─────────────────────────────────────────────────────────────────────────────
// BARRIDO iPhone/iPad de TODO el sistema (26-ago-2026).
//
// Daniel entró desde el iPhone a Depurador › Fórmulas por marca y el nombre de
// la marca se leía «▸M». La pregunta fue "¿podés hacer un audit de TODO?", así
// que esto recorre las ~45 pantallas del sistema y mide, POR CONDUCTA, los
// cinco defectos en el orden de gravedad que fijó Daniel:
//
//   1. TEXTO CORTADO ....... texto recortado por su caja. Es lo PEOR: el
//      usuario no sabe qué está mirando. 🩸 NINGÚN censo anterior lo veía:
//      un `truncate` no pide un solo píxel de arrastre, así que las dos
//      vueltas de #297-318 (que medían arrastre y tocables) lo dieron por sano.
//   2. ARRASTRE del cuerpo . la página se va de lado (una tabla con su propio
//      scroller NO cuenta: eso es intencional y se reporta aparte).
//   3. TOCABLES < 44 px .... mínimo de Apple.
//   4. TEXTO < 12 px ....... ilegible a un brazo de distancia.
//   5. ENCIMADOS ........... dos textos pisándose.
//
// GOTCHAS DE MEDICIÓN (heredados de #297-318 — respetarlos o se mide humo):
//   1. Cookie firmada + `sessionStorage` sembrado, o todo redirige al login
//      DESPUÉS de hidratar y uno termina midiendo la pantalla de ingreso.
//   2. `delete Navigator.prototype.serviceWorker` ANTES de navegar: bloquear el
//      SW por ruteo mata la hidratación y se mide una página muerta.
//   3. Esperar a que el texto deje de crecer Y un piso fijo de tiempo: los
//      overlays pintan esqueleto sobre un fondo ya estable.
//
// Los tres anchos van en la MISMA carga (setViewportSize dispara un `resize`
// real, así que lo que escucha el ancho se entera): 45 cargas en vez de 135.
// Es a propósito — la base no aguanta un barrido de 135 páginas.
//
// SOLO LECTURA: navega y abre pestañas por querystring. No toca un botón que
// guarde, borre, envíe ni sincronice.
//
//   BASE=http://localhost:3211 node scripts/_barrido-iphone-todo.mjs
//   SOLO=Fórmulas BASE=https://fashiongr.com node scripts/_barrido-iphone-todo.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3211";
const SALIDA = process.env.SALIDA ?? "/tmp/barrido-iphone";
const ETAPA = process.env.ETAPA ?? "barrido";
const SOLO = process.env.SOLO ? process.env.SOLO.split(",") : null;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1440];

const GUIA = "4048a77f-c1b3-4cf8-853d-e27323f096cd";
const RECLAMO = "empresa=Vistana+International&view=detail&id=0ba1ab3c-dfd3-44ae-b1b6-b00522e470c7";
const CAJA = "41661bd4-02e3-43c6-bb3d-e4709b1607a6";
const PREST = "e5a900f9-b05d-4ac3-914f-cd13448c5005";
const PROY = "f66c2385-e69d-4d90-82d5-6f694379464e";

const PANTALLAS = [
  { mod: "Inicio",        pant: "Home",              url: "/home" },
  { mod: "CXC",           pant: "Panel",             url: "/admin" },
  { mod: "CXC",           pant: "Clientes",          url: "/clientes" },
  { mod: "CXC",           pant: "Ficha cliente",     url: "/clientes/D-1" },
  { mod: "Proveedores",   pant: "Lista",             url: "/proveedores" },
  { mod: "Ventas",        pant: "Panel",             url: "/ventas" },
  { mod: "Ventas",        pant: "Reporte",           url: "/ventas/reporte" },
  { mod: "Vista General", pant: "Panel",             url: "/vista-general" },
  { mod: "Comisiones",    pant: "Panel",             url: "/comisiones" },
  { mod: "Multifashion",  pant: "Resumen",           url: "/multifashion?subtab=resumen" },
  { mod: "Multifashion",  pant: "Clientes",          url: "/multifashion?subtab=clientes" },
  { mod: "Multifashion",  pant: "Vendedoras",        url: "/multifashion?subtab=vendedoras" },
  { mod: "Multifashion",  pant: "Productos",         url: "/multifashion?subtab=productos" },
  { mod: "Guías",         pant: "Lista",             url: "/guias" },
  { mod: "Guías",         pant: "Nueva",             url: "/guias/nueva" },
  { mod: "Guías",         pant: "Detalle",           url: `/guias/${GUIA}` },
  { mod: "Guías",         pant: "Imprimir",          url: `/guias/${GUIA}/imprimir` },
  { mod: "Reclamos",      pant: "Por empresa",       url: "/reclamos?empresa=Vistana+International" },
  { mod: "Reclamos",      pant: "Detalle",           url: `/reclamos?${RECLAMO}` },
  { mod: "Reclamos",      pant: "Nuevo",             url: "/reclamos?view=form" },
  { mod: "Caja",          pant: "Períodos",          url: "/caja" },
  { mod: "Caja",          pant: "Período",           url: `/caja/${CAJA}` },
  { mod: "Cheques",       pant: "Lista",             url: "/cheques" },
  { mod: "Cheques",       pant: "Calendario",        url: "/cheques?view=calendario" },
  { mod: "Préstamos",     pant: "Lista",             url: "/prestamos" },
  { mod: "Préstamos",     pant: "Detalle",           url: `/prestamos/${PREST}` },
  { mod: "Packing Lists", pant: "Lista",             url: "/packing-lists" },
  { mod: "Depurador",     pant: "Depurador",         url: "/productos/cargar" },
  { mod: "Depurador",     pant: "Fórmulas",          url: "/productos/cargar?tab=formulas", esperar: "[data-layout]" },
  { mod: "Depurador",     pant: "Facturas Tienda",   url: "/productos/cargar?tab=facturas" },
  { mod: "Depurador",     pant: "Reglas",            url: "/productos/cargar?tab=reglas" },
  { mod: "Depurador",     pant: "Historial",         url: "/productos/cargar?tab=historial" },
  { mod: "Depurador",     pant: "Tallas",            url: "/productos/cargar?tab=curvas" },
  { mod: "Depurador",     pant: "Fotos a mi Excel",  url: "/productos/cargar?tab=misfotos" },
  { mod: "Referencia",    pant: "Panel",             url: "/referencia" },
  { mod: "Asistencia",    pant: "Panel",             url: "/asistencia" },
  { mod: "Gastos",        pant: "Contabilidad",      url: "/gastos-contabilidad" },
  { mod: "Marketing",     pant: "Proyectos",         url: "/marketing" },
  { mod: "Marketing",     pant: "Reportes",          url: "/marketing?vista=reportes" },
  { mod: "Marketing",     pant: "Marca",             url: "/marketing/calvin-klein" },
  { mod: "Marketing",     pant: "Mobiliario",        url: "/marketing/mobiliario" },
  { mod: "Catálogos",     pant: "Marcas",            url: "/catalogos/marcas" },
  { mod: "Catálogos",     pant: "Admin Reebok",      url: "/catalogos/admin/reebok" },
  { mod: "Catálogos",     pant: "Reebok",            url: "/catalogo/reebok" },
  { mod: "Catálogos",     pant: "Reebok productos",  url: "/catalogo/reebok/productos" },
  { mod: "Catálogos",     pant: "Reebok pedidos",    url: "/catalogo/reebok/pedidos" },
  { mod: "Catálogos",     pant: "Público Reebok",    url: "/catalogo-publico/reebok" },
  { mod: "Sistema",       pant: "Usuarios",          url: "/admin/usuarios" },
  { mod: "Sistema",       pant: "Data Health",       url: "/admin/usuarios?tab=data-health" },
];

const SONDA = `(() => {
  const VW = document.documentElement.clientWidth;
  const VH = document.documentElement.clientHeight;
  const txt = (el) => (el.innerText || el.textContent || "").trim().replace(/\\s+/g," ");
  const cls = (el) => { const c = el.className; return (c && c.baseVal !== undefined ? c.baseVal : String(c||"")).slice(0,70); };
  // 🩸 MIRAR SOLO EL ELEMENTO NO ALCANZA. El asistente de Reclamos deja los 4
  // pasos en el DOM y apaga los que no tocan desde un ANCESTRO: el hijo computa
  // display:block, opacity:1 y un rect normal, así que el barrido reportó 7
  // "encimados" en una pantalla que en la captura se ve perfecta. checkVisibility
  // camina la cadena; el hit-test remata (un ancestro con max-h-0 + overflow
  // hidden no lo agarra ninguna propiedad computada).
  const enPantalla = (el) => {
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) <= 0.05) return false;
    return true;
  };
  const tocable = (el) => {
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 1), VW - 1);
    const y = Math.min(Math.max(r.top + r.height / 2, 1), VH - 1);
    if (r.top > VH || r.bottom < 0) return true;   // fuera de la ventana: no se puede hit-testear
    const en = document.elementFromPoint(x, y);
    return !!en && (en === el || el.contains(en) || en.contains(el));
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    return enPantalla(el);
  };
  const donde = (el) => {
    if (el.closest("aside, nav")) return "barra";
    if (el.closest("header")) return "cabecera";
    return "contenido";
  };
  const todos = Array.from(document.querySelectorAll("body *"));

  // ── 1. TEXTO CORTADO ───────────────────────────────────────────────────────
  // Un elemento con TEXTO PROPIO cuya caja lo recorta. Se mide la fracción
  // visible: un apellido largo con "…" al final es aceptable; «▸M» no lo es.
  // 🩸 visible() NO sirve acá: cuando la caja queda en 0 px de ancho —que es
  // el caso PEOR, el texto no se ve NADA— pediría width>0 y lo saltearía. Fue
  // exactamente lo que pasó en la primera corrida: Fórmulas dio 0 cortados a
  // 390 (columna aplastada a 0) y 26 a 834. Acá alcanza con que tenga ALTO.
  const visibleAlto = (el) => {
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return false;
    return enPantalla(el);
  };
  const cortados = [];
  for (const el of todos) {
    const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!propio || !visibleAlto(el)) continue;
    const cs = getComputedStyle(el);
    const recorta = cs.overflowX === "hidden" || cs.overflowX === "clip" || cs.textOverflow === "ellipsis";
    if (!recorta) continue;
    const exceso = el.scrollWidth - el.clientWidth;
    const t = txt(el);
    if (!t) continue;
    // Caja de ancho 0 (o casi) con texto adentro: no hay "exceso" que medir
    // porque no hay caja. Es el caso más grave y se cuenta como 0 % visible.
    const nada = el.clientWidth <= 2;
    if (exceso <= 2 && !nada) continue;
    const visibleFrac = nada ? 0 : el.clientWidth / el.scrollWidth;
    // Se reporta cuando se pierde MÁS DE LA MITAD del texto o cuando quedan
    // menos de 90 px de caja: ahí ya no se sabe qué dice.
    if (visibleFrac >= 0.5 && el.clientWidth >= 90) continue;
    cortados.push({
      texto: t.slice(0, 50), visiblePx: Math.round(el.clientWidth), necesitaPx: Math.round(el.scrollWidth),
      frac: Math.round(visibleFrac * 100), zona: donde(el), clase: cls(el),
    });
  }
  cortados.sort((a, b) => a.frac - b.frac);

  // ── 2. ARRASTRE ────────────────────────────────────────────────────────────
  const arrastreCuerpo = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  const scrollers = [];
  for (const el of todos) {
    const ox = getComputedStyle(el).overflowX;
    if (ox !== "auto" && ox !== "scroll") continue;
    const exceso = el.scrollWidth - el.clientWidth;
    if (exceso <= 1 || !visible(el)) continue;
    scrollers.push({ px: exceso, clase: cls(el), muestra: txt(el).slice(0, 40) });
  }
  scrollers.sort((a,b)=>b.px-a.px);

  // ── 3. TOCABLES < 44 ───────────────────────────────────────────────────────
  const SEL = "button, a[href], [role=button], input, select, textarea, [role=menuitem], [role=tab], summary";
  const chicos = [];
  const vistos = new Set();
  for (const el of document.querySelectorAll(SEL)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.top > VH * 4) continue;
    if (r.height >= 44 && r.width >= 44) continue;
    if (el.type === "hidden" || el.type === "checkbox" || el.type === "radio") continue;
    const ps = getComputedStyle(el, "::after");
    if (ps && ps.content !== "none" && ps.position === "absolute") {
      const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
      if (r.height - px(ps.top) - px(ps.bottom) >= 44 && r.width - px(ps.left) - px(ps.right) >= 44) continue;
    }
    const t = (txt(el) || el.getAttribute("aria-label") || el.getAttribute("title") || el.tagName.toLowerCase()).slice(0,34);
    const it = { alto: Math.round(r.height), ancho: Math.round(r.width), t, zona: donde(el), clase: cls(el) };
    const k = it.t + "|" + it.alto + "|" + it.ancho + "|" + it.zona;
    if (vistos.has(k)) continue;
    vistos.add(k); chicos.push(it);
  }

  // ── 4. TEXTO < 12 px ───────────────────────────────────────────────────────
  const letraChica = [];
  const vistosL = new Set();
  for (const el of todos) {
    const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!propio || !visible(el)) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (!(px < 12)) continue;
    const t = txt(el).slice(0, 34);
    const k = t + "|" + px;
    if (vistosL.has(k)) continue;
    vistosL.add(k);
    letraChica.push({ t, px, zona: donde(el), clase: cls(el) });
  }

  // ── 5. ENCIMADOS ───────────────────────────────────────────────────────────
  // Hojas con texto que se pisan. Se ignoran ancestro/descendiente y los
  // posicionados a propósito (absolute/fixed/sticky: chips, badges, overlays).
  const hojas = [];
  for (const el of todos) {
    const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!propio || !visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== "static" && cs.position !== "relative") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > VH * 3) continue;
    if (!tocable(el)) continue;
    // Un inline que ENVUELVE a dos renglones tiene un rect que abarca las dos
    // líneas enteras y "solapa" con lo que tenga al lado sin pisarlo ni un
    // píxel. Es el falso positivo de Reglas y de Cheques.
    if (el.getClientRects().length > 1) continue;
    hojas.push({ el, r });
  }
  const encimados = [];
  for (let i = 0; i < hojas.length && encimados.length < 8; i++) {
    for (let j = i + 1; j < hojas.length; j++) {
      const a = hojas[i], b = hojas[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w <= 2 || h <= 2) continue;
      const area = w * h;
      const menor = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
      if (area / menor < 0.35) continue;
      const zona = donde(a.el);
      if (zona !== "contenido") continue;   // el cromo global (barra/cabecera) es otro lote
      encimados.push({ a: txt(a.el).slice(0,26), b: txt(b.el).slice(0,26), px: Math.round(area), zona });
      break;
    }
  }

  return {
    VW,
    cortados: cortados.slice(0, 8), nCortados: cortados.length,
    arrastreCuerpo,
    scrollerMax: scrollers.length ? scrollers[0].px : 0,
    scrollers: scrollers.slice(0, 3),
    chicos: chicos.slice(0, 12), nChicos: chicos.length,
    nChicosContenido: chicos.filter(c => c.zona === "contenido").length,
    letraChica: letraChica.slice(0, 10), nLetraChica: letraChica.length,
    nLetraContenido: letraChica.filter(c => c.zona === "contenido").length,
    encimados,
    largoTexto: document.body.innerText.length,
    titulo: (document.querySelector("h1,h2")?.innerText||"").trim().slice(0,44),
    enLogin: !!document.querySelector('input[type=password]'),
    // 🩸 Una pantalla que cargó el cascarón pero NO los datos mide 0 defectos y
    // pasa por sana. El banner naranja de la PWA la delata.
    sinConexion: /Sin conexi[oó]n/i.test(document.body.innerText),
  };
})()`;

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await ctx.addInitScript(() => {
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
  sessionStorage.setItem("fg_is_owner", "1");
});

const resultados = [];
for (const p of PANTALLAS) {
  const clave = `${p.mod} › ${p.pant}`;
  if (SOLO && !SOLO.some((s) => clave.includes(s))) continue;
  const page = await page_nueva();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + p.url, { waitUntil: "networkidle", timeout: 90000 });
    await estabilizar(page);
    if (p.esperar) await page.waitForSelector(p.esperar, { timeout: 15000 }).catch(() => {});
    for (const ancho of ANCHOS) {
      await page.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : ancho === 834 ? 1112 : 900 });
      await page.waitForTimeout(900);
      const r = await page.evaluate(SONDA);
      resultados.push({ mod: p.mod, pant: p.pant, url: p.url, ancho, ...r });
      if (ancho === 390) {
        await page.screenshot({ path: path.join(SALIDA, `${ETAPA}-${p.mod}-${p.pant}-390`.replace(/[^\wáéíóúñÁÉÍÓÚÑ-]+/g, "-") + ".png") });
      }
      console.error(
        `[${String(ancho).padStart(4)}] ${clave.padEnd(28)} cortado=${String(r.nCortados).padStart(3)} arrastre=${String(r.arrastreCuerpo).padStart(4)} tap<44=${String(r.nChicosContenido).padStart(3)} letra<12=${String(r.nLetraContenido).padStart(3)} encim=${r.encimados.length}${r.enLogin ? " ⚠️LOGIN" : ""}${r.largoTexto < 200 ? " ⚠️VACÍA" : ""}`,
      );
    }
  } catch (e) {
    resultados.push({ mod: p.mod, pant: p.pant, url: p.url, ancho: 0, error: String(e.message).slice(0, 160) });
    console.error(`[ERR ] ${clave.padEnd(28)} ${String(e.message).slice(0, 120)}`);
  }
  await page.close();
}
await navegador.close();
writeFileSync(path.join(SALIDA, `${ETAPA}.json`), JSON.stringify(resultados, null, 2));
console.error(`\n✅ ${resultados.length} mediciones → ${SALIDA}/${ETAPA}.json`);

async function page_nueva() { return await ctx.newPage(); }
async function estabilizar(page) {
  await page.waitForTimeout(3500);
  let previo = -1, iguales = 0;
  for (let i = 0; i < 30 && iguales < 3; i++) {
    await page.waitForTimeout(400);
    const n = await page.evaluate(() => document.body.innerText.length).catch(() => 0);
    if (n === previo && n > 0) iguales++; else { iguales = 0; previo = n; }
  }
}
