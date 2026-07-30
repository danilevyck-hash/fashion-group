// CENSO de scroll horizontal en celular (390 px), pantalla por pantalla.
//
// 🩸 POR QUÉ EXISTE. Daniel, sobre una tabla del sistema: *"todavia hay q hacer
// mucho scroll a la derecha para ver la info"*. Es sistémico: cada módulo
// resolvió sus tablas anchas metiéndolas en un `overflow-x-auto`, que en un
// teléfono de 390 px convierte la información en algo que hay que ir a buscar
// arrastrando. Antes de arreglar nada hay que saber CUÁL es la peor, y para eso
// hace falta un número por pantalla.
//
// QUÉ MIDE. En cada pantalla, con el viewport en 390 px, recorre el DOM y busca
// TODO elemento visible que pueda scrollear a lo ancho (`scrollWidth -
// clientWidth > 0`). Reporta:
//
//   * `peorPx`  — el máximo de esos desbordes. Es EL número del censo: cuántos
//                 píxeles de información quedan fuera de la pantalla y sólo se
//                 alcanzan arrastrando.
//   * `cuerpoPx` — desborde del documento entero. Distinto del anterior: acá la
//                 que se va de lado es la PÁGINA, no un panel interno. Es peor
//                 de lo que suena porque rompe la sensación de app nativa.
//   * `filas`/`celdas` — cuántas filas y celdas de tabla se vieron. Sirve de
//                 CONTROL DE VACÍO: una tabla sin datos mide 0 px y no prueba
//                 nada. Un 0 con `filas: 0` es "no medido", no "sano".
//
// CÓMO SE INTERPRETA `peorPx`. No es "el ancho de la tabla" sino lo que sobra:
// una tabla de 1143 px en una pantalla de 390 da 753 px. O sea, para leer la
// última columna hay que arrastrar casi DOS pantallas.
//
// OJO con los carruseles a propósito. Algunos desbordes son intencionales (una
// fila de chips que se desliza, con `scrollSnapType`). El script los anota igual
// —no adivina intención— pero guarda la etiqueta del elemento para poder
// distinguirlos a mano al leer el JSON.
//
// GOTCHAS heredados (no tocar sin leer):
//   * Hay que sembrar la COOKIE de sesión firmada o TODO redirige al login.
//   * Hay que sembrar sessionStorage (`cxc_role`): useAuth lo lee de AHÍ.
//   * Hay que `delete Navigator.prototype.serviceWorker` ANTES de navegar
//     (bloquear el SW de otra forma mata la hidratación).
//
// Solo lectura: ningún escenario guarda, borra ni envía nada.
//
//   ETAPA=antes node scripts/_medir-scroll-lateral.mjs
//   ETAPA=despues SOLO=ventas-resumen node scripts/_medir-scroll-lateral.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3167";
const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
const ETAPA = process.env.ETAPA ?? "antes";
const SOLO = process.env.SOLO ?? "";
const ANCHO = Number(process.env.ANCHO ?? 390);
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

// ── Sonda ────────────────────────────────────────────────────────────────────

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

// ── Pantallas ────────────────────────────────────────────────────────────────
//
// `espera` es generoso a propósito: casi todo se hidrata y DESPUÉS pide datos,
// y medir antes de que lleguen daría ceros falsos. `preparar` es para lo que no
// se alcanza por URL (entrar a un período de caja, cambiar de vista).

const P = [];
const pant = (o) => P.push(o);

// Mis 7 módulos del grupo "Ventas y clientes". Comisiones, Cheques, Caja,
// Préstamos, Guías, Reclamos, Packing, Depurador, Marketing, Gastos y Data
// Health los mide OTRO agente — no se duplican acá.
pant({ id: "vista-general", titulo: "Vista General", url: "/vista-general", espera: 10000 });

pant({ id: "ventas-resumen", titulo: "Ventas › Resumen", url: "/ventas?tab=resumen", espera: 11000 });
pant({ id: "ventas-clientes", titulo: "Ventas › Clientes", url: "/ventas?tab=clientes", espera: 11000 });
pant({ id: "ventas-productos", titulo: "Ventas › Productos", url: "/ventas?tab=productos", espera: 12000 });
pant({ id: "ventas-utilidad", titulo: "Ventas › Utilidad", url: "/ventas?tab=utilidad", espera: 12000 });

// CXC ya fue trabajada: sirve de CALIBRACIÓN (el patrón que hay que imitar).
pant({ id: "cxc", titulo: "CXC (Panel principal)", url: "/admin", espera: 9000 });

pant({ id: "multifashion-resumen", titulo: "Multifashion › Resumen", url: "/multifashion?subtab=resumen", espera: 11000 });
pant({ id: "multifashion-vendedoras", titulo: "Multifashion › Vendedoras", url: "/multifashion?subtab=vendedoras", espera: 11000 });
pant({ id: "multifashion-clientes", titulo: "Multifashion › Clientes", url: "/multifashion?subtab=clientes", espera: 11000 });
pant({ id: "multifashion-caja", titulo: "Multifashion › Caja", url: "/multifashion?subtab=caja", espera: 11000 });

pant({ id: "clientes", titulo: "Clientes › Directorio", url: "/clientes", espera: 9000 });
pant({
  id: "clientes-ficha",
  titulo: "Clientes › Ficha de cliente",
  url: "/clientes",
  espera: 9000,
  // En celular la lista es `ul.sm:hidden` y navega por `onClick` de la fila, no
  // con un `<a>`: buscar un enlace no encontraba nada (el `<a>` del nombre vive
  // en la tabla de escritorio, que a 390 px está oculta). En 834/1440 sí hay
  // tabla, así que se prueban los dos caminos.
  async preparar(page) {
    const fila = page.locator("ul.sm\\:hidden > li").locator("visible=true").first();
    if (await fila.count()) {
      await fila.click({ timeout: 8000 }).catch(() => {});
    } else {
      const l = page.locator('a[href^="/clientes/"]').locator("visible=true").first();
      if (!(await l.count())) return false;
      await l.click({ timeout: 8000 }).catch(() => {});
    }
    await page.waitForTimeout(6000);
    return /\/clientes\/[^/]+$/.test(page.url());
  },
});

pant({ id: "proveedores", titulo: "Proveedores (CxP)", url: "/proveedores", espera: 9000 });
pant({
  id: "proveedores-ficha",
  titulo: "Proveedores › Ficha",
  url: "/proveedores",
  espera: 9000,
  async preparar(page) {
    const l = page.locator('a[href^="/proveedores/"]').locator("visible=true").first();
    if (!(await l.count())) return false;
    await l.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(6000);
    return /\/proveedores\/[^/]+$/.test(page.url());
  },
});

// ── Catálogos: las 3 marcas, interna y pública ───────────────────────────────
// ⚠️ Los FILTROS los está arreglando otro agente: el `div.overflow-x-auto` de
// `CatalogFilters` se anota pero NO cuenta como hallazgo mío (queda marcado en
// el JSON por su etiqueta). Lo que se mide acá es el resto: grilla, tarjetas,
// carrito y detalle de producto.
pant({ id: "catalogos-hub", titulo: "Catálogos › Hub de marcas", url: "/catalogos/marcas", espera: 8000 });
for (const m of ["reebok", "joybees", "tommy"]) {
  pant({ id: `catalogo-${m}`, titulo: `Catálogo interno › ${m}`, url: `/catalogo/${m}`, espera: 13000 });
  pant({ id: `catalogo-pub-${m}`, titulo: `Catálogo público › ${m}`, url: `/catalogo-publico/${m}`, espera: 13000 });
  // El detalle de producto NO es una pantalla aparte: la grilla usa tarjetas
  // agrupadas que se despliegan en su lugar, sin navegar. Se mide en la grilla.
}

// ── Corrida ──────────────────────────────────────────────────────────────────

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const resultados = [];

for (const p of P) {
  if (SOLO && !SOLO.split(",").some((s) => p.id.includes(s))) continue;

  // El alto acompaña al ancho: un iPad con 844 px de alto no existe, y varias
  // pantallas cargan por debajo del pliegue. El táctil se apaga en escritorio —
  // hay layouts que se ramifican por `hasTouch` y medir un 1440 táctil sería
  // medir una pantalla que ningún usuario ve.
  const ALTO = ANCHO >= 1200 ? 900 : ANCHO >= 700 ? 1194 : 844;
  const ctx = await navegador.newContext({
    viewport: { width: ANCHO, height: ALTO },
    deviceScaleFactor: 1,
    hasTouch: ANCHO < 1200,
    isMobile: false,
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
    // `hasModuleAccess` cae de vuelta a `fg_modules`: sin esto el catálogo
    // interno rebota antes de dibujar nada y se mediría una pantalla vacía.
    sessionStorage.setItem(
      "fg_modules",
      JSON.stringify([
        "catalogos", "ventas", "cxc", "multifashion", "clientes", "proveedores",
        "vista-general", "admin",
      ]),
    );
  });

  const page = await ctx.newPage();
  const erroresJs = [];
  page.on("pageerror", (x) => erroresJs.push(String(x.message)));

  const r = { etapa: ETAPA, id: p.id, titulo: p.titulo, ancho: ANCHO };
  try {
    await page.goto(BASE + p.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(p.espera ?? 8000);
    if (p.preparar && !(await p.preparar(page))) throw new Error("no pude preparar la pantalla");
    r.urlFinal = page.url().replace(BASE, "");
    if (/\/$|\/login/.test(r.urlFinal) && r.urlFinal !== p.url) throw new Error("me echó al login: " + r.urlFinal);

    Object.assign(r, await page.evaluate(SONDA));

    // El screenshot es de página completa: si la tabla se va de lado, el PNG lo
    // muestra recortado igual que el teléfono, que es justo lo que se quiere ver.
    await page.screenshot({
      path: path.join(SALIDA, `scroll-${p.id}-${ETAPA}-${ANCHO}.png`),
      fullPage: true,
    });

    // ¿Hay DATOS? Sin datos un 0 px no prueba nada, así que el veredicto lo dice.
    // Un desborde MEDIDO ya es prueba de contenido por sí solo — no hace falta
    // contar filas para creerle. Y con la pantalla declarando "no hay nada" y sin
    // desborde, el 0 no vale.
    r.conDatos = r.peorPx > 0 || r.cortadoPx > 0 || r.filas > 0 || r.celdas > 0
      || (!r.mensajeVacio && r.textoLargo > 250);
    r.veredicto = !r.conDatos
      ? "SIN-DATOS (el 0 no prueba nada)"
      : r.cortadoPx > 0 && r.peorPx === 0
        ? "CORTADO (no se alcanza)"
        : r.peorPx > 0
          ? "SCROLL"
          : "SANO";
  } catch (err) {
    r.error = String(err.message ?? err).slice(0, 200);
    r.veredicto = "NO-MEDIDO";
    await page.screenshot({
      path: path.join(SALIDA, `scroll-${p.id}-${ETAPA}-${ANCHO}-ERROR.png`),
      fullPage: true,
    }).catch(() => {});
  }
  r.erroresJs = erroresJs.slice(0, 2);
  resultados.push(r);
  console.error(
    `[${ETAPA}@${ANCHO}] ${p.id.padEnd(24)} arrastre=${String(r.peorPx ?? "?").padStart(4)} ` +
    `RECORTADO=${String(r.cortadoPx ?? "?").padStart(4)} montos✂=${String(r.montosCortados ?? "?").padStart(3)} ` +
    `tap<44=${String(r.targetsChicos ?? "?").padStart(3)} filas=${String(r.filas ?? "?").padStart(4)} ` +
    `${r.veredicto}` +
    ((r.peor ?? r.cortado) ? `  ← ${(r.peor ?? r.cortado).etiqueta.slice(0, 44)}` : "") +
    (r.error ? `  ⚠️ ${r.error}` : ""),
  );
  await ctx.close();
}

await navegador.close();
resultados.sort((a, b) =>
  Math.max(b.peorPx ?? -1, b.cortadoPx ?? -1) - Math.max(a.peorPx ?? -1, a.cortadoPx ?? -1));
const dest = path.join(SALIDA, `scroll-lateral-censo-${ETAPA}-${ANCHO}.json`);
writeFileSync(dest, JSON.stringify(resultados, null, 2));

console.error(`\n${"".padEnd(72, "─")}\nCENSO ${ETAPA} @${ANCHO}px — peor a mejor\n${"".padEnd(72, "─")}`);
for (const r of resultados) {
  console.error(
    `${String(r.peorPx ?? "?").padStart(5)} px  ${r.titulo.padEnd(40)} ${r.veredicto}` +
    (r.cortadoPx ? `  (+${r.cortadoPx} px cortados)` : ""),
  );
}
console.error(`\nJSON → ${dest}`);
