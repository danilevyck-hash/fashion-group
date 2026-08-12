// Medición REAL en navegador de la PODA DE PALABRAS OBVIAS (12-ago-2026).
//
// Qué mide, en 390 / 834 / 1024 / 1440, contra el build de producción y con
// datos de producción (SOLO LECTURA — no se toca ningún botón que escriba):
//   A. ARRASTRE DE PÁGINA — documentElement.scrollWidth − clientWidth.
//   B. RECORTADOS — contenido que se sale de su caja SIN scroller (nadie lo
//      puede alcanzar, ni arrastrando). Los scrollers declarados no cuentan:
//      ésos son el mecanismo.
//   C. BLANCOS TÁCTILES < 44 px.
//   D. TEXTOS < 12 px.
//   E. HUECOS: contenedores que quedaron VACÍOS con margen o padding — el modo
//      de fallo propio de una poda (se saca el texto y queda el agujero).
//
// 🩸 Y lo que de verdad hay que comprobar acá: que lo podado NO SE VEA y que lo
// que se decidió conservar SIGA VIÉNDOSE. `PROHIBIDOS` y `SE_QUEDAN` por
// pantalla; el script FALLA (exit 1) si aparece uno prohibido o falta uno de
// los que se quedan. Sin eso, medir píxeles no prueba nada del cambio.
//
// GOTCHAS (no tocar sin leer):
//   * Hay que sembrar la COOKIE de sesión firmada o todo redirige al login.
//   * Hay que sembrar sessionStorage.cxc_role: useAuth lo lee de AHÍ.
//   * Hay que `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//   * Los ids (período de caja, guía, cliente, proveedor, préstamo, proyecto)
//     se DESCUBREN navegando las listas: hardcodearlos deja el script muerto
//     el día que ese registro se borre.
//
//   PORT=3178 SALIDA=/tmp/poda node scripts/_medir-poda-textos-obvios.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const PORT = process.env.PORT ?? "3178";
const BASE = process.env.BASE ?? `http://localhost:${PORT}`;
const SALIDA = process.env.SALIDA ?? "/tmp/poda-textos";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const TAMANOS = [
  { nombre: "390", width: 390, height: 844, movil: true },
  { nombre: "834", width: 834, height: 1194, movil: true },
  { nombre: "1024", width: 1024, height: 768, movil: false },
  { nombre: "1440", width: 1440, height: 900, movil: false },
];

const MEDIR = `(() => {
  // 🩸 innerText SÍ incluye lo que está \`sr-only\` (position:absolute + clip no
  // es display:none). Medir la poda con innerText daba "sigue en pantalla" para
  // todo lo que se movió a sr-only. Acá se arma el texto QUE SE VE.
  function textoVisible(raiz) {
    const partes = [];
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = (n.textContent || "").trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;       // sr-only mide 1×1
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      if (cs.clip !== "auto" && cs.clip !== "") continue; // clip: rect(0,0,0,0)
      partes.push(t);
    }
    return partes.join(" ").replace(/\\s+/g, " ");
  }
  const doc = document.documentElement;
  const arrastrePagina = doc.scrollWidth - doc.clientWidth;
  const raiz = document.querySelector("main") || document.body;
  const recortados = [];
  const chicos = [];
  const textosChicos = [];
  const huecos = [];
  for (const el of raiz.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    // sr-only mide 1px a propósito: contarlo sería ruido.
    if ((el.className || "").toString().includes("sr-only")) continue;
    if (r.width === 0 && r.height === 0) continue;

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
    // C. blancos táctiles
    if (["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) {
      if (r.height > 0 && r.height < 44) {
        chicos.push({
          tag: el.tagName.toLowerCase(),
          alto: Math.round(r.height * 10) / 10,
          texto: (el.textContent || el.getAttribute("placeholder") || el.getAttribute("aria-label") || "").trim().slice(0, 40),
        });
      }
    }
    // D. textos bajo 12 px (solo nodos con texto propio)
    const propio = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim()).join(" ");
    if (propio) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) textosChicos.push({ px: fs, texto: propio.slice(0, 40) });
    }
    // E. HUECO: el contenedor no tiene NADA adentro pero sigue ocupando alto
    //    por su propio padding/margen. Es lo que deja una poda mal hecha.
    // Solo HTML: los <path>/<circle>/<rect> de cada ícono son "vacíos" por
    // definición y ahogarían la señal.
    if (el.namespaceURI === "http://www.w3.org/1999/xhtml"
        && !el.children.length && !(el.textContent || "").trim()
        && !["IMG","INPUT","BR","HR","TEXTAREA","CANVAS","IFRAME"].includes(el.tagName)) {
      const alto = r.height;
      const mt = parseFloat(cs.marginTop) || 0;
      const mb = parseFloat(cs.marginBottom) || 0;
      if (alto > 4 || mt + mb > 8) {
        huecos.push({
          tag: el.tagName.toLowerCase(),
          clase: (el.className || "").toString().slice(0, 50),
          alto: Math.round(alto), mt, mb,
        });
      }
    }
  }
  return {
    arrastrePagina, recortados, chicos, textosChicos, huecos,
    texto: textoVisible(raiz),
  };
})()`;

/** Devuelve el primer href que matchee `re` dentro de la página. */
async function primerHref(page, re) {
  return page.evaluate((fuente) => {
    const rx = new RegExp(fuente);
    for (const a of document.querySelectorAll("a[href]")) {
      const h = a.getAttribute("href");
      if (h && rx.test(h)) return h;
    }
    return null;
  }, re.source);
}

const PANTALLAS = [];

/**
 * Prepara la lista de pantallas resolviendo los ids contra las listas reales.
 * 🩸 Los ids NO se hardcodean: se piden a las mismas rutas de API que la propia
 * pantalla usa. Hardcodearlos deja el script muerto el día que ese registro se
 * borre, y clickear filas es peor: media app abre el detalle con onClick, no
 * con <a>, y el selector se rompe con cada rediseño.
 */
async function resolverPantallas(page) {
  // 🩸 `fetch` relativo necesita ORIGEN: sin este goto la página es about:blank
  // y las dos llamadas devuelven null en silencio (caja y guías desaparecían
  // de la medición sin que nada se pusiera rojo).
  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  const api = async (ruta) => {
    try {
      return await page.evaluate(async (r) => {
        const res = await fetch(r, { credentials: "include" });
        return res.ok ? await res.json() : null;
      }, ruta);
    } catch { return null; }
  };

  const periodos = await api("/api/caja/periodos");
  const periodoId = Array.isArray(periodos) && periodos[0] ? periodos[0].id : null;
  const guias = await api("/api/guias");
  const guiaId = Array.isArray(guias) && guias[0] ? guias[0].id : null;

  await page.goto(`${BASE}/clientes`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const clienteHref = await primerHref(page, /^\/clientes\/[^/]+$/) || "/clientes/D-1";

  await page.goto(`${BASE}/proveedores`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  // 🩸 La clave del proveedor NO se puede derivar del nombre que se ve: la
  // tabla pinta "American Fashion Wear, SA" y la clave real es otra cosa. Se
  // abre la primera fila y se lee la URL que quedó — es lo único que no miente.
  // (Armarla a mano daba un 404 que la medición leía como "se perdió el
  // encabezado" en vez de "la pantalla no cargó".)
  let provHref = null;
  try {
    await page.locator("main tbody tr").first().click({ timeout: 8000 });
    await page.waitForTimeout(2000);
    if (/\/proveedores\/.+/.test(page.url())) provHref = new URL(page.url()).pathname;
  } catch {}

  await page.goto(`${BASE}/prestamos`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  let prestamoHref = null;
  try {
    await page.getByText("Confecciones Boston").first().click({ timeout: 6000 });
    await page.waitForTimeout(1800);
    if (/\/prestamos\/[0-9a-f-]{36}/.test(page.url())) prestamoHref = new URL(page.url()).pathname;
  } catch {}

  PANTALLAS.push(
    {
      id: "gastos-resumen", url: "/gastos-contabilidad",
      // "La contadora ya cerró este mes." es lo podado; las otras TRES
      // explicaciones se quedan y hay que verlas.
      prohibidos: ["La contadora ya cerró este mes"],
      seQuedan: ["Todavía no hay contabilidad de este mes"],
    },
    {
      id: "referencia", url: "/referencia",
      prohibidos: ["pegá tu lista: cuánto llegó"],
      // "Referencia" NO se busca acá: desde #510 el h1 es `sr-only` y el nombre
      // de la pantalla vive en la barra sticky y el breadcrumb, que están
      // FUERA de <main>. Lo que tiene que seguir viéndose es el buscador.
      seQuedan: ["códigos juntos"],
    },
    ...(periodoId
      ? [
          {
            id: "caja-periodo", url: `/caja?view=detail&id=${periodoId}`,
            prohibidos: ["% gastado", "Disponible"],
            seQuedan: ["% del fondo", "Saldo", "Fondo"],
          },
          {
            id: "caja-nuevo-gasto", url: `/caja/${periodoId}/nuevo`,
            // "Caja Menuda" a secas está en la barra de navegación y en el
            // encabezado del período, que se quedan: lo podado es el eyebrow
            // "Período Nº N · Caja Menuda" DEL FORMULARIO.
            prohibidos: ["· Caja Menuda", "Los campos con * son obligatorios"],
            seQuedan: ["Nuevo gasto"],
          },
        ]
      : []),
    {
      id: "cxc-grupo", url: "/admin",
      prohibidos: [], seQuedan: ["Grupo · 6 empresas"], unaVez: "6 empresas",
    },
    {
      // La coletilla de Boston es `hidden md:block`: en celular NO existe, y
      // eso es de antes de esta poda. Solo se exige de 834 para arriba.
      id: "cxc-boston", url: "/admin", clic: "text=Confecciones Boston",
      prohibidos: [], seQuedan: ["se lleva aparte"], desde: 834,
    },
    {
      id: "cliente-ficha", url: clienteHref,
      // La pantalla lo pinta en versalitas: se compara en MAYÚSCULA.
      prohibidos: ["SINCRONIZADOS DE SWITCH"],
      seQuedan: ["DATOS FISCALES", "Última sincronización"],
    },
    { id: "mf-vendedoras", url: "/multifashion?subtab=vendedoras", prohibidos: [], seQuedan: ["incluye mayoreo si lo hubo"] },
    { id: "mf-clientes", url: "/multifashion?subtab=clientes", prohibidos: [], seQuedan: ["Mostrador anónimo va aparte"] },
    { id: "ventas-clientes", url: "/ventas?tab=clientes", prohibidos: ["Vista:", "Desglose por empresa"], seQuedan: ["clientes"] },
    ...(guiaId
      // "Cambiar los envíos de esta guía" es un BOTÓN y se queda; lo podado es
      // el rótulo de la sección, que ahora dice "Envíos" a secas.
      ? [{ id: "guia", url: `/guias/${guiaId}`, prohibidos: ["Envíos de esta guía"], seQuedan: ["ENVÍOS", "Cambiar los envíos"], sensible: true }]
      : []),
    { id: "reclamo-nuevo", url: "/reclamos?view=form", prohibidos: [], seQuedan: ["Empresa *"], unaVez: "Empresa *" },
    { id: "asistencia-ayuda", url: "/asistencia", clic: 'button[aria-label="Cómo funciona"]', prohibidos: [], seQuedan: ["Cerrar", "Cómo funciona la marcación"] },
    ...(provHref
      ? [{ id: "proveedor", url: provHref, prohibidos: ["Por empresa"], seQuedan: ["EMPRESA", "POR PAGAR", "Última sincronización"] }]
      : []),
    ...(prestamoHref
      ? [{ id: "prestamo", url: prestamoHref, prohibidos: ["Estado de Cuenta"], seQuedan: ["Todos", "Pendientes"] }]
      : []),
    { id: "marketing-inicio", url: "/marketing", prohibidos: ["RESUMEN"], seQuedan: ["gastado en el período actual"] },
    { id: "saldos-banco", url: "/saldos-banco", prohibidos: ["Lo que hay en el banco de cada empresa"], seQuedan: ["Disponibilidad"] },
  );
}

(async () => {
  mkdirSync(SALIDA, { recursive: true });
  const browser = await chromium.launch();
  const informe = {};
  let fallas = 0;

  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies([{ name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" }]);
    await ctx.addInitScript(() => {
      try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
      try { delete Navigator.prototype.serviceWorker; } catch {}
    });
    const page = await ctx.newPage();
    await resolverPantallas(page);
    await ctx.close();
    console.log(`Pantallas resueltas: ${PANTALLAS.map((p) => p.id).join(", ")}\n`);
  }

  for (const t of TAMANOS) {
    const ctx = await browser.newContext({
      viewport: { width: t.width, height: t.height },
      isMobile: t.movil, hasTouch: t.movil, deviceScaleFactor: 1,
    });
    await ctx.addCookies([{ name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" }]);
    await ctx.addInitScript(() => {
      try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
      try { delete Navigator.prototype.serviceWorker; } catch {}
    });
    const page = await ctx.newPage();
    informe[t.nombre] = {};
    console.log(`\n=== ${t.nombre} px ===`);

    for (const p of PANTALLAS) {
      try {
        await page.goto(`${BASE}${p.url}`, { waitUntil: "networkidle", timeout: 45000 });
        await page.waitForTimeout(900);
        if (p.clic) {
          try { await page.click(p.clic, { timeout: 4000 }); await page.waitForTimeout(700); } catch {}
        }
        const m = await page.evaluate(MEDIR);
        // 🩸 Insensible a mayúsculas: media app pinta versalitas con
        // `uppercase`, y el DOM guarda "Datos fiscales" mientras el ojo lee
        // "DATOS FISCALES". Comparar tal cual daba falsos rojos.
        const T = m.texto.toLocaleLowerCase();
        const malos = p.sensible
          ? p.prohibidos.filter((x) => m.texto.includes(x))
          : p.prohibidos.filter((x) => T.includes(x.toLocaleLowerCase()));
        const faltan = (p.desde && t.width < p.desde)
          ? []
          : p.seQuedan.filter((x) => !T.includes(x.toLocaleLowerCase()));
        const repetido = p.unaVez
          ? (T.split(p.unaVez.toLocaleLowerCase()).length - 1) > 1
          : false;
        informe[t.nombre][p.id] = { ...m, texto: undefined, malos, faltan, repetido };
        const ok = !malos.length && !faltan.length && !repetido
          && m.arrastrePagina === 0 && !m.recortados.length
          && !m.chicos.length && !m.textosChicos.length && !m.huecos.length;
        if (!ok) fallas++;
        console.log(
          `  ${ok ? "🟢" : "🔴"} ${p.id.padEnd(20)} arrastre ${String(m.arrastrePagina).padStart(4)} · recortados ${m.recortados.length} · táctiles<44 ${m.chicos.length} · texto<12 ${m.textosChicos.length} · huecos ${m.huecos.length}`,
        );
        if (malos.length) console.log(`     🔴 SIGUE EN PANTALLA: ${JSON.stringify(malos)}`);
        if (faltan.length) console.log(`     🔴 SE PERDIÓ lo que debía quedarse: ${JSON.stringify(faltan)}`);
        if (repetido) console.log(`     🔴 "${p.unaVez}" aparece más de una vez`);
        if (m.recortados.length) console.log(`     recortados: ${JSON.stringify(m.recortados.slice(0, 4))}`);
        if (m.chicos.length) console.log(`     táctiles: ${JSON.stringify(m.chicos.slice(0, 4))}`);
        if (m.textosChicos.length) console.log(`     textos: ${JSON.stringify(m.textosChicos.slice(0, 4))}`);
        if (m.huecos.length) console.log(`     huecos: ${JSON.stringify(m.huecos.slice(0, 4))}`);
        await page.screenshot({ path: path.join(SALIDA, `${p.id}-${t.nombre}.png`), fullPage: true });
      } catch (e) {
        fallas++;
        console.log(`  🔴 ${p.id.padEnd(20)} ERROR: ${String(e).slice(0, 120)}`);
        informe[t.nombre][p.id] = { error: String(e).slice(0, 300) };
      }
    }

    // El cajón de módulos y la campanita solo existen en celular / en el header.
    if (t.nombre === "390") {
      await page.goto(`${BASE}/home`, { waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      try {
        await page.click('button[aria-label="Menú"], header button:has(svg)', { timeout: 4000 });
        await page.waitForTimeout(500);
        const drawer = await page.evaluate(`(() => {
          const d = document.querySelector(".fixed.inset-0.z-50");
          return d ? (d.innerText || "").replace(/\\s+/g, " ") : null;
        })()`);
        informe[t.nombre].drawer = drawer;
        console.log(`  cajón: ${drawer ? (drawer.includes("Módulos") ? "🔴 sigue diciendo Módulos" : "🟢 sin 'Módulos'") : "no se pudo abrir"}`);
        await page.screenshot({ path: path.join(SALIDA, `drawer-390.png`) });
      } catch { console.log("  cajón: no se pudo abrir"); }
    }

    await ctx.close();
  }

  writeFileSync(path.join(SALIDA, "informe.json"), JSON.stringify(informe, null, 2));
  await browser.close();
  console.log(`\n${fallas === 0 ? "🟢 TODO VERDE" : `🔴 ${fallas} hallazgo(s)`} — capturas e informe en ${SALIDA}`);
  process.exit(fallas === 0 ? 0 : 1);
})();
