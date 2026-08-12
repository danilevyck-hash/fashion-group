// Medición REAL en navegador del flujo "Registrar gasto" rediseñado
// (12-ago-2026): cliente obligatorio, "Gasto de la marca" con sub-opciones,
// marca preseleccionada, y la pantalla de éxito de la entrega con su nota.
//
// 12-ago-2026 (noche): el cliente pasó a ser SOLO de la lista (ClientePicker
// sin "Otro"). El script ahora ELIGE un cliente del desplegable en vez de
// tipear texto libre, mide el paso 2 con el PICKER ABIERTO (la lista flota en
// <body>, así que se mide junto con el modal) y verifica que el texto libre
// NO encienda Continuar.
//
// SOLO LECTURA CONTRA LA BASE. Toda ESCRITURA se INTERCEPTA en el navegador
// (page.route) y se contesta con un doble — el POST de proyectos, el POST de
// la entrega y los datos de la nota nunca llegan a producción. Es el mismo
// patrón de scripts/_medir-saldos-banco.mjs.
//
// Qué mide, en 390 · 834 · 1024 · 1440, contra el build de producción:
//   A. ARRASTRE DE PÁGINA  B. RECORTADOS sin scroller  C. TÁCTILES < 44 px
//   D. TEXTOS < 12 px
// en: paso 1 (los 3 caminos) · factura paso 2 (cliente obligatorio + marca
// fija) · factura form · mueble form · éxito de la entrega con la nota ·
// gasto de la marca (sub-opciones, impulsadora, otro gasto → form).
//
// GOTCHAS medidos de este repo: cookie firmada + sessionStorage.cxc_role +
// `delete Navigator.prototype.serviceWorker` antes de navegar.
//
//   PORT=3184 SALIDA=/tmp/mk-gasto node scripts/_medir-marketing-gasto-flujo.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const PORT = process.env.PORT ?? "3184";
const BASE = process.env.BASE ?? `http://localhost:${PORT}`;
const SALIDA = process.env.SALIDA ?? "/tmp/mk-gasto";
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
  const roots = [...document.querySelectorAll(${JSON.stringify(raiz)})];
  if (roots.length === 0) return { falta: ${JSON.stringify(raiz)} };
  const recortados = [], chicos = [], textosChicos = [];
  const todos = roots.flatMap((r) => [...r.querySelectorAll("*")]);
  for (const el of todos) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    // El sr-only de ClientePicker mide 1 px a propósito (texto solo para
    // lectores de pantalla): contarlo como recorte sería ruido — el mismo
    // criterio de scripts/_medir-guias-sugerencias-anchos.mjs.
    const esSrOnly = (el.className || "").toString().includes("sr-only");
    const desborde = el.scrollWidth - el.clientWidth;
    if (desborde > 1 && cs.overflowX === "hidden" && !esSrOnly) {
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
  return { arrastrePagina, recortados, chicos, textosChicos };
})()`;

// Los dos z del sistema: el modal de gasto (z-50) y el de entrega (z-[60]).
const MODAL = "div.fixed.inset-0.z-50 > div.relative, div.fixed.inset-0.z-\\[60\\] > div.relative";
// El paso 2 con la lista de clientes abierta: la lista flota en <body>
// (DesplegableFlotante), así que se mide como segunda raíz junto al modal.
const MODAL_Y_PICKER = `${MODAL}, [data-desplegable="cliente"]`;

const ok = (m) =>
  m.falta
    ? `FALTA ${m.falta}`
    : `arrastre ${m.arrastrePagina} · recortados ${m.recortados.length} · táctiles<44 ${m.chicos.length} · texto<12 ${m.textosChicos.length}`;

const NOTA_FAKE = {
  entregaId: "e-fake",
  numero: 22,
  fecha: "2026-08-12",
  cliente: "Nova Lux, S.A.",
  clienteCodigo: "D-170",
  tienda: "Nova Lux",
  proyecto: "Apertura",
  items: [{ articulo: "Paneles", cantidad: 2, bultos: 1, precioUnitario: 130 }],
  porMarca: [{ marca: "Calvin Klein", monto: 260 }],
  total: 260,
  notas: null,
};

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

    // 🔴 NINGUNA ESCRITURA LLEGA A LA BASE: POST/PUT/PATCH/DELETE de la API
    // se contestan acá. Los GET pasan (son lectura).
    await page.route("**/api/marketing/**", async (route) => {
      const req = route.request();
      const url = req.url();
      const met = req.method();
      if (met === "GET") {
        if (url.includes("/entregas-pdf/e-fake/")) {
          return route.fulfill({ json: NOTA_FAKE });
        }
        return route.continue();
      }
      if (met === "POST" && url.includes("/api/marketing/proyectos")) {
        return route.fulfill({
          json: { id: "p-fake", tienda: "Tienda de prueba", nombre: "Tienda de prueba" },
        });
      }
      if (met === "POST" && url.includes("/inventario/entregas")) {
        return route.fulfill({ json: { id: "e-fake" } });
      }
      return route.fulfill({ json: { ok: true } });
    });

    const caso = {};
    const foto = async (nombre) => {
      if (!t.captura) return;
      await page.screenshot({ path: path.join(SALIDA, `${nombre}-${t.nombre}.png`), fullPage: true });
    };
    const medir = async (clave, nombre, raiz = MODAL) => {
      caso[clave] = await page.evaluate(MEDIR(raiz));
      await foto(nombre);
    };
    const abrirModal = async () => {
      // Desde la página de la MARCA (Calvin): marcaInicial puesta.
      await page.goto(`${BASE}/marketing/calvin-klein`, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      await page.getByRole("button", { name: /Registrar gasto/ }).first().click();
      await page.waitForTimeout(450);
    };
    // El cliente se ELIGE de la lista (D-XXX) — el texto libre ya no pasa.
    const elegirCliente = async () => {
      const input = page.locator('input[placeholder="Busca la tienda…"]');
      await input.click();
      await input.fill("city");
      await page.waitForSelector('[data-desplegable="cliente"] button', { timeout: 15000 });
      await page.locator('[data-desplegable="cliente"] button').first().dispatchEvent("mousedown");
      await page.waitForTimeout(350);
    };
    const continuar = async () => {
      await page.getByRole("button", { name: /Continuar/ }).first().click();
      await page.waitForTimeout(1000);
    };

    // 1. Paso 1 — los 3 caminos (con "Gasto de la marca").
    await abrirModal();
    await medir("paso1", "paso1");

    // 2. Factura: paso 2 (cliente obligatorio, marca en renglón fijo) + form.
    await page.click('[data-camino="factura"]');
    await page.waitForTimeout(450);
    await medir("facturaPaso2", "factura-datos");
    caso.marcaFija = await page.evaluate(
      `document.body.innerText.includes("Calvin Klein") && !document.querySelector('[data-marca]')`,
    );
    caso.continuarSinCliente = await page
      .getByRole("button", { name: /Continuar/ })
      .first()
      .isEnabled();
    // 🔴 Texto libre que no matchea: Continuar sigue APAGADO y la lista dice
    // el camino (darlo de alta en Switch). Se mide con el picker abierto.
    {
      const input = page.locator('input[placeholder="Busca la tienda…"]');
      await input.click();
      await input.fill("tienda que no existe zz");
      await page.waitForSelector('[data-desplegable="cliente"]', { timeout: 15000 });
      await page.waitForTimeout(400);
      caso.continuarConTextoLibre = await page
        .getByRole("button", { name: /Continuar/ })
        .first()
        .isEnabled();
      caso.avisoAltaEnSwitch = await page.evaluate(
        `document.querySelector('[data-desplegable="cliente"]')?.textContent.includes("darlo de alta en Switch") ?? false`,
      );
      caso.sinSalidaOtro = await page.evaluate(
        `!(document.querySelector('[data-desplegable="cliente"]')?.textContent.includes("Otro — guardar") ?? false)`,
      );
    }
    // El picker ABIERTO con resultados reales, medido modal + lista juntos.
    {
      const input = page.locator('input[placeholder="Busca la tienda…"]');
      await input.fill("city");
      await page.waitForSelector('[data-desplegable="cliente"] button', { timeout: 15000 });
      await medir("facturaPickerAbierto", "factura-picker", MODAL_Y_PICKER);
    }
    await elegirCliente();
    await continuar();
    await medir("facturaForm", "factura-form");

    // 3. Mueble: form de entrega + PANTALLA DE ÉXITO con la nota.
    await abrirModal();
    await page.click('[data-camino="mueble"]');
    await page.waitForTimeout(450);
    await elegirCliente();
    await continuar();
    await medir("muebleForm", "mueble-form");
    // La marca viene heredada (Calvin ya marcada): solo falta el kit.
    await page.locator("#entrega-paneles").fill("2");
    await page.waitForTimeout(300);
    const registrar = page.getByRole("button", { name: "Registrar entrega" });
    if (await registrar.isEnabled()) {
      await registrar.click(); // interceptado: no escribe
      await page.waitForTimeout(900);
      await medir("entregaExito", "entrega-exito");
      caso.exitoTieneNota = await page.evaluate(
        `!!document.evaluate('//button[contains(., "Compartir")]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue`,
      );
    } else {
      caso.entregaExito = { falta: "Registrar entrega deshabilitado" };
      fallas++;
    }

    // 4. Gasto de la marca: sub-opciones → impulsadora → otro gasto → form.
    await abrirModal();
    await page.click('[data-camino="marca"]');
    await page.waitForTimeout(450);
    await medir("marcaSubopciones", "marca-subopciones");
    await page.click('[data-subgasto="impulsadora"]');
    await page.waitForSelector("[data-impulsadora]", { timeout: 15000 });
    await medir("marcaImpulsadora", "marca-impulsadora");
    await page.click('[data-subgasto="otro"]');
    await page.waitForTimeout(450);
    await medir("marcaOtro", "marca-otro");
    await continuar(); // proyecto null: no toca la red
    await medir("marcaOtroForm", "marca-otro-form");

    for (const [k, v] of Object.entries(caso)) {
      if (v && typeof v === "object" && !("falta" in v) && "arrastrePagina" in v) {
        if (v.arrastrePagina > 0 || v.recortados.length || v.chicos.length || v.textosChicos.length) {
          fallas++;
        }
      }
    }
    // Los booleanos del candado de cliente también cuentan como falla.
    if (caso.continuarSinCliente) fallas++;
    if (caso.continuarConTextoLibre) fallas++;
    if (caso.avisoAltaEnSwitch === false) fallas++;
    if (caso.sinSalidaOtro === false) fallas++;
    informe[t.nombre] = caso;
    console.log(`\n═══ ${t.nombre}px ═══`);
    for (const [k, v] of Object.entries(caso)) {
      if (v && typeof v === "object" && ("arrastrePagina" in v || "falta" in v)) {
        console.log(`  ${k.padEnd(18)} ${ok(v)}`);
      } else {
        console.log(`  ${k.padEnd(18)} ${JSON.stringify(v)}`);
      }
    }
    await ctx.close();
  }

  writeFileSync(path.join(SALIDA, "informe.json"), JSON.stringify(informe, null, 2));
  console.log(`\n${fallas === 0 ? "🟢 TODO EN CERO" : `🔴 ${fallas} casos con hallazgos`} → ${SALIDA}/informe.json`);
  await browser.close();
  process.exit(0);
})();
