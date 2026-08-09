// SOLO LECTURA. Los dos puntos del contrato que no se ven en una captura fija.
//
//   4) el buscador del selector encuentra por coincidencia PARCIAL: escribir
//      "city" tiene que ofrecer City Mall David, City Mall Paso Canoa y
//      City Moda Chorrera. Y "american classics store" tiene que encontrar D-108.
//
//   5) el PEOR CASO de ancho: el nombre más largo de los 148 clientes D-XXX
//      vivos son 47 caracteres ("Sistema Nacional De Proteccion Civil
//      (Sinaproc)", D-138). Ninguna línea de guía está atada a él hoy, así que
//      no alcanza con mirar GT-189: se le mete ese texto AL DOM del chip y se
//      vuelve a medir. Cambia el texto, nada más — no toca la base.
//
// No guarda nada: abre la ventana y la cierra con Cancelar.
//
//   BASE=http://localhost:3095 node scripts/_verif-guias-contrato-visual.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3095";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const PEOR = "Sistema Nacional De Proteccion Civil (Sinaproc)";

const nav = await chromium.launch();
let malos = 0;

for (const ancho of [390, 834, 1440]) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200 });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => { sessionStorage.setItem("cxc_role", "admin"); sessionStorage.setItem("fg_is_owner", "1"); });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/guias`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  await page.evaluate(() => {
    const n = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && /GT-189/.test(e.textContent || ""));
    let el = n[0];
    while (el && getComputedStyle(el).cursor !== "pointer") el = el.parentElement;
    (el || n[0])?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForTimeout(6000);

  console.log(`\n═══ ${ancho} px ═══`);

  // ── 5) PEOR CASO: 47 caracteres dentro del chip ───────────────────────────
  const peor = await page.evaluate((PEOR) => {
    const de = document.documentElement;
    const antes = { arrastre: Math.max(0, de.scrollWidth - de.clientWidth) };
    // El span del nombre dentro del primer chip visible.
    const spans = [...document.querySelectorAll("td span span span")].filter((s) => {
      const r = s.getBoundingClientRect();
      return r.height > 0 && /^[A-Za-zÀ-ÿ]/.test((s.textContent || "").trim());
    });
    if (!spans.length) return { ok: false };
    const original = spans[0].textContent;
    spans[0].textContent = PEOR;
    const r = spans[0].parentElement.parentElement.getBoundingClientRect();
    const out = {
      ok: true,
      arrastreAntes: antes.arrastre,
      arrastreDespues: Math.max(0, de.scrollWidth - de.clientWidth),
      chipW: Math.round(r.width),
      chipH: Math.round(r.height),
      // ¿el texto se ve entero, o quedó cortado?
      cortado: spans[0].scrollWidth > spans[0].clientWidth + 1,
    };
    spans[0].textContent = original;
    return out;
  }, PEOR);

  if (peor.ok) {
    const ok = peor.arrastreDespues === peor.arrastreAntes && !peor.cortado;
    if (!ok) malos++;
    console.log(`   peor caso 47 chars → chip ${peor.chipW}×${peor.chipH} px · arrastre ${peor.arrastreAntes}→${peor.arrastreDespues} px · ${peor.cortado ? "🔴 CORTADO" : "entero ✅"}`);
  } else {
    console.log("   ⚠️ no se encontró un chip para el peor caso");
  }

  // ── 4) el buscador, en el selector REAL ──────────────────────────────────
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /D-\d+/.test(x.textContent || "") && x.closest("td"));
    b?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForTimeout(2500);

  for (const [consulta, esperados] of [
    ["city", ["D-24", "D-25", "D-26"]],
    ["american classics store", ["D-108"]],
    ["CITY MALL", ["D-24", "D-25"]],
  ]) {
    const input = page.locator('[role="dialog"] input').first();
    await input.fill("");
    await input.type(consulta, { delay: 25 });
    await page.waitForTimeout(1200);
    const ofrecidos = await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .filter((b) => /D-\d+\s*$/.test((b.textContent || "").trim()) && b.getBoundingClientRect().height > 0 && !b.closest("td"))
        .map((b) => (b.textContent || "").replace(/\s+/g, " ").trim()),
    );
    const codigos = ofrecidos.map((t) => (t.match(/D-\d+/) || [""])[0]);
    const faltan = esperados.filter((e) => !codigos.includes(e));
    if (faltan.length) malos++;
    console.log(`   "${consulta}" → ${faltan.length === 0 ? "✅" : "🔴 faltan " + faltan.join(", ")}  [${ofrecidos.slice(0, 5).join(" · ")}]`);
  }

  await page.screenshot({ path: `/tmp/guias-chip/contrato-${ancho}.png` });
  // Cerrar SIN guardar.
  await page.evaluate(() => {
    [...document.querySelectorAll("[role=dialog] button")].find((b) => /Cancelar/.test(b.textContent || ""))
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForTimeout(1000);
  await ctx.close();
}
await nav.close();
console.log(malos === 0 ? "\nCONTRATO CUMPLIDO en los 3 anchos.\n" : `\n🔴 ${malos} problema(s).\n`);
process.exit(malos === 0 ? 0 : 1);
