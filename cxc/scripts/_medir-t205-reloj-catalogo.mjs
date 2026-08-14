// Los 3 anchos (+ el iPad acostado) del indicador "Sincronizado con Switch
// hace X" del catálogo, en el navegador contra el BUILD DE PRODUCCIÓN y con
// DATOS DE PRODUCCIÓN. Solo lectura: NUNCA toca "Actualizar ahora".
//
// 🩸 GOTCHAS DE MEDICIÓN (los dos ya mordieron a este repo):
//   · sin `delete Navigator.prototype.serviceWorker` el SW mata la hidratación;
//   · sin sembrar `sessionStorage.cxc_role` la pantalla redirige al login y el
//     script mide una página vacía y pasa en verde sin haber mirado nada.
// Por eso este script FALLA si no encuentra el texto del indicador.
//
//   BASE=http://localhost:3205 node scripts/_medir-t205-reloj-catalogo.mjs
import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3205";
const COOKIE = readFileSync(process.env.COOKIE_FILE ?? "/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];
const MARCAS = ["tommy", "reebok", "calvin", "joybees"];

const navegador = await chromium.launch();
let fallas = 0;

for (const marca of MARCAS) {
  for (const ancho of ANCHOS) {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: 900 } });
    await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
    await ctx.addInitScript(() => {
      try { delete Navigator.prototype.serviceWorker; } catch { /* noop */ }
      sessionStorage.setItem("cxc_role", "admin");
      sessionStorage.setItem("cxc_user", "medicion");
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/catalogos/admin/${marca}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const r = await page.evaluate(() => {
      const txt = document.body.innerText;
      // Dos redacciones vivas: Reebok muestra el relativo ("Sincronizado con
      // Switch hace X") y Tommy/Calvin/Joybees el sello absoluto en hora de
      // Panamá ("· sincronizado 14 ago, 10:39 a. m."). Se acepta cualquiera.
      const m =
        txt.match(/[^\n]*Sincronizado con Switch (hace [^\n·]+|sin datos)[^\n]*/i) ||
        // 🩸 el separador de `toLocaleString("es-PA")` es un GUION ("14-ago"),
        // no un espacio: con `\d{1,2}\s+\w+` el chequeo no encontraba nada y
        // daba rojo con el indicador a la vista.
        txt.match(/[^\n]*·\s*sincronizado\s+\d{1,2}[-\s]\w+[^\n]*/i);
      const doc = document.documentElement;
      // Recortes / desbordes / táctiles / textos chicos, sobre todo lo visible.
      let recorte = 0, tactiles = 0, chicos = 0;
      for (const el of document.querySelectorAll("*")) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        if (cs.overflowX === "hidden" && el.scrollWidth - el.clientWidth > 100) recorte++;
        if ((el.tagName === "BUTTON" || el.tagName === "A") &&
            (rect.height < 44 || rect.width < 44) && el.offsetParent) tactiles++;
        const fs = parseFloat(cs.fontSize);
        if (fs && fs < 12 && el.children.length === 0 && (el.textContent || "").trim()) chicos++;
      }
      return {
        linea: m ? m[0].trim() : null,
        arrastre: Math.max(0, doc.scrollWidth - doc.clientWidth),
        recorte, tactiles, chicos,
      };
    });

    const ok = r.linea !== null && r.arrastre === 0;
    if (!ok) fallas++;
    console.log(
      `${ok ? "🟢" : "🔴"} ${marca.padEnd(8)} ${String(ancho).padStart(4)} px · arrastre ${r.arrastre} · ` +
      `recorte ${r.recorte} · táctiles<44 ${r.tactiles} · textos<12 ${r.chicos} · ${r.linea ?? "(NO SE ENCONTRÓ EL INDICADOR)"}`,
    );
    await ctx.close();
  }
}

await navegador.close();
console.log(fallas === 0 ? "🟢 OK" : `🔴 ${fallas} caso(s) con problema`);
process.exit(fallas === 0 ? 0 : 1);
