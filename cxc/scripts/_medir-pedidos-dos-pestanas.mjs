// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA. Mide los TRES anchos (+ el iPad acostado) de la lista de
// pedidos con las DOS pestañas, en los 4 catálogos.
//
//   BASE=http://localhost:3111 node scripts/_medir-pedidos-dos-pestanas.mjs
//
// 🔴 NO toca ningún botón que guarde: solo cambia de pestaña (estado local).
//
// Gotchas de medición de la casa:
//   · sembrar `sessionStorage.cxc_role`, si no `useAuth` redirige al login;
//   · `delete Navigator.prototype.serviceWorker` ANTES de navegar;
//   · un scroller DECLARADO (`overflow-x:auto`) no es un recorte: es el
//     mecanismo. Se excluye.
//
// El script FALLA si no encuentra las DOS pestañas, si aparece una tercera, o
// si en «Pedidos a Switch» hay una fila sin número — medir cero y dar verde sin
// haber mirado nada es el peor resultado posible.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3111";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const SALIDA = "/tmp/t203b-pedidos";
const ANCHOS = [390, 834, 1024, 1440];
const MARCAS = ["reebok", "joybees", "tommy", "calvin"];

mkdirSync(SALIDA, { recursive: true });

const MEDIR = () => {
  const de = document.documentElement;
  const arrastrePagina = Math.max(0, de.scrollWidth - de.clientWidth);

  const recortados = [...document.querySelectorAll("body div *")]
    .filter((e) => {
      const s = getComputedStyle(e);
      if (s.overflowX === "auto" || s.overflowX === "scroll") return false;
      return e.clientWidth > 1 && e.scrollWidth - e.clientWidth > 2;
    })
    .map((e) => ({ tag: e.tagName, cls: (e.className || "").toString().slice(0, 50), px: e.scrollWidth - e.clientWidth }));

  const chicos = [...document.querySelectorAll("button, a, input, select")]
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.height < 44;
    })
    .map((e) => ({ txt: (e.textContent || "").trim().slice(0, 24), alto: Math.round(e.getBoundingClientRect().height) }));

  const textoChico = [...document.querySelectorAll("body *")]
    .filter((e) => {
      if (!e.textContent || !e.textContent.trim()) return false;
      if (e.children.length > 0) return false;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      return fs > 0 && fs < 12;
    })
    .map((e) => ({ txt: e.textContent.trim().slice(0, 24), px: parseFloat(getComputedStyle(e).fontSize) }));

  const pestanas = [...document.querySelectorAll("button[aria-pressed]")].map((b) =>
    (b.textContent || "").replace(/\s+/g, " ").trim(),
  );

  // Filas visibles y su número de Switch (el chip vive en la misma fila).
  const filas = [...document.querySelectorAll("[data-pedido]")].map((f) => ({
    pedido: f.getAttribute("data-pedido"),
    texto: (f.textContent || "").replace(/\s+/g, " ").trim(),
  }));

  return { arrastrePagina, recortados, chicos, textoChico, pestanas, filas };
};

const browser = await chromium.launch();
let fallos = 0;
let medidos = 0;

for (const marca of MARCAS) {
  for (const ancho of ANCHOS) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    await ctx.addCookies([{ name: "cxc_session", value: COOKIE, domain: new URL(BASE).hostname, path: "/" }]);
    // 🩸 GOTCHAS de medición de la casa, y los DOS hacen falta:
    //   · `cxc_role` solo NO alcanza — `hasModuleAccess` mira `fg_modules`, y
    //     sin esa clave la pantalla se redirige sola al login a los ~2 s. La
    //     primera corrida midió 0 pestañas por esto (y el script FALLÓ, que es
    //     justo lo que tiene que hacer en vez de dar verde sin haber mirado).
    //   · `delete Navigator.prototype.serviceWorker` ANTES de navegar.
    await ctx.addInitScript(() => {
      try { delete Navigator.prototype.serviceWorker; } catch {}
      sessionStorage.setItem("cxc_role", "admin");
      sessionStorage.setItem("fg_user_name", "medicion-t203b");
      sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/catalogo/${marca}/pedidos`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);

    for (const pestana of ["Borradores", "Pedidos a Switch"]) {
      if (pestana === "Pedidos a Switch") {
        const b = page.locator("button[aria-pressed]", { hasText: /Pedidos a Switch/ });
        if (await b.count()) { await b.first().click(); await page.waitForTimeout(400); }
      }
      const r = await page.evaluate(MEDIR);

      // ¿Se midió algo de verdad?
      if (r.pestanas.length !== 2) {
        console.log(`  🔴 ${marca} @${ancho} [${pestana}]: esperaba 2 pestañas, hay ${r.pestanas.length} → ${JSON.stringify(r.pestanas)}`);
        fallos++;
        continue;
      }
      if (!/^Borradores/.test(r.pestanas[0]) || !/^Pedidos a Switch/.test(r.pestanas[1])) {
        console.log(`  🔴 ${marca} @${ancho}: pestañas inesperadas → ${JSON.stringify(r.pestanas)}`);
        fallos++;
        continue;
      }
      medidos++;

      // En «Pedidos a Switch», TODA fila tiene que mostrar su número.
      let sinNumero = [];
      if (pestana === "Pedidos a Switch") {
        sinNumero = r.filas.filter((f) => !/#\d|en Switch, sin número/.test(f.texto)).map((f) => f.pedido);
      }

      const mal = r.arrastrePagina > 0 || sinNumero.length > 0;
      if (mal) fallos++;
      console.log(
        `  ${mal ? "🔴" : "✅"} ${marca.padEnd(8)} @${String(ancho).padStart(4)} [${pestana.padEnd(17)}] ` +
        `arrastre ${r.arrastrePagina}px · recortados ${r.recortados.length} · <44px ${r.chicos.length} · ` +
        `texto<12px ${r.textoChico.length} · filas ${r.filas.length}` +
        (sinNumero.length ? `  ← SIN NÚMERO: ${sinNumero.join(", ")}` : ""),
      );
      if (r.recortados.length) for (const x of r.recortados.slice(0, 3)) console.log(`        recorte ${x.px}px  ${x.tag}.${x.cls}`);
      if (r.chicos.length) for (const x of r.chicos.slice(0, 3)) console.log(`        táctil ${x.alto}px  "${x.txt}"`);
      if (r.textoChico.length) for (const x of r.textoChico.slice(0, 3)) console.log(`        texto ${x.px}px  "${x.txt}"`);

      await page.screenshot({ path: `${SALIDA}/${marca}-${ancho}-${pestana.replace(/\s+/g, "_")}.png` });
    }
    await ctx.close();
  }
}

await browser.close();
console.log("");
console.log("════════════════════════════════════════════");
console.log(`  pantallas medidas: ${medidos}   ·   fallos: ${fallos}`);
console.log("════════════════════════════════════════════");
if (medidos === 0) { console.log("🔴 NO se midió NADA. Falla."); process.exit(1); }
process.exit(fallos === 0 ? 0 : 1);
