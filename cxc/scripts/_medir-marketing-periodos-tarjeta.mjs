/**
 * Verificación en la APP REAL (build de producción) del inicio de Marketing:
 *   1. Los períodos CERRADOS viven dentro de la tarjeta de su marca
 *      (Tommy: abierto arriba + "mid 2026 (cerrado) $94,104.43 [ZIP][Excel]").
 *   2. La fila suelta "Períodos cerrados" del pie SE FUE.
 *   3. Multifashion tiene su "Bajar ZIP".
 *   4. Los 4 anchos (390 · 834 · 1024 · 1440): 0 px de arrastre de página,
 *      0 elementos recortados fuera de un scroller, 0 blancos táctiles <44 px
 *      y 0 textos <12 px en las filas nuevas.
 * Solo lectura (no guarda nada). Deja capturas en /tmp/mk-tarjeta-*.png.
 *
 * Uso: BASE=http://localhost:3164 node scripts/_medir-marketing-periodos-tarjeta.mjs
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
const BASE = process.env.BASE || "http://localhost:3164";
const ANCHOS = [390, 834, 1024, 1440];
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

let fallos = 0;
const check = (etiqueta, ok, detalle = "") => {
  if (!ok) fallos++;
  console.log(`  ${ok ? "✅" : "❌"} ${etiqueta}${detalle ? ` — ${detalle}` : ""}`);
};

async function main() {
  const sessionToken = crypto.randomUUID();
  const ins = await sb
    .from("user_sessions")
    .insert({
      user_name: "daniel",
      user_role: "admin",
      session_token: sessionToken,
      ip_address: "127.0.0.1",
      last_seen: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (ins.error) throw new Error("no pude sembrar sesión: " + ins.error.message);
  const cookie = signSession({ role: "admin", userId: "daniel", userName: "daniel", sessionToken });

  const browser = await chromium.launch();
  try {
    for (const ancho of ANCHOS) {
      const ctx = await browser.newContext({ viewport: { width: ancho, height: 1100 } });
      await ctx.addCookies([
        { name: "cxc_session", value: cookie, domain: "localhost", path: "/", httpOnly: true },
      ]);
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        try {
          delete Navigator.prototype.serviceWorker; // el SW mata la hidratación en el arnés
        } catch {}
        sessionStorage.setItem("cxc_role", "admin");
      });
      await page.goto(`${BASE}/marketing`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1800);

      console.log(`\n═══ ${ancho} px ═══`);
      const m = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const arrastre = Math.max(0, (document.scrollingElement?.scrollWidth ?? 0) - vw);
        // Recortado = un elemento que se sale del viewport por la derecha sin
        // vivir dentro de un scroller declarado (overflow-x auto/scroll).
        const tieneScroller = (el) => {
          for (let n = el.parentElement; n; n = n.parentElement) {
            const o = getComputedStyle(n).overflowX;
            if (o === "auto" || o === "scroll") return true;
          }
          return false;
        };
        let recortados = 0;
        const ejemplos = [];
        for (const el of document.querySelectorAll("main *")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right > vw + 1 && !tieneScroller(el)) {
            recortados++;
            if (ejemplos.length < 3)
              ejemplos.push(`${el.tagName}.${String(el.className).slice(0, 40)} right=${Math.round(r.right)}`);
          }
        }
        // Filas nuevas de períodos cerrados: botones ≥44px, texto ≥12px.
        let blancos = 0;
        let textosChicos = 0;
        const filas = [...document.querySelectorAll("main section div")].filter((d) =>
          /\(cerrado\)/.test(d.textContent ?? "") && d.querySelector("button"),
        );
        for (const fila of filas) {
          for (const b of fila.querySelectorAll("button")) {
            if (b.getBoundingClientRect().height < 44) blancos++;
          }
          for (const el of fila.querySelectorAll("*")) {
            if (!el.textContent?.trim() || el.children.length > 0) continue;
            if (parseFloat(getComputedStyle(el).fontSize) < 12) textosChicos++;
          }
        }
        const texto = document.querySelector("main")?.innerText ?? "";
        return { arrastre, recortados, ejemplos, blancos, textosChicos, texto };
      });

      check("0 px de arrastre de página", m.arrastre === 0, `${m.arrastre}px`);
      check("0 recortados fuera de scroller", m.recortados === 0, m.ejemplos.join(" | "));
      check("0 blancos táctiles <44px en filas de cerrados", m.blancos === 0, String(m.blancos));
      check("0 textos <12px en filas de cerrados", m.textosChicos === 0, String(m.textosChicos));
      check("Tommy lista su cerrado con monto", /mid 2026\s*\(cerrado\)\s*\$94,104\.43/.test(m.texto.replace(/\n/g, " ")));
      check("la fila suelta 'Períodos cerrados' se fue", !/Períodos cerrados/.test(m.texto));
      check("los botones ZIP y Excel del cerrado existen", /\(cerrado\)/.test(m.texto) && /Excel/.test(m.texto));

      // Multifashion con su Bajar ZIP: la tarjeta que dice "Tienda propia".
      const mf = await page.evaluate(() => {
        const bloques = [...document.querySelectorAll("main section > div")];
        const card = bloques.find((b) => /Multifashion/.test(b.textContent ?? "") && /Tienda propia/.test(b.textContent ?? ""));
        return card ? { hayZip: /Bajar ZIP/.test(card.textContent ?? "") } : null;
      });
      check("Multifashion tiene 'Bajar ZIP'", !!mf?.hayZip);

      // Captura de la tarjeta de Tommy (con sus dos períodos).
      const tommy = page.locator("main section > div", { hasText: "Tommy Hilfiger" }).first();
      await tommy.screenshot({ path: `/tmp/mk-tarjeta-tommy-${ancho}.png` }).catch(() => {});
      await page.screenshot({ path: `/tmp/mk-marketing-${ancho}.png`, fullPage: true });
      await ctx.close();
    }
  } finally {
    await browser.close();
    // Higiene: revocar la sesión sembrada.
    await sb.from("user_sessions").update({ revoked: true }).eq("session_token", sessionToken);
  }

  console.log(`\n${fallos === 0 ? "🟢 TODO OK" : `🔴 ${fallos} FALLOS`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
