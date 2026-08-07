/* Verificación en el NAVEGADOR de la pantalla de Configuración de Asistencia.
 *
 * Corre contra el build de producción (`next start`) y datos de PRODUCCIÓN, en
 * los tres anchos que importan (390 · 834 · 1440).
 *
 * ⚠️ SOLO LECTURA — Y ESO COSTÓ CARO (6-ago-2026). El script mandaba un PUT
 * VÁLIDO «para comprobar que rebota con 503», apoyado en que la migración
 * todavía no estaba corrida. Se corrió, el PUT dejó de rebotar y **le escribió
 * encima a una persona de verdad**: el código 6 (KEVIN LUBO · Fashion Wear ·
 * $523,47 · 40 h) quedó como «Prueba · Confecciones Boston · $850 · 48 h». Se
 * restauró desde una captura anterior, pero la fila estuvo mal un rato y esa
 * ficha alimenta su planilla. Un chequeo que depende de que algo NO exista se
 * vuelve destructivo el día que existe. Los únicos PUT que quedan son los que
 * el servidor rechaza con 400 ANTES de tocar la base, y el de la sección 2, que
 * lo intercepta el propio navegador y nunca sale a la red.
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

// El middleware valida la cookie firmada CONTRA `user_sessions`: sin una fila
// viva redirige a /?expired=1. Se siembra una y se revoca al terminar (mismo
// patrón que `_verif-marketing-browser.mjs`).
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

const ANCHOS = [
  ["iPhone", 390, 844],
  ["iPad", 834, 1112],
  ["Escritorio", 1440, 900],
];

const log = (...a) => console.log(...a);

async function nuevaPagina(browser, ancho, alto) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  await ctx.addCookies([
    {
      name: "cxc_session",
      value: signSession({ role: "admin", userId: "daniel", userName: "daniel", sessionToken }),
      domain: "localhost",
      path: "/",
    },
  ]);
  await ctx.addInitScript(() => {
    try { delete Navigator.prototype.serviceWorker; } catch {}
    sessionStorage.setItem("cxc_role", "admin");
  });
  return { ctx, page: await ctx.newPage() };
}

async function irAConfiguracion(page) {
  await page.goto(`${BASE}/asistencia`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Configuración", exact: true }).click();
  await page.waitForTimeout(1500);
}

async function medirArrastre(page) {
  return page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    cliente: document.documentElement.clientWidth,
  }));
}

async function blancosChicos(page) {
  return page.evaluate(() => {
    const malos = [];
    for (const el of document.querySelectorAll("button, input, a[href]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.height < 44) malos.push({ texto: (el.textContent || el.tagName).trim().slice(0, 30), alto: Math.round(r.height) });
    }
    return malos;
  });
}

const run = async () => {
  await sembrarSesion();
  const browser = await chromium.launch();
  let fallas = 0;

  // ── 1. Contra la base REAL ────────────────────────────────────────────────
  {
    const { ctx, page } = await nuevaPagina(browser, 1440, 900);
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await irAConfiguracion(page);

    const api = await page.evaluate(async () => {
      const r = await fetch("/api/asistencia/configuracion", { cache: "no-store" });
      return { status: r.status, cuerpo: await r.json() };
    });
    log("\n── 1. Base real ──");
    log("   GET /api/asistencia/configuracion →", api.status);
    log("   personas con marcaciones:", api.cuerpo.resumen?.conMarcaciones);
    log("   total en la lista:", api.cuerpo.resumen?.total);
    log("   faltaMigracion:", api.cuerpo.faltaMigracion);
    log("   aviso:", api.cuerpo.avisoMigracion);
    log("   tolerancia que devuelve:", api.cuerpo.reglas?.toleranciaTardanzaMin);

    const texto = await page.locator("body").innerText();
    // La migración YA está corrida: la pantalla no debe avisar de un paso que no
    // falta, y sobre todo no debe romperse. Si algún día se cayera la tabla, el
    // aviso vuelve solo (lo decide el servidor) y este chequeo lo destaparía.
    const migracionOk = api.cuerpo.faltaMigracion === false
      && !texto.includes("Falta un paso antes de poder guardar");
    const noSeRompio = !texto.includes("Algo salió mal") && errores.length === 0;
    log("   la migración está corrida y la pantalla no avisa de más:", migracionOk);
    log("   la pantalla no se rompió:", noSeRompio);
    if (!migracionOk || !noSeRompio || api.status !== 200) fallas++;
    if (errores.length) { log("   ⚠️ errores de página:", errores); }

    // ⛔ Acá había un PUT VÁLIDO contra el código 6. NO se reintroduce: escribe
    // sobre la ficha de una persona real. Lo que sigue son cuerpos INVÁLIDOS,
    // que el validador rechaza antes de que la base se entere.

    // El REPORTE tiene que seguir saliendo igual, con la tolerancia por defecto.
    const rep = await page.evaluate(async () => {
      const r = await fetch("/api/asistencia/reporte?desde=2026-07-13&hasta=2026-07-17", { cache: "no-store" });
      return { status: r.status, cuerpo: await r.json() };
    });
    log("   GET /api/asistencia/reporte →", rep.status,
        "· personas:", rep.cuerpo.personas?.length,
        "· tolerancia usada:", rep.cuerpo.reglas?.toleranciaTardanzaMin);
    if (rep.status !== 200 || rep.cuerpo.reglas?.toleranciaTardanzaMin !== 10) fallas++;

    // Validación del SERVIDOR: la basura no entra ni con la tabla ausente.
    log("   — validación en el servidor (antes de tocar la base) —");
    for (const [caso, cuerpo] of [
      ["salario 0", { codigo: "6", nombre: "X", salarioMensual: 0, jornadaSemanal: 48, empresa: "vistana" }],
      ["salario negativo", { codigo: "6", nombre: "X", salarioMensual: -100, jornadaSemanal: 48, empresa: "vistana" }],
      ["jornada 44", { codigo: "6", nombre: "X", salarioMensual: 850, jornadaSemanal: 44, empresa: "vistana" }],
      ["empresa de otro reloj", { codigo: "6", nombre: "X", salarioMensual: 850, jornadaSemanal: 48, empresa: "american_classic" }],
      ["sin nombre", { codigo: "6", nombre: "", salarioMensual: 850, jornadaSemanal: 48, empresa: "vistana" }],
    ]) {
      const r = await page.evaluate(async (b) => {
        const res = await fetch("/api/asistencia/configuracion", {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
        });
        return { status: res.status, error: (await res.json()).error };
      }, cuerpo);
      log(`     ${caso} → ${r.status} · ${r.error}`);
      if (r.status !== 400) fallas++;
    }
    for (const [caso, cuerpo] of [
      ["divisor 0", { divisor48: 0 }],
      ["divisor vacío", { divisor48: "" }],
      ["recargo 0.25", { recargoExtraDiurno: "0.25" }],
      ["seguro 975", { seguroSocialPct: "975" }],
    ]) {
      const base = {
        toleranciaTardanzaMin: "10", extraMinimoMin: "15", almuerzoDefaultMin: "30",
        recargoExtraDiurno: "1.25", recargoExtraNocturno: "1.5", horaCorteNocturno: "18:00",
        recargoDomingoFeriado: "1.5", divisor40: "173.33", divisor48: "208",
        seguroSocialPct: "9.75", seguroEducativoPct: "1.25", excedenteHorasDia: "3",
        recargoExcedenteNocturnaMixta: "2.625",
      };
      const r = await page.evaluate(async (b) => {
        const res = await fetch("/api/asistencia/configuracion/reglas", {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
        });
        return { status: res.status, error: (await res.json()).error };
      }, { ...base, ...cuerpo });
      log(`     reglas ${caso} → ${r.status} · ${r.error}`);
      if (r.status !== 400) fallas++;
    }
    await page.screenshot({ path: "/tmp/t93-sin-migracion.png", fullPage: true });
    await ctx.close();
  }

  // ── 2. Con la migración YA corrida (respuesta simulada) ───────────────────
  // No se puede crear la tabla en producción sin la aprobación de Daniel, así
  // que el estado POSTERIOR se verifica sirviéndole a la pantalla exactamente
  // la forma que devuelve el servidor con las tablas creadas.
  {
    const { ctx, page } = await nuevaPagina(browser, 1440, 900);
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    let putRecibido = null;

    await page.route("**/api/asistencia/configuracion", async (route) => {
      const req = route.request();
      if (req.method() === "PUT") {
        putRecibido = JSON.parse(req.postData() ?? "{}");
        // El servidor devuelve la ficha YA validada: el doble tiene que
        // devolverla también, o se estaría probando otra respuesta.
        return route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            persona: {
              codigo: putRecibido.codigo, nombre: putRecibido.nombre,
              salarioMensual: Number(putRecibido.salarioMensual),
              jornadaSemanal: putRecibido.jornadaSemanal, empresa: putRecibido.empresa,
            },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          personas: [
            { codigo: "6", nombre: null, salarioMensual: null, jornadaSemanal: 48, empresa: null,
              configurado: false, faltaSalario: false, marcaciones: 84, ultimaMarca: "2026-08-05",
              rataHora: null, valorMinuto: null },
            { codigo: "1", nombre: "Ángela García", salarioMensual: 850, jornadaSemanal: 48,
              empresa: "confecciones_boston", configurado: true, faltaSalario: false,
              marcaciones: 92, ultimaMarca: "2026-08-05", rataHora: 4.0865, valorMinuto: 0.068108 },
            { codigo: "7", nombre: "Roxana Hernández", salarioMensual: null, jornadaSemanal: 40,
              empresa: "vistana", configurado: true, faltaSalario: true,
              marcaciones: 77, ultimaMarca: "2026-08-04", rataHora: null, valorMinuto: null },
          ],
          reglas: {
            toleranciaTardanzaMin: 10, extraMinimoMin: 15, almuerzoDefaultMin: 30,
            recargoExtraDiurno: 1.25, recargoExtraNocturno: 1.5, horaCorteNocturno: "18:00",
            recargoDomingoFeriado: 1.5, divisor40: 173.33, divisor48: 208,
            seguroSocialPct: 9.75, seguroEducativoPct: 1.25, excedenteHorasDia: 3,
            recargoExcedenteNocturnaMixta: 2.625,
          },
          resumen: { total: 3, sinConfigurar: 1, sinSalario: 1, conMarcaciones: 3 },
          faltaMigracion: false, avisoMigracion: null,
        }),
      });
    });

    await irAConfiguracion(page);
    const texto = await page.locator("body").innerText();
    log("\n── 2. Con la migración corrida (respuesta simulada) ──");
    log("   NO muestra el aviso de migración:", !texto.includes("Falta un paso antes de poder guardar"));
    // UN solo aviso, con las dos clases de pendiente adentro.
    log("   destaca a los que faltan:", /2 personas de 3 todavía no salen/.test(texto.replace(/\n/g, " ")));
    log("   avisa del que no tiene salario:", texto.includes("le falta el salario"));
    log("   muestra la rata del CÁLCULO, a centavos ($850 ÷ 208 = 4.09):", texto.includes("$4.09"));
    log("   y NO la de 4 decimales:", !texto.includes("$4.0865"));
    if (texto.includes("Falta un paso antes de poder guardar")) fallas++;

    // Guardar una persona. Ya NO hay botón: se guarda al cambiar, como
    // HorariosTab. El PUT sale al tocar la píldora de empresa, que es lo que
    // completa la ficha (sin nombre y empresa el servidor rebotaría).
    await page.getByRole("button", { name: /Código 6/ }).first().click();
    await page.waitForTimeout(300);
    await page.getByPlaceholder("Ángela García").fill("Kevin Lubo");
    await page.getByPlaceholder("850.00").fill("900");
    // `exact` a propósito: la píldora de filtro se llama "Fashion Wear (0)" y
    // sin esto se toca el filtro, la fila desaparece y el formulario se cierra.
    await page.getByRole("button", { name: "Fashion Wear", exact: true }).click();
    await page.waitForTimeout(1000);
    log("   PUT que salió del formulario:", JSON.stringify(putRecibido));
    const bienFormado =
      putRecibido?.codigo === "6" &&
      putRecibido?.nombre === "Kevin Lubo" &&
      putRecibido?.salarioMensual === "900" &&   // TEXTO crudo: el servidor convierte
      putRecibido?.jornadaSemanal === 48 &&
      putRecibido?.empresa === "fashion_wear";
    log("   el cuerpo va bien formado y el salario viaja como TEXTO:", bienFormado);
    if (!bienFormado) fallas++;
    if (errores.length) { log("   ⚠️ errores de página:", errores); fallas++; }

    // Guardar las reglas
    let putReglas = null;
    await page.route("**/api/asistencia/configuracion/reglas", async (route) => {
      if (route.request().method() === "PUT") {
        putReglas = JSON.parse(route.request().postData() ?? "{}");
        // El servidor devuelve la ficha YA validada: el doble tiene que
        // devolverla también, o se estaría probando otra respuesta.
        return route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            persona: {
              codigo: putRecibido.codigo, nombre: putRecibido.nombre,
              salarioMensual: Number(putRecibido.salarioMensual),
              jornadaSemanal: putRecibido.jornadaSemanal, empresa: putRecibido.empresa,
            },
          }),
        });
      }
      return route.continue();
    });
    // Reglas ahora es una SECCIÓN de Configuración: hay que abrirla primero.
    await page.getByRole("button", { name: /^Reglas del cálculo/ }).first().click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Guardar las reglas" }).click();
    await page.waitForTimeout(800);
    log("   PUT de reglas:", JSON.stringify(putReglas));
    const reglasOk = putReglas?.divisor48 === "208" && putReglas?.toleranciaTardanzaMin === "10"
      && putReglas?.recargoExcedenteNocturnaMixta === "2.625";
    log("   manda las 13 reglas:", Object.keys(putReglas ?? {}).length === 13, "· valores correctos:", reglasOk);
    if (!reglasOk || Object.keys(putReglas ?? {}).length !== 13) fallas++;

    await page.screenshot({ path: "/tmp/t93-con-migracion.png", fullPage: true });
    await ctx.close();
  }

  // ── 3. Los tres anchos ────────────────────────────────────────────────────
  log("\n── 3. Anchos (arrastre lateral y blancos táctiles) ──");
  for (const [nombre, w, h] of ANCHOS) {
    const { ctx, page } = await nuevaPagina(browser, w, h);
    await irAConfiguracion(page);
    // Abrir una ficha: el formulario es lo más ancho de la pantalla.
    const primera = page.locator("button[aria-expanded]", { hasText: /marcaciones/ }).first();
    if (await primera.count()) { await primera.click(); await page.waitForTimeout(400); }
    const { scroll, cliente } = await medirArrastre(page);
    const chicos = await blancosChicos(page);
    const arrastre = Math.max(0, scroll - cliente);
    log(`   ${nombre} (${w}px): arrastre ${arrastre}px · blancos <44px: ${chicos.length}`);
    if (arrastre > 0) { fallas++; log("     ⚠️ desborde"); }
    if (chicos.length) { fallas++; log("     ⚠️", JSON.stringify(chicos.slice(0, 5))); }
    await page.screenshot({ path: `/tmp/t93-${w}.png`, fullPage: true });
    await ctx.close();
  }

  await browser.close();
  await revocarSesion();
  log(fallas === 0 ? "\n✅ TODO VERDE" : `\n❌ ${fallas} verificaciones fallaron`);
  process.exit(fallas === 0 ? 0 : 1);
};

run().catch(async (e) => { console.error(e); await revocarSesion(); process.exit(1); });
