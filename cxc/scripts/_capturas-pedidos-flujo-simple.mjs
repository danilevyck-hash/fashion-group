// Capturas HOY vs RECOMENDACIÓN — Despachos › Pedidos, flujo SIMPLIFICADO
// (7-oct-2026). SOLO LECTURA: bloquea todo método que no sea GET/HEAD antes
// de navegar — nada se guarda nunca, en NINGÚN modo.
//
//   MODO=hoy|propuesta BASE=http://127.0.0.1:3491 OUT=/tmp/caps-flujo-simple \
//     node -r dotenv/config scripts/_capturas-pedidos-flujo-simple.mjs
import { chromium } from "playwright";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE, S = process.env.SESSION_SECRET;
const OUT = process.env.OUT || "/tmp/caps-flujo-simple";
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
const [personaAdmin] = await sb(`fg_users?select=id,name&role=eq.admin&active=eq.true&name=eq.daniel&limit=1`);
const [sesAdmin] = await sb(`user_sessions?select=session_token&revoked=eq.false&user_name=eq.${personaAdmin.name}&order=last_seen.desc&limit=1`);
// Bodega real (Julio) para la pantalla de bodega: solo SUS empresas.
const [personaBodega] = await sb(`fg_users?select=id,name&role=eq.bodega&active=eq.true&name=eq.julio&limit=1`);
const [sesBodega] = await sb(`user_sessions?select=session_token&revoked=eq.false&user_name=eq.${personaBodega?.name}&order=last_seen.desc&limit=1`);

const cookie = (rol, persona, sesion) => firmar({
  authenticated: true, role: rol, userId: persona.id, userName: persona.name,
  modules: perms.find((p) => p.role === rol).modulos, sessionToken: sesion?.session_token,
});

const CHROME = "/Users/daniellevy/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const br = await chromium.launch({ executablePath: CHROME });

async function nuevaPagina(rol, persona, sesion, viewport) {
  const ctx = await br.newContext({ viewport, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "cxc_session", value: cookie(rol, persona, sesion), domain: "127.0.0.1", path: "/" }]);
  const modules = perms.find((p) => p.role === rol).modulos;
  await ctx.addInitScript(
    ([r, id, name, mods]) => {
      sessionStorage.setItem("cxc_role", r);
      sessionStorage.setItem("fg_user_id", id);
      sessionStorage.setItem("fg_user_name", name);
      sessionStorage.setItem("fg_modules", JSON.stringify(mods));
    },
    [rol, persona.id, persona.name, modules],
  );
  const pg = await ctx.newPage();
  await pg.route("**/*", (r) => {
    const m = r.request().method();
    if (m !== "GET" && m !== "HEAD") return r.abort();
    r.continue();
  });
  return { ctx, pg };
}

async function abrirPedidos(pg, chip) {
  await pg.goto(`${BASE}/despachos?vista=pedidos`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(1200);
  if (chip) {
    await pg.locator(`button:has-text("${chip}")`).first().click().catch(() => {});
    await pg.waitForTimeout(500);
  }
}

async function shot(pg, nombre) {
  await pg.screenshot({ path: `${OUT}/${MODO}-${nombre}.png` });
  console.log(`  ✓ ${MODO}-${nombre}.png`);
}

const DESKTOP = { width: 1440, height: 900 };
const CEL = { width: 390, height: 844 };

// ── 1 · bodega: la lista y sus chips (computadora) ──────────────────────────
{
  const { ctx, pg } = await nuevaPagina("bodega", personaBodega, sesBodega, DESKTOP);
  await abrirPedidos(pg);
  await shot(pg, "1a-bodega-lista-pc");
  await ctx.close();
}

// Pedido con líneas REALES (102, medido antes) para que la pantalla no
// salga vacía: fashion_wear #2816, dentro de las empresas de Julio.
const PEDIDO_CON_LINEAS = "16-000002816";

// ── 2 · bodega: anotar los bultos y entregar (celular) ──────────────────────
{
  const { ctx, pg } = await nuevaPagina("bodega", personaBodega, sesBodega, CEL);
  await abrirPedidos(pg);
  if (MODO === "propuesta") {
    // La casilla de bultos, EN LA FILA del pedido (nunca por artículo).
    const fila = pg.locator(`text=${PEDIDO_CON_LINEAS}`).first();
    await fila.scrollIntoViewIfNeeded().catch(() => {});
    const input = pg.locator('input[aria-label^="Bultos del pedido"]').first();
    await input.fill("6").catch(() => {});
    await pg.waitForTimeout(300);
    await shot(pg, "2a-bodega-bultos-en-la-fila");
  } else {
    // Hoy: tocar el cliente abre el detalle con la casilla POR ARTÍCULO.
    const fila = pg.locator(`text=${PEDIDO_CON_LINEAS}`).first();
    if (await fila.count()) {
      await fila.click().catch(() => {});
      await pg.waitForTimeout(1200);
    }
    await shot(pg, "2a-bodega-detalle-por-articulo");
  }
  await ctx.close();
}

// ── 3 · secretaria: Preparados, para facturar en Switch ─────────────────────
{
  const { ctx, pg } = await nuevaPagina("secretaria", personaAdmin, sesAdmin, DESKTOP);
  await abrirPedidos(pg, MODO === "propuesta" ? "Preparados" : "Preparados");
  if (MODO === "propuesta") {
    const facturar = pg.locator('button:has-text("Facturar")').first();
    if (await facturar.count()) {
      await facturar.click().catch(() => {});
      await pg.waitForTimeout(500);
    }
    await shot(pg, "3a-secretaria-facturar-pc");
  } else {
    await shot(pg, "3a-secretaria-verificar-pc");
  }
  await ctx.close();
}

// ── 4 · las pestañas de estado (computadora) ─────────────────────────────
{
  const { ctx, pg } = await nuevaPagina("admin", personaAdmin, sesAdmin, DESKTOP);
  await abrirPedidos(pg);
  await shot(pg, "4a-chips-de-estado");
  await ctx.close();
}

// ── 5 · la pestaña «Bultos»/«Etiquetas» del módulo Despachos ───────────────
{
  const { ctx, pg } = await nuevaPagina("admin", personaAdmin, sesAdmin, DESKTOP);
  await pg.goto(`${BASE}/despachos`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(1000);
  await shot(pg, "5a-pestanas-despachos");
  await ctx.close();
}

await br.close();
console.log(`\nListo (${MODO}).`);
