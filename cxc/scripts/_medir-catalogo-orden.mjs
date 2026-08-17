// LOS 3 ANCHOS (+ el iPad acostado) del catálogo, con el desempate por código puesto.
//
// Este cambio NO agrega ni quita un solo elemento del DOM: reordena tarjetas
// dentro de un `grid-cols-2 sm:3 lg:4 xl:5`, donde el ancho de cada columna lo
// pone el CONTENEDOR (`1fr`), no el contenido. Por eso lo que se mide no es
// "¿entró lo nuevo?" —no hay nada nuevo— sino la afirmación que este cambio
// tiene que sostener: **el mismo conjunto de tarjetas, en otro orden, no
// ensancha nada**.
//
//   * `arrastre`        — px de scroll lateral de la página. Tiene que ser 0.
//   * `recortados`      — elementos cuyo contenido se sale sin scroller propio.
//   * `tactilesChicos`  — blancos táctiles bajo 44 px.
//   * `textosChicos`    — textos bajo 12 px.
//   * `skus`            — los códigos EN EL ORDEN EN QUE SE PINTARON, para
//                         verificar en el navegador REAL que los KCMEENA quedan
//                         pegados (no solo en el arnés de tests).
//
// El script FALLA si no encuentra tarjetas o si los KCMEENA salen separados:
// medir cero y dar verde sin haber mirado nada es el peor resultado posible.
//
// GOTCHA heredado: `delete Navigator.prototype.serviceWorker` ANTES de navegar
// (bloquear el SW de otra forma mata la hidratación).
//
// Solo lectura: no toca un solo botón que escriba.
//
//   BASE=http://localhost:3210 node scripts/_medir-catalogo-orden.mjs

import { chromium } from "playwright";
import { readFileSync, existsSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3210";
const ANCHOS = [390, 834, 1024, 1440];
const COOKIE_FILE = process.env.COOKIE_FILE ?? "/tmp/fg-cookie.txt";
const COOKIE = existsSync(COOKIE_FILE) ? readFileSync(COOKIE_FILE, "utf8").trim() : null;

const PANTALLAS = [
  { nombre: "público · Calvin", url: "/catalogo-publico/calvin", sesion: false },
  { nombre: "público · Tommy", url: "/catalogo-publico/tommy", sesion: false },
  { nombre: "vendedor · Calvin", url: "/catalogo/calvin", sesion: true },
  { nombre: "vendedor · Tommy", url: "/catalogo/tommy", sesion: true },
];

const SONDA = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  };

  // Los códigos, en el ORDEN EN QUE EL NAVEGADOR LOS PINTÓ.
  const skus = [...document.querySelectorAll("span")]
    .filter((s) => visible(s) && /^[A-Z0-9][A-Z0-9.\\-]{5,}$/.test((s.textContent || "").trim()))
    .map((s) => s.textContent.trim());

  let arrastre = 0;
  for (const el of document.querySelectorAll("*")) {
    const s = el.scrollWidth - el.clientWidth;
    if (s <= 1 || !visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX !== "auto" && cs.overflowX !== "scroll") continue;
    if (s > arrastre) arrastre = Math.round(s);
  }
  const arrastrePagina = Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth);

  const recortados = [];
  const tactilesChicos = [];
  const textosChicos = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // Recortado = el contenido se sale y NO hay scroller propio para alcanzarlo.
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra > 1 && cs.overflowX !== "auto" && cs.overflowX !== "scroll" && cs.textOverflow !== "ellipsis") {
      recortados.push({ tag: el.tagName, cls: (el.className || "").toString().slice(0, 60), px: Math.round(sobra) });
    }
    const tocable = el.tagName === "BUTTON" || el.tagName === "A" || el.getAttribute("role") === "button";
    if (tocable && (r.height < 44 || r.width < 24)) {
      tactilesChicos.push({ tag: el.tagName, txt: (el.textContent || "").trim().slice(0, 24), h: Math.round(r.height), w: Math.round(r.width) });
    }
    const fs = parseFloat(cs.fontSize);
    const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (propio && fs > 0 && fs < 12) {
      textosChicos.push({ px: Math.round(fs * 10) / 10, txt: (el.textContent || "").trim().slice(0, 28) });
    }
  }
  return { skus, arrastre: Math.max(arrastre, arrastrePagina), recortados, tactilesChicos, textosChicos };
})()`;

// ⚠️ Una familia PUEDE salir partida y estar BIEN: el desempate va DESPUÉS de
// categoría y género, así que `FW0FW08…` —que en Tommy vive en 5 secciones
// (sneakers · flip_flops · sandals · shoes · slippers de mujer)— se parte donde
// cambia la sección, a propósito. Exigirle estar pegada sería exigir que el
// código le gane a la categoría, que es justo lo que este cambio NO hace.
//
// Se verifican por eso DOS cosas distintas:
//   * `familiaPegada`  — para una familia que vive en UNA sola sección
//                        (los KCMEENA de Calvin: los 4 son flip_flops/women).
//   * `corridasAZ`     — el invariante general: dentro de cada corrida contigua
//                        de la misma familia, los códigos van en orden A-Z. Sin
//                        el desempate esto se rompe en cuanto hay dos con el
//                        mismo nombre, que en Tommy son 435 de 435.

/** ¿Los códigos de esta familia salieron pegados y en orden A-Z? */
function familiaPegada(skus, prefijo) {
  const pos = skus.map((s, i) => [s, i]).filter(([s]) => s.startsWith(prefijo));
  if (pos.length < 2) return { n: pos.length, pegados: null, orden: pos.map(([s]) => s) };
  const idxs = pos.map(([, i]) => i);
  const pegados = idxs.every((v, k) => k === 0 || v === idxs[k - 1] + 1);
  return { n: pos.length, pegados, orden: pos.map(([s]) => s), desde: idxs[0], hasta: idxs[idxs.length - 1] };
}

/** Corridas contiguas de la familia; cada una tiene que ir en orden A-Z. */
function corridasAZ(skus, prefijo) {
  const pos = skus.map((s, i) => [s, i]).filter(([s]) => s.startsWith(prefijo));
  const corridas = [];
  for (const [s, i] of pos) {
    const ult = corridas[corridas.length - 1];
    if (ult && ult.hasta === i - 1) { ult.hasta = i; ult.skus.push(s); }
    else corridas.push({ desde: i, hasta: i, skus: [s] });
  }
  const desordenada = corridas.find((c) => c.skus.some((s, k) => k > 0 && s.toUpperCase() < c.skus[k - 1].toUpperCase()));
  return { n: pos.length, corridas: corridas.length, ok: !desordenada, desordenada };
}

let fallos = 0;
const browser = await chromium.launch();

for (const p of PANTALLAS) {
  if (p.sesion && !COOKIE) {
    console.log(`\n⏭  ${p.nombre} — sin ${COOKIE_FILE}, se saltea (mintéala con _mint-cookie-medicion.ts)`);
    continue;
  }
  console.log(`\n════ ${p.nombre}  ${p.url}`);
  for (const ancho of ANCHOS) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 }, deviceScaleFactor: 2 });
    if (p.sesion) await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      try { delete Navigator.prototype.serviceWorker; } catch {}
      try {
        // 🩸 GOTCHA: `CatalogoAuthGuard` NO mira el rol: mira
        // `sessionStorage.fg_modules`. Sin sembrarlo, la pantalla redirige al
        // login y la medición da 0 elementos — verde sin haber mirado nada.
        sessionStorage.setItem("cxc_role", "admin");
        sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
      } catch {}
    });
    await page.goto(BASE + p.url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const m = await page.evaluate(SONDA);

    if (m.skus.length < 10) {
      console.log(`  ${ancho}px  🔴 solo ${m.skus.length} códigos en pantalla — no hay nada que medir`);
      fallos++;
      await ctx.close();
      continue;
    }

    const esCalvin = p.url.includes("calvin");
    const prefijo = esCalvin ? "KCMEENA" : "FW0FW08";
    let veredicto;
    if (esCalvin) {
      const fam = familiaPegada(m.skus, prefijo);
      veredicto = fam.pegados !== false;
      if (!veredicto) fallos++;
      console.log(
        `  ${String(ancho).padStart(4)}px  tarjetas ${String(m.skus.length).padStart(3)} · ` +
        `arrastre ${m.arrastre} · recortados ${m.recortados.length} · ` +
        `táctiles<44 ${m.tactilesChicos.length} · textos<12px ${m.textosChicos.length}  ` +
        `│ ${prefijo} ×${fam.n} ${veredicto ? "PEGADOS ✅" : "SEPARADOS 🔴"}` +
        (fam.desde !== undefined ? ` (#${fam.desde}–#${fam.hasta})` : "")
      );
      if (ancho === 390 && fam.n) console.log(`         orden: ${fam.orden.join(" · ")}`);
    } else {
      const c = corridasAZ(m.skus, prefijo);
      veredicto = c.ok;
      if (!veredicto) fallos++;
      console.log(
        `  ${String(ancho).padStart(4)}px  tarjetas ${String(m.skus.length).padStart(3)} · ` +
        `arrastre ${m.arrastre} · recortados ${m.recortados.length} · ` +
        `táctiles<44 ${m.tactilesChicos.length} · textos<12px ${m.textosChicos.length}  ` +
        `│ ${prefijo} ×${c.n} en ${c.corridas} corridas (cambia de sección) ${veredicto ? "cada una A-Z ✅" : "DESORDENADA 🔴"}`
      );
      if (!veredicto) console.log(`         🔴 ${c.desordenada.skus.join(" · ")}`);
    }
    if (m.arrastre > 0) { console.log(`         🔴 arrastre ${m.arrastre}px`); fallos++; }
    for (const r of m.recortados.slice(0, 4)) console.log(`         recortado ${r.px}px  ${r.tag}.${r.cls}`);
    for (const t of m.tactilesChicos.slice(0, 4)) console.log(`         táctil ${t.w}×${t.h}  "${t.txt}"`);
    for (const t of m.textosChicos.slice(0, 4)) console.log(`         texto ${t.px}px  "${t.txt}"`);

    await ctx.close();
  }
}

await browser.close();
console.log(fallos === 0 ? "\n🟢 0 arrastre · el orden por código se cumple en los 4 anchos" : `\n🔴 ${fallos} hallazgos`);
process.exit(fallos === 0 ? 0 : 1);
