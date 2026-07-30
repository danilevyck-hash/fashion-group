// CENSO de scroll lateral / recortes / targets chicos en CAJA MENUDA, PRÉSTAMOS
// y CHEQUES, a los 3 anchos que importan (390 iPhone, 834 iPad, 1440 escritorio).
//
// 🩸 POR QUÉ EXISTE. Regla de Daniel: *"cada modulo tiene que adaptarse a
// iphone, y ipad"*. El censo de 54 pantallas encontró que estas tres pantallas
// se rompen **solo en iPad**: en celular usan tarjetas y en escritorio la tabla
// entra, pero a 834 px la barra lateral (`md:ml-56` = 224 px, que ARRANCA
// justo en 768) se come el ancho y la tabla de escritorio se enciende en el
// mismo breakpoint. El ancho ÚTIL de un iPad de 834 es ~562-610 px: más
// angosto que un iPhone acostado.
//
// QUÉ MIDE (sonda idéntica a scripts/_medir-scroll-lateral.mjs, para que los
// números sean comparables con el censo grande):
//   * `peorPx`  — px que hay que ARRASTRAR para ver el resto.
//   * `cortadoPx` — px de datos recortados que NO se alcanzan ni arrastrando.
//   * `targetsChicos` — controles con menos de 44 px de lado, EN REPOSO.
//   * `filas`/`celdas`/`articulos` — control de vacío. Un 0 px con 0 filas y 0
//     tarjetas es "no medido", no "sano".
//
// GOTCHAS heredados (no tocar sin leer):
//   * Hay que sembrar la COOKIE de sesión firmada o TODO redirige al login.
//   * Hay que sembrar sessionStorage (`cxc_role`): useAuth lo lee de AHÍ.
//   * Hay que `delete Navigator.prototype.serviceWorker` ANTES de navegar
//     (bloquear el SW de otra forma mata la hidratación).
//   * Préstamos › ficha y Caja › detalle se abren por URL DIRECTA: los ids se
//     resuelven contra la API con la misma cookie antes de empezar.
//
// ⚠️ Solo lectura: no se hace click en NINGÚN botón que ejecute algo. Las
// pantallas se alcanzan por URL, nunca tocando "Depositar", "Cerrar período" ni
// "Eliminar".
//
//   ETAPA=antes ANCHO=390 node scripts/_medir-caja-prestamos-cheques.mjs
//   ETAPA=despues ANCHO=834 SOLO=cheques node scripts/_medir-caja-prestamos-cheques.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3173";
const SALIDA = process.env.SALIDA ?? "/tmp/t73-medicion";
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
    el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().replace(/\\s+/g, ".").slice(0, 90) : "");

  const desbordes = [];
  for (const el of document.querySelectorAll("*")) {
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra <= 1) continue;
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX === "visible") continue;

    const arrastrable = cs.overflowX === "auto" || cs.overflowX === "scroll";
    const tablaAdentro = Boolean(el.querySelector("table"));
    const RECORTE_SOSPECHOSO_PX = 100;
    const recorteDeDatos = el.children.length > 0 && (tablaAdentro || sobra >= RECORTE_SOSPECHOSO_PX);
    if (!arrastrable && !recorteDeDatos) continue;

    desbordes.push({
      etiqueta: etiqueta(el),
      sobraPx: Math.round(sobra),
      arrastrable,
      anchoContenido: el.scrollWidth,
      anchoVisible: el.clientWidth,
      overflowX: cs.overflowX,
      snap: cs.scrollSnapType && cs.scrollSnapType !== "none" ? cs.scrollSnapType : null,
      tablaAdentro,
    });
  }
  desbordes.sort((a, b) => b.sobraPx - a.sobraPx);
  const arrastrables = desbordes.filter((d) => d.arrastrable);
  const cortados = desbordes.filter((d) => !d.arrastrable);

  const tablasVisibles = [...document.querySelectorAll("table")].filter(visible);
  return {
    peorPx: arrastrables.length ? arrastrables[0].sobraPx : 0,
    peor: arrastrables[0] ?? null,
    cortadoPx: cortados.length ? cortados[0].sobraPx : 0,
    cortado: cortados[0] ?? null,
    desbordes: desbordes.slice(0, 8),
    cuerpoPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    tablas: tablasVisibles.length,
    filas: tablasVisibles.reduce((n, t) => n + t.querySelectorAll("tbody tr").length, 0),
    celdas: tablasVisibles.reduce((n, t) => n + t.querySelectorAll("tbody td").length, 0),
    articulos: [...document.querySelectorAll("article, li, [data-fila]")].filter(visible).length,
    titulo: (document.querySelector("h1")?.textContent ?? "").trim().slice(0, 60),
    textoLargo: document.body.innerText.replace(/\\s+/g, " ").trim().length,
    mensajeVacio: /No hay |Sin resultados|No se encontr|Sin movimientos|Sin gastos/i.test(document.body.innerText),

    ...(() => {
      const cortes = [];
      for (const el of document.querySelectorAll("*")) {
        if (el.children.length > 0) continue;
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
        ejemplosCorte: cortes.slice(0, 6),
      };
    })(),

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
      return { targetsChicos: chicos.length, ejemplosTarget: chicos.slice(0, 8) };
    })(),
  };
})()`;

// ── Resolver ids sin tocar nada (GET puros) ──────────────────────────────────

async function pedirJson(ruta) {
  const res = await fetch(BASE + ruta, { headers: { cookie: `cxc_session=${COOKIE}` } });
  if (!res.ok) throw new Error(`${ruta} → ${res.status}`);
  return res.json();
}

const periodos = await pedirJson("/api/caja/periodos");
const listaPeriodos = Array.isArray(periodos) ? periodos : (periodos.periodos ?? []);
// Se prefiere un período con gastos: uno vacío mide 0 px y no prueba nada.
const periodoId = (listaPeriodos.find((p) => (p.total_gastado ?? 0) > 0) ?? listaPeriodos[0])?.id;

const empleados = await pedirJson("/api/prestamos/empleados");
const listaEmp = Array.isArray(empleados) ? empleados : (empleados.empleados ?? []);
const conMovs = listaEmp
  .map((e) => ({ id: e.id, n: (e.prestamos_movimientos ?? []).length }))
  .sort((a, b) => b.n - a.n)[0];
const empleadoId = conMovs?.id;

console.error(`ids → periodo=${periodoId} empleado=${empleadoId} (movs=${conMovs?.n ?? "?"})`);
if (!periodoId || !empleadoId) throw new Error("no pude resolver ids — la medición sería sobre pantallas vacías");

// ── Pantallas ────────────────────────────────────────────────────────────────

const P = [
  { id: "caja-periodos", titulo: "Caja Menuda › Períodos", url: "/caja", espera: 8000 },
  { id: "caja-detalle", titulo: "Caja Menuda › Detalle", url: `/caja/${periodoId}`, espera: 9000 },
  { id: "caja-nuevo", titulo: "Caja Menuda › Nuevo gasto", url: `/caja/${periodoId}/nuevo`, espera: 9000 },
  { id: "cheques-lista", titulo: "Cheques › Lista", url: "/cheques", espera: 9000 },
  { id: "cheques-calendario", titulo: "Cheques › Calendario", url: "/cheques?view=calendario", espera: 9000 },
  { id: "prestamos-lista", titulo: "Préstamos › Lista", url: "/prestamos", espera: 9000 },
  { id: "prestamos-ficha", titulo: "Préstamos › Ficha del empleado", url: `/prestamos/${empleadoId}`, espera: 9000 },
];

// ── Corrida ──────────────────────────────────────────────────────────────────

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const resultados = [];

for (const p of P) {
  if (SOLO && !SOLO.split(",").some((s) => p.id.includes(s))) continue;

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
    sessionStorage.setItem(
      "fg_modules",
      JSON.stringify(["caja", "cheques", "prestamos", "cxc", "ventas", "admin"]),
    );
  });

  const page = await ctx.newPage();
  const erroresJs = [];
  page.on("pageerror", (x) => erroresJs.push(String(x.message)));

  const r = { etapa: ETAPA, id: p.id, titulo: p.titulo, ancho: ANCHO };
  try {
    await page.goto(BASE + p.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(p.espera ?? 8000);
    r.urlFinal = page.url().replace(BASE, "");
    if (/\/$|\/login/.test(r.urlFinal) && r.urlFinal !== p.url) throw new Error("me echó al login: " + r.urlFinal);

    Object.assign(r, await page.evaluate(SONDA));

    await page.screenshot({
      path: path.join(SALIDA, `${p.id}-${ETAPA}-${ANCHO}.png`),
      fullPage: true,
    });

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
      path: path.join(SALIDA, `${p.id}-${ETAPA}-${ANCHO}-ERROR.png`),
      fullPage: true,
    }).catch(() => {});
  }
  r.erroresJs = erroresJs.slice(0, 2);
  resultados.push(r);
  console.error(
    `[${ETAPA}@${ANCHO}] ${p.id.padEnd(22)} arrastre=${String(r.peorPx ?? "?").padStart(4)} ` +
    `RECORTADO=${String(r.cortadoPx ?? "?").padStart(4)} montos✂=${String(r.montosCortados ?? "?").padStart(3)} ` +
    `texto✂=${String(r.textosCortados ?? "?").padStart(3)} tap<44=${String(r.targetsChicos ?? "?").padStart(3)} ` +
    `filas=${String(r.filas ?? "?").padStart(3)} tarj=${String(r.articulos ?? "?").padStart(3)} ${r.veredicto}` +
    ((r.peor ?? r.cortado) ? `  ← ${(r.peor ?? r.cortado).etiqueta.slice(0, 46)}` : "") +
    (r.error ? `  ⚠️ ${r.error}` : ""),
  );
  await ctx.close();
}

await navegador.close();
const dest = path.join(SALIDA, `censo-${ETAPA}-${ANCHO}.json`);
writeFileSync(dest, JSON.stringify(resultados, null, 2));
console.error(`\nJSON → ${dest}`);
