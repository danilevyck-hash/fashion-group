/* Verificación en el NAVEGADOR de las ALTAS Y BAJAS de Asistencia.
 *
 * Corre contra el build de producción (`next start`) y datos de PRODUCCIÓN, en
 * los tres anchos que importan (390 · 834 · 1440).
 *
 * 🔴 SOLO LECTURA, Y ESTA VEZ EN SERIO. En este módulo ya pasó dos veces que un
 * script de verificación le escribió encima a una persona real (la ficha de
 * KEVIN LUBO y un préstamo de prueba a Alejandra Camaño). Acá NO hay un solo
 * PUT contra la base: el caso "ya no trabaja acá" se prueba INTERCEPTANDO la
 * respuesta del GET en el navegador (`page.route`), o sea que la fila de baja
 * existe únicamente dentro del Chrome de este script. La única escritura es la
 * fila de sesión en `user_sessions`, que se revoca al terminar.
 *
 * Gotchas obligatorios en este repo:
 *  - sembrar la cookie firmada Y `sessionStorage.cxc_role`, o `useAuth` manda
 *    todo al login;
 *  - `delete Navigator.prototype.serviceWorker` ANTES de navegar.
 */
import { chromium } from "playwright";
import { config } from "dotenv";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const BASE = process.env.VERIF_BASE ?? "http://localhost:3197";
const SECRET = process.env.SESSION_SECRET;
if (!SECRET) throw new Error("falta SESSION_SECRET");

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

const sb = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
let sessionToken = null;
let sessionRowId = null;

async function sembrarSesion() {
  sessionToken = crypto.randomUUID();
  const ins = await sb.from("user_sessions").insert({
    user_name: "daniel", user_role: "admin", session_token: sessionToken,
    ip_address: "127.0.0.1", last_seen: new Date().toISOString(),
  }).select("id").single();
  if (ins.error) throw new Error("no pude sembrar sesión: " + ins.error.message);
  sessionRowId = ins.data.id;
}
async function revocarSesion() {
  if (sessionRowId) await sb.from("user_sessions").update({ revoked: true }).eq("id", sessionRowId);
}

const ANCHOS = [["iPhone", 390, 844], ["iPad", 834, 1112], ["Escritorio", 1440, 900]];
const log = (...a) => console.log(...a);

async function nuevaPagina(browser, ancho, alto) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  await ctx.addCookies([{
    name: "cxc_session",
    value: signSession({ role: "admin", userId: "daniel", userName: "daniel", sessionToken }),
    domain: "localhost", path: "/",
  }]);
  await ctx.addInitScript(() => {
    try { delete Navigator.prototype.serviceWorker; } catch {}
    sessionStorage.setItem("cxc_role", "admin");
  });
  return { ctx, page: await ctx.newPage() };
}

/** Simula que la migración YA está corrida y que el código 47 está de baja.
 *  Toca SOLO la respuesta que ve este navegador; la base no se entera. */
async function simularBaja(page) {
  await page.route("**/api/asistencia/configuracion", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch();
    const d = await res.json();
    const hoy = "2026-08-06";
    d.puedeDarDeBaja = true;
    d.avisoMigracionBajas = null;
    d.personas = d.personas.map((p) =>
      p.codigo !== "47" ? p : {
        ...p,
        fechaSalida: "2026-07-20",
        motivoSalida: "renuncia",
        activo: false,
        baja: "Renunció el 20 de julio de 2026",
        marcoDespuesDeLaBaja: false,
      });
    const activos = d.personas.filter((p) => p.activo);
    d.resumen = {
      ...d.resumen,
      total: activos.length,
      bajas: d.personas.length - activos.length,
      sinConfigurar: activos.filter((p) => !p.configurado).length,
      sinSalario: activos.filter((p) => p.faltaSalario).length,
    };
    d.avisoBajas = {
      titulo: "1 persona dada de baja siguió marcando en el reloj.",
      detalle: ["FULANO DE PRUEBA salió el 20 de julio de 2026 y marcó el 25 de julio de 2026: o volvió a trabajar —hay que reactivarla o la planilla le va a pagar cero— o alguien más está usando su huella."],
    };
    void hoy;
    await route.fulfill({ response: res, body: JSON.stringify(d) });
  });
}

async function irAConfiguracion(page) {
  await page.goto(`${BASE}/asistencia`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Configuración", exact: true }).click();
  await page.waitForTimeout(1500);
}

const medirArrastre = (page) => page.evaluate(() => ({
  scroll: document.documentElement.scrollWidth,
  cliente: document.documentElement.clientWidth,
}));

const blancosChicos = (page) => page.evaluate(() => {
  const malos = [];
  for (const el of document.querySelectorAll("button, input, a[href], summary")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.height < 44) malos.push({ texto: (el.textContent || el.tagName).trim().slice(0, 30), alto: Math.round(r.height) });
  }
  return malos;
});

const run = async () => {
  await sembrarSesion();
  const browser = await chromium.launch();
  let fallas = 0;

  // ── 1. La base REAL, con la migración de bajas SIN correr ──────────────────
  {
    const { ctx, page } = await nuevaPagina(browser, 1440, 900);
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await irAConfiguracion(page);

    const api = await page.evaluate(async () => {
      const r = await fetch("/api/asistencia/configuracion", { cache: "no-store" });
      return { status: r.status, cuerpo: await r.json() };
    });
    log("\n── 1. Base real (columnas de baja TODAVÍA no creadas) ──");
    log("   GET configuración →", api.status);
    log("   total (activos):", api.cuerpo.resumen?.total, "· bajas:", api.cuerpo.resumen?.bajas);
    log("   puedeDarDeBaja:", api.cuerpo.puedeDarDeBaja);
    log("   avisoMigracionBajas:", api.cuerpo.avisoMigracionBajas?.slice(0, 60));
    const y47 = api.cuerpo.personas?.find((p) => p.codigo === "47");
    log("   código 47:", y47?.nombre, "· marcaciones:", y47?.marcaciones, "· activo:", y47?.activo);

    if (api.status !== 200) { log("   ❌ el GET no respondió 200"); fallas++; }
    if (api.cuerpo.resumen?.bajas !== 0) { log("   ❌ sin columnas nadie puede estar de baja"); fallas++; }
    if (api.cuerpo.puedeDarDeBaja !== false) { log("   ❌ no debería poder dar de baja sin las columnas"); fallas++; }
    if (!api.cuerpo.avisoMigracionBajas?.includes("20260807120000")) { log("   ❌ el aviso no nombra el archivo"); fallas++; }
    if (y47?.activo !== true) { log("   ❌ el 47 debería verse activo mientras no haya baja"); fallas++; }

    const planilla = await page.evaluate(async () => {
      const r = await fetch("/api/asistencia/planilla?quincena=2026-07-2&empresa=confecciones_boston", { cache: "no-store" });
      return { status: r.status, cuerpo: await r.json() };
    });
    log("   GET planilla 2026-07-2 →", planilla.status,
      "· líneas:", planilla.cuerpo.lineas?.length,
      "· fueraPorBaja:", planilla.cuerpo.avisos?.fueraPorBaja,
      "· marcóDespués:", planilla.cuerpo.avisos?.marcoDespuesDeIrse,
      "· neto:", planilla.cuerpo.totales?.netoPagar);
    if (planilla.status !== 200) { log("   ❌ la planilla no respondió 200"); fallas++; }
    if (planilla.cuerpo.avisos?.fueraPorBaja !== 0) { log("   ❌ nadie debería quedar afuera todavía"); fallas++; }

    if (errores.length) { log("   ❌ errores de JS:", errores); fallas++; }
    await ctx.close();
  }

  // ── 2. Con una baja simulada, en los tres anchos ──────────────────────────
  for (const [nombre, ancho, alto] of ANCHOS) {
    const { ctx, page } = await nuevaPagina(browser, ancho, alto);
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await simularBaja(page);
    await irAConfiguracion(page);

    // Abrir el bloque de los que ya no trabajan acá.
    const detalle = page.locator("summary", { hasText: "Ya no trabajan acá" });
    const hay = await detalle.count();
    if (hay) await detalle.first().click();
    await page.waitForTimeout(400);

    const texto = await page.locator("body").innerText();
    const arrastre = await medirArrastre(page);
    const chicos = await blancosChicos(page);

    log(`\n── 2. ${nombre} (${ancho}px) con una baja simulada ──`);
    log("   bloque «Ya no trabajan acá»:", hay > 0 ? "sí" : "NO");
    log("   dice «Renunció el 20 de julio de 2026»:", texto.includes("Renunció el 20 de julio de 2026"));
    log("   aviso rojo de marcación posterior:", texto.includes("siguió marcando en el reloj"));
    log("   botón «Volvió a trabajar acá»:", texto.includes("Volvió a trabajar acá"));
    log("   arrastre lateral:", arrastre.scroll - arrastre.cliente, "px");
    log("   táctiles < 44 px:", chicos.length);

    if (!hay) { log("   ❌ falta el bloque de bajas"); fallas++; }
    if (!texto.includes("Renunció el 20 de julio de 2026")) { log("   ❌ no se lee la baja"); fallas++; }
    if (!texto.includes("siguió marcando en el reloj")) { log("   ❌ falta el aviso de marcación posterior"); fallas++; }
    if (arrastre.scroll - arrastre.cliente > 0) { log("   ❌ hay arrastre lateral"); fallas++; }
    if (chicos.length) { log("   ❌ táctiles chicos:", JSON.stringify(chicos)); fallas++; }
    if (errores.length) { log("   ❌ errores de JS:", errores); fallas++; }

    await ctx.close();
  }

  // ── 3. La ficha abierta muestra el bloque de dar de baja ──────────────────
  for (const [nombre, ancho, alto] of ANCHOS) {
    const { ctx, page } = await nuevaPagina(browser, ancho, alto);
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await simularBaja(page);
    await irAConfiguracion(page);

    // Se abre la ficha de alguien ACTIVO (la primera de la lista).
    await page.locator('[aria-expanded]').filter({ hasText: "código" }).first().click();
    await page.waitForTimeout(400);

    // ⚠️ `innerText` devuelve el texto YA transformado por CSS: las etiquetas
    // llevan `uppercase`, así que se compara en minúsculas o no se encuentra nada.
    const texto = (await page.locator("body").innerText()).toLowerCase();
    const arrastre = await medirArrastre(page);
    const chicos = await blancosChicos(page);
    const deshabilitado = await page.locator('button:has-text("Dar de baja")').first().isDisabled();

    log(`\n── 3. ${nombre} (${ancho}px) — ficha abierta ──`);
    log("   pregunta «¿Se fue de la empresa?»:", texto.includes("¿se fue de la empresa?"));
    log("   pide fecha y motivo:", texto.includes("último día de trabajo"), texto.includes("¿por qué salió?"));
    log("   «Dar de baja» arranca deshabilitado:", deshabilitado);
    log("   campo «Empezó a trabajar»:", texto.includes("empezó a trabajar"));
    log("   arrastre lateral:", arrastre.scroll - arrastre.cliente, "px");
    log("   táctiles < 44 px:", chicos.length);

    if (!texto.includes("¿se fue de la empresa?")) { log("   ❌ falta el bloque de baja"); fallas++; }
    if (!deshabilitado) { log("   ❌ «Dar de baja» tendría que estar apagado sin fecha ni motivo"); fallas++; }
    if (arrastre.scroll - arrastre.cliente > 0) { log("   ❌ hay arrastre lateral"); fallas++; }
    if (chicos.length) { log("   ❌ táctiles chicos:", JSON.stringify(chicos)); fallas++; }
    if (errores.length) { log("   ❌ errores de JS:", errores); fallas++; }

    await ctx.close();
  }

  await browser.close();
  await revocarSesion();
  log(fallas === 0 ? "\n✅ TODO VERDE" : `\n❌ ${fallas} fallas`);
  process.exit(fallas === 0 ? 0 : 1);
};

run().catch(async (e) => {
  console.error(e);
  await revocarSesion();
  process.exit(1);
});
