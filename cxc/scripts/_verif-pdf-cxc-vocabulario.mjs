// Verificación del vocabulario de los PAPELES de CXC — en la APP REAL, no en el
// arnés de tests (regla de la casa `feedback_verificar_print_en_app_real`).
//
// Abre `/admin` contra el build de producción y con DATOS DE PRODUCCIÓN, y baja
// los tres papeles por los MISMOS botones que usa Daniel:
//   1. Estado de cuenta de un cliente → botón "PDF" del drawer   (LO QUE VE EL CLIENTE)
//   2. Exportar → "PDF Resumen"                                   (interno)
//   3. Exportar → "PDF Detallado"                                 (interno)
// Después le lee el texto a cada PDF con `pdftotext` y CUENTA los rótulos.
//
// 🔴 Lo que se verifica, en las dos direcciones:
//   · el papel del CLIENTE no dice "vencido"/"vencida" ni una sola vez;
//   · dice "Total" (y NO "TOTAL ADEUDADO");
//   · conserva sus encabezados de siempre (Documento/Tipo/Fecha/Días/Monto/Saldo);
//   · los papeles internos dicen los MISMOS tramos que la pantalla
//     ("Por vencer 0-90d" · "Vencido reciente 91-120d" · "Vencido crítico 121d+")
//     y ya no dicen "Corriente", "Vigilancia", "Total CXC", "Reporte CXC".
//
// SOLO LECTURA: no escribe en la base, no manda ningún correo, no toca Switch.
//
//   npm run build && PORT=3468 npm run start
//   BASE=http://localhost:3468 node scripts/_verif-pdf-cxc-vocabulario.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3468";
const OUT = process.env.OUT ?? "/tmp/pdf-cxc";
mkdirSync(OUT, { recursive: true });

function cookieDeSesion() {
  if (existsSync("/tmp/fg-cookie.txt")) return readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) {
    throw new Error("Falta /tmp/fg-cookie.txt (cookie cxc_session de una sesión real)");
  }
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const body = Buffer.from(
    JSON.stringify({ role: "admin", userId: "medicion", userName: "medicion", sessionToken: "medicion%local" }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function texto(pdf) {
  // -layout conserva las columnas; sin él los encabezados se mezclan entre sí.
  return execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", pdf, "-"], { encoding: "utf8" });
}

const cuenta = (t, s) => t.split(s).length - 1;

let fallo = false;
function revisar(titulo, t, { prohibido = [], requerido = [] }) {
  console.log(`\n── ${titulo} ──`);
  console.log(`   ${t.length} caracteres de texto extraído`);
  for (const p of prohibido) {
    const n = typeof p === "string" ? cuenta(t, p) : (t.match(p) || []).length;
    const etiqueta = typeof p === "string" ? `"${p}"` : String(p);
    console.log(`   ${n === 0 ? "🟢" : "🔴"} ${etiqueta.padEnd(34)} × ${n}   (esperado 0)`);
    if (n !== 0) fallo = true;
  }
  for (const r of requerido) {
    const n = cuenta(t, r);
    console.log(`   ${n > 0 ? "🟢" : "🔴"} "${r}"`.padEnd(42) + ` × ${n}   (esperado ≥1)`);
    if (n === 0) fallo = true;
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.addCookies([{ name: "cxc_session", value: cookieDeSesion(), url: BASE }]);
await ctx.addInitScript(() => {
  try { delete Navigator.prototype.serviceWorker; } catch {}
  sessionStorage.setItem("cxc_role", "admin");
});
const page = await ctx.newPage();

/**
 * Click por DOM sobre el botón cuyo texto coincide. Playwright rechaza el click
 * "de verdad" en esta pantalla porque la barra pegajosa del filtro queda encima
 * del elemento al hacer scroll — un estorbo del arnés, no de la página: el botón
 * es el mismo y el handler es el mismo.
 */
async function tocar(texto) {
  const hecho = await page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === t);
    if (!b) return false;
    b.click();
    return true;
  }, texto);
  if (!hecho) throw new Error(`no se encontró el botón "${texto}"`);
  await page.waitForTimeout(400);
}

async function bajar(accion, nombre) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), accion()]);
  const ruta = `${OUT}/${nombre}.pdf`;
  await dl.saveAs(ruta);
  return ruta;
}

try {
  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  // La tabla de CXC está hecha de `div`, no de `<table>`: el ancla estable es el
  // botón "···" de cada fila, que se llama "Acciones de <CLIENTE>".
  await page.getByRole("button", { name: /^Acciones de / }).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);

  // ── 1. El papel del CLIENTE: estado de cuenta del primer cliente ───────────
  const acciones = page.getByRole("button", { name: /^Acciones de / }).first();
  console.log("Cliente de prueba:", (await acciones.getAttribute("aria-label")) ?? "?");
  await acciones.click({ force: true });
  await tocar("Estado de cuenta");
  await page.getByText("documento", { exact: false }).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const pdfCliente = await bajar(() => tocar("PDF"), "estado-cuenta");

  const tCliente = texto(pdfCliente);
  revisar("PDF de ESTADO DE CUENTA (lo que recibe el cliente)", tCliente, {
    prohibido: [/vencid[oa]s?/gi, "ADEUDADO", "CXC", "aging", "bucket", "saldo consecutivo"],
    requerido: ["Estado de cuenta", "Documento", "Tipo", "Fecha", "Días", "Monto", "Saldo", "Subtotal", "Total"],
  });

  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);

  // ── 2 y 3. Los papeles INTERNOS del menú Exportar ──────────────────────────
  const abrirExportar = async () => {
    await tocar("Exportar");
    await page.waitForTimeout(300);
  };

  await abrirExportar();
  const pdfResumen = await bajar(() => tocar("PDF ResumenVista general, listo para imprimir"), "resumen");
  const tResumen = texto(pdfResumen);
  revisar("PDF RESUMEN (interno, menú Exportar)", tResumen, {
    prohibido: ["Corriente", "Vigilancia", "Total CXC", "Reporte CXC", "+121d", "+120d"],
    requerido: [
      "Cuentas por Cobrar",
      "Total pendiente",
      "Por vencer 0-90d",
      "Vencido reciente 91-120d",
      "Vencido crítico 121d+",
      "Total",
    ],
  });

  await abrirExportar();
  const pdfDetalle = await bajar(() => tocar("PDF DetalladoDesglose completo por empresa y tramo de días"), "detallado");
  const tDetalle = texto(pdfDetalle);
  revisar("PDF DETALLADO (interno, menú Exportar)", tDetalle, {
    prohibido: ["Reporte CXC", "Total CXC"],
    // Este papel rotula por rango puro (0-30 … +365): no lleva nombres de tramo.
    requerido: ["Cuentas por Cobrar", "Cliente / Empresa", "0-30", "91-120", "+365", "Total"],
  });
} finally {
  await browser.close();
}

console.log(fallo ? "\n🔴 HAY HALLAZGOS" : `\n🟢 Los tres papeles hablan el idioma de la pantalla. PDFs en ${OUT}`);
process.exit(fallo ? 1 : 0);
