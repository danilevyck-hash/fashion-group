/**
 * Verifica el flujo COMPLETO de "cambiar la marca de una factura" en la app real,
 * y mide el impacto EXACTO de pasar 0000062726 de Calvin a Tommy.
 * NO guarda nada: llega hasta el botón Guardar y no lo toca.
 */
import fs from "fs";
import crypto from "crypto";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const BASE = "http://localhost:3153", OUT = "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sign = (p) => { const b = Buffer.from(JSON.stringify(p)).toString("base64url"); return `${b}.${crypto.createHmac("sha256", process.env.SESSION_SECRET).update(b).digest("base64url")}`; };

const CK = "6dc27cc7-c061-440e-9dc9-915198852a47", TH = "1673d8a7-582c-4568-8608-34c88b4b6ec6";

async function main() {
  // ── Impacto EXACTO del cambio (solo lectura) ──
  const f = await sb.from("mk_facturas").select("id, proyecto_id, numero_factura, subtotal, itbms, total, grupo_legacy").eq("numero_factura", "0000062726").single();
  const fm = await sb.from("mk_factura_marcas").select("*").eq("factura_id", f.data.id);
  console.log("=== FACTURA 0000062726 (crudo de la base) ===");
  console.log(`  subtotal=${f.data.subtotal}  itbms=${f.data.itbms}  total=${f.data.total}  grupo_legacy=${f.data.grupo_legacy}`);
  console.log(`  marca actual: ${fm.data.map(r => (r.marca_id === CK ? "Calvin Klein" : r.marca_id === TH ? "Tommy Hilfiger" : r.marca_id) + " " + r.porcentaje + "%").join(", ")}`);

  // Totales de Outlet Duty Free N2 antes y después (simulado, sin escribir)
  const proy = await sb.from("mk_proyectos").select("tienda, tienda_codigo").eq("id", f.data.proyecto_id).single();
  const facts = await sb.from("mk_facturas").select("id, subtotal, total").eq("proyecto_id", f.data.proyecto_id).is("anulado_en", null);
  const fms = await sb.from("mk_factura_marcas").select("factura_id, marca_id").in("factura_id", facts.data.map(x => x.id));
  const byId = new Map(facts.data.map(x => [x.id, x]));
  const suma = (mid, cambiar) => fms.data.reduce((s, r) => {
    let m = r.marca_id;
    if (cambiar && r.factura_id === f.data.id) m = TH;
    return s + (m === mid ? Number(byId.get(r.factura_id).subtotal) : 0);
  }, 0);
  const ent = await sb.from("mk_entregas_muebles").select("total_por_marca").eq("proyecto_id", f.data.proyecto_id);
  const entM = (mid) => ent.data.reduce((s, e) => s + Number((e.total_por_marca ?? {})[mid] ?? 0), 0);
  console.log(`\n=== ${proy.data.tienda} (${proy.data.tienda_codigo}) — columnas del Excel, sin ITBMS ===`);
  for (const [lbl, cambiar] of [["ANTES", false], ["DESPUÉS", true]]) {
    console.log(`  ${lbl.padEnd(8)} Calvin=${(suma(CK, cambiar) + entM(CK)).toFixed(2)}  Tommy=${(suma(TH, cambiar) + entM(TH)).toFixed(2)}  (subtotal total no cambia)`);
  }

  // ── Flujo en la app: abrir Editar, destildar Calvin, tildar Tommy ──
  const token = crypto.randomUUID();
  const ins = await sb.from("user_sessions").insert({ user_name: "daniel", user_role: "admin", session_token: token, ip_address: "127.0.0.1", last_seen: new Date().toISOString() }).select("id").single();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.addCookies([{ name: "cxc_session", value: sign({ role: "admin", userId: "daniel", userName: "daniel", sessionToken: token }), domain: "localhost", path: "/", httpOnly: true }]);
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { delete Navigator.prototype.serviceWorker; } catch {} sessionStorage.setItem("cxc_role", "admin"); });
  // Bloquea cualquier escritura: si el arnés intentara guardar, se vería acá.
  const escrituras = [];
  await page.route("**/api/marketing/**", (route) => {
    const m = route.request().method();
    if (m !== "GET") { escrituras.push(`${m} ${route.request().url()}`); return route.abort(); }
    return route.continue();
  });

  await page.goto(`${BASE}/marketing?marca=legacy&proyecto=${f.data.proyecto_id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const card = page.locator("div.relative.group", { hasText: "0000062726" }).first();
  await card.scrollIntoViewIfNeeded();
  await card.locator('button:has-text("Editar")').first().click();
  await page.waitForTimeout(2500);

  const panel = page.locator("div.border-2.border-black").filter({ hasText: "Editar factura 0000062726" }).first();
  // Valores precargados (inputs, no texto).
  const vals = await panel.locator("input").evaluateAll((els) => els.map((e) => ({ v: e.value, ph: e.placeholder })).filter((x) => x.v));
  console.log("\n=== form de edición: valores precargados ===");
  console.log("  " + JSON.stringify(vals));

  // Botones de marca y cuál está seleccionado (borde negro = seleccionado).
  const marcas = await panel.locator("button").evaluateAll((els) =>
    els.filter((e) => /Tommy Hilfiger|Calvin Klein|Reebok|Joybees|French Connection|Otros/.test(e.textContent || ""))
       .map((e) => ({ nombre: (e.textContent || "").replace(/\s+/g, " ").trim(), sel: e.className.includes("border-black") })));
  console.log("=== selector de marca ===");
  for (const m of marcas) console.log(`  ${m.sel ? "[x]" : "[ ]"} ${m.nombre}`);

  // Cambiar: destildar Calvin, tildar Tommy.
  await panel.locator('button:has-text("Calvin Klein")').first().click();
  await page.waitForTimeout(300);
  await panel.locator('button:has-text("Tommy Hilfiger")').first().click();
  await page.waitForTimeout(500);
  const marcas2 = await panel.locator("button").evaluateAll((els) =>
    els.filter((e) => /Tommy Hilfiger|Calvin Klein/.test(e.textContent || ""))
       .map((e) => ({ nombre: (e.textContent || "").replace(/\s+/g, " ").trim(), sel: e.className.includes("border-black") })));
  console.log("=== después de tocar Calvin (off) y Tommy (on) ===");
  for (const m of marcas2) console.log(`  ${m.sel ? "[x]" : "[ ]"} ${m.nombre}`);
  const btnGuardar = panel.locator('button:has-text("Guardar")').first();
  console.log(`  botón Guardar habilitado: ${(await btnGuardar.isEnabled()) ? "SÍ" : "NO"}`);
  await page.screenshot({ path: `${OUT}/5-cambiar-marca-a-tommy.png`, fullPage: true });

  console.log(`\nescrituras interceptadas (debe ser 0): ${escrituras.length} ${escrituras.join(", ")}`);
  // Confirmar que la base NO cambió.
  const fm2 = await sb.from("mk_factura_marcas").select("marca_id").eq("factura_id", f.data.id);
  console.log(`marca en la base al terminar: ${fm2.data.map(r => r.marca_id === CK ? "Calvin Klein" : r.marca_id === TH ? "Tommy Hilfiger" : r.marca_id).join(", ")} (sin tocar)`);
  await browser.close();
  await sb.from("user_sessions").update({ revoked: true }).eq("id", ins.data.id);
}
main().catch((e) => { console.error(e); process.exit(1); });
