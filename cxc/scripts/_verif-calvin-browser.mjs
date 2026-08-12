// Verificación en NAVEGADOR del catálogo Calvin Klein contra el build de
// producción local (BASE), en dos partes:
//
//   A) PRE-DDL contra producción REAL (la migración 20260812150000 no corrió):
//      las pantallas fallan LIMPIO — hub con la card, catálogo público con su
//      estado vacío/no listo, pedido público "no existe", sin páginas rotas.
//   B) LOS 3 ANCHOS + 1024 con el catálogo POBLADO (los products se sirven por
//      interceptación de red con la forma y los datos REALES medidos el
//      12-ago-2026 en vistana marcaId 8: nombres "Women-Sneakers"…, precios
//      15-55, SKUs con guión V3A8-80217-313). Se mide: arrastre horizontal de
//      página = 0, recortes = 0, táctiles < 44 px = 0, textos < 12 px = 0.
//      La DDL NO corre en ninguna parte: la base no se toca.
//
// GOTCHAS heredados del arnés (no tocar sin leer):
//   * Sembrar la cookie firmada (cxc_session) + fila real en user_sessions.
//   * Sembrar sessionStorage cxc_role (useAuth lo lee de AHÍ).
//   * delete Navigator.prototype.serviceWorker ANTES de navegar.
//
// Solo lectura salvo la fila de sesión (se revoca al final).
//
//   BASE=http://localhost:3166 node scripts/_verif-calvin-browser.mjs

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  if (!l || l.startsWith("#") || !l.includes("=")) continue;
  const i = l.indexOf("=");
  if (!(l.slice(0, i).trim() in process.env))
    process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const BASE = process.env.BASE ?? "http://localhost:3166";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

// ── Catálogo sintético con la FORMA real (medición 12-ago-2026) ─────────────
const CATS = [
  ["Women-Sneakers", "sneakers", "women", 10],
  ["Women-Flip Flops", "flip_flops", "women", 27],
  ["Men-Sneakers", "sneakers", "men", 3],
  ["Women-Sandals", "sandals", "women", 13],
  ["Men-Flip Flops", "flip_flops", "men", 27],
];
const PRECIOS = [15.5, 18, 19, 22, 25, 29, 33, 38, 55];
const products = [];
let n = 0;
for (const [name, category, gender, cuantos] of CATS) {
  for (let i = 0; i < cuantos; i++) {
    n++;
    const conGuion = n % 8 === 0;
    products.push({
      id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      sku: conGuion ? `V3A8-80${200 + n}-313` : `KCC${String(70000 + n)}`,
      name, category, gender,
      price: PRECIOS[n % PRECIOS.length],
      stock: 24 + (n % 5) * 12, existencia: 24 + (n % 5) * 12,
      disponibilidad: 24 + (n % 5) * 12,
      keep_visible: null, image_url: null, active: true, badge: null,
      nombre_manual: false, bulto_pzas: n % 6 === 0 ? 8 : null,
      created_at: "2026-08-12T00:00:00Z",
    });
  }
}
console.log(`catálogo sintético: ${products.length} productos (80 = los con stock medidos)`);

const TAMANOS = [
  { nombre: "390", width: 390, height: 844 },
  { nombre: "834", width: 834, height: 1194 },
  { nombre: "1024", width: 1024, height: 768 },
  { nombre: "1440", width: 1440, height: 900 },
];

const MEDIR = `(() => {
  const body = document.documentElement;
  const arrastre = Math.max(0, body.scrollWidth - body.clientWidth);
  let recortados = 0, chicos = 0, textosChicos = 0;
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  for (const el of document.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    // recorte de DATOS: overflow hidden con contenido más ancho, sin scroller propio
    if (cs.overflowX === "hidden" && el.scrollWidth - el.clientWidth > 100) recortados++;
    if ((el.tagName === "BUTTON" || el.tagName === "A" || el.tagName === "SELECT" || el.tagName === "INPUT") ) {
      const r = el.getBoundingClientRect();
      if (r.height > 1 && (r.height < 43.5 && Math.max(r.height, r.width) < 43.5)) chicos++;
    }
    if (el.childElementCount === 0 && el.textContent.trim()) {
      const fs = parseFloat(cs.fontSize);
      if (fs && fs < 11.5) textosChicos++;
    }
  }
  return { arrastre, recortados, chicos, textosChicos, texto: document.body.innerText.slice(0, 4000) };
})()`;

async function main() {
  const sessionToken = crypto.randomUUID();
  const ins = await sb.from("user_sessions").insert({
    user_name: "daniel", user_role: "admin", session_token: sessionToken,
    ip_address: "127.0.0.1", last_seen: new Date().toISOString(),
  }).select("id").single();
  if (ins.error) throw new Error("no pude sembrar sesión: " + ins.error.message);
  const cookie = signSession({ role: "admin", userId: "daniel", userName: "daniel", sessionToken });

  const browser = await chromium.launch();
  let fallas = 0;
  const check = (ok, msg) => { console.log(`${ok ? "🟢" : "🔴"} ${msg}`); if (!ok) fallas++; };

  try {
    // ── A) PRE-DDL contra producción real ──────────────────────────────────
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addCookies([{ name: "cxc_session", value: cookie, domain: "localhost", path: "/", httpOnly: true }]);
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        try { delete Navigator.prototype.serviceWorker; } catch {}
        sessionStorage.setItem("cxc_role", "admin");
        sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
      });

      await page.goto(`${BASE}/catalogos/marcas`, { waitUntil: "networkidle" });
      const hub = await page.locator("body").innerText();
      check(hub.includes("CALVIN KLEIN"), "hub: la card CALVIN KLEIN aparece");
      check(!/application error|unhandled/i.test(hub), "hub: sin página rota");

      await page.goto(`${BASE}/catalogo-publico/calvin`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      const pub = await page.locator("body").innerText();
      check(!/application error|unhandled/i.test(pub), "público pre-DDL: sin página rota");
      check(!pub.includes("undefined"), "público pre-DDL: sin 'undefined' suelto");
      console.log("   público pre-DDL dice:", JSON.stringify(pub.replace(/\s+/g, " ").slice(0, 180)));

      await page.goto(`${BASE}/pedido-calvin/NOEXISTE1`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      const ped = await page.locator("body").innerText();
      check(!/application error|unhandled/i.test(ped), "pedido-calvin pre-DDL: sin página rota");
      console.log("   pedido pre-DDL dice:", JSON.stringify(ped.replace(/\s+/g, " ").slice(0, 160)));

      await page.goto(`${BASE}/catalogos/admin/calvin`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      const adm = await page.locator("body").innerText();
      check(!/application error|unhandled/i.test(adm), "admin pre-DDL: sin página rota");
      await ctx.close();
    }

    // ── B) 3 anchos + 1024, catálogo poblado por interceptación ────────────
    // El conteo de textos < 12 px se compara CONTRA TOMMY con el MISMO payload:
    // los componentes son compartidos, así que el único conteo aceptable para
    // Calvin es el idéntico al de la plantilla (hoy: el badge "Bulto de N" de
    // text-[10px], pre-existente en las 3 marcas — 1 por card).
    for (const t of TAMANOS) {
      const ctx = await browser.newContext({ viewport: { width: t.width, height: t.height } });
      await ctx.addCookies([{ name: "cxc_session", value: cookie, domain: "localhost", path: "/", httpOnly: true }]);
      for (const marca of ["calvin", "tommy"]) {
        await ctx.route(`**/api/catalogo/${marca}/public`, (r) =>
          r.fulfill({ json: { products } }));
        await ctx.route(`**/api/catalogo/${marca}/products**`, (r) =>
          r.fulfill({ json: products }));
      }
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        try { delete Navigator.prototype.serviceWorker; } catch {}
        sessionStorage.setItem("cxc_role", "admin");
        sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
      });

      for (const [id, url] of [
        ["interno", "/catalogo/calvin"],
        ["publico", "/catalogo-publico/calvin"],
        ["admin", "/catalogos/admin/calvin"],
      ]) {
        await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(1800);
        const m = await page.evaluate(MEDIR);
        // Paridad: la MISMA pantalla de Tommy con el MISMO payload.
        await page.goto(`${BASE}${url.replace("calvin", "tommy")}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(1800);
        const ref = await page.evaluate(MEDIR);
        const cargo = m.texto.includes("Women-Sneakers");
        check(
          m.arrastre === 0 && m.recortados === 0 && m.chicos === 0 &&
            m.textosChicos === ref.textosChicos && cargo,
          `${t.nombre}px ${id}: arrastre=${m.arrastre} recortados=${m.recortados} táctiles<44=${m.chicos} ` +
            `textos<12=${m.textosChicos} (tommy=${ref.textosChicos}, paridad) cargó=${cargo}`,
        );
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    await sb.from("user_sessions").update({ revoked: true }).eq("id", ins.data.id);
    console.log("sesión de prueba revocada");
  }
  if (fallas > 0) { console.error(`\n${fallas} chequeos en rojo`); process.exitCode = 1; }
  else console.log("\nTodo verde");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
