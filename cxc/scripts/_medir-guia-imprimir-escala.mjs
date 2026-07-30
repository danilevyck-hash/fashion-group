// La guía de despacho en pantalla: ¿se ve la HOJA ENTERA sin arrastrar?
//
// ── 🩸 POR QUÉ ───────────────────────────────────────────────────────────────
//
// La guía impresa mide ~548px de contenido (7 columnas) y en un iPhone de 390 no
// entra. Daniel eligió la opción 2: **la hoja entra entera, achicada**, como la
// vista previa de un PDF, y se toca para verla grande.
//
// El razonamiento: el problema no es que la guía sea ancha, es que en el celular
// **no se sabe que hay algo más a la derecha**. Achicarla resuelve eso sin tocar
// el papel. (La opción 3 —tarjetas en pantalla, tabla en papel— se lee mejor
// pero parte el documento en dos versiones, y ese papel es el respaldo de la
// entrega: que la pantalla y la hoja digan lo mismo vale más.)
//
// Mide, en los 4 anchos y en los DOS modos (hoja / ampliado):
//   · arrastre del cuerpo y del marco
//   · si la hoja entra ENTERA (ancho renderizado ≤ ancho disponible)
//   · la escala aplicada
//   · que exista una salida visible del modo ampliado
//   · targets < 44px del contenido
//
// El papel se verifica aparte y con el archivo de verdad:
// `scripts/_verif-guia-impresa-identica.mjs`.
//
// GOTCHAS: sembrar cookie + sessionStorage o todo va al login; y
// `delete Navigator.prototype.serviceWorker` antes de navegar.
//
// Solo lectura.
//
//   ETAPA=antes   node scripts/_medir-guia-imprimir-escala.mjs
//   ETAPA=despues node scripts/_medir-guia-imprimir-escala.mjs
//   node scripts/_medir-guia-imprimir-escala.mjs --comparar

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3180";
const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp/guia80";
const ETAPA = process.env.ETAPA ?? "antes";
const ID_GUIA = process.env.ID_GUIA ?? "4048a77f-c1b3-4cf8-853d-e27323f096cd";

const TAMANOS = [
  { nombre: "390", width: 390, height: 844, touch: true },
  { nombre: "834", width: 834, height: 1112, touch: true },
  { nombre: "1024", width: 1024, height: 768, touch: true },
  { nombre: "1440", width: 1440, height: 900, touch: false },
];

const SONDA = `(() => {
  const VW = document.documentElement.clientWidth;
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const cls = (el) => { const c = el.className; return (c && c.baseVal !== undefined ? c.baseVal : String(c||"")).slice(0,70); };

  const doc = document.getElementById("print-document");
  const marco = document.querySelector("[data-hoja-marco]");

  // arrastre: cuerpo + cualquier contenedor con scroll lateral
  const arrastreCuerpo = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  let arrastreMarco = 0, scrollers = [];
  for (const el of document.querySelectorAll("body *")) {
    const ox = getComputedStyle(el).overflowX;
    if (ox !== "auto" && ox !== "scroll") continue;
    const ex = el.scrollWidth - el.clientWidth;
    if (ex <= 1 || !visible(el)) continue;
    scrollers.push({ px: ex, clase: cls(el) });
    arrastreMarco = Math.max(arrastreMarco, ex);
  }

  // ¿entra la hoja entera? Se compara el ancho REAL PINTADO (con la escala ya
  // aplicada: getBoundingClientRect SÍ refleja el transform) contra el hueco.
  // 🩸 Se mide el CONTENIDO (scrollWidth), no la caja: el documento es un
  // bloque que se encoge al contenedor mientras su TABLA desborda adentro, así
  // que comparar caja contra contenedor daba "entra entera" siempre — un falso
  // positivo. scrollWidth es ancho de layout y el transform no lo toca, así que
  // hay que multiplicarlo por la escala para saber cuánto se PINTA.
  let hoja = null;
  if (doc) {
    const r = doc.getBoundingClientRect();
    const cont = (marco || doc.parentElement).getBoundingClientRect();
    const escala = doc.offsetWidth ? +(r.width / doc.offsetWidth).toFixed(3) : 1;
    const anchoContenido = Math.max(doc.scrollWidth, doc.offsetWidth);
    const pintadoContenido = anchoContenido * escala;
    // 🩸 "Entra entera" se juzga contra el BORDE DERECHO REAL en pantalla, no
    // contra un ancho suelto. Comparar solo anchos daba un falso VERDE: la hoja
    // medía 390 en una ventana de 390 y parecía entrar, pero arrancaba en x=16
    // (el padding del marco) y terminaba en 406 — 16px afuera, con la última
    // columna cortada. Y el arrastre daba 0 igual, porque overflow-hidden lo
    // recorta sin dejar rastro.
    const bordeDerecho = r.left + pintadoContenido;
    hoja = {
      anchoContenido: Math.round(anchoContenido),
      pintadoContenido: Math.round(pintadoContenido),
      anchoDisponible: Math.round(cont.width),
      bordeDerecho: Math.round(bordeDerecho),
      escala,
      entraEntera: r.left >= -1 && bordeDerecho <= VW + 1,
      seSaleDePantalla: Math.max(0, Math.round(bordeDerecho - VW)),
    };
  }

  // salida visible del modo ampliado
  const salida = [...document.querySelectorAll("button")]
    .filter(b => visible(b) && /hoja completa|ver completa|reducir|salir|volver a la hoja/i.test(b.innerText || ""))
    .map(b => (b.innerText || "").trim().slice(0, 40));

  // targets < 44 del CONTENIDO (el cromo global es de otro lote)
  const chicos = [];
  const vistos = new Set();
  for (const el of document.querySelectorAll("button, a[href], [role=button], input, select")) {
    if (!visible(el)) continue;
    if (el.closest("nav, aside, header")) continue;
    const cab = el.closest("div.w-full.border-b.bg-white");
    if (cab && cab.getBoundingClientRect().top < 120) continue;
    if (el.closest("#print-document")) continue;   // el documento es papel, no UI
    const r = el.getBoundingClientRect();
    if (r.height >= 44 && r.width >= 44) continue;
    const t = (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 30);
    const k = t + "|" + Math.round(r.height) + "|" + Math.round(r.width);
    if (vistos.has(k)) continue;
    vistos.add(k);
    chicos.push({ t, alto: Math.round(r.height), ancho: Math.round(r.width) });
  }

  return {
    VW, arrastreCuerpo, arrastreMarco,
    arrastreMax: Math.max(arrastreCuerpo, arrastreMarco),
    scrollers: scrollers.slice(0, 3),
    hoja, salida, nChicos: chicos.length, chicos: chicos.slice(0, 6),
    hayDoc: !!doc, hayMarco: !!marco,
    largoTexto: document.body.innerText.length,
  };
})()`;

if (process.argv.includes("--comparar")) {
  const A = JSON.parse(readFileSync(path.join(SALIDA, "pantalla-antes.json"), "utf8"));
  const D = JSON.parse(readFileSync(path.join(SALIDA, "pantalla-despues.json"), "utf8"));
  const key = (x) => x.ancho + "|" + x.modo;
  const ia = Object.fromEntries(A.map(x => [key(x), x])), id = Object.fromEntries(D.map(x => [key(x), x]));
  console.log("ANCHO  MODO      ARRASTRE        HOJA ENTERA        ESCALA");
  let peor = 0;
  for (const k of Object.keys(id)) {
    const x = id[k], y = ia[k] ?? ia[k.split("|")[0] + "|hoja"];
    const [ancho, modo] = k.split("|");
    const arr = `${String(y?.arrastreMax ?? "-").padStart(4)}→${String(x.arrastreMax).padStart(4)}`;
    const ent = `${y?.hoja?.entraEntera ? "sí" : "NO"} → ${x.hoja?.entraEntera ? "sí ✅" : "NO ⛔"}`;
    console.log(`${ancho.padStart(5)}  ${modo.padEnd(9)} ${arr}  ${ent.padEnd(18)} ${x.hoja?.escala ?? "-"}`);
    if ((ancho === "1024" || ancho === "1440") && modo === "hoja" && y && x.arrastreMax > y.arrastreMax) peor++;
  }
  console.log(peor ? `\n⛔ ESCRITORIO EMPEORÓ (${peor})` : "\n✅ Escritorio no empeoró");
  process.exit(peor ? 1 : 0);
}

mkdirSync(SALIDA, { recursive: true });
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const nav = await chromium.launch();
const out = [];

for (const t of TAMANOS) {
  const ctx = await nav.newContext({ viewport: { width: t.width, height: t.height }, hasTouch: t.touch });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/guias/${ID_GUIA}/imprimir`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(9000);

  const base = await page.evaluate(SONDA);
  out.push({ ancho: t.nombre, modo: "hoja", ...base });
  await page.screenshot({ path: path.join(SALIDA, `${ETAPA}-${t.nombre}-hoja.png`) });
  console.log(`[${t.nombre}] hoja      arrastre=${base.arrastreMax} entera=${base.hoja?.entraEntera} fuera=${base.hoja?.seSaleDePantalla}px escala=${base.hoja?.escala} salida=[${base.salida}] tap<44=${base.nChicos}`);

  // modo ampliado: se toca la hoja
  const lupa = page.locator("[data-hoja-ampliar]");
  if (await lupa.count().catch(() => 0)) {
    await lupa.first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const amp = await page.evaluate(SONDA);
    out.push({ ancho: t.nombre, modo: "ampliado", ...amp });
    await page.screenshot({ path: path.join(SALIDA, `${ETAPA}-${t.nombre}-ampliado.png`) });
    console.log(`[${t.nombre}] ampliado  arrastre=${amp.arrastreMax} (cuerpo=${amp.arrastreCuerpo}) salida=[${amp.salida}] tap<44=${amp.nChicos}`);
  }

  await page.close();
  await ctx.close();
}
await nav.close();
writeFileSync(path.join(SALIDA, `pantalla-${ETAPA}.json`), JSON.stringify(out, null, 2));
console.log(`\n✅ ${out.length} mediciones → ${SALIDA}/pantalla-${ETAPA}.json`);
