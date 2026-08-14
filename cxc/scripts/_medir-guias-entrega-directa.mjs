// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA. Mide los TRES anchos (+ el iPad acostado) de lo que cambió en
// Guías:
//   · /guias con una guía PENDIENTE abierta  — el botón dice "Despachar"
//   · /guias/[id] pendiente, transportista    — los juegos del transportista
//   · /guias/[id] pendiente, transportista    — los juegos MÁS USADOS
//   · /guias/[id] pendiente, entrega directa  — sin placa ni N° de transportista
//   · /guias/nueva                            — la dirección como 1ª opción
//
// 🔴 NO TOCA "Despachar" ni ningún botón que guarde. Solo abre, mide y saca
//    capturas. Lo único que se toca es "Cambiar" del modo, que es estado local
//    (y su borrador en localStorage, en un navegador efímero).
//
//   BASE=http://localhost:3111 GUIA_PENDIENTE=<uuid> node scripts/_medir-guias-entrega-directa.mjs
//
// Gotchas de medición de la casa:
//   · sembrar `sessionStorage.cxc_role`, si no `useAuth` redirige al login;
//   · `delete Navigator.prototype.serviceWorker` ANTES de navegar;
//   · el ancho que decide NO es el de la ventana: la barra lateral se lleva
//     224 px desde `md:`, así que un iPad de 834 deja 610 útiles.
//
// El script FALLA si no encuentra lo que vino a medir — medir cero y dar verde
// sin haber mirado nada es el peor resultado posible.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3111";
const SALIDA = "/tmp/guias-entrega-directa";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const PENDIENTE = process.env.GUIA_PENDIENTE ?? "";
const ANCHOS = [390, 834, 1024, 1440];

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
    .map((e) => ({
      tag: e.tagName,
      cls: (e.className || "").toString().slice(0, 40),
      extra: e.scrollWidth - e.clientWidth,
      txt: (e.textContent || "").trim().slice(0, 32),
    }));

  const chicos = [...document.querySelectorAll("button, a, input, select, textarea")]
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44);
    })
    .map((e) => {
      const r = e.getBoundingClientRect();
      return {
        t: (e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 28),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });

  const letraChica = [...document.querySelectorAll("*")]
    .filter((e) => e.children.length === 0 && (e.textContent || "").trim())
    .map((e) => parseFloat(getComputedStyle(e).fontSize))
    .filter((n) => n && n < 12).length;

  return { arrastrePagina, recortados, chicos, letraChica };
};

const informe = {};
const problemas = [];

const nav = await chromium.launch();
for (const ancho of ANCHOS) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200 });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_is_owner", "1");
  });
  const page = await ctx.newPage();
  const de = (k) => `${k}@${ancho}`;

  // ── 1. La lista, con la guía PENDIENTE abierta ───────────────────────────
  await page.goto(`${BASE}/guias`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  // Abrir justamente una PENDIENTE (las despachadas siguen diciendo otra cosa).
  const abrio = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => /GT-\d+/.test(x.textContent || "") && /Pendiente/i.test(x.textContent || ""),
    );
    if (!b) return false;
    b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  });
  await page.waitForTimeout(4000);
  const botones = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim())
      .filter((t) => /^(Editar|Imprimir|Despachar)$/.test(t)),
  );
  informe[de("lista-pendiente-abierta")] = { ...(await page.evaluate(MEDIR)), botones, abrio };
  await page.screenshot({ path: `${SALIDA}/lista-${ancho}.png` });
  if (!abrio) problemas.push(`${ancho}: no se encontró ninguna guía pendiente en la lista`);
  else if (!botones.includes("Despachar")) problemas.push(`${ancho}: la guía pendiente no ofrece "Despachar" (botones: ${botones.join(", ")})`);

  // ── 2. La página de la guía pendiente — transportista ────────────────────
  if (PENDIENTE) {
    await page.goto(`${BASE}/guias/${PENDIENTE}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(7000);
    const estado = await page.evaluate(() => ({
      modo: [...document.querySelectorAll("span")].map((s) => s.textContent?.trim()).filter((t) => t === "Transportista externo" || t === "Entrega directa")[0] ?? null,
      hayCambiar: [...document.querySelectorAll("button")].some((b) => (b.textContent || "").trim() === "Cambiar"),
      hayPlaca: !!document.getElementById("despacho-placa"),
      hayTransp: !!document.getElementById("transp-0"),
      juegos: [...document.querySelectorAll("button")].filter((b) => /·/.test(b.textContent || "") && /min-h-\[44px\]/.test(b.className)).length,
      // ⚠️ el encabezado lleva `uppercase` por CSS: innerText lo devuelve en
      // MAYÚSCULAS, así que comparar tal cual da SIEMPRE false (y el chequeo
      // pasaría en verde sin haber mirado nada).
      textoJuegos: document.body.innerText.toUpperCase().includes("LOS QUE MÁS USA ESTE TRANSPORTISTA"),
    }));
    informe[de("guia-pendiente-externo")] = { ...(await page.evaluate(MEDIR)), ...estado };
    await page.screenshot({ path: `${SALIDA}/guia-externo-${ancho}.png` });
    if (!estado.hayCambiar) problemas.push(`${ancho}: la página de la guía no muestra el modo con un "Cambiar"`);
    if (!estado.hayPlaca) problemas.push(`${ancho}: con transportista externo debería pedir placa`);
    if (!estado.textoJuegos) problemas.push(`${ancho}: no se ofrecen los juegos más usados de este transportista`);

    // ── 3. La MISMA guía, cambiada a entrega directa ───────────────────────
    await page.evaluate(() => {
      const cambiar = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Cambiar");
      cambiar?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const opcion = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Entrega directa");
      opcion?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.waitForTimeout(1200);
    const directa = await page.evaluate(() => ({
      modo: [...document.querySelectorAll("span")].map((s) => s.textContent?.trim()).filter((t) => t === "Transportista externo" || t === "Entrega directa")[0] ?? null,
      hayPlaca: !!document.getElementById("despacho-placa"),
      hayTransp: !!document.getElementById("transp-0"),
      hayChofer: !!document.getElementById("despacho-chofer"),
      // ⚠️ el encabezado lleva `uppercase` por CSS: innerText lo devuelve en
      // MAYÚSCULAS, así que comparar tal cual da SIEMPRE false (y el chequeo
      // pasaría en verde sin haber mirado nada).
      textoJuegos: document.body.innerText.toUpperCase().includes("LOS QUE MÁS USA ESTE TRANSPORTISTA"),
      explicacion: document.body.innerText.includes("nuestro propio camión"),
    }));
    informe[de("guia-pendiente-directa")] = { ...(await page.evaluate(MEDIR)), ...directa };
    await page.screenshot({ path: `${SALIDA}/guia-directa-${ancho}.png` });
    if (directa.modo !== "Entrega directa") problemas.push(`${ancho}: no se pudo cambiar a entrega directa (quedó "${directa.modo}")`);
    if (directa.hayPlaca) problemas.push(`🔴 ${ancho}: en entrega directa SIGUE pidiendo placa`);
    if (directa.hayTransp) problemas.push(`🔴 ${ancho}: en entrega directa SIGUE pidiendo N° de transportista`);
    if (!directa.hayChofer) problemas.push(`${ancho}: en entrega directa debería pedir chofer`);
    if (directa.textoJuegos) problemas.push(`🔴 ${ancho}: los juegos del transportista aparecen en entrega directa`);
    if (!directa.explicacion) problemas.push(`${ancho}: falta la explicación de por qué no lleva placa`);
  }

  // ── 4. La guía con un cliente ATADO — la dirección como primera opción ───
  // ⚠️ `/guias/nueva` arranca con una fila VACÍA: ahí no hay cliente y por lo
  // tanto no hay nada que sugerir. La sugerencia solo existe con un cliente del
  // directorio, así que se mide sobre los renglones de una guía real.
  if (PENDIENTE) {
    await page.goto(`${BASE}/guias/${PENDIENTE}/editar`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);
    const sug = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll("input")].filter((i) => (i.getAttribute("list") || "").startsWith("direcciones-list"));
      const propias = inputs.filter((i) => (i.getAttribute("list") || "") !== "direcciones-list");
      const lista = propias[0] ? document.getElementById(propias[0].getAttribute("list")) : null;
      return {
        campos: inputs.length,
        conListaPropia: propias.length,
        listaId: propias[0]?.getAttribute("list") ?? null,
        primeras: lista ? [...lista.querySelectorAll("option")].slice(0, 3).map((o) => o.value) : [],
        valorDelCampo: propias[0]?.value ?? null,
      };
    });
    informe[de("guia-editar-sugerencia")] = { ...(await page.evaluate(MEDIR)), ...sug };
    await page.screenshot({ path: `${SALIDA}/editar-${ancho}.png` });
    if (sug.conListaPropia === 0) problemas.push(`${ancho}: el campo de dirección del cliente atado no tiene su lista propia`);
    if (sug.primeras[0] !== "Santiago") problemas.push(`${ancho}: la última dirección de D-68 no va primera (primeras: ${sug.primeras.join(", ")})`);
  }

  // ── 5. La guía nueva — las mismas palabras al crear ──────────────────────
  await page.goto(`${BASE}/guias/nueva`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  const form = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("input")].filter((i) => (i.getAttribute("list") || "").startsWith("direcciones-list"));
    const listas = [...document.querySelectorAll("datalist")].map((d) => ({
      id: d.id,
      primeras: [...d.querySelectorAll("option")].slice(0, 3).map((o) => o.value),
    }));
    return {
      camposDireccion: inputs.length,
      listaDelPrimerCampo: inputs[0]?.getAttribute("list") ?? null,
      listas,
      modos: [...document.querySelectorAll("button")].map((b) => (b.textContent || "").trim()).filter((t) => /^(Transportista|Transportista externo|Entrega directa)$/.test(t)),
    };
  });
  informe[de("guia-nueva")] = { ...(await page.evaluate(MEDIR)), ...form };
  await page.screenshot({ path: `${SALIDA}/nueva-${ancho}.png` });
  if (form.camposDireccion === 0) problemas.push(`${ancho}: no se encontró el campo de dirección`);
  if (form.modos.includes("Transportista")) problemas.push(`🔴 ${ancho}: el alta sigue diciendo "Transportista" en vez de "Transportista externo"`);
  if (!form.modos.includes("Transportista externo")) problemas.push(`${ancho}: el alta no dice "Transportista externo"`);

  await ctx.close();
}
await nav.close();

writeFileSync(`${SALIDA}/informe.json`, JSON.stringify(informe, null, 2));

console.log("\n═══ LOS 3 ANCHOS (+ iPad acostado) ═══");
for (const [k, v] of Object.entries(informe)) {
  console.log(
    `${k.padEnd(34)} arrastre ${String(v.arrastrePagina).padStart(4)} px · recortados ${String(v.recortados.length).padStart(2)} · táctiles<44 ${String(v.chicos.length).padStart(2)} · texto<12 ${v.letraChica}`,
  );
  if (v.recortados.length) console.log("     recortados:", v.recortados.map((r) => `${r.tag}.${r.cls}(${r.extra}px "${r.txt}")`).join(" · "));
  if (v.chicos.length) console.log("     táctiles:", v.chicos.map((c) => `"${c.t}" ${c.w}x${c.h}`).join(" · "));
}

console.log(`\ncapturas en ${SALIDA}`);
if (problemas.length) {
  console.log("\n🔴 PROBLEMAS:");
  for (const p of problemas) console.log("  -", p);
  process.exit(1);
}
console.log("\n🟢 sin problemas");
