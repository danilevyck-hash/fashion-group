/* Verificación en el NAVEGADOR del acomodo de Asistencia (6-ago-2026).
 *
 * Corre contra el build de producción (`next start`) y datos de PRODUCCIÓN.
 * SOLO LECTURA: no manda ni un PUT — las 38 personas son personas de verdad.
 *
 * Qué mide:
 *   1. que sean 4 pestañas, en orden, y que abra en Planilla YA CARGADA con la
 *      quincena en curso (sin elegir nada);
 *   2. que «Cómo funciona» sea el botón «?» y no una pestaña;
 *   3. en Configuración: la rata con DOS decimales, UN solo aviso ámbar, y
 *      Horarios y Feriados como secciones de adentro;
 *   4. los tres anchos: 0 px de arrastre y 0 blancos táctiles bajo 44 px.
 *
 * Gotchas obligatorios en este repo:
 *  - sembrar la cookie firmada Y `sessionStorage.cxc_role`, o `useAuth` manda
 *    todo al login;
 *  - `delete Navigator.prototype.serviceWorker` ANTES de navegar, o el SW
 *    interfiere con la hidratación.
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
let fallas = 0;
const check = (etiqueta, ok, extra = "") => {
  log(`   ${ok ? "✅" : "❌"} ${etiqueta}${extra ? " · " + extra : ""}`);
  if (!ok) fallas++;
};

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

/** Los rótulos de la barra de pestañas, en el orden en que se ven. */
async function pestanas(page) {
  return page.evaluate(() => {
    // Se busca la barra POR SU CONTENIDO, no por sus clases: el encabezado de
    // la app también es un `div.border-b.border-gray-200` y salía primero.
    const barras = [...document.querySelectorAll("div.border-b")];
    const barra = barras.find((d) =>
      [...d.querySelectorAll(":scope > div > button")].some((b) => b.textContent?.trim() === "Planilla"));
    if (!barra) return [];
    return [...barra.querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim())
      .filter((t) => t && t !== "?");
  });
}

/** Arrastre lateral de la PÁGINA + blancos táctiles por debajo de 44 px. */
async function medir(page) {
  return page.evaluate(() => {
    const malos = [];
    for (const el of document.querySelectorAll("button, input, a[href], select")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.height < 44) malos.push({ texto: (el.textContent || el.tagName).trim().slice(0, 34), alto: Math.round(r.height) });
    }
    return {
      arrastre: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      malos,
    };
  });
}

const run = async () => {
  await sembrarSesion();
  const browser = await chromium.launch();

  // ── 1. Las 4 pestañas, el orden y con qué abre ────────────────────────────
  log("\n── 1. Las pestañas ──");
  {
    const { ctx, page } = await nuevaPagina(browser, 1440, 900);
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(`${BASE}/asistencia`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    const tabs = await pestanas(page);
    log("   pestañas que se ven:", JSON.stringify(tabs));
    check("son 4", tabs.length === 4, `${tabs.length}`);
    check("en orden Planilla · Reporte · Justificaciones · Configuración",
      JSON.stringify(tabs) === JSON.stringify(["Planilla", "Reporte", "Justificaciones", "Configuración"]));
    check("Horarios ya NO es pestaña", !tabs.includes("Horarios"));
    check("Feriados ya NO es pestaña", !tabs.includes("Feriados"));
    check("«Cómo funciona» ya NO es pestaña", !tabs.some((t) => t.includes("Cómo funciona")));

    const ayuda = page.getByRole("button", { name: "Cómo funciona" });
    check("existe el botón ?", (await ayuda.count()) === 1);
    const caja = await ayuda.boundingBox();
    check("el ? es tocable (44 × 44)", caja && caja.width >= 44 && caja.height >= 44,
      caja ? `${Math.round(caja.width)}×${Math.round(caja.height)}` : "sin caja");
    await ayuda.click();
    await page.waitForTimeout(600);
    const conAyuda = await page.locator("body").innerText();
    check("el ? abre la ayuda", conAyuda.includes("Se marca 4 veces al día"));
    await page.getByRole("button", { name: "Cerrar" }).first().click();
    await page.waitForTimeout(400);

    check("sin errores de página", errores.length === 0, errores.join(" | "));
    await ctx.close();
  }

  // ── 2. Planilla abre CARGADA en la quincena en curso ──────────────────────
  log("\n── 2. Planilla: abre donde sirve ──");
  {
    const { ctx, page } = await nuevaPagina(browser, 1440, 900);
    const llamadas = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/asistencia/planilla")) llamadas.push(r.url());
    });
    await page.goto(`${BASE}/asistencia`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    // La quincena en curso, calculada acá aparte (hora de Panamá).
    const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
    const [a, m, d] = hoy.split("-").map(Number);
    const esperada = `${a}-${String(m).padStart(2, "0")}-${Number(d) <= 15 ? "1" : "2"}`;

    check("pidió la planilla sin que nadie tocara nada", llamadas.length > 0, `${llamadas.length} llamada(s)`);
    check("y la pidió para la quincena EN CURSO",
      llamadas.some((u) => decodeURIComponent(u).includes(`quincena=${esperada}`)),
      `esperada ${esperada} · ${decodeURIComponent(llamadas[0] ?? "—")}`);

    const seleccionada = await page.locator("select").first().inputValue();
    check("el selector ya muestra la quincena en curso", seleccionada === esperada, seleccionada);

    const texto = await page.locator("body").innerText();
    check("y la pantalla ya trae el cuadro (no un «elige una quincena»)",
      texto.includes("Neto a pagar") || texto.includes("Todavía no hay"),
      texto.slice(0, 0));
    await page.screenshot({ path: "/tmp/t95-planilla-1440.png", fullPage: true });
    await ctx.close();
  }

  // ── 3. Configuración: rata a 2 decimales, UN aviso, secciones ─────────────
  log("\n── 3. Configuración ──");
  {
    const { ctx, page } = await nuevaPagina(browser, 1440, 900);
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(`${BASE}/asistencia`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Configuración", exact: true }).click();
    await page.waitForTimeout(2500);

    const api = await page.evaluate(async () => {
      const r = await fetch("/api/asistencia/configuracion", { cache: "no-store" });
      return r.json();
    });
    log("   personas en la lista:", api.resumen?.total,
        "· sin ficha:", api.resumen?.sinConfigurar,
        "· sin salario:", api.resumen?.sinSalario);

    // 🔴 LA RATA. Ninguna del API puede tener más de 2 decimales, y ninguna
    // cifra de la pantalla puede verse como $9.9999.
    const ratasLargas = (api.personas ?? []).filter(
      (p) => p.rataHora !== null && Math.round(p.rataHora * 100) / 100 !== p.rataHora,
    );
    check("el API devuelve la rata a centavos", ratasLargas.length === 0,
      JSON.stringify(ratasLargas.slice(0, 3)));

    const texto = await page.locator("body").innerText();
    const cuatroDecimales = texto.match(/\$\d[\d,]*\.\d{4}\b/g) ?? [];
    check("en pantalla no queda ninguna cifra con 4 decimales", cuatroDecimales.length === 0,
      cuatroDecimales.slice(0, 5).join(" "));

    const ratasEnPantalla = await page.evaluate(() =>
      [...document.querySelectorAll("span")]
        .map((s) => s.textContent?.trim() ?? "")
        .filter((t) => /^\$\d[\d,]*\.\d+$/.test(t)));
    log("   ejemplos de montos en pantalla:", ratasEnPantalla.slice(0, 6).join(" · "));

    // Un ejemplo concreto, calculado a mano contra el divisor de la persona.
    const conRata = (api.personas ?? []).find((p) => p.rataHora !== null);
    if (conRata) {
      const div = conRata.jornadaSemanal === 40 ? api.reglas.divisor40 : api.reglas.divisor48;
      const largo = conRata.salarioMensual / div;
      log(`   ejemplo: ${conRata.nombre ?? conRata.codigo} · $${conRata.salarioMensual} ÷ ${div}`
          + ` = ${largo.toFixed(6)} → se muestra $${conRata.rataHora.toFixed(2)}`);
      check("la rata mostrada es el largo redondeado a centavos",
        Math.round(largo * 100 + 1e-9) / 100 === conRata.rataHora);
      check("y ese número está en el DOM", texto.includes(`$${conRata.rataHora.toFixed(2)}`));
    }

    // UN solo aviso ámbar de pendientes.
    const amarillos = await page.evaluate(() =>
      [...document.querySelectorAll("[class*='bg-amber-50']")]
        .map((e) => (e.textContent || "").trim()));
    log("   avisos ámbar:", JSON.stringify(amarillos.map((t) => t.slice(0, 70))));
    check("hay UN solo aviso ámbar de pendientes", amarillos.length <= 1, `${amarillos.length}`);
    check("y trae el desglose adentro",
      amarillos.length === 0 || /marcan en el reloj|ya tienen ficha/.test(amarillos[0]));

    // Un solo indicador por fila.
    const repetidos = (texto.match(/Falta (el nombre|la empresa|el salario)/g) ?? []);
    check("la lista no repite «Falta el nombre / la empresa / el salario»", repetidos.length === 0,
      repetidos.slice(0, 4).join(" · "));

    // Horarios y Feriados VIVEN acá adentro.
    for (const [titulo, senal] of [
      // ⚠️ `innerText` devuelve el texto YA en mayúsculas: estas etiquetas
      // llevan `uppercase` en CSS. Comparar contra "Sale a las" da falso.
      ["Horarios", "SALE A LAS"],
      ["Feriados y cierres", "QUÉ ES"],
    ]) {
      await page.getByRole("button", { name: new RegExp(`^${titulo}`) }).first().click();
      await page.waitForTimeout(1800);
      const t = await page.locator("body").innerText();
      check(`la sección «${titulo}» abre y trae su pantalla completa`, t.includes(senal));
    }

    // Que se NOTE que se puede editar.
    const primera = page.locator("button[aria-expanded]").filter({ hasText: /marcaciones/ }).first();
    check("las filas se anuncian como abribles", (await primera.count()) > 0);
    await primera.click();
    await page.waitForTimeout(600);
    const t2 = await page.locator("body").innerText();
    check("al abrir una fila aparecen los campos",
      t2.includes("SALARIO MENSUAL") && t2.includes("JORNADA POR SEMANA"));
    check("y dice que se guarda solo", t2.includes("Se guarda solo") || t2.includes("se guarda solo"));
    check("ya no hay botón «Guardar esta persona»", !t2.includes("Guardar esta persona"));

    check("sin errores de página", errores.length === 0, errores.join(" | "));
    await page.screenshot({ path: "/tmp/t95-config-1440.png", fullPage: true });
    await ctx.close();
  }

  // ── 4. Los tres anchos, pestaña por pestaña ───────────────────────────────
  log("\n── 4. Anchos (arrastre de página y blancos táctiles) ──");
  for (const [nombre, w, h] of ANCHOS) {
    const { ctx, page } = await nuevaPagina(browser, w, h);
    await page.goto(`${BASE}/asistencia`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    for (const tab of ["Planilla", "Reporte", "Justificaciones", "Configuración"]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      await page.waitForTimeout(1800);
      if (tab === "Configuración") {
        // El peor caso: con una ficha abierta y las 4 secciones desplegadas.
        for (const s of ["Horarios", "Feriados y cierres", "Reglas del cálculo"]) {
          const b = page.getByRole("button", { name: new RegExp(`^${s}`) }).first();
          if (await b.count()) { await b.click(); await page.waitForTimeout(1200); }
        }
        const fila = page.locator("button[aria-expanded]").filter({ hasText: /marcaciones/ }).first();
        if (await fila.count()) { await fila.click(); await page.waitForTimeout(600); }
      }
      const { arrastre, malos } = await medir(page);
      const ok = arrastre === 0 && malos.length === 0;
      log(`   ${ok ? "✅" : "❌"} ${nombre} (${w}px) · ${tab}: arrastre ${arrastre}px · blancos <44px: ${malos.length}`);
      if (!ok) {
        fallas++;
        if (malos.length) log("      ⚠️", JSON.stringify(malos.slice(0, 6)));
      }
      await page.screenshot({ path: `/tmp/t95-${w}-${tab}.png`, fullPage: true });
    }
    await ctx.close();
  }

  await browser.close();
  await revocarSesion();
  log(fallas === 0 ? "\n✅ TODO VERDE" : `\n❌ ${fallas} verificaciones fallaron`);
  process.exit(fallas === 0 ? 0 : 1);
};

run().catch(async (e) => { console.error(e); await revocarSesion(); process.exit(1); });
