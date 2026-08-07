// Verificación en el NAVEGADOR de la pestaña Planilla, contra el build de
// producción y los datos reales.
//
// Qué comprueba, y por qué cada cosa:
//   1. Que la pestaña carga y trae FILAS (un 0 no prueba nada).
//   2. Que quien no se puede calcular aparece con «falta configurar» y NO con $0.
//   3. Que el Excel y el PDF BAJAN DE VERDAD (bytes > 0) y el Excel trae filas.
//   4. Los tres anchos: 390 / 834 / 1440. Arrastre del CUERPO = 0 px, y blancos
//      táctiles >= 44 px.
//
// GOTCHAS heredados (no tocar sin leer):
//   * Cookie de sesión FIRMADA o todo redirige al login.
//   * sessionStorage `cxc_role`: useAuth lo lee de AHÍ.
//   * `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
// Solo lectura salvo el POST de montos manuales, que se prueba aparte.

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, statSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3167";
const SALIDA = process.env.SALIDA ?? "/tmp/planilla-verif";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = (process.env.ANCHOS ?? "390,834,1440").split(",").map(Number);

const SONDA = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const txt = document.body.innerText;

  // Arrastre de la PÁGINA (lo que no se perdona) y del panel interno (que sí).
  let peorPanel = 0, peorEtq = "";
  for (const el of document.querySelectorAll("*")) {
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra <= 1 || !visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX !== "auto" && cs.overflowX !== "scroll") continue;
    if (sobra > peorPanel) { peorPanel = Math.round(sobra); peorEtq = el.tagName + "." + String(el.className).slice(0, 50); }
  }

  const chicos = [];
  const sel = "button, a[href], [role=button], input:not([type=hidden]), select, textarea";
  for (const el of document.querySelectorAll(sel)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height >= 43.5 && r.width >= 43.5) continue;
    chicos.push({ e: (el.getAttribute("aria-label") || el.textContent || el.tagName).replace(/\\s+/g, " ").trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) });
  }

  const tablas = [...document.querySelectorAll("table")].filter(visible);
  return {
    cuerpoPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    panelPx: peorPanel,
    panelEtq: peorEtq,
    filasTabla: tablas.reduce((n, t) => n + t.querySelectorAll("tbody tr").length, 0),
    columnas: tablas.length ? tablas[0].querySelectorAll("thead th").length : 0,
    // En celular son tarjetas, no <table>: se cuentan los botones de tarjeta.
    tarjetas: [...document.querySelectorAll("div.rounded-lg > button")].filter(visible).length,
    faltaConfigurar: (txt.match(/falta configurar/g) || []).length,
    // 🔴 Un $0.00 en una fila de planilla es la firma del error que esto evita.
    ceros: (txt.match(/\\$0\\.00/g) || []).length,
    tieneTotal: /TOTAL/.test(txt),
    tieneNeto: /Neto a pagar|Neto a\\npagar/i.test(txt),
    textoLargo: txt.replace(/\\s+/g, " ").trim().length,
    muestra: txt.replace(/\\s+/g, " ").trim().slice(0, 400),
    targetsChicos: chicos.length,
    ejemplos: chicos.slice(0, 6),
  };
})()`;

mkdirSync(SALIDA, { recursive: true });
const nav = await chromium.launch();
const salida = [];

for (const ANCHO of ANCHOS) {
  const ALTO = ANCHO >= 1200 ? 900 : ANCHO >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({
    viewport: { width: ANCHO, height: ALTO },
    deviceScaleFactor: 1,
    hasTouch: ANCHO < 1200,
    acceptDownloads: true,
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_is_owner", "1");
    sessionStorage.setItem("fg_modules", JSON.stringify(["asistencia", "admin"]));
  });

  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (x) => errores.push(String(x.message).slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text().slice(0, 160)); });

  const r = { ancho: ANCHO };
  try {
    await page.goto(BASE + "/asistencia", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    await page.getByRole("button", { name: "Planilla", exact: true }).click();
    // La quincena por defecto es la de hoy (agosto), que tiene pocos días.
    // Se elige la del 16 al 31 de julio: es la del cotejo con la contable.
    await page.waitForTimeout(1500);
    await page.locator("select").first().selectOption("2026-07-2");
    await page.waitForTimeout(6000);

    Object.assign(r, await page.evaluate(SONDA));
    await page.screenshot({ path: path.join(SALIDA, `planilla-${ANCHO}.png`), fullPage: true });

    // ── Descargas de verdad ──────────────────────────────────────────────────
    if (ANCHO === 1440) {
      for (const [boton, ext] of [["Excel", "xlsx"], ["PDF", "pdf"]]) {
        const espera = page.waitForEvent("download", { timeout: 25_000 });
        await page.getByRole("button", { name: boton, exact: true }).click();
        const dl = await espera;
        const destino = path.join(SALIDA, dl.suggestedFilename());
        await dl.saveAs(destino);
        r[`${ext}Nombre`] = dl.suggestedFilename();
        r[`${ext}Bytes`] = statSync(destino).size;
        await page.waitForTimeout(800);
      }
    }
  } catch (e) {
    r.error = String(e.message ?? e).slice(0, 250);
    await page.screenshot({ path: path.join(SALIDA, `planilla-${ANCHO}-ERROR.png`), fullPage: true }).catch(() => {});
  }
  r.errores = errores.slice(0, 4);
  salida.push(r);
  console.error(
    `[${ANCHO}] cuerpo=${r.cuerpoPx ?? "?"}px panel=${r.panelPx ?? "?"}px filas=${r.filasTabla ?? 0} ` +
    `tarjetas=${r.tarjetas ?? 0} cols=${r.columnas ?? 0} faltaConf=${r.faltaConfigurar ?? "?"} ` +
    `ceros=${r.ceros ?? "?"} tap<44=${r.targetsChicos ?? "?"} ${r.error ? "ERROR " + r.error : ""}`,
  );
  await ctx.close();
}

await nav.close();
writeFileSync(path.join(SALIDA, "resultado.json"), JSON.stringify(salida, null, 2));
console.log(JSON.stringify(salida, null, 2));
