// Capturas HOY vs RECOMENDACIÓN — CXC, el botón único de estado de cuenta (7-oct-2026).
// SOLO LECTURA: bloquea todo método que no sea GET/HEAD antes de navegar.
//
//   MODO=hoy|propuesta BASE=http://127.0.0.1:3491 OUT=/tmp/ec-grupo-caps \
//     node -r dotenv/config scripts/_capturas-estado-cuenta-boton.mjs
import { chromium } from "playwright";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE, S = process.env.SESSION_SECRET;
const OUT = process.env.OUT || "/tmp/ec-grupo-caps";
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
const [persona] = await sb(`fg_users?select=id,name&role=eq.admin&active=eq.true&name=eq.daniel&limit=1`);
const [sesPersona] = await sb(`user_sessions?select=session_token&revoked=eq.false&user_name=eq.${persona.name}&order=last_seen.desc&limit=1`);
const cookie = () => firmar({
  authenticated: true, role: "admin", userId: persona.id, userName: persona.name,
  modules: perms.find((p) => p.role === "admin").modulos, sessionToken: sesPersona.session_token,
});

const CHROME = "/Users/daniellevy/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const br = await chromium.launch({ executablePath: CHROME });

async function nuevaPagina(viewport) {
  const ctx = await br.newContext({ viewport, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "cxc_session", value: cookie(), domain: "127.0.0.1", path: "/" }]);
  const modules = perms.find((p) => p.role === "admin").modulos;
  await ctx.addInitScript(
    ([id, name, mods]) => {
      sessionStorage.setItem("cxc_role", "admin");
      sessionStorage.setItem("fg_user_id", id);
      sessionStorage.setItem("fg_user_name", name);
      sessionStorage.setItem("fg_modules", JSON.stringify(mods));
    },
    [persona.id, persona.name, modules],
  );
  const pg = await ctx.newPage();
  await pg.route("**/*", (r) => {
    const m = r.request().method();
    if (m !== "GET" && m !== "HEAD") return r.abort();
    r.continue();
  });
  return { ctx, pg };
}

async function shot(pg, nombre, opciones) {
  await pg.screenshot({ path: `${OUT}/${MODO}-${nombre}.png`, ...opciones });
  console.log(`  ✓ ${MODO}-${nombre}.png`);
}

// ── 1 · computadora: la tarjeta expandida de un cliente con saldo ─────────
{
  const { ctx, pg } = await nuevaPagina({ width: 1440, height: 900 });
  await pg.goto(`${BASE}/cxc?search=Nova+Lux`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(1500);
  // La fila de Nova Lux: tocar el nombre para expandir el panel de contacto.
  // `.last()` — a 1440px la versión del celular (`PanelCxcCelular`) está en
  // el DOM pero oculta por CSS (`lg:hidden`); la de escritorio (`ClientTable`)
  // se monta después.
  const fila = pg.locator("text=Nova Lux").last();
  await fila.waitFor({ state: "visible", timeout: 20000 });
  await fila.click();
  await pg.waitForTimeout(600);
  const panel = pg.locator("text=Desglose por empresa").first();
  await panel.scrollIntoViewIfNeeded().catch(() => {});
  await pg.waitForTimeout(300);
  await shot(pg, "1-computadora-tarjeta");
  await ctx.close();
}

// ── 2 · celular: la lista de la cartera (PanelCxcCelular, el real) ───────
// 🔑 NO cambia con este interruptor: la fila ya se toca entera y abre
// `HojaCobrar` directo — no hay un segundo botón que unificar acá. Se
// captura igual para que el mockup lo diga en vez de darlo por sentado.
{
  const { ctx, pg } = await nuevaPagina({ width: 390, height: 844 });
  await pg.goto(`${BASE}/cxc?search=Nova+Lux`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(1500);
  await shot(pg, "2-celular-lista");
  await ctx.close();
}

// ── 3 · celular: la ficha del cliente (D-170, Nova Lux) ───────────────────
{
  const { ctx, pg } = await nuevaPagina({ width: 390, height: 844 });
  await pg.goto(`${BASE}/clientes/D-170`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(1200);
  await shot(pg, "3-celular-ficha");
  await ctx.close();
}

// ── 4 · dónde vive el selector de UNA empresa (computadora) ───────────────
{
  const { ctx, pg } = await nuevaPagina({ width: 1440, height: 900 });
  await pg.goto(`${BASE}/cxc`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(1200);
  const selector = pg.locator("select, button").filter({ hasText: /Todas|Fashion Wear|Empresa/ }).first();
  await selector.scrollIntoViewIfNeeded().catch(() => {});
  await pg.waitForTimeout(200);
  await shot(pg, "4-selector-empresa", { clip: { x: 0, y: 0, width: 1440, height: 260 } });
  await ctx.close();
}

await br.close();
console.log(`\nListo (${MODO}).`);
