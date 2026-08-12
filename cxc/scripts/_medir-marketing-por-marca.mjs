// Medición REAL en navegador del Marketing POR MARCA (11-ago-2026).
//
// SOLO LECTURA. No se toca ningún botón que escriba: el camino de "Registrar
// gasto" se recorre SIN cliente a propósito, porque con cliente el paso
// "Continuar" CREA un proyecto en producción. Nunca se aprieta Guardar, ni
// Cerrar, ni Bajar ZIP.
//
// Qué mide, en 390 · 834 · 1024 · 1440, contra el build de producción:
//   A. ARRASTRE DE PÁGINA — documentElement.scrollWidth − clientWidth.
//   B. RECORTADOS — elementos cuyo contenido se sale de su caja SIN scroller
//      (overflow-x: hidden). Un `overflow-x: auto` no cuenta: se puede arrastrar.
//   C. BLANCOS TÁCTILES < 44 px.
//   D. TEXTOS < 12 px.
//   E. ANCHO ÚTIL de la raíz medida (el número que decide, no el viewport).
//
// 🔑 1024 NO ES "ESCRITORIO": es el iPad acostado, y la barra lateral se lleva
// 224 px, así que deja 766 px útiles. Es el ancho que nadie mira.
//
// GOTCHAS medidos de este repo (no tocar sin leer):
//   * Hay que sembrar la COOKIE de sesión firmada o todo redirige al login.
//   * Y ADEMÁS sessionStorage.cxc_role: useAuth lo lee de AHÍ.
//   * Y `delete Navigator.prototype.serviceWorker` ANTES de navegar, o se
//     rompe la hidratación.
//
//   PORT=3175 SALIDA=/tmp/mk-marca node scripts/_medir-marketing-por-marca.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const PORT = process.env.PORT ?? "3175";
const BASE = process.env.BASE ?? `http://localhost:${PORT}`;
const SALIDA = process.env.SALIDA ?? "/tmp/mk-marca";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const TAMANOS = [
  { nombre: "390", width: 390, height: 844, movil: true, captura: true },
  { nombre: "834", width: 834, height: 1194, movil: true, captura: true },
  { nombre: "1024", width: 1024, height: 768, movil: false, captura: false },
  { nombre: "1440", width: 1440, height: 900, movil: false, captura: true },
];

/**
 * `raiz` = "main" para la pantalla, o el panel del modal cuando hay uno
 * abierto: medir <main> con un modal encima mide lo que está tapado.
 */
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
    // B. recortado: se sale de su caja y NADIE puede arrastrar.
    const desborde = el.scrollWidth - el.clientWidth;
    if (desborde > 1 && cs.overflowX === "hidden") {
      recortados.push({
        tag: el.tagName.toLowerCase(),
        clase: (el.className || "").toString().slice(0, 60),
        px: desborde,
        texto: (el.textContent || "").trim().slice(0, 40),
      });
    }
    // C. blancos táctiles. El sr-only mide 1 px a propósito: es ruido.
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
    // D. textos bajo 12 px (solo nodos con texto PROPIO).
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

// El panel del modal que esté encima (RegistrarGasto / Cerrar / Entrega / Pago).
const MODAL = "div.fixed.inset-0.z-50, div.fixed.inset-0.z-\\[60\\]";

const clic = async (page, texto, exacto = false) => {
  const loc = page.getByRole("button", { name: texto, exact: exacto });
  await loc.first().click();
  await page.waitForTimeout(450);
};

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

    const ir = async () => {
      await page.goto(`${BASE}/marketing`, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
    };

    // ---------------- 1. INICIO ----------------
    await ir();
    caso.inicio = await page.evaluate(MEDIR("main"));
    if (t.captura) {
      await page.screenshot({
        path: path.join(SALIDA, `inicio-${t.nombre}.png`),
        fullPage: true,
      });
    }
    // Lo que dice cada bloque, para leerlo sin abrir el navegador.
    caso.bloques = await page.evaluate(`(() => {
      const sec = document.querySelectorAll("main section");
      const out = [];
      for (const s of sec) {
        for (const d of s.children) {
          const t = (d.innerText || "").trim();
          if (t) out.push(t.replace(/\\n+/g, " | "));
        }
      }
      return out;
    })()`);

    // ---------------- 2. REGISTRAR GASTO — paso 1 ----------------
    await clic(page, /Registrar gasto/);
    caso.gastoPaso1 = await page.evaluate(MEDIR(MODAL));
    if (t.captura) {
      await page.screenshot({
        path: path.join(SALIDA, `registrar-gasto-${t.nombre}.png`),
        fullPage: true,
      });
    }

    // ---------------- 3. LOS TRES CAMINOS ----------------
    // SIN CLIENTE en los tres: con cliente, "Continuar" crearía un proyecto.
    // Los ganchos son `data-camino` / `data-marca` / `data-impulsadora`: el
    // nombre accesible de esos botones incluye su texto de ayuda, así que
    // buscarlos por texto se rompe en cuanto la ayuda cambia una coma.
    for (const key of ["factura", "mueble", "impulsadora"]) {
      await ir();
      await clic(page, /Registrar gasto/);
      await page.click(`[data-camino="${key}"]`);
      await page.waitForTimeout(450);
      // Paso 2: elegir lo mínimo para poder continuar. SIN CLIENTE siempre.
      if (key === "impulsadora") {
        // La lista se pide al entrar al camino: hay que esperarla, si no se
        // mide un esqueleto y "Continuar" queda apagado.
        await page.waitForSelector("[data-impulsadora]", { timeout: 15000 });
        await page.locator("[data-impulsadora]").first().click();
      } else {
        const marcas = page.locator("[data-marca]");
        if (await marcas.count()) await marcas.first().click();
      }
      await page.waitForTimeout(300);
      caso[`${key}Paso2`] = await page.evaluate(MEDIR(MODAL));
      if (t.captura) {
        await page.screenshot({
          path: path.join(SALIDA, `gasto-${key}-datos-${t.nombre}.png`),
          fullPage: true,
        });
      }
      // Paso 3: el formulario. Sin cliente NO hay escritura.
      const cont = page.getByRole("button", { name: /Continuar/ });
      if (await cont.count()) {
        const habilitado = await cont.first().isEnabled();
        if (habilitado) {
          await cont.first().click();
          await page.waitForTimeout(1200);
          caso[`${key}Form`] = await page.evaluate(MEDIR(MODAL));
          if (t.captura) {
            await page.screenshot({
              path: path.join(SALIDA, `gasto-${key}-form-${t.nombre}.png`),
              fullPage: true,
            });
          }
        } else {
          caso[`${key}Form`] = { falta: "Continuar deshabilitado" };
        }
      }
    }

    // ---------------- 4. MODAL DE CIERRE (marca y grupo) ----------------
    await ir();
    const cerrarUno = page.getByRole("button", { name: "Cerrar", exact: true });
    if (await cerrarUno.count()) {
      await cerrarUno.first().click();
      await page.waitForTimeout(450);
      caso.cierreMarca = await page.evaluate(MEDIR(MODAL));
      if (t.captura) {
        await page.screenshot({
          path: path.join(SALIDA, `cierre-marca-${t.nombre}.png`),
          fullPage: true,
        });
      }
    } else {
      caso.cierreMarca = { falta: "no hay marca con período abierto y gasto" };
    }

    await ir();
    const cerrarTres = page.getByRole("button", { name: /Cerrar las tres/ });
    if (await cerrarTres.count()) {
      await cerrarTres.first().click();
      await page.waitForTimeout(450);
      caso.cierreGrupo = await page.evaluate(MEDIR(MODAL));
      if (t.captura) {
        await page.screenshot({
          path: path.join(SALIDA, `cierre-grupo-${t.nombre}.png`),
          fullPage: true,
        });
      }
    } else {
      caso.cierreGrupo = { falta: "no se dibujó 'Cerrar las tres'" };
    }

    // ---------------- 5. EL AVISO DE LO QUE FALTA ----------------
    // 🩸 Hoy en producción las marcas que se pueden cerrar tienen 0 y 0, así
    // que el aviso NO se dibuja — que es lo correcto, pero deja el camino sin
    // medir. Se INTERCEPTA la respuesta del API (solo lectura: no se escribe
    // nada en ningún lado) para ponerle pendientes al primer bloque y ver el
    // aviso en el bloque y en el modal de cierre.
    await page.route("**/api/marketing/inicio", async (route) => {
      const res = await route.fetch();
      const j = await res.json();
      const b = (j.bloques ?? []).find((x) => x.periodoAbierto?.id && x.total > 0);
      if (b) { b.sinComprobante = 2; b.sinFoto = 3; }
      await route.fulfill({ response: res, body: JSON.stringify(j) });
    });
    await ir();
    caso.avisoBloque = await page.evaluate(MEDIR("main"));
    caso.textoAviso = await page.evaluate(`(() => {
      const t = (document.querySelector("main")?.innerText || "");
      return t.split(String.fromCharCode(10)).filter((l) => /sin comprobante|sin foto/.test(l));
    })()`);
    const cerrarConAviso = page.getByRole("button", { name: "Cerrar", exact: true });
    if (await cerrarConAviso.count()) {
      await cerrarConAviso.first().click();
      await page.waitForTimeout(450);
      caso.avisoCierre = await page.evaluate(MEDIR(MODAL));
      caso.textoAvisoCierre = await page.evaluate(`(() => {
        const m = document.querySelector(${JSON.stringify(MODAL)});
        return (m?.innerText || "").split(String.fromCharCode(10)).filter((l) => /comprobante|foto/i.test(l));
      })()`);
      if (t.captura) {
        await page.screenshot({
          path: path.join(SALIDA, `cierre-con-aviso-${t.nombre}.png`),
          fullPage: true,
        });
      }
    }
    await page.unroute("**/api/marketing/inicio");

    informe[t.nombre] = caso;
    await ctx.close();

    console.log(`\n=== ${t.nombre} px ===`);
    for (const [k, m] of Object.entries(caso)) {
      if (k === "bloques" || k.startsWith("texto")) continue;
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
    console.log("  AVISO en el bloque :", JSON.stringify(caso.textoAviso));
    console.log("  AVISO en el cierre :", JSON.stringify(caso.textoAvisoCierre));
    if (t.nombre === "1440") {
      console.log("  BLOQUES:");
      (caso.bloques ?? []).forEach((b) => console.log("   ·", b));
    }
  }

  writeFileSync(path.join(SALIDA, "informe.json"), JSON.stringify(informe, null, 2));
  await browser.close();
  console.log(`\nCapturas e informe en ${SALIDA}`);
  console.log(fallas === 0 ? "\n🟢 0 en los cuatro anchos." : `\n🔴 ${fallas} hallazgos.`);
})();
