// Medición REAL en navegador — Marketing SIN el atajo de cierre conjunto
// (11-ago-2026, Daniel: *"que sea por separado mejor no?"*).
//
// SOLO LECTURA. Se abre el modal de cerrar UNA marca para medirlo y se cierra
// con Cancelar. Nunca se escribe el nombre del período ni se aprieta el botón
// de confirmar.
//
// Qué verifica, en 390 · 834 · 1024 · 1440, contra el build de producción:
//   1. La cabecera gris "Tommy · Calvin · Karl se cierran juntas" NO está, y
//      el botón "Cerrar las tres" TAMPOCO — si aparecen, el script FALLA.
//   2. Cada marca con gasto sigue teniendo SU botón "Cerrar" y su "Bajar ZIP".
//   3. Arrastre de página 0 · recortados 0 · blancos táctiles <44 px 0 ·
//      textos <12 px 0, en el inicio y en el modal de cierre de una marca.
//
// GOTCHAS medidos de este repo (no tocar sin leer):
//   * Sembrar la COOKIE de sesión firmada o todo redirige al login.
//   * Y ADEMÁS sessionStorage.cxc_role: useAuth lo lee de AHÍ.
//   * Y `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
//   PORT=3199 SALIDA=/tmp/mk-separado node scripts/_medir-marketing-cierre-separado.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const PORT = process.env.PORT ?? "3199";
const BASE = process.env.BASE ?? `http://localhost:${PORT}`;
const SALIDA = process.env.SALIDA ?? "/tmp/mk-separado";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const TAMANOS = [
  { nombre: "390", width: 390, height: 844, movil: true, captura: true },
  { nombre: "834", width: 834, height: 1194, movil: true, captura: true },
  { nombre: "1024", width: 1024, height: 768, movil: false, captura: false },
  { nombre: "1440", width: 1440, height: 900, movil: false, captura: true },
];

const MEDIR = (raiz) => `(() => {
  const doc = document.documentElement;
  const arrastrePagina = doc.scrollWidth - doc.clientWidth;
  const root = document.querySelector(${JSON.stringify(raiz)});
  if (!root) return { falta: ${JSON.stringify(raiz)} };
  const cs0 = getComputedStyle(root);
  const anchoUtil = Math.round(
    root.getBoundingClientRect().width -
      parseFloat(cs0.paddingLeft) - parseFloat(cs0.paddingRight),
  );
  const recortados = [], chicos = [], textosChicos = [];
  for (const el of root.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    const desborde = el.scrollWidth - el.clientWidth;
    if (desborde > 1 && cs.overflowX === "hidden") {
      recortados.push({
        tag: el.tagName.toLowerCase(),
        clase: (el.className || "").toString().slice(0, 60),
        px: desborde,
        texto: (el.textContent || "").trim().slice(0, 40),
      });
    }
    if (["BUTTON","A","INPUT","SELECT","TEXTAREA"].includes(el.tagName)) {
      const srOnly = (el.className || "").toString().includes("sr-only");
      if (cs.display !== "none" && !srOnly && r.height > 0 && r.height < 44) {
        chicos.push({
          tag: el.tagName.toLowerCase(),
          alto: Math.round(r.height * 10) / 10,
          texto: (el.textContent || el.getAttribute("placeholder") || "").trim().slice(0, 40),
        });
      }
    }
    const propio = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim()).join(" ");
    if (propio) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) textosChicos.push({ px: fs, texto: propio.slice(0, 40) });
    }
  }
  return { arrastrePagina, anchoUtil, recortados, chicos, textosChicos };
})()`;

const MODAL = "div.fixed.inset-0.z-50, div.fixed.inset-0.z-\\[60\\]";

const ok = (m) =>
  m.falta
    ? `FALTA ${m.falta}`
    : `arrastre ${m.arrastrePagina} · recortados ${m.recortados.length} · táctiles<44 ${m.chicos.length} · texto<12 ${m.textosChicos.length}`;

(async () => {
  mkdirSync(SALIDA, { recursive: true });
  const browser = await chromium.launch();
  const informe = {};
  let fallas = 0;

  for (const t of TAMANOS) {
    const ctx = await browser.newContext({
      viewport: { width: t.width, height: t.height },
      isMobile: t.movil,
      hasTouch: t.movil,
      deviceScaleFactor: 2,
    });
    await ctx.addCookies([
      { name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" },
    ]);
    await ctx.addInitScript(() => {
      try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
      try { delete Navigator.prototype.serviceWorker; } catch {}
    });
    const page = await ctx.newPage();
    const caso = {};

    await page.goto(`${BASE}/marketing`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);

    // ---- 1. La cabecera y el atajo NO pueden estar --------------------------
    const textoMain = await page.evaluate(
      `(document.querySelector("main")?.innerText || "")`,
    );
    caso.atajoAusente = {
      cerrarLasTres: /Cerrar las tres/.test(textoMain),
      seCierranJuntas: /se cierran juntas/i.test(textoMain),
    };
    if (caso.atajoAusente.cerrarLasTres || caso.atajoAusente.seCierranJuntas) {
      fallas += 1;
    }

    // ---- 2. Cada marca con gasto conserva SU cierre -------------------------
    caso.botonesCerrar = await page
      .getByRole("button", { name: "Cerrar", exact: true })
      .count();
    caso.botonesZip = await page
      .getByRole("button", { name: "Bajar ZIP", exact: true })
      .count();

    // ---- 3. Medición del inicio --------------------------------------------
    caso.inicio = await page.evaluate(MEDIR("main"));
    if (t.captura) {
      await page.screenshot({
        path: path.join(SALIDA, `inicio-${t.nombre}.png`),
        fullPage: true,
      });
    }

    // ---- 4. El modal de cerrar UNA marca (se cierra con Cancelar) ----------
    const cerrarUno = page.getByRole("button", { name: "Cerrar", exact: true });
    if (await cerrarUno.count()) {
      await cerrarUno.first().click();
      await page.waitForTimeout(450);
      caso.cierreMarca = await page.evaluate(MEDIR(MODAL));
      caso.tituloModal = await page.evaluate(`(() => {
        const m = document.querySelector(${JSON.stringify(MODAL)});
        return (m?.querySelector("h2")?.textContent || "").trim();
      })()`);
      if (t.captura) {
        await page.screenshot({
          path: path.join(SALIDA, `cierre-marca-${t.nombre}.png`),
          fullPage: true,
        });
      }
      await page.getByRole("button", { name: "Cancelar" }).first().click();
      await page.waitForTimeout(300);
    } else {
      caso.cierreMarca = { falta: "no hay marca con período abierto y gasto" };
    }

    informe[t.nombre] = caso;
    await ctx.close();

    console.log(`\n=== ${t.nombre} px ===`);
    console.log(
      `  atajo conjunto     ${caso.atajoAusente.cerrarLasTres || caso.atajoAusente.seCierranJuntas ? "🔴 TODAVÍA ESTÁ" : "✅ ausente"}`,
    );
    console.log(
      `  cierres por marca  botones "Cerrar": ${caso.botonesCerrar} · "Bajar ZIP": ${caso.botonesZip}`,
    );
    for (const k of ["inicio", "cierreMarca"]) {
      const m = caso[k];
      console.log(`  ${k.padEnd(18)} ${ok(m)}${m.anchoUtil ? ` (útil ${m.anchoUtil})` : ""}`);
      if (m.recortados?.length) console.log("     recortados:", JSON.stringify(m.recortados));
      if (m.chicos?.length) console.log("     táctiles:", JSON.stringify(m.chicos));
      if (m.textosChicos?.length) console.log("     textos:", JSON.stringify(m.textosChicos));
      if (!m.falta) {
        fallas +=
          (m.arrastrePagina > 0 ? 1 : 0) + m.recortados.length +
          m.chicos.length + m.textosChicos.length;
      }
    }
    if (caso.tituloModal) console.log(`  modal: "${caso.tituloModal}"`);
  }

  writeFileSync(path.join(SALIDA, "informe.json"), JSON.stringify(informe, null, 2));
  await browser.close();
  console.log(`\nCapturas e informe en ${SALIDA}`);
  console.log(fallas === 0 ? "\n🟢 0 hallazgos en los cuatro anchos." : `\n🔴 ${fallas} hallazgos.`);
})();
