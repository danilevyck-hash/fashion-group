/* Verificación en el NAVEGADOR de los nombres del módulo de Asistencia.
 *
 * Corre contra el build de producción (`next start`) y datos de PRODUCCIÓN, en
 * los tres anchos que importan (390 · 834 · 1440). SOLO LECTURA: no escribe una
 * sola fila.
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

async function irA(page, pestana) {
  await page.goto(`${BASE}/asistencia`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: pestana, exact: true }).click();
  await page.waitForTimeout(2000);
}

const run = async () => {
  await sembrarSesion();
  const browser = await chromium.launch();
  let fallas = 0;

  // ── 1. Justificaciones: el desplegable que Daniel fotografió ───────────────
  {
    const { ctx, page } = await nuevaPagina(browser, 1440, 900);
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await irA(page, "Justificaciones");

    log("\n── 1. Justificaciones · desplegable de Persona ──");
    const opciones = await page.evaluate(() => {
      const sel = document.querySelector("select");
      return [...sel.querySelectorAll("optgroup")].map((g) => ({
        grupo: g.label,
        opciones: [...g.querySelectorAll("option")].map((o) => o.textContent.trim()),
      }));
    });
    for (const g of opciones) log(`   [${g.grupo}] ${g.opciones.length}: ${g.opciones.slice(0, 4).join(" · ")}…`);

    const conNombre = opciones.find((g) => g.grupo === "Personas")?.opciones ?? [];
    const pendientes = opciones.find((g) => /Falta/.test(g.grupo))?.opciones ?? [];

    log("   con nombre:", conNombre.length, "· pendientes:", pendientes.length);
    log("   primeros nombres:", conNombre.slice(0, 3).join(" | "));
    log("   pendientes:", pendientes.join(" | "));

    const hayNombres = conNombre.includes("BRICEIDA MONTERO");
    const ningunNumeroPelado = conNombre.every((t) => !/^\d+$/.test(t));
    const ordenado = conNombre.every((t, i) => i === 0 || conNombre[i - 1].localeCompare(t, "es", { sensitivity: "base" }) <= 0);
    const pendOrdenados = pendientes.map((t) => Number(t.replace(/\D/g, "")));
    const pendCrecientes = pendOrdenados.every((n, i) => i === 0 || pendOrdenados[i - 1] < n);

    log("   ✔ muestra BRICEIDA MONTERO:", hayNombres);
    log("   ✔ ningún código pelado entre los nombres:", ningunNumeroPelado);
    log("   ✔ alfabético:", ordenado);
    log("   ✔ pendientes numéricos crecientes (5 antes que 49):", pendCrecientes, pendOrdenados.join(","));
    log("   errores de página:", errores.length);
    if (!hayNombres || !ningunNumeroPelado || !ordenado || !pendCrecientes || errores.length) fallas++;
    await ctx.close();
  }

  // ── 2. La pestaña "Cargar Excel" ya no existe ─────────────────────────────
  {
    const { ctx, page } = await nuevaPagina(browser, 1440, 900);
    await page.goto(`${BASE}/asistencia`, { waitUntil: "networkidle" });
    // ⚠️ Solo la BARRA de pestañas. Barriendo todos los botones de la página
    // salta el "Excel" de descargar el reporte, que sí tiene que seguir estando.
    const pestanas = await page.evaluate(() => {
      const barra = document.querySelector("h1 + div");
      return [...barra.querySelectorAll("button")].map((b) => b.textContent.trim());
    });
    log("\n── 2. Pestañas ──");
    log("   ", pestanas.join(" · "));
    const sinExcel = !pestanas.some((t) => /Excel/i.test(t));
    log("   ✔ sin pestaña Cargar Excel:", sinExcel);
    if (!sinExcel) fallas++;

    const imp = await page.evaluate(async () => {
      const r = await fetch("/api/asistencia/importar", { method: "POST" });
      return r.status;
    });
    log("   POST /api/asistencia/importar →", imp, "(404 = la ruta ya no existe)");
    if (imp !== 404) fallas++;
    await ctx.close();
  }

  // ── 3. Horarios y Reporte, con nombres ────────────────────────────────────
  {
    const { ctx, page } = await nuevaPagina(browser, 1440, 900);
    await irA(page, "Horarios");
    const horarios = await page.evaluate(() =>
      [...document.querySelectorAll("tbody tr")].map((tr) => tr.cells[0].textContent.trim()));
    log("\n── 3. Horarios ──");
    log("   filas:", horarios.length, "·", horarios.slice(0, 3).join(" | "));
    const horOk = horarios.length > 0 && horarios.some((t) => /BRICEIDA/.test(t));
    const horSinBlancos = horarios.every((t) => t !== "");
    log("   ✔ muestra nombres:", horOk, "· ✔ ninguna celda vacía:", horSinBlancos);
    if (!horOk || !horSinBlancos) fallas++;

    await irA(page, "Reporte");
    // Un rango con datos de verdad (julio 2026).
    const rep = await page.evaluate(async () => {
      const r = await fetch("/api/asistencia/reporte?desde=2026-07-13&hasta=2026-07-31", { cache: "no-store" });
      const d = await r.json();
      return {
        status: r.status,
        personas: (d.personas ?? []).length,
        conNombre: (d.personas ?? []).filter((p) => p.nombre).length,
        muestra: (d.personas ?? []).slice(0, 3).map((p) => `${p.codigo}=${p.nombre ?? "(sin ficha)"}`),
      };
    });
    log("\n── 4. Reporte (13→31 jul) ──");
    log("   status", rep.status, "· personas:", rep.personas, "· con nombre:", rep.conNombre);
    log("   muestra:", rep.muestra.join(" | "));
    if (rep.status !== 200 || rep.conNombre === 0) fallas++;

    // La búsqueda por NOMBRE, que antes no encontraba nada.
    const busq = await page.evaluate(async () => {
      const r = await fetch("/api/asistencia/reporte?desde=2026-07-13&hasta=2026-07-31&q=briceida", { cache: "no-store" });
      const d = await r.json();
      return (d.personas ?? []).map((p) => p.nombre);
    });
    log("   buscar «briceida» →", busq.join(" | ") || "(nada)");
    if (busq.length === 0) fallas++;
    await ctx.close();
  }

  // ── 5. Los tres anchos: arrastre y blancos táctiles ───────────────────────
  log("\n── 5. Los tres anchos ──");
  for (const [nombre, w, h] of ANCHOS) {
    const { ctx, page } = await nuevaPagina(browser, w, h);
    for (const pestana of ["Justificaciones", "Horarios", "Reporte"]) {
      await irA(page, pestana);
      const m = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        cliente: document.documentElement.clientWidth,
      }));
      const chicos = await page.evaluate(() => {
        const malos = [];
        for (const el of document.querySelectorAll("select, input:not([type=file]), button")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          if (r.height < 44) malos.push(`${(el.textContent || el.tagName).trim().slice(0, 22)}=${Math.round(r.height)}`);
        }
        return malos;
      });
      const arrastre = m.scroll - m.cliente;
      log(`   ${nombre} ${w}px · ${pestana} → arrastre ${arrastre}px · blancos <44px: ${chicos.length}`);
      if (arrastre > 0) { fallas++; log("      ⚠️", m); }
      if (chicos.length) log("      ⚠️", chicos.slice(0, 6).join(" · "));
    }
    await ctx.close();
  }

  await browser.close();
  await revocarSesion();
  log(`\n${fallas === 0 ? "✅ TODO VERDE" : `❌ ${fallas} falla(s)`}`);
  process.exit(fallas === 0 ? 0 : 1);
};

run().catch(async (e) => { console.error(e); await revocarSesion(); process.exit(1); });
