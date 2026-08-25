// ─────────────────────────────────────────────────────────────────────────────
// LAS DOS PESTAÑAS DE COMISIONES TIENEN QUE DECIR LO MISMO — medido leyendo la
// CELDA RENDERIZADA, no el JSON.
//
// 🩸 POR QUÉ. "Por empresa" mostraba el SUBTOTAL (sin restar los descuentos
// fijos) mientras "Todas las empresas" y el detalle del vendedor sí los
// restaban: Reinaldo en Fashion Shoes salía $1.573,08 más alto en una pestaña
// que en la otra, la misma persona y el mismo mes en la misma pantalla.
//
// Este script abre las DOS pestañas con datos de producción, para varios
// períodos y las 6 empresas, y compara **celda por celda** el número de la
// columna "Com. total" de "Por empresa" contra la celda de esa empresa en la
// matriz de "Todas las empresas". Cero diferencias es el resultado esperado.
//
// GOTCHAS (los mismos de `_medir-comisiones-tabla.mjs`, no tocar sin leer):
//   * Hay que sembrar la COOKIE de sesión firmada o todo redirige al login.
//   * Hay que sembrar sessionStorage.cxc_role: useAuth lo lee de AHÍ.
//   * Hay que `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
// Solo lectura: nunca toca "Actualizar ahora" ni "Excel".
//
//   ETAPA=antes BASE=http://localhost:3199 node scripts/_medir-comisiones-dos-pestanas.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3199";
const ETAPA = process.env.ETAPA ?? "antes";
const SALIDA = process.env.SALIDA ?? "/tmp/t234";
const COOKIE = readFileSync(process.env.COOKIE_FILE ?? "/tmp/fg-cookie.txt", "utf8").trim();

const PERIODOS = (process.env.PERIODOS ?? "2026-06,2026-07,2026-08")
  .split(",")
  .map((p) => {
    const [y, m] = p.split("-").map(Number);
    return { year: y, mes: m };
  });

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Las empresas NO se escriben acá: son los encabezados que la propia matriz
// dibuja (una copia más de la lista es cómo se contradicen un día).
const plata = (txt) => {
  const t = (txt ?? "").trim();
  if (!t || t === "—") return null;
  return Number(t.replace(/[$,\s]/g, "").replace("−", "-"));
};

// ── Lectores de tabla (corren dentro de la página) ───────────────────────────
function leerTabla() {
  const t = document.querySelector("table");
  if (!t) return null;
  const heads = [...t.querySelectorAll("thead th")].map((th) => th.textContent.trim());
  const filas = [];
  for (const tr of t.querySelectorAll("tbody tr")) {
    const tds = [...tr.querySelectorAll("td")];
    if (tds.length !== heads.length) continue;      // fila "N sin actividad"
    filas.push(tds.map((td) => td.textContent.trim()));
  }
  const pie = [...t.querySelectorAll("tfoot td")].map((td) => td.textContent.trim());
  return { heads, filas, pie };
}

// 🩸 GOTCHA: esperar "hay tabla con filas" JUSTO después del clic mide la tabla
// VIEJA — la que todavía está en pantalla mientras sale el pedido nuevo. Hay que
// esperar la RESPUESTA del endpoint y recién después las filas.
async function conRespuesta(page, accion) {
  const [, ] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/ventas/comisiones") && r.request().method() === "GET",
      { timeout: 45000 },
    ),
    accion(),
  ]);
}

async function esperarTabla(page) {
  // La tabla tiene que tener FILAS de verdad — un <table> montado no alcanza, y
  // un "0 filas" leído como dato es el peor resultado posible.
  await page.waitForFunction(
    `(() => {
      if (document.querySelector(".animate-pulse")) return false;
      const t = document.querySelector("table");
      if (!t) return !!document.querySelector("[data-comision-card]") ||
                     /Sin (comisiones|vendedores) para/.test(document.body.textContent);
      return t.querySelectorAll("tbody tr").length > 0;
    })()`,
    null,
    { timeout: 45000 },
  );
  await page.waitForTimeout(200);
}

async function elegirPeriodo(page, year, mes) {
  const boton = page.locator('button[aria-label^="Período:"]').first();
  const etiqueta = await boton.getAttribute("aria-label");
  if (etiqueta === `Período: ${MESES[mes - 1]} ${year}`) return esperarTabla(page);
  await boton.click();
  const panel = page.locator('[role="dialog"][aria-label="Elegir período"]');
  await panel.waitFor({ state: "visible" });
  // Año con el stepper hasta llegar.
  for (let i = 0; i < 12; i++) {
    const actual = Number(await panel.locator("span.tabular-nums").first().textContent());
    if (actual === year) break;
    await panel.getByLabel(actual > year ? "Año anterior" : "Año siguiente").click();
    await page.waitForTimeout(120);
  }
  await conRespuesta(page, () => panel.locator(`button[aria-label="${MESES[mes - 1]}"]`).click());
  await esperarTabla(page);
}

async function pestana(page, nombre) {
  const b = page.getByRole("button", { name: nombre, exact: true });
  // Tocar la pestaña que YA está activa no dispara ningún pedido: esperar una
  // respuesta ahí colgaría la medición 45 s por nada.
  if ((await b.getAttribute("aria-current")) === "page") return esperarTabla(page);
  await conRespuesta(page, () => b.click());
  await esperarTabla(page);
}

async function elegirEmpresa(page, nombreEmpresa) {
  const trigger = page.locator('button[role="combobox"]').first();
  // Elegir la empresa que YA está elegida no dispara ningún pedido.
  if (((await trigger.textContent()) ?? "").trim() === nombreEmpresa) return esperarTabla(page);
  await trigger.click();
  await conRespuesta(page, () =>
    page.getByRole("option", { name: nombreEmpresa, exact: true }).click(),
  );
  await esperarTabla(page);
}

async function main() {
  mkdirSync(SALIDA, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const url = new URL(BASE);
  await ctx.addCookies([
    { name: "cxc_session", value: COOKIE, domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
    try { localStorage.setItem("fg_comisiones_mode", "todas"); } catch {}
    // El service worker sirve HTML viejo y la medición leería otra pantalla.
    try { delete Navigator.prototype.serviceWorker; } catch {}
  });
  const page = await ctx.newPage();

  const salida = { etapa: ETAPA, base: BASE, cuando: new Date().toISOString(), periodos: [] };

  await page.goto(`${BASE}/comisiones`, { waitUntil: "domcontentloaded" });
  await esperarTabla(page);

  for (const { year, mes } of PERIODOS) {
    const reg = { year, mes, todas: null, porEmpresa: {} };

    await pestana(page, "Todas las empresas");
    await elegirPeriodo(page, year, mes);
    const todas = await page.evaluate(leerTabla);
    if (!todas || todas.filas.length === 0) {
      console.log("DEBUG tablas=", await page.locator("table").count(), "url=", page.url());
      console.log("DEBUG body=", (await page.evaluate(() => document.body.innerText)).slice(-900));
      throw new Error(`la matriz de ${MESES[mes - 1]} ${year} salió VACÍA — la medición no midió nada`);
    }
    reg.todas = todas;

    // Nombres de empresa = los encabezados de la matriz, sin "Vendedor" ni "Total".
    const empresasVisibles = todas ? todas.heads.slice(1, -1) : [];

    await pestana(page, "Por empresa");
    for (const nombreEmpresa of empresasVisibles) {
      await elegirEmpresa(page, nombreEmpresa);
      reg.porEmpresa[nombreEmpresa] = await page.evaluate(leerTabla);
    }
    salida.periodos.push(reg);
    console.log(`· ${MESES[mes - 1]} ${year}: matriz ${todas?.filas.length ?? 0} filas · ${empresasVisibles.length} empresas leídas`);
  }

  await browser.close();
  const archivo = `${SALIDA}/pantallas-${ETAPA}.json`;
  writeFileSync(archivo, JSON.stringify(salida, null, 2));
  console.log(`\nescrito ${archivo}`);

  comparar(salida);
}

// ── Comparación celda por celda ──────────────────────────────────────────────
function comparar(salida) {
  let iguales = 0;
  const distintas = [];
  for (const per of salida.periodos) {
    const { heads, filas } = per.todas ?? { heads: [], filas: [] };
    const idxDe = new Map(heads.map((h, i) => [h, i]));
    for (const [nombreEmpresa, tabla] of Object.entries(per.porEmpresa)) {
      if (!tabla) continue;
      const cTotal = tabla.heads.indexOf("Com. total");
      const col = idxDe.get(nombreEmpresa);
      for (const fila of tabla.filas) {
        // La celda del nombre lleva debajo la línea "− $X en descuentos" (no
        // ensancha la tabla, crece hacia abajo) y `textContent` la pega sin
        // salto de línea: hay que sacarla para parear contra la matriz.
        const vendedor = fila[0].replace(/−\s*\$[\d.,]+\s*en descuentos$/, "").trim();
        const porEmpresa = plata(fila[cTotal]);
        const filaTodas = filas.find((f) => f[0] === vendedor || (vendedor === "DEFAULT" && f[0] === "Sin asignar"));
        if (!filaTodas) {
          // Vendedor que la matriz no dibuja (ej. los ocultos): se reporta aparte.
          distintas.push({ per: `${per.year}-${per.mes}`, empresa: nombreEmpresa, vendedor, porEmpresa, todas: "(no está en la matriz)" });
          continue;
        }
        const enTodas = plata(filaTodas[col]);
        if (porEmpresa === enTodas || (porEmpresa === 0 && enTodas === null)) { iguales++; continue; }
        distintas.push({
          per: `${per.year}-${String(per.mes).padStart(2, "0")}`,
          empresa: nombreEmpresa, vendedor, porEmpresa, todas: enTodas,
          diferencia: enTodas === null ? null : Math.round((porEmpresa - enTodas) * 100) / 100,
        });
      }
    }
  }
  console.log(`\n=== CELDA POR CELDA: ${iguales} iguales · ${distintas.length} distintas ===`);
  if (distintas.length) console.table(distintas);
}

main().catch((e) => { console.error(e); process.exit(1); });
