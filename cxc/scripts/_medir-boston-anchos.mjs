// Mide el módulo Confecciones Boston en los 3 anchos + el iPad ACOSTADO,
// en el navegador, contra el build de PRODUCCIÓN y con datos de producción.
//
//   BASE=http://localhost:3499 TOKEN=<session_token vivo> node scripts/_medir-boston-anchos.mjs
//
// 🔴 SOLO LECTURA: el navegador ABORTA cualquier pedido que no sea GET/HEAD.
// Esta medición pasa por pantallas con botones que escriben (la estrella de la
// cartera), y medir no puede depender de que nadie se equivoque.
//
// 🩸 GOTCHAS QUE YA COSTARON UNA VUELTA EN ESTE REPO:
//   · No alcanza con FIRMAR la cookie: el middleware valida el `sessionToken`
//     contra `user_sessions`, y una sesión inventada redirige al login. Se toma
//     prestado —SOLO LEYENDO— un token vivo, y se le firma encima el ROL que se
//     quiere medir.
//   · `useAuth` no mira el rol: mira `sessionStorage`. Sin sembrar `cxc_role` y
//     `fg_modules`, la pantalla rebota a /home y se mide una página vacía.
//   · Hay que matar el service worker (`delete Navigator.prototype.serviceWorker`)
//     antes de navegar, o la hidratación se rompe.
//   · Los rótulos llevan `uppercase` por CSS: `innerText` los devuelve en
//     MAYÚSCULAS y compararlos tal cual da SIEMPRE false.
// El script FALLA si no encuentra las 6 pestañas o si una pantalla queda vacía:
// medir cero y darlo por bueno es el peor resultado posible.

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

const PESTANAS = ["inicio", "cxc", "ventas", "clientes", "planilla", "prestamos"];

function firmar(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

const COOKIE = firmar({
  role: "gerente_boston",
  userId: "medicion-boston",
  userName: "david",
  sessionToken: TOKEN,
});

/** Lo que se mide en cada pantalla. Corre DENTRO del navegador. */
function medir() {
  const doc = document.documentElement;
  const vw = window.innerWidth;

  const arrastrePagina = Math.max(0, doc.scrollWidth - vw);

  const recortados = [];
  const tactiles = [];
  const chicos = [];

  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;

    // Recorte: se pasa del ancho de la ventana, y NO es un scroller declarado
    // (arrastrar un scroller ES el mecanismo, no un defecto).
    const scroller = cs.overflowX === "auto" || cs.overflowX === "scroll";
    if (!scroller && el.scrollWidth - el.clientWidth > 1 && el.clientWidth > 0) {
      const padre = el.closest("[style*='overflow'], .overflow-x-auto");
      if (!padre || padre === el) {
        recortados.push({
          tag: el.tagName + (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""),
          px: el.scrollWidth - el.clientWidth,
        });
      }
    }

    // Blancos táctiles bajo 44 px.
    const tocable =
      el.tagName === "BUTTON" ||
      el.tagName === "A" ||
      (el.tagName === "INPUT" && el.type !== "hidden") ||
      el.tagName === "SELECT" ||
      el.getAttribute("role") === "button";
    if (tocable && (r.height < 44 || r.width < 44) && r.height > 0) {
      tactiles.push({ tag: el.tagName, w: Math.round(r.width), h: Math.round(r.height), txt: (el.textContent || "").trim().slice(0, 24) });
    }

    // Textos bajo 12 px, solo en nodos con texto propio.
    const tieneTextoPropio = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
    );
    if (tieneTextoPropio) {
      const fs = parseFloat(cs.fontSize);
      if (fs && fs < 12) chicos.push({ px: fs, txt: (el.textContent || "").trim().slice(0, 24) });
    }
  }

  const barra = document.querySelector('[data-pestanas="boston"]');
  return {
    arrastrePagina,
    arrastreBarra: barra ? Math.max(0, barra.scrollWidth - barra.clientWidth) : null,
    pestañas: barra ? [...barra.querySelectorAll("button")].map((b) => b.textContent.trim()) : [],
    recortados,
    tactiles,
    chicos,
    alto: doc.scrollHeight,
    // ¿La pantalla trajo algo? Un cero en una pantalla vacía no prueba nada.
    nodosConTexto: document.querySelectorAll("p, td, span, h1, h2, button").length,
  };
}

const navegador = await chromium.launch();
const hallazgos = [];
let fallo = false;

for (const { w, nombre } of ANCHOS) {
  const ctx = await navegador.newContext({ viewport: { width: w, height: 900 } });

  // 🔴 Solo lectura: nada que no sea GET/HEAD sale de acá.
  let bloqueadas = 0;
  await ctx.route("**/*", (route) => {
    const m = route.request().method();
    if (m === "GET" || m === "HEAD") return route.continue();
    bloqueadas += 1;
    return route.abort();
  });

  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem("cxc_role", "gerente_boston");
      sessionStorage.setItem("fg_modules", JSON.stringify(["boston"]));
      sessionStorage.setItem("fg_user_name", "david");
    } catch {}
    try { delete Navigator.prototype.serviceWorker; } catch {}
  });

  const page = await ctx.newPage();

  for (const tab of PESTANAS) {
    await page.goto(`${BASE}/boston?tab=${tab}`, { waitUntil: "networkidle", timeout: 90_000 });
    await page.waitForTimeout(700);
    const m = await page.evaluate(medir);

    if (m.pestañas.length !== 6) {
      console.error(`🔴 ${nombre} · ${tab}: se esperaban 6 pestañas y hay ${m.pestañas.length}`);
      fallo = true;
    }
    if (m.nodosConTexto < 10) {
      console.error(`🔴 ${nombre} · ${tab}: la pantalla salió vacía (${m.nodosConTexto} nodos)`);
      fallo = true;
    }

    hallazgos.push({ ancho: w, nombre, tab, ...m, bloqueadas });

    const mal =
      m.arrastrePagina > 0 || m.recortados.length > 0 || m.tactiles.length > 0 || m.chicos.length > 0;
    console.log(
      `${mal ? "⚠️ " : "✅ "}${String(w).padStart(4)} ${nombre.padEnd(14)} ${tab.padEnd(10)} ` +
        `arrastre ${m.arrastrePagina}px · barra ${m.arrastreBarra}px · recorte ${m.recortados.length} · ` +
        `táctil<44 ${m.tactiles.length} · texto<12 ${m.chicos.length} · alto ${m.alto}px`,
    );
    if (m.recortados.length) console.log("      recorte:", JSON.stringify(m.recortados.slice(0, 4)));
    if (m.tactiles.length) console.log("      táctil:", JSON.stringify(m.tactiles.slice(0, 4)));
    if (m.chicos.length) console.log("      texto:", JSON.stringify(m.chicos.slice(0, 4)));
  }

  await ctx.close();
}

await navegador.close();

const tot = (k) => hallazgos.reduce((s, h) => s + (Array.isArray(h[k]) ? h[k].length : h[k]), 0);
console.log("\n" + "═".repeat(70));
console.log(`casos medidos          ${hallazgos.length}`);
console.log(`arrastre de página     ${tot("arrastrePagina")} px en total`);
console.log(`recortados             ${tot("recortados")}`);
console.log(`táctiles < 44 px       ${tot("tactiles")}`);
console.log(`textos < 12 px         ${tot("chicos")}`);
console.log(`escrituras BLOQUEADAS  ${hallazgos.reduce((s, h) => Math.max(s, h.bloqueadas), 0)}`);
process.exit(fallo ? 1 : 0);
