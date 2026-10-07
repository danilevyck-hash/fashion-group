// Capturas HOY vs RECOMENDACIÓN — Guías › Pedidos, «menos pasos» (7-oct-2026).
// SOLO LECTURA: bloquea todo método que no sea GET/HEAD antes de navegar.
//
//   MODO=hoy|propuesta BASE=http://127.0.0.1:3491 OUT=/tmp/caps-pedidos \
//     node -r dotenv/config scripts/_capturas-pedidos-menos-pasos.mjs
import { chromium } from "playwright";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE, S = process.env.SESSION_SECRET;
const OUT = process.env.OUT || "/tmp/caps-pedidos";
const MODO = process.env.MODO || "hoy"; // "hoy" | "propuesta"
const U = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}` };
const sb = async (q) => (await fetch(`${U}/rest/v1/${q}`, { headers: H })).json();
const firmar = (p) => {
  const b = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${b}.${crypto.createHmac("sha256", S).update(b).digest("base64url")}`;
};

mkdirSync(OUT, { recursive: true });
const perms = await sb("role_permissions?select=role,modulos");
// 🔑 El `userId`/`userName` tienen que ser de una persona REAL y activa, y el
// `sessionToken` una sesión viva de ESA misma persona: `/api/auth/sesion`
// (que la app llama al abrir) revalida los tres contra `fg_users` y
// `user_sessions`, y con un "cap" inventado los rechaza con 401 — ahí la
// pantalla se desloguea sola aunque el middleware ya haya dejado pasar la
// cookie. Con un usuario real, las dos capas coinciden.
const [persona] = await sb(`fg_users?select=id,name&role=eq.admin&active=eq.true&name=eq.daniel&limit=1`);
const [sesPersona] = await sb(`user_sessions?select=session_token&revoked=eq.false&user_name=eq.${persona.name}&order=last_seen.desc&limit=1`);
const cookie = (rol, user) => firmar({
  authenticated: true, role: rol, userId: persona.id, userName: user,
  modules: perms.find((p) => p.role === rol).modulos, sessionToken: sesPersona.session_token,
});

// Pedido A: fashion_wear #2816 — «pendiente», 102 líneas, CERO con bulto. Sirve
// para los dos pasos de asignar (una fila y varias filas). El secuencial es
// ÚNICO en la lista; el nombre del cliente se repite entre empresas.
const PEDIDO_A = { secuencial: "16-000002816" };
// Pedido B: joystep #72 — «preparado», 28 de 28 líneas YA con bulto (Verificar
// queda prendido en las dos versiones): aísla la diferencia de CONFIRMAR.
const PEDIDO_B = { secuencial: "16-000000072" };

// ponytail: binario fijo del Chromium ya instalado (el "headless shell" nuevo
// no se pudo descargar por la red lenta de la sandbox); si algún día falta,
// `npx playwright install chromium` lo repone y se puede quitar executablePath.
const CHROME = "/Users/daniellevy/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const br = await chromium.launch({ executablePath: CHROME });

async function nuevaPagina(rol, user) {
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "cxc_session", value: cookie(rol, user), domain: "127.0.0.1", path: "/" }]);
  // 🔑 La cookie basta para el middleware, pero la pantalla (`GroupPage` y
  // similares) decide con `sessionStorage` tras el primer pintado: sin estas
  // claves —las MISMAS que escribe el login en `app/page.tsx`— manda a /home
  // apenas monta, aunque la cookie sea válida.
  const modules = perms.find((p) => p.role === rol).modulos;
  await ctx.addInitScript(
    ([r, id, name, mods]) => {
      sessionStorage.setItem("cxc_role", r);
      sessionStorage.setItem("fg_user_id", id);
      sessionStorage.setItem("fg_user_name", name);
      sessionStorage.setItem("fg_modules", JSON.stringify(mods));
    },
    [rol, persona.id, user, modules],
  );
  const pg = await ctx.newPage();
  await pg.route("**/*", (r) => {
    const m = r.request().method();
    if (m !== "GET" && m !== "HEAD") return r.abort();
    r.continue();
  });
  return { ctx, pg };
}

async function abrirPedido(pg, pedido, chip) {
  await pg.goto(`${BASE}/guias?vista=pedidos`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(1200);
  if (chip) {
    await pg.locator(`button:has-text("${chip}")`).first().click().catch(() => {});
    await pg.waitForTimeout(500);
  }
  // El secuencial es ÚNICO en la lista; el nombre del cliente se repite.
  const fila = pg.locator(`text=${pedido.secuencial}`).first();
  await fila.waitFor({ state: "visible", timeout: 15000 });
  await fila.click();
  await pg.waitForTimeout(900);
}

async function shot(pg, nombre) {
  await pg.screenshot({ path: `${OUT}/${MODO}-${nombre}.png` });
  console.log(`  ✓ ${MODO}-${nombre}.png`);
}

// ── 1 · una fila ──────────────────────────────────────────────────────────
{
  const { ctx, pg } = await nuevaPagina("admin", "daniel");
  await abrirPedido(pg, PEDIDO_A);
  if (MODO === "hoy") {
    // No hay casilla propia en el celular: se marca la fila y aparece
    // «Asignar bulto» abajo. Paso 1: marcada, botón cerrado.
    // nth(0) es «marcar todas» en el encabezado; la fila es nth(1).
    await pg.locator('input[type="checkbox"]').nth(1).check().catch(() => {});
    await pg.waitForTimeout(300);
    await shot(pg, "1a-marcada");
    // Paso 2: se tocó «Asignar bulto» y aparece el campo + botón «Asignar».
    await pg.locator('button:has-text("Asignar bulto")').first().click().catch(() => {});
    await pg.waitForTimeout(300);
    await shot(pg, "1b-campo-abierto");
  } else {
    // La casilla de la fila ya está ahí: se escribe directo.
    const input = pg.locator('input[aria-label^="Bulto de"]').first();
    await input.scrollIntoViewIfNeeded();
    await input.fill("5");
    await pg.waitForTimeout(300);
    await shot(pg, "1a-escrito-directo");
  }
  await ctx.close();
}

// ── 2 · varias filas ─────────────────────────────────────────────────────
{
  const { ctx, pg } = await nuevaPagina("admin", "daniel");
  await abrirPedido(pg, PEDIDO_A);
  const checks = pg.locator('input[type="checkbox"]');
  // nth(0) es «marcar todas» en el encabezado; las filas empiezan en nth(1).
  await checks.nth(1).check().catch(() => {});
  await checks.nth(2).check().catch(() => {});
  await checks.nth(3).check().catch(() => {});
  await pg.waitForTimeout(300);
  if (MODO === "hoy") {
    await shot(pg, "2a-marcadas-antes-del-boton");
    await pg.locator('button:has-text("Asignar bulto")').first().click().catch(() => {});
    await pg.waitForTimeout(300);
    const campo = pg.locator('input[type="number"]').last();
    await campo.fill("3").catch(() => {});
    await pg.waitForTimeout(200);
    await shot(pg, "2b-campo-abierto-con-numero");
  } else {
    // La barra de abajo YA trae el campo: se escribe de una vez.
    const campo = pg.locator('label:has-text("Bulto") input[type="number"]').first();
    await campo.fill("3").catch(() => {});
    await pg.waitForTimeout(300);
    await shot(pg, "2a-barra-con-numero");
  }
  await ctx.close();
}

// ── 3 · confirmar al cambiar de estado ───────────────────────────────────
{
  const { ctx, pg } = await nuevaPagina("admin", "daniel");
  await pg.goto(`${BASE}/guias?vista=pedidos`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(1000);
  // El pedido B está Preparado: cambiar al filtro «Preparado».
  const chipPreparado = pg.locator('button:has-text("Preparado")').first();
  if (await chipPreparado.count()) { await chipPreparado.click().catch(() => {}); await pg.waitForTimeout(500); }
  const verificar = pg.locator('button:has-text("Verificar")').first();
  await verificar.waitFor({ state: "visible", timeout: 15000 });
  if (MODO === "hoy") {
    // Hoy: el botón está ahí, un toque y se va — no hay ventana.
    await shot(pg, "3a-boton-sin-ventana");
  } else {
    // Recomendación: el toque abre la ventana de confirmar (estado local,
    // ninguna escritura todavía).
    await verificar.click();
    await pg.waitForTimeout(500);
    await shot(pg, "3a-ventana-confirmar");
  }
  await ctx.close();
}

await br.close();
console.log(`\nListo (${MODO}).`);
