// Navegador para capturas CON DATOS DE EJEMPLO (17-nov-2026). Nunca la sesión
// de Daniel ni la base de producción: el servidor local corre contra
// `fake-supabase.mjs` y la cookie se firma con un SESSION_SECRET inventado.
//
// Cómo levantar todo (tres terminales o `&`):
//   FIXTURES=<dir> PORT=54999 node scripts/_capturas/fake-supabase.mjs
//   SESSION_SECRET=capturas SUPABASE_URL=http://127.0.0.1:54999 \
//     NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54999 SUPABASE_SERVICE_ROLE_KEY=falsa \
//     NEXT_PUBLIC_SUPABASE_ANON_KEY=falsa npx next dev -p 3111
//   BASE=http://127.0.0.1:3111 SESSION_SECRET=capturas npx tsx <tu-script>.ts   (sin top-level await: envuelve en main())
//
// Uso desde un script:
//   const { page, cerrar } = await abrir({ rol: "admin", viewport: { width: 1440, height: 900 } });
//   await page.route("**/api/comisiones/**", (r) => r.fulfill({ json: … }));  // opcional
//   await page.goto(`${BASE}/comisiones`);
import { chromium, type BrowserContext, type Page } from "playwright";
import crypto from "node:crypto";
import { getDefaultModulesForRole } from "../../src/lib/modules";

export const BASE = process.env.BASE || "http://127.0.0.1:3111";
const SECRET = process.env.SESSION_SECRET || "capturas";
const host = new URL(BASE).hostname;

export function cookieFirmada(rol: string, modulos: string[]): string {
  const body = Buffer.from(
    JSON.stringify({ authenticated: true, role: rol, userId: "capturas", userName: "Capturas", modules: modulos, sessionToken: "capturas" }),
  ).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", SECRET).update(body).digest("base64url")}`;
}

export async function abrir(opts: {
  rol?: string;
  viewport?: { width: number; height: number };
  celular?: boolean;
}): Promise<{ page: Page; ctx: BrowserContext; cerrar: () => Promise<void> }> {
  const rol = opts.rol ?? "admin";
  const modulos = getDefaultModulesForRole(rol);
  const br = await chromium.launch({ channel: "chromium" });
  const ctx = await br.newContext({
    viewport: opts.viewport ?? (opts.celular ? { width: 390, height: 844 } : { width: 1440, height: 900 }),
    deviceScaleFactor: 2,
    ...(opts.celular
      ? {
          isMobile: true,
          hasTouch: true,
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        }
      : {}),
  });
  await ctx.addCookies([
    { name: "cxc_session", value: cookieFirmada(rol, modulos), domain: host, path: "/" },
    { name: "cxc_ultimo_toque", value: String(Date.now()), domain: host, path: "/" },
  ]);
  await ctx.addInitScript(
    ([r, mods]: [string, string[]]) => {
      sessionStorage.setItem("cxc_role", r);
      sessionStorage.setItem("fg_user_id", "capturas");
      sessionStorage.setItem("fg_user_name", "Capturas");
      sessionStorage.setItem("fg_modules", JSON.stringify(mods));
    },
    [rol, modulos] as [string, string[]],
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 400)));
  return { page, ctx, cerrar: () => br.close() };
}
