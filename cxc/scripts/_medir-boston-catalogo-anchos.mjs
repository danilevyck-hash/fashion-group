// Mide lo que DAVID ve del catálogo, en los 3 anchos + el iPad ACOSTADO, en el
// navegador, contra el build de PRODUCCIÓN y con datos de producción.
//
//   BASE=http://127.0.0.1:3499 TOKEN=<session_token vivo> node scripts/_medir-boston-catalogo-anchos.mjs
//
// 🔴 SOLO LECTURA: el navegador ABORTA cualquier pedido que no sea GET/HEAD.
// Esta medición pasa por el catálogo, que tiene botones que escriben (agregar
// al carrito, mandar a Switch), y medir no puede depender de que nadie se
// equivoque.
//
// 🔴 Y MIDE LO QUE **NO** TIENE QUE ESTAR, que es la mitad del encargo: el hub
// no puede ofrecerle «Administrar» ni «Pedidos», y el catálogo de la marca
// tampoco «Pedidos». Un botón que muere en 403 es peor que no tenerlo.
//
// 🩸 GOTCHAS QUE ESTE REPO YA PAGÓ:
//   · No alcanza con FIRMAR la cookie: el middleware valida el `sessionToken`
//     contra `user_sessions` y una sesión inventada redirige al login — se
//     mediría la pantalla de LOGIN, verde sin haber mirado nada. Se toma
//     prestado, SOLO LEYENDO, un token vivo y se le firma encima el rol.
//   · `CatalogoAuthGuard` no mira el rol: mira `sessionStorage.fg_modules`.
//     Se siembra `["boston"]` A PROPÓSITO — es lo que dice su fila de
//     `role_permissions` mientras la DDL no corra, o sea el caso peor.
//   · Hay que matar el service worker antes de navegar o la hidratación se
//     rompe.
//   · Los rótulos llevan `uppercase` por CSS: `innerText` los devuelve en
//     MAYÚSCULAS y compararlos tal cual da SIEMPRE false → se compara sobre
//     `textContent` en minúsculas.
//   · ⚠️ ANTES DE CREERLE A UNA MEDICIÓN, hay que verificar que el servidor que
//     contesta es el TUYO: un `next start` que muere por EADDRINUSE deja al
//     medidor conectado al build de otro worktree.
//
// El script FALLA si una pantalla sale vacía, si el catálogo no trae productos
// o si aparece uno de los botones prohibidos.

import crypto from "crypto";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:3499";
const TOKEN = process.env.TOKEN;
const SECRET = process.env.SESSION_SECRET;
if (!TOKEN || !SECRET) {
  console.error("Faltan TOKEN (session_token vivo) o SESSION_SECRET.");
  process.exit(1);
}

const ANCHOS = [
  { w: 390, nombre: "iPhone" },
  { w: 834, nombre: "iPad" },
  { w: 1024, nombre: "iPad acostado" },
  { w: 1440, nombre: "escritorio" },
];

const MARCAS = ["reebok", "joybees", "tommy", "calvin"];

// 🔴 EL BASELINE. `ROL=vendedor` mide LAS MISMAS pantallas con un rol que YA
// tenía el catálogo antes de este cambio: es lo único que prueba que los
// recortes, los tocables de 38 px y los textos de 10-11 px son PRE-EXISTENTES
// del catálogo y no algo que trajo abrirle la puerta a David. Con `vendedor`
// los botones «Pedidos» SÍ tienen que estar (él está en COMPROBANTES_ROLES),
// así que la exigencia de «0 pedidos» solo corre para gerente_boston.
const ROL = process.env.ROL ?? "gerente_boston";
const MODULOS = ROL === "gerente_boston" ? ["boston"] : ["catalogos", "guias"];

function firmar(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

const COOKIE = firmar({
  role: ROL,
  userId: "medicion-catalogo",
  userName: `medicion-${ROL}`,
  sessionToken: TOKEN,
});

/** Lo que se mide en cada pantalla. Corre DENTRO del navegador. */
function medir() {
  const doc = document.documentElement;
  const vw = window.innerWidth;

  const recortados = [];
  const tactiles = [];
  const chicos = [];

  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;

    // Recorte: se pasa del ancho de la ventana y NO es un scroller declarado
    // (arrastrar un scroller ES el mecanismo, no un defecto).
    const scroller = cs.overflowX === "auto" || cs.overflowX === "scroll";
    if (!scroller && el.scrollWidth - el.clientWidth > 1 && el.clientWidth > 0) {
      const padre = el.closest("[style*='overflow'], .overflow-x-auto");
      if (!padre || padre === el) {
        recortados.push({
          tag: el.tagName + (typeof el.className === "string" && el.className ? "." + el.className.split(" ")[0] : ""),
          px: el.scrollWidth - el.clientWidth,
        });
      }
    }

    const tocable =
      el.tagName === "BUTTON" || el.tagName === "A" ||
      (el.tagName === "INPUT" && el.type !== "hidden") ||
      el.tagName === "SELECT" || el.getAttribute("role") === "button";
    if (tocable && (r.height < 44 || r.width < 44) && r.height > 0) {
      tactiles.push({ tag: el.tagName, w: Math.round(r.width), h: Math.round(r.height), txt: (el.textContent || "").trim().slice(0, 28) });
    }

    const tieneTextoPropio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (tieneTextoPropio) {
      const fs = parseFloat(cs.fontSize);
      if (fs && fs < 12) chicos.push({ px: fs, txt: (el.textContent || "").trim().slice(0, 28) });
    }
  }

  // 🔴 Lo que NO puede estar. Se cuenta sobre `textContent` en minúsculas: el
  // `uppercase` es de CSS y `innerText` lo devolvería en mayúsculas.
  const enlaces = [...document.querySelectorAll("a, button")].map((e) => (e.textContent || "").trim().toLowerCase());
  const cuenta = (t) => enlaces.filter((x) => x === t || x.startsWith(t)).length;

  return {
    arrastrePagina: Math.max(0, doc.scrollWidth - vw),
    recortados, tactiles, chicos,
    alto: doc.scrollHeight,
    administrar: cuenta("administrar"),
    pedidos: cuenta("pedidos"),
    verCatalogo: cuenta("ver catálogo"),
    // Cuántas tarjetas de producto dibujó. Cero = la pantalla no cargó, y medir
    // cero dándolo por bueno es el peor resultado posible.
    productos: document.querySelectorAll("img").length,
    nodosConTexto: document.querySelectorAll("p, td, span, h1, h2, h3, button, a").length,
    url: location.pathname,
  };
}

const navegador = await chromium.launch();
const hallazgos = [];
let fallo = false;

for (const { w, nombre } of ANCHOS) {
  const ctx = await navegador.newContext({ viewport: { width: w, height: 900 } });

  let bloqueadas = 0;
  await ctx.route("**/*", (route) => {
    const m = route.request().method();
    if (m === "GET" || m === "HEAD") return route.continue();
    bloqueadas += 1;
    return route.abort();
  });

  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(([rol, modulos]) => {
    try {
      sessionStorage.setItem("cxc_role", rol);
      // Para David va A PROPÓSITO sin "catalogos": es el caso peor (DDL sin
      // correr) y lo que prueba que la herencia y el guard hacen su trabajo.
      sessionStorage.setItem("fg_modules", JSON.stringify(modulos));
      sessionStorage.setItem("fg_user_name", `medicion-${rol}`);
    } catch {}
    try { delete Navigator.prototype.serviceWorker; } catch {}
  }, [ROL, MODULOS]);

  const page = await ctx.newPage();
  const pantallas = [
    { nombre: "hub", url: "/catalogos/marcas" },
    ...MARCAS.map((m) => ({ nombre: `catálogo ${m}`, url: `/catalogo/${m}` })),
  ];

  for (const p of pantallas) {
    await page.goto(`${BASE}${p.url}`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForTimeout(1200);
    const m = await page.evaluate(medir);

    if (m.url !== p.url) {
      console.error(`🔴 ${nombre} · ${p.nombre}: lo REBOTÓ a ${m.url} — el guard no lo dejó entrar`);
      fallo = true;
    }
    if (m.nodosConTexto < 10) {
      console.error(`🔴 ${nombre} · ${p.nombre}: la pantalla salió vacía (${m.nodosConTexto} nodos)`);
      fallo = true;
    }
    if (p.nombre === "hub" && m.verCatalogo !== 4) {
      console.error(`🔴 ${nombre} · hub: se esperaban 4 «Ver catálogo» y hay ${m.verCatalogo}`);
      fallo = true;
    }
    if (p.nombre !== "hub" && m.productos < 5) {
      console.error(`🔴 ${nombre} · ${p.nombre}: el catálogo no dibujó productos (${m.productos} imágenes)`);
      fallo = true;
    }
    if (m.administrar > 0) {
      console.error(`🔴 ${nombre} · ${p.nombre}: le ofrece «Administrar» (${m.administrar}) — muere en 403`);
      fallo = true;
    }
    if (ROL === "gerente_boston" && m.pedidos > 0) {
      console.error(`🔴 ${nombre} · ${p.nombre}: le ofrece «Pedidos» (${m.pedidos}) — muere en 403`);
      fallo = true;
    }
    // Y al revés: si el baseline NO ofrece «Pedidos», el medidor está roto y el
    // «0» de David no probaría nada.
    if (ROL === "vendedor" && m.pedidos === 0) {
      console.error(`🔴 ${nombre} · ${p.nombre}: al VENDEDOR le falta «Pedidos» — el medidor no mira bien`);
      fallo = true;
    }

    hallazgos.push({ ancho: w, nombre, pantalla: p.nombre, ...m, bloqueadas });

    const mal = m.arrastrePagina > 0 || m.recortados.length > 0 || m.tactiles.length > 0 || m.chicos.length > 0;
    console.log(
      `${mal ? "⚠️ " : "✅ "}${String(w).padStart(4)} ${nombre.padEnd(14)} ${p.nombre.padEnd(16)} ` +
        `arrastre ${m.arrastrePagina}px · recorte ${m.recortados.length} · táctil<44 ${m.tactiles.length} · ` +
        `texto<12 ${m.chicos.length} · admin ${m.administrar} · pedidos ${m.pedidos} · alto ${m.alto}px`,
    );
    if (m.recortados.length) console.log("      recorte:", JSON.stringify(m.recortados.slice(0, 4)));
    if (m.tactiles.length) console.log("      táctil:", JSON.stringify(m.tactiles.slice(0, 4)));
    if (m.chicos.length) console.log("      texto:", JSON.stringify(m.chicos.slice(0, 4)));
  }

  await ctx.close();
}

await navegador.close();

const tot = (k) => hallazgos.reduce((s, h) => s + (Array.isArray(h[k]) ? h[k].length : h[k]), 0);
console.log("\n" + "═".repeat(74));
console.log(`ROL medido             ${ROL}  (fg_modules = ${JSON.stringify(MODULOS)})`);
console.log(`casos medidos          ${hallazgos.length}`);
console.log(`arrastre de página     ${tot("arrastrePagina")} px en total`);
console.log(`recortados             ${tot("recortados")}`);
console.log(`táctiles < 44 px       ${tot("tactiles")}`);
console.log(`textos < 12 px         ${tot("chicos")}`);
console.log(`«Administrar»          ${tot("administrar")}  (tiene que ser 0)`);
console.log(`«Pedidos»              ${tot("pedidos")}  (tiene que ser 0)`);
console.log(`escrituras BLOQUEADAS  ${hallazgos.reduce((s, h) => Math.max(s, h.bloqueadas), 0)}`);
process.exit(fallo ? 1 : 0);
