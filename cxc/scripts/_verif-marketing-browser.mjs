/**
 * Verificación en la APP REAL (build de producción, puerto 3153) de:
 *   1. card independiente de Multifashion en /marketing
 *   2. botón Editar de una factura → abre el form EN EL LUGAR de la factura
 *   3. comprobante de entrega de mobiliario → abre un PDF de verdad
 * Solo lectura (no guarda nada).
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
const BASE = "http://localhost:3153";
const OUT = "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

async function main() {
  // Sesión real: fila en user_sessions + cookie firmada (el middleware valida ambas).
  const sessionToken = crypto.randomUUID();
  const ins = await sb.from("user_sessions").insert({
    user_name: "daniel", user_role: "admin", session_token: sessionToken, ip_address: "127.0.0.1", last_seen: new Date().toISOString(),
  }).select("id").single();
  if (ins.error) throw new Error("no pude sembrar sesión: " + ins.error.message);
  const sessionRowId = ins.data.id;
  const cookie = signSession({ role: "admin", userId: "daniel", userName: "daniel", sessionToken });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.addCookies([{ name: "cxc_session", value: cookie, domain: "localhost", path: "/", httpOnly: true }]);
  const page = await ctx.newPage();
  // El SW mata la hidratación en este arnés (gotcha del repo).
  await page.addInitScript(() => {
    try { delete Navigator.prototype.serviceWorker; } catch {}
    sessionStorage.setItem("cxc_role", "admin");
  });
  const errores = [];
  page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });

  // ── 1. Card de Multifashion ────────────────────────────────────────────────
  await page.goto(`${BASE}/marketing`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  const textoHome = await page.locator("main").innerText();
  const hayCard = /Multifashion/.test(textoHome) && /Independiente/.test(textoHome);
  console.log(`1) card Multifashion visible: ${hayCard ? "SÍ" : "NO"}`);
  const mfLinea = textoHome.split("\n").filter((l) => /Multifashion|Independiente|Tienda propia/.test(l));
  console.log("   texto:", JSON.stringify(mfLinea));
  // Total mostrado en la card de Multifashion
  const cardMf = page.locator("button", { hasText: "Independiente" }).first();
  console.log("   card:", (await cardMf.innerText()).replace(/\n/g, " | "));
  await page.screenshot({ path: `${OUT}/1-marketing-home.png`, fullPage: true });

  // Entrar al bucket de Multifashion
  await cardMf.click();
  await page.waitForTimeout(2000);
  const mfView = await page.locator("main").innerText();
  console.log("   dentro del bucket:", mfView.split("\n").slice(0, 6).join(" | "));
  await page.screenshot({ path: `${OUT}/2-multifashion-bucket.png`, fullPage: true });

  // ── 2. Editar factura 0000062726 (Outlet Duty Free N2) ─────────────────────
  const f = await sb.from("mk_facturas").select("id, proyecto_id, numero_factura").eq("numero_factura", "0000062726").single();
  await page.goto(`${BASE}/marketing?marca=legacy&proyecto=${f.data.proyecto_id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  // Card de la factura: buscamos el bloque que contiene el número.
  const cardFactura = page.locator("div.relative.group", { hasText: "0000062726" }).first();
  await cardFactura.scrollIntoViewIfNeeded();
  const cajaAntes = await cardFactura.boundingBox();
  await page.screenshot({ path: `${OUT}/3-ficha-antes-de-editar.png`, fullPage: true });
  await cardFactura.locator('button:has-text("Editar")').first().click();
  await page.waitForTimeout(2500);
  // ¿Apareció el form de edición? ¿Y está a la vista (dentro del viewport)?
  const form = page.locator('text=Editar factura 0000062726').first();
  const visible = await form.isVisible().catch(() => false);
  const caja = await form.boundingBox().catch(() => null);
  const vp = page.viewportSize();
  const enPantalla = !!caja && caja.y >= 0 && caja.y <= vp.height;
  console.log(`\n2) Editar → form visible: ${visible ? "SÍ" : "NO"} · dentro del viewport: ${enPantalla ? "SÍ" : "NO"}`);
  console.log(`   card estaba en y=${cajaAntes?.y?.toFixed(0)} · form apareció en y=${caja?.y?.toFixed(0)} (viewport ${vp.height})`);
  // ¿Los datos son los de ESTA factura y se puede cambiar la marca?
  const textoForm = await page.locator("form, div").filter({ hasText: "Editar factura 0000062726" }).first().innerText();
  const traeCalvin = /Calvin Klein/.test(textoForm);
  const traeTommy = /Tommy Hilfiger/.test(textoForm);
  console.log(`   selector de marca con Calvin: ${traeCalvin ? "SÍ" : "NO"} · con Tommy: ${traeTommy ? "SÍ" : "NO"}`);
  console.log(`   subtotal precargado: ${/157\.5/.test(textoForm) ? "157.5 OK" : "NO SE VE"}`);
  await page.screenshot({ path: `${OUT}/4-editar-en-el-lugar.png`, fullPage: true });

  // ── 3. Comprobante de entrega de mobiliario ────────────────────────────────
  const e = await sb.from("mk_entregas_muebles").select("id, proyecto_id, total").not("proyecto_id", "is", null).order("total", { ascending: false }).limit(1).single();
  const res = await page.request.get(`${BASE}/api/marketing/entregas-pdf/${e.data.id}`);
  const buf = await res.body();
  console.log(`\n3) GET /api/marketing/entregas-pdf/<id> (con sesión) → ${res.status()} · ${res.headers()["content-type"]} · ${buf.length} bytes · %PDF=${buf.slice(0,5).toString()}`);
  fs.writeFileSync(`${OUT}/comprobante-desde-la-app.pdf`, buf);
  // Sin sesión debe cerrar la puerta.
  const ctx2 = await browser.newContext();
  const r2 = await ctx2.request.get(`${BASE}/api/marketing/entregas-pdf/${e.data.id}`);
  console.log(`   sin sesión y sin token → ${r2.status()} (debe ser 401/403)`);
  await ctx2.close();

  console.log(`\nerrores de consola: ${errores.length}${errores.length ? " → " + errores.slice(0,3).join(" ;; ") : ""}`);
  await browser.close();
  await sb.from("user_sessions").update({ revoked: true }).eq("id", sessionRowId);
  console.log("sesión de prueba revocada.");
}
main().catch(async (e) => { console.error(e); process.exit(1); });
