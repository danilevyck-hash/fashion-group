// Medición de la ÚLTIMA pantalla de la poda de títulos: Packing Lists › detalle.
//
// El h1 decía "Índice de Estilos por Bulto — PL #12345". Se podó el nombre de la
// pantalla (pasó a `sr-only`) y quedó a la vista SOLO el identificador. Lo que
// hay que medir es que:
//   · el número de PL SIGA VISIBLE en los cuatro anchos (es la regla 2 de la
//     poda: a 390 px no está en ningún otro lado — la miga es `hidden sm:flex`);
//   · el nombre de la pantalla siga existiendo para un lector (h1 con sr-only);
//   · no haya arrastre, recortes, blancos táctiles <44 px ni textos <12 px.
//
// ⚠️ `packing_lists` está VACÍA en producción (0 filas), así que no hay ninguna
// PL real que abrir. La respuesta de `/api/packing-lists/<id>` se INTERCEPTA en
// el navegador con una PL sintética: se mide la pantalla REAL del build de
// producción, con datos controlados. Nada sale a la base ni a Switch.
//
// GOTCHAS heredados (CLAUDE.md): cookie de sesión + `sessionStorage.cxc_role` y
// `fg_modules` (si no, `useAuth` redirige al login), y
// `delete Navigator.prototype.serviceWorker` antes de navegar (bloquear el SW de
// otra forma mata la hidratación).
//
//   npm run build && PORT=3468 npm run start
//   BASE=http://localhost:3468 node scripts/_medir-pl-titulo.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3468";
const OUT = process.env.OUT ?? "/tmp/pl-titulo";
mkdirSync(OUT, { recursive: true });

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPad-acostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

const NUMERO_PL = "TEST-4471";

// Una PL con nombres largos y muchos bultos: el peor caso para el ancho.
const PL_FALSA = {
  id: "00000000-0000-0000-0000-000000000001",
  numero_pl: NUMERO_PL,
  empresa: "Vistana International",
  fecha_entrega: "2026-08-12",
  total_bultos: 12,
  total_piezas: 1840,
  total_estilos: 9,
  bulto_muestra: "B1",
  created_at: "2026-08-12T00:00:00Z",
  parser_metadata: {
    bulto_order: Array.from({ length: 12 }, (_, i) => ({ id: `B${i + 1}`, label: `CTN-${100 + i}` })),
  },
  items: Array.from({ length: 9 }, (_, i) => ({
    estilo: `T1A8-32600-31${i}`,
    producto: `Men's Cotton Classic Polo Short Sleeve Regular Fit ${i + 1}`,
    total_pcs: 120 + i * 20,
    bultos: Object.fromEntries(Array.from({ length: 12 }, (_, b) => [`B${b + 1}`, 10 + b])),
    bulto_muestra: i % 3 === 0 ? "B1" : "",
    is_os: i % 4 === 0,
  })),
};

// ── Sesión: MISMO mecanismo que `_medir-titulos-repetidos.mjs` ───────────────
// (cookie firmada con SESSION_SECRET; no toca `user_sessions`).
function cookieDeSesion() {
  if (existsSync("/tmp/fg-cookie.txt")) return readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) {
    throw new Error("Falta /tmp/fg-cookie.txt (cookie cxc_session de una sesión real)");
  }
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const body = Buffer.from(
    JSON.stringify({ role: "admin", userId: "medicion", userName: "medicion", sessionToken: "medicion%local" }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

// ── Medición ─────────────────────────────────────────────────────────────────
const MEDIR = () => {
  const doc = document.documentElement;
  const arrastre = Math.max(0, doc.scrollWidth - doc.clientWidth);

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // El sr-only es una caja de 1x1 con overflow:hidden: contarlo como recorte es
  // un falso positivo del MEDIDOR, no un defecto de la página.
  const esSrOnly = (el) => el.closest(".sr-only") !== null;

  const recortes = [];
  const tactiles = [];
  const chicos = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el) || esSrOnly(el)) continue;
    const cs = getComputedStyle(el);
    const dx = el.scrollWidth - el.clientWidth;
    // Un scroller declarado NO es un recorte: es el mecanismo.
    const declara = /auto|scroll/.test(cs.overflowX);
    if (dx > 2 && !declara) {
      recortes.push({ tag: el.tagName, cls: (el.className || "").toString().slice(0, 60), dx });
    }
    if (el.matches("button, a[href], input, select, [role=button]")) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height < 44) tactiles.push({ tag: el.tagName, alto: Math.round(r.height), txt: (el.textContent || "").trim().slice(0, 30) });
    }
    const px = parseFloat(cs.fontSize);
    if (px && px < 12 && (el.textContent || "").trim() && el.children.length === 0) {
      chicos.push({ px, txt: (el.textContent || "").trim().slice(0, 30) });
    }
  }

  const h1s = [...document.querySelectorAll("h1")];
  const h1 = h1s[0] || null;
  const cuerpo = document.body.innerText;
  const oculto = h1 ? [...h1.querySelectorAll(".sr-only")].map((s) => s.textContent.trim()).join(" ") : "";
  // 🩸 `innerText` INCLUYE el sr-only (está renderizado, solo recortado a 1×1),
  // así que preguntarle a él "qué se ve" da el texto entero y el chequeo pasaría
  // en verde con el título sin podar. Se clona el h1 y se le sacan los sr-only.
  let visibleH1 = "";
  if (h1) {
    const copia = h1.cloneNode(true);
    copia.querySelectorAll(".sr-only").forEach((n) => n.remove());
    visibleH1 = copia.textContent.replace(/\s+/g, " ").trim();
  }

  return {
    arrastre,
    recortes,
    tactiles,
    chicos,
    h1Cantidad: h1s.length,
    h1Visible: visibleH1,
    h1Oculto: oculto,
    numeroEnPantalla: /PL #TEST-4471/.test(cuerpo),
    nombreEnPantalla: /Índice de Estilos por Bulto/.test(cuerpo),
  };
};

const COOKIE = cookieDeSesion();
const browser = await chromium.launch();
let fallo = false;

try {
  for (const a of ANCHOS) {
    const ctx = await browser.newContext({ viewport: { width: a.w, height: a.h }, deviceScaleFactor: 2 });
    await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
    await ctx.addInitScript(() => {
      try { delete Navigator.prototype.serviceWorker; } catch {}
      sessionStorage.setItem("cxc_role", "admin");
      sessionStorage.setItem("fg_modules", JSON.stringify(["packing-lists"]));
    });
    const page = await ctx.newPage();
    await page.route("**/api/packing-lists/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PL_FALSA) }),
    );

    await page.goto(`${BASE}/packing-lists/${PL_FALSA.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1", { timeout: 20000 });
    await page.waitForTimeout(600);

    const m = await page.evaluate(MEDIR);
    await page.screenshot({ path: `${OUT}/pl-${a.w}.png`, fullPage: false });

    const ok =
      m.arrastre === 0 &&
      m.recortes.length === 0 &&
      m.tactiles.length === 0 &&
      m.chicos.length === 0 &&
      m.h1Cantidad === 1 &&
      m.numeroEnPantalla === true && // 🔴 la regla 2: el identificador NO se esconde
      m.h1Oculto.includes("Índice de Estilos por Bulto") && // el nombre sigue para el lector
      m.h1Visible === `PL #${NUMERO_PL}`; // …y NO se ve

    if (!ok) fallo = true;
    console.log(
      `${ok ? "🟢" : "🔴"} ${a.nombre} (${a.w})  arrastre=${m.arrastre}  recortes=${m.recortes.length}  ` +
        `táctiles<44=${m.tactiles.length}  textos<12=${m.chicos.length}  h1=${m.h1Cantidad}  ` +
        `visible="${m.h1Visible}"  oculto="${m.h1Oculto}"  númeroEnPantalla=${m.numeroEnPantalla}`,
    );
    if (m.recortes.length) console.log("   recortes:", JSON.stringify(m.recortes));
    if (m.tactiles.length) console.log("   táctiles:", JSON.stringify(m.tactiles));
    if (m.chicos.length) console.log("   textos chicos:", JSON.stringify(m.chicos));

    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(fallo ? "\n🔴 HAY HALLAZGOS" : `\n🟢 Todo limpio. Capturas en ${OUT}`);
process.exit(fallo ? 1 : 0);
