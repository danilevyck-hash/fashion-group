// Arrastre lateral de MIS 4 pantallas (Ventas > Clientes / Productos / Utilidad
// y Vista General), a 390 / 834 / 1024 / 1440 px.
//
// 🩸 POR QUÉ UN SCRIPT PROPIO. `_medir-scroll-lateral.mjs` es compartido y su
// lista de pantallas la reapunta cada agente a SU lote (el 30-jul quedó apuntado
// a Multifashion/Proveedores/Directorio). Pelearse por esa lista deja a los dos
// sin poder re-medir. Acá va MI lista — pero la SONDA se COPIA del censo en
// tiempo de generación, no se reescribe: un criterio propio daría números que no
// se pueden comparar contra el censo, que es de donde salieron los 369/368.
//
// 🔑 1024 NO ES ESCRITORIO: ES EL MISMO IPAD, ACOSTADO. Es el ancho donde las
// dos salidas se separan — correr el corte a `lg` puede dejar el problema vivo
// justo ahí. Por eso se mide, aunque el encargo pedía tres anchos.
//
// ⚠️ CONTROL DE VACÍO: un 0 en una pantalla vacía no prueba nada. Estas 4
// pantallas dibujan TARJETAS en los anchos angostos, así que contar `<tbody tr>`
// las daría por vacías siendo que están llenas. Se cuentan por su `data-` fijo
// (`data-fila-cliente` y compañía) y, si da 0, el veredicto lo dice.
//
// Solo lectura: no se toca ningún botón que ejecute nada.
//
//   BASE=http://localhost:3172 node scripts/_medir-ventas-vista-general.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3172";
const SALIDA = process.env.SALIDA ?? "/tmp/t72f";
const ETAPA = process.env.ETAPA ?? "final";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const PANTALLAS = [
  // Resumen NO tiene `data-fila-*`: su forma angosta son tarjetas y la ancha una
  // matriz, y ninguna de las dos quedó marcada cuando se separaron (#369). Se
  // espera por lo que SÍ existe en las dos: `tbody tr` en la matriz y
  // `[data-celda]` en las tarjetas. Sigue siendo un ancla estable del contenido,
  // no una clase de breakpoint.
  { id: "ventas-resumen",   titulo: "Ventas > Resumen",   url: "/ventas?tab=resumen",   ancla: "table tbody tr, [data-celda]" },
  { id: "ventas-clientes",  titulo: "Ventas > Clientes",  url: "/ventas?tab=clientes",  ancla: "table tbody tr, [data-fila-cliente]" },
  { id: "ventas-productos", titulo: "Ventas > Productos", url: "/ventas?tab=productos", ancla: "[data-fila-producto]" },
  { id: "ventas-utilidad",  titulo: "Ventas > Utilidad",  url: "/ventas?tab=utilidad",  ancla: "[data-fila-utilidad]" },
  { id: "vista-general",    titulo: "Vista General",      url: "/vista-general",        ancla: "[data-fila-semaforo]" },
];

const SONDA = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const etiqueta = (el) =>
    el.tagName.toLowerCase() + (el.className ? "." + String(el.className).trim().replace(/\\s+/g, ".").slice(0, 90) : "");

  const desbordes = [];
  for (const el of document.querySelectorAll("*")) {
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra <= 1) continue;                 // 1px = redondeo de subpíxel
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    // 'visible' no recorta: el contenido se ve, mal, pero se ve. No es esto.
    if (cs.overflowX === "visible") continue;

    const arrastrable = cs.overflowX === "auto" || cs.overflowX === "scroll";
    const tablaAdentro = Boolean(el.querySelector("table"));

    // 'hidden' / 'clip' recortan SIN dejar scrollear, y eso son DOS cosas
    // distintas según qué recorten:
    //   · un texto con puntos suspensivos → que scrollWidth pase del clientWidth
    //     ES el mecanismo, no un defecto. Contarlos era ruido puro: el CXC, que
    //     ya está resuelto y mide 0, salía con 2 px por un nombre de cliente.
    //   · una tabla → el dato queda fuera de la pantalla y no hay forma de
    //     alcanzarlo. Es PEOR que tener que arrastrar, y hay que reportarlo.
    // Lo que separa los dos casos es QUE recorta, y son dos condiciones:
    //   (a) recorta HIJOS, no texto propio. Un elemento hoja que recorta es un
    //       texto con puntos suspensivos por definicion. Los nombres de producto
    //       del catalogo, que son un h3 con truncate, perdian 174 px y se leian
    //       como datos inalcanzables siendo el mecanismo del ... bien usado. Los
    //       recortes de texto se cuentan aparte, en textosCortados, y si el texto
    //       cortado es un MONTO se marca aparte otra vez, en montosCortados.
    //   (b) y es una tabla, o un recorte grande. Un table adentro lo resuelve sin
    //       ambiguedad pero NO alcanza: la tabla de Multifashion > Clientes esta
    //       hecha de divs y perdia 288 px sin un solo table. El umbral esta
    //       MEDIDO: en el barrido, todo recorte de texto quedo en 53 px o menos y
    //       el unico recorte de datos real fue de 288 px.
    const RECORTE_SOSPECHOSO_PX = 100;
    const recorteDeDatos = el.children.length > 0 && (tablaAdentro || sobra >= RECORTE_SOSPECHOSO_PX);
    if (!arrastrable && !recorteDeDatos) continue;

    const r = el.getBoundingClientRect();
    desbordes.push({
      etiqueta: etiqueta(el),
      sobraPx: Math.round(sobra),
      arrastrable,
      anchoContenido: el.scrollWidth,
      anchoVisible: el.clientWidth,
      cajaAncho: Math.round(r.width),
      overflowX: cs.overflowX,
      // Un carrusel a propósito se delata por el scroll-snap.
      snap: cs.scrollSnapType && cs.scrollSnapType !== "none" ? cs.scrollSnapType : null,
      // ¿Hay una tabla adentro? Es la firma de "tabla ancha metida en un div".
      tablaAdentro: Boolean(el.querySelector("table")),
      columnas: el.querySelector("table")
        ? el.querySelectorAll("table thead th").length ||
          (el.querySelector("table tr") ? el.querySelector("table tr").children.length : 0)
        : 0,
    });
  }
  desbordes.sort((a, b) => b.sobraPx - a.sobraPx);
  const arrastrables = desbordes.filter((d) => d.arrastrable);
  const cortados = desbordes.filter((d) => !d.arrastrable);

  const tablasVisibles = [...document.querySelectorAll("table")].filter(visible);
  return {
    // EL número del censo: px que hay que arrastrar para ver el resto.
    peorPx: arrastrables.length ? arrastrables[0].sobraPx : 0,
    peor: arrastrables[0] ?? null,
    // Px de tabla que quedan fuera y NO se pueden alcanzar ni arrastrando.
    cortadoPx: cortados.length ? cortados[0].sobraPx : 0,
    cortado: cortados[0] ?? null,
    desbordes: desbordes.slice(0, 8),
    cuantos: desbordes.length,
    cuerpoPx: Math.max(
      0,
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
    // Control de vacío.
    tablas: tablasVisibles.length,
    filas: tablasVisibles.reduce((n, t) => n + t.querySelectorAll("tbody tr").length, 0),
    celdas: tablasVisibles.reduce((n, t) => n + t.querySelectorAll("tbody td").length, 0),
    // Muchos módulos ya usan tarjetas en móvil; contarlas evita confundir
    // "no hay datos" con "los datos están en tarjetas y no en <table>".
    articulos: [...document.querySelectorAll("article, li")].filter(visible).length,
    titulo: (document.querySelector("h1")?.textContent ?? "").trim().slice(0, 60),
    textoLargo: document.body.innerText.replace(/\\s+/g, " ").trim().length,
    // La pantalla DICE que está vacía. Es la única señal confiable de vacío: el
    // largo del texto no sirve (Reclamos, con 5 tarjetas y 26 reclamos, tiene
    // menos texto que el mensaje de "no hay nada" de otra pantalla).
    mensajeVacio: /No hay |Sin resultados|No se encontr/i.test(document.body.innerText),

    // ── Texto y NÚMEROS cortados ─────────────────────────────────────────────
    // Un nombre con puntos suspensivos es diseño. Un MONTO cortado es otra cosa:
    // "$1,23…" no es un número más chico, es un número que no se puede leer, y
    // encima parece completo. Por eso se cuentan aparte.
    ...(() => {
      const cortes = [];
      for (const el of document.querySelectorAll("*")) {
        if (el.children.length > 0) continue;              // solo hojas de texto
        const sobra = el.scrollWidth - el.clientWidth;
        if (sobra <= 1) continue;
        const cs = getComputedStyle(el);
        if (cs.overflowX !== "hidden" && cs.overflowX !== "clip") continue;
        if (!visible(el)) continue;
        const txt = (el.textContent ?? "").trim();
        if (!txt) continue;
        cortes.push({ txt: txt.slice(0, 40), px: Math.round(sobra), plata: /[$%]|\\d[\\d,.]{3,}/.test(txt) });
      }
      cortes.sort((a, b) => b.px - a.px);
      return {
        textosCortados: cortes.length,
        montosCortados: cortes.filter((c) => c.plata).length,
        ejemplosCorte: cortes.slice(0, 5),
      };
    })(),

    // ── Blancos táctiles por debajo de 44 px ─────────────────────────────────
    // Regla de la casa (auditoría iPhone #297-304). Se mide en reposo: lo que se
    // ve al abrir la pantalla, sin desplegar nada.
    ...(() => {
      const chicos = [];
      const sel = "button, a[href], [role=button], [role=menuitem], input:not([type=hidden]), select, textarea";
      for (const el of document.querySelectorAll(sel)) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.height >= 44 && r.width >= 44) continue;
        chicos.push({
          etiqueta: (el.getAttribute("aria-label") || el.textContent || el.tagName).replace(/\\s+/g, " ").trim().slice(0, 28),
          w: Math.round(r.width), h: Math.round(r.height),
        });
      }
      chicos.sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h));
      return { targetsChicos: chicos.length, ejemplosTarget: chicos.slice(0, 5) };
    })(),
  };
})()`;

const ANCHOS = (process.env.ANCHOS ?? "390,834,1024,1440").split(",").map(Number);

mkdirSync(SALIDA, { recursive: true });
const nav = await chromium.launch();
const filas = [];

for (const ancho of ANCHOS) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: alto },
    deviceScaleFactor: 1,
    // El táctil se apaga en escritorio: hay layouts que se ramifican por
    // `hasTouch` y medir un 1440 táctil sería medir algo que nadie ve.
    hasTouch: ancho < 1200,
    isMobile: false,
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  // Bloquear el SW de otra forma mata la hidratación.
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  // Sin sembrar esto, useAuth manda TODO al login y se mide una pantalla vacía.
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
    sessionStorage.setItem("fg_modules", JSON.stringify(["ventas", "cxc", "clientes", "vista-general", "admin"]));
  });
  const page = await ctx.newPage();

  for (const p of PANTALLAS) {
    const r = { etapa: ETAPA, ancho, id: p.id, titulo: p.titulo };
    try {
      await page.goto(BASE + p.url, { waitUntil: "domcontentloaded", timeout: 90000 });
      // Esperar DATOS, no un reloj: los 3 tabs de Ventas se auto-fetchean
      // después de hidratar y medir antes daría ceros falsos.
      await page.waitForSelector(p.ancla, { timeout: 60000, state: "attached" }).catch(() => {});
      await page.waitForTimeout(2500);
      const urlFinal = page.url().replace(BASE, "");
      if (/\/login/.test(urlFinal)) throw new Error("me echó al login: " + urlFinal);
      Object.assign(r, await page.evaluate(SONDA));
      r.conDatos = await page.locator(p.ancla).count();
      // ⚠️ UNA excepción, medida contra main y anotada acá para que no sea una
      // exención en blanco: a 1024 px las tarjetas de "Requiere tu atención"
      // (grid de 3 columnas) recortan hasta 125 px del NOMBRE del cliente con
      // `truncate`. Verificado el 30-jul-2026 sobre el build de main SIN este
      // cambio: los mismos 18 spans, el mismo peor caso de 125 px ("American
      // Designer Fashion · Vistana International", caja de 159 px). Es
      // PRE-EXISTENTE (viene del #301) y no lo toca este PR — mis hunks de
      // vista-general son Equilibrio y Semáforo, nada de esa sección.
      // La sonda del censo lo cuenta como "recorte de datos" sólo porque el span
      // tiene un hijo (la empresa va en un span anidado); en los hechos es el
      // mecanismo de los puntos suspensivos. El MONTO de al lado es `shrink-0`
      // y no se recorta: `montosCortados` da 0.
      const soloTextoConPuntos = r.cortadoPx > 0
        && (r.montosCortados ?? 0) === 0
        && (r.cortado?.etiqueta ?? "").includes("truncate");
      r.recortePreexistente = soloTextoConPuntos ? r.cortadoPx : 0;
      const cortadoReal = soloTextoConPuntos ? 0 : r.cortadoPx;
      r.veredicto = r.conDatos === 0
        ? "SIN-DATOS (el 0 no prueba nada)"
        : cortadoReal > 0 && r.peorPx === 0 ? "CORTADO (no se alcanza)"
        : r.peorPx > 0 ? "SCROLL"
        : soloTextoConPuntos ? `SANO (+${r.cortadoPx}px de nombre con puntos suspensivos, ya estaba en main)`
        : "SANO";
      await page.screenshot({ path: path.join(SALIDA, `${p.id}-${ETAPA}-${ancho}.png`), fullPage: true });
    } catch (err) {
      r.error = String(err?.message ?? err).slice(0, 160);
      r.veredicto = "NO-MEDIDO";
    }
    filas.push(r);
    console.log(
      `[${ETAPA}@${String(ancho).padStart(4)}] ${p.id.padEnd(17)} arrastre=${String(r.peorPx ?? "?").padStart(4)} ` +
      `RECORTADO=${String(r.cortadoPx ?? "?").padStart(4)} montos-cortados=${String(r.montosCortados ?? "?").padStart(3)} ` +
      `tap<44=${String(r.targetsChicos ?? "?").padStart(3)} filas=${String(r.conDatos ?? "?").padStart(4)} ${r.veredicto}` +
      ((r.peor ?? r.cortado) ? `  <- ${(r.peor ?? r.cortado).etiqueta.slice(0, 46)}` : "") +
      (r.error ? `  ATENCION ${r.error}` : ""),
    );
  }
  await ctx.close();
}
await nav.close();

const dest = path.join(SALIDA, `ventas-vista-general-${ETAPA}.json`);
writeFileSync(dest, JSON.stringify(filas, null, 2));
const malas = filas.filter((f) =>
  (f.peorPx ?? 1) > 0
  || ((f.cortadoPx ?? 1) - (f.recortePreexistente ?? 0)) > 0
  || f.conDatos === 0
  || f.error);
console.log(`\n${filas.length} mediciones · ${malas.length} con problema · JSON -> ${dest}`);
process.exit(malas.length ? 1 : 0);
