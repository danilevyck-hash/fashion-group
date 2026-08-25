// ─────────────────────────────────────────────────────────────────────────────
// MEDICIÓN — «Comprobantes»: el panel renombrado, su filtro por TIPO, y el
// botón que lleva a la lista en UN toque (25-ago-2026).
//
// Contra el BUILD DE PRODUCCIÓN, con DATOS DE PRODUCCIÓN, en las 4 marcas y en
// los cuatro anchos de la casa: 390 (iPhone) · 834 (iPad) · 1024 (iPad
// ACOSTADO) · 1440 (escritorio).
//
//   npx next build && npx next start -p 3496
//   BASE=http://localhost:3496 ETAPA=despues node scripts/_medir-comprobantes-anchos.mjs
//
// `ETAPA=antes` corre EL MISMO ARCHIVO contra `origin/main` (dos scripts
// distintos no comparan nada): mide lo mismo, no exige lo que todavía no
// existe, y cuenta los TOQUES por el camino viejo.
//
// 🔴 NADA SE MANDA A SWITCH. El navegador ABORTA cualquier petición que no sea
// GET/HEAD — esta medición pasa por pantallas con botones de borrar, de
// exportar y de MANDAR A SWITCH, y desde el 25-ago tocar una salida MANDA sin
// ventana en el medio. El script no las toca, pero medir no puede depender de
// que nadie se equivoque.
//
// 🩸 Gotchas ya pagados y que siguen vigentes:
//   · Al usuario de medición no le corresponde vendedor: en el checkout hay que
//     elegirle uno ADEMÁS del cliente o el botón queda apagado con razón. Acá no
//     se arma ningún pedido, así que no aplica — se dice para que nadie lo
//     "arregle" agregando un checkout a esta medición.
//   · El service worker rompe la hidratación: se borra en el init script.
//   · Por defecto solo se abre el mes ACTUAL. Primero se despliegan los meses,
//     DESPUÉS se esperan las filas (Reebok: sus pedidos son de julio).
//   · El contador del mes dice «pedidos» en `origin/main` y «comprobantes» en
//     esta rama: el selector acepta LOS DOS o `ETAPA=antes` no encontraría nada.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { existsSync, readFileSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3496";
const ETAPA = process.env.ETAPA ?? "despues";
const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPad acostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];
const MARCAS = ["reebok", "joybees", "tommy", "calvin"];
/** Los roles que VEN la confirmación (createRoles de las 4 marcas). */
const ROLES = ["admin", "vendedor"];

async function cookieViva() {
  const candidatas = [];
  if (process.env.COOKIE_FILE) candidatas.push(process.env.COOKIE_FILE);
  candidatas.push("/tmp/fg-cookie.txt", "/tmp/fg-cookie-t400.txt", "/tmp/fg-cookie-t232.txt");
  for (const f of candidatas) {
    if (!existsSync(f)) continue;
    const c = readFileSync(f, "utf8").trim();
    const r = await fetch(`${BASE}/api/catalogo/reebok/pedidos-unificado`, { headers: { Cookie: `cxc_session=${c}` } });
    if (r.ok) { console.log(`Sesión: ${f} ✅`); return c; }
    console.log(`Sesión: ${f} ❌ (${r.status})`);
  }
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const body = Buffer.from(
    JSON.stringify({ role: "admin", userId: "medicion", userName: "medicion", sessionToken: "medicion%local" }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  const c = `${body}.${sig}`;
  const r = await fetch(`${BASE}/api/catalogo/reebok/pedidos-unificado`, { headers: { Cookie: `cxc_session=${c}` } });
  if (r.ok) { console.log("Sesión: cookie firmada a mano ✅"); return c; }
  console.error("❌ NINGUNA cookie sirve — inicia sesión y guarda `cxc_session` en /tmp/fg-cookie.txt.");
  process.exit(1);
}

const COOKIE = await cookieViva();
const browser = await chromium.launch();
const fallos = [];
const heredados = [];
let escriturasBloqueadas = 0;

/** Un pedido REAL por marca, para poder abrir su pantalla de confirmación. */
async function pedidoDe(marca) {
  const r = await fetch(`${BASE}/api/catalogo/${marca}/orders`, { headers: { Cookie: `cxc_session=${COOKIE}` } });
  if (!r.ok) return null;
  const rows = await r.json();
  const usable = (Array.isArray(rows) ? rows : []).filter((o) => o.fuente !== "publicos" && o.id);
  return usable[0]?.id ?? null;
}

async function nuevoContexto(role = "admin") {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript((r) => {
    try { sessionStorage.setItem("cxc_role", r); } catch {}
    try { sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos", "guias", "cxc", "directorio"])); } catch {}
    try { sessionStorage.setItem("fg_user_name", "medicion"); } catch {}
    try { delete Navigator.prototype.serviceWorker; } catch {}
  }, role);
  await ctx.route("**/*", (route) => {
    const m = route.request().method();
    if (m === "GET" || m === "HEAD") return route.continue();
    escriturasBloqueadas++;
    return route.abort();
  });
  return ctx;
}

// Mide una caja: arrastre de página, recorte propio, táctiles <44 y textos <12.
async function medir(page, sel, etiqueta, idx = 0, { recorteEsFallo = true } = {}) {
  const m = await page.evaluate(([s, i]) => {
    const el = document.querySelectorAll(s)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const chicos = [], tactilesChicos = [];
    for (const n of el.querySelectorAll("*")) {
      const b = n.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      const cs = getComputedStyle(n);
      const fs = parseFloat(cs.fontSize);
      if (n.children.length === 0 && n.textContent.trim() && fs < 12) {
        chicos.push(`${Math.round(fs * 10) / 10}px "${n.textContent.trim().slice(0, 24)}"`);
      }
      if ((n.tagName === "BUTTON" || n.tagName === "INPUT" || n.tagName === "A") && (b.height < 44 || b.width < 44)) {
        const lbl = n.closest("label");
        const lr = lbl ? lbl.getBoundingClientRect() : null;
        if (!(lr && lr.height >= 44 && lr.width >= 44)) {
          const txt = (n.textContent || n.getAttribute("aria-label") || n.type || "").trim().slice(0, 20);
          tactilesChicos.push(`${n.tagName}[${txt}] ${Math.round(b.width)}×${Math.round(b.height)}`);
        }
      }
    }
    return {
      docScrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
      w: Math.round(r.width), h: Math.round(r.height),
      scrollW: el.scrollWidth, clientW: el.clientWidth,
      chicos, tactilesChicos,
    };
  }, [sel, idx]);

  if (!m) {
    fallos.push(`${etiqueta}: NO SE ENCONTRÓ ${sel}`);
    console.log(`  ❌ ${etiqueta}: no se encontró ${sel}`);
    return null;
  }
  const arrastre = m.docScrollW - m.innerW;
  const recorte = m.scrollW - m.clientW;
  if (arrastre > 0) fallos.push(`${etiqueta}: arrastre de página ${arrastre}px`);
  if (recorte > 0) {
    if (recorteEsFallo) fallos.push(`${etiqueta}: recorte ${recorte}px`);
    else heredados.push(`${etiqueta}: recorte ${recorte}px`);
  }
  const cuenta = {};
  for (const t of m.tactilesChicos) cuenta[t] = (cuenta[t] || 0) + 1;
  console.log(
    `  ${etiqueta}: ${m.w}×${m.h}px · arrastre ${arrastre <= 0 ? "✅ 0" : `❌ ${arrastre}`} · ` +
      `recorte ${recorte <= 0 ? "✅ 0" : `⚠️ ${recorte}`} · ` +
      `táctil<44 ${m.tactilesChicos.length === 0 ? "✅ 0" : `⚠️ ${m.tactilesChicos.length}`} · ` +
      `texto<12px ${m.chicos.length === 0 ? "✅ 0" : `⚠️ ${m.chicos.length}`}`,
  );
  if (m.tactilesChicos.length) console.log(`      táctiles: ${Object.entries(cuenta).map(([t, n]) => (n > 1 ? `${t} ×${n}` : t)).join(" | ")}`);
  if (m.chicos.length) console.log(`      textos:   ${[...new Set(m.chicos)].slice(0, 6).join(" | ")}`);
  return { arrastre, recorte, tactiles: m.tactilesChicos.length, textos: m.chicos.length, alto: m.h, ancho: m.w };
}

const resumen = [];
const resumenConf = [];

// ── Calentar: la PRIMERA navegación del server recién levantado tarda de más ──
{
  const ctx = await nuevoContexto();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/catalogos/admin/reebok?tab=pedidos`, { waitUntil: "domcontentloaded", timeout: 180_000 }).catch(() => {});
  await page.waitForSelector("table tbody tr", { timeout: 180_000 }).catch(() => {});
  await ctx.close();
}

// ═══ PARTE A · EL PANEL ══════════════════════════════════════════════════════
// El contador del mes acepta LOS DOS sustantivos: `origin/main` dice «pedidos»
// y esta rama «comprobantes». Un selector que solo aceptara uno haría que
// ETAPA=antes no encontrara nada y diera rojo por el renombre, no por la caja.
const MES_ABIERTO = /\((\d+) (pedidos?|comprobantes?)\)/;

for (const marca of MARCAS) {
  console.log(`\n${"═".repeat(78)}\nPANEL · ${marca.toUpperCase()}\n${"═".repeat(78)}`);
  const ctx = await nuevoContexto("admin");
  const page = await ctx.newPage();

  for (const a of ANCHOS) {
    await page.setViewportSize({ width: a.w, height: a.h });
    await page.goto(`${BASE}/catalogos/admin/${marca}?tab=pedidos`, { waitUntil: "domcontentloaded", timeout: 120_000 });

    // 🔴 La pestaña llega por la URL vieja (`?tab=pedidos`): si el renombre
    // hubiera tocado la key, un marcador guardado caería en «Faltan foto».
    try {
      await page.waitForFunction(
        (re) => [...document.querySelectorAll("button")].some((b) => new RegExp(re).test(b.textContent || "")),
        MES_ABIERTO.source,
        { timeout: 60_000 },
      );
    } catch {
      const t = (await page.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\n+/g, " · ");
      fallos.push(`${marca} @${a.w}: la lista NO apareció con ?tab=pedidos — pantalla: ${t}`);
      console.log(`\n${a.nombre} (${a.w}px)\n  ❌ sin lista`);
      continue;
    }

    // El PEOR CASO: todos los meses desplegados.
    await page.evaluate((re) => {
      for (const b of document.querySelectorAll("button")) {
        if (new RegExp(re).test(b.textContent || "") && !b.querySelector("svg.rotate-90")) b.click();
      }
    }, MES_ABIERTO.source);
    await page.waitForTimeout(400);
    try {
      await page.waitForSelector("table tbody tr", { timeout: 30_000 });
    } catch {
      fallos.push(`${marca} @${a.w}: los meses se desplegaron y no hay ni una fila`);
      continue;
    }

    console.log(`\n${a.nombre} (${a.w}px)`);

    // El NOMBRE de la pestaña: «Comprobantes» después, «Pedidos» antes.
    const nombreTab = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /^(Pedidos|Comprobantes)$/.test((x.textContent || "").trim()));
      return b ? b.textContent.trim() : null;
    });
    const esperado = ETAPA === "despues" ? "Comprobantes" : "Pedidos";
    console.log(`     pestaña: «${nombreTab}» (se esperaba «${esperado}»)`);
    if (nombreTab !== esperado) fallos.push(`${marca} @${a.w}: la pestaña dice «${nombreTab}» y no «${esperado}»`);

    const cols = await page.evaluate(() => [...document.querySelectorAll("table")].map((t) => t.querySelectorAll("thead th").length));
    const filas = await page.evaluate(() => document.querySelectorAll("tbody tr").length);
    console.log(`     filas ${filas} · tablas ${cols.length} · columnas ${JSON.stringify([...new Set(cols)])}`);
    if (filas === 0) fallos.push(`${marca} @${a.w}: 0 filas — no hay nada que medir`);
    if (cols.some((c) => c !== 6)) fallos.push(`${marca} @${a.w}: alguna tabla tiene ${JSON.stringify(cols)} columnas (tienen que ser 6)`);

    // ── El FILTRO POR TIPO (solo existe en esta rama) ──
    if (ETAPA === "despues") {
      const f = await page.evaluate(() => {
        const caja = document.querySelector('[data-medir="filtro-tipo-comprobante"]');
        if (!caja) return null;
        const bs = [...caja.querySelectorAll("button")];
        return {
          labels: bs.map((b) => (b.textContent || "").replace(/\s+/g, " ").trim()),
          chicos: bs.filter((b) => { const r = b.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).length,
          alto: Math.round(caja.getBoundingClientRect().height),
        };
      });
      if (!f) {
        fallos.push(`${marca} @${a.w}: NO está el filtro por tipo de comprobante`);
      } else {
        const nums = f.labels.map((l) => Number((l.match(/(\d+)$/) || [])[1] ?? NaN));
        console.log(`     filtro tipo: ${f.labels.join(" · ")} (alto ${f.alto}px, táctiles<44: ${f.chicos})`);
        if (f.labels.length !== 4) fallos.push(`${marca} @${a.w}: el filtro tiene ${f.labels.length} opciones y no 4`);
        if (f.chicos > 0) fallos.push(`${marca} @${a.w}: ${f.chicos} filtros por debajo de 44px`);
        // 🔴 Los tres baldes tienen que sumar el total: si no, alguna fila se
        // cuenta dos veces o se pierde.
        if (nums.length === 4 && nums.every((n) => Number.isFinite(n)) && nums[1] + nums[2] + nums[3] !== nums[0]) {
          fallos.push(`${marca} @${a.w}: los conteos no suman (${nums[1]}+${nums[2]}+${nums[3]} ≠ ${nums[0]})`);
        }
        if (nums[0] !== filas) fallos.push(`${marca} @${a.w}: «Todos» dice ${nums[0]} y hay ${filas} filas`);

        // Y FILTRA de verdad: tocar «Cotizaciones» deja exactamente su conteo.
        for (const [i, etiqueta] of [[1, "Pedidos"], [2, "Cotizaciones"], [3, "Sin mandar"]]) {
          await page.evaluate((lbl) => {
            const caja = document.querySelector('[data-medir="filtro-tipo-comprobante"]');
            [...caja.querySelectorAll("button")].find((b) => (b.textContent || "").trim().startsWith(lbl))?.click();
          }, etiqueta);
          await page.waitForTimeout(250);
          await page.evaluate((re) => {
            for (const b of document.querySelectorAll("button")) {
              if (new RegExp(re).test(b.textContent || "") && !b.querySelector("svg.rotate-90")) b.click();
            }
          }, MES_ABIERTO.source);
          await page.waitForTimeout(150);
          const visibles = await page.evaluate(() => document.querySelectorAll("tbody tr").length);
          if (visibles !== nums[i]) {
            fallos.push(`${marca} @${a.w}: «${etiqueta}» dice ${nums[i]} y muestra ${visibles} filas`);
          }
          console.log(`       «${etiqueta}»: ${visibles} filas (el conteo dice ${nums[i]}) ${visibles === nums[i] ? "✅" : "❌"}`);
        }
        await page.evaluate(() => {
          const caja = document.querySelector('[data-medir="filtro-tipo-comprobante"]');
          [...caja.querySelectorAll("button")].find((b) => (b.textContent || "").trim().startsWith("Todos"))?.click();
        });
        await page.waitForTimeout(250);
        await page.evaluate((re) => {
          for (const b of document.querySelectorAll("button")) {
            if (new RegExp(re).test(b.textContent || "") && !b.querySelector("svg.rotate-90")) b.click();
          }
        }, MES_ABIERTO.source);
        await page.waitForTimeout(200);
      }
    }

    // El peor contenedor de tabla (uno por mes desplegado). El recorte del
    // `overflow-x-auto` NO tumba: arrastrar la tabla ES el mecanismo, y se
    // compara contra ETAPA=antes.
    const cuantos = await page.evaluate(() => document.querySelectorAll("div.bg-white.border.border-gray-200.rounded-lg.overflow-x-auto").length);
    let peor = null;
    for (let i = 0; i < cuantos; i++) {
      const m = await medir(page, "div.bg-white.border.border-gray-200.rounded-lg.overflow-x-auto", `${marca}/${a.w} (mes ${i + 1}/${cuantos})`, i, { recorteEsFallo: false });
      if (m && (!peor || m.recorte > peor.recorte)) peor = m;
    }
    if (peor) resumen.push({ marca, ...peor, ancho: a.w });
  }
  await ctx.close();
}

// ═══ PARTE B · LA CONFIRMACIÓN, POR ROL ══════════════════════════════════════

const PEDIDOS = {};
for (const m of MARCAS) PEDIDOS[m] = await pedidoDe(m);

for (const marca of MARCAS) {
  const oid = PEDIDOS[marca];
  if (!oid) { fallos.push(`${marca}: no hay ningún pedido interno para abrir la confirmación`); continue; }
  for (const role of ROLES) {
    console.log(`\n${"═".repeat(78)}\nCONFIRMACIÓN · ${marca.toUpperCase()} · rol ${role}\n${"═".repeat(78)}`);
    const ctx = await nuevoContexto(role);
    const page = await ctx.newPage();
    for (const a of ANCHOS) {
      await page.setViewportSize({ width: a.w, height: a.h });
      await page.goto(`${BASE}/catalogo/${marca}/confirmacion/${oid}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.waitForSelector("h1", { timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(500);
      console.log(`\n${a.nombre} (${a.w}px)`);
      const m = await medir(page, "div.mx-auto.w-full.max-w-xl", `${marca}/${role}/${a.w}`);
      if (m) resumenConf.push({ marca, role, ...m, ancho: a.w });

      if (ETAPA === "despues") {
        const b = await page.evaluate(() => {
          const el = document.querySelector('a[data-medir="ver-lista"]');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { texto: (el.textContent || "").trim(), href: el.getAttribute("href"), w: Math.round(r.width), h: Math.round(r.height) };
        });
        if (!b) {
          fallos.push(`${marca}/${role} @${a.w}: NO está el botón a la lista`);
        } else {
          const esperadoHref = role === "admin" ? `/catalogos/admin/${marca}?tab=pedidos` : `/catalogo/${marca}/pedidos`;
          const esperadoTexto = role === "admin" ? "Ver comprobantes" : "Ver pedidos";
          console.log(`     botón: «${b.texto}» → ${b.href} · ${b.w}×${b.h}px`);
          if (b.href !== esperadoHref) fallos.push(`${marca}/${role} @${a.w}: el botón va a ${b.href} y no a ${esperadoHref}`);
          if (b.texto !== esperadoTexto) fallos.push(`${marca}/${role} @${a.w}: el botón dice «${b.texto}» y no «${esperadoTexto}»`);
          if (b.h < 44 || b.w < 44) fallos.push(`${marca}/${role} @${a.w}: el botón mide ${b.w}×${b.h} (<44)`);
          // 🔴 Un vendedor NUNCA sale apuntado al admin de catálogos.
          if (role !== "admin") {
            const alAdmin = await page.evaluate(() => [...document.querySelectorAll("a")].filter((x) => (x.getAttribute("href") || "").includes("/catalogos/admin/")).length);
            if (alAdmin > 0) fallos.push(`${marca}/vendedor @${a.w}: ${alAdmin} enlaces al admin de catálogos (403 seguro)`);
          }
        }
      }
    }
    await ctx.close();
  }
}

// ═══ PARTE C · LOS TOQUES, CONTADOS TOCANDO ══════════════════════════════════
// Se DRIVEN los clics de verdad, uno por uno, y se cuentan. Nada se estima.

const toques = [];

async function contarToques(marca, role) {
  const oid = PEDIDOS[marca];
  if (!oid) return null;
  const ctx = await nuevoContexto(role);
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/catalogo/${marca}/confirmacion/${oid}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector("h1", { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(400);

  const destino = role === "admin" ? `/catalogos/admin/${marca}` : `/catalogo/${marca}/pedidos`;
  let n = 0;
  const paso = async (fn, nombre) => {
    n += 1;
    const ok = await fn();
    if (!ok) { fallos.push(`toques ${marca}/${role}: el paso «${nombre}» no existe`); throw new Error(nombre); }
    await page.waitForTimeout(900);
  };
  const clickHref = (frag) => page.evaluate((f) => {
    const el = [...document.querySelectorAll("a")].find((x) => (x.getAttribute("href") || "").includes(f));
    if (!el) return false; el.click(); return true;
  }, frag);
  const clickTexto = (txt) => page.evaluate((t) => {
    const el = [...document.querySelectorAll("a,button")].find((x) => (x.textContent || "").trim() === t);
    if (!el) return false; el.click(); return true;
  }, txt);

  try {
    if (ETAPA === "despues") {
      await paso(() => page.evaluate(() => {
        const el = document.querySelector('a[data-medir="ver-lista"]');
        if (!el) return false; el.click(); return true;
      }), "el botón a la lista");
    } else if (role === "admin") {
      // El camino viejo, tocando: ← Inicio · Catálogos · Administrar · pestaña.
      await paso(() => clickHref("/home"), "← Inicio");
      await paso(() => clickHref("/catalogos/marcas"), "Catálogos");
      await paso(() => clickHref(`/catalogos/admin/${marca}`), "Administrar");
      await paso(() => clickTexto("Pedidos"), "la pestaña Pedidos");
    } else {
      await paso(() => clickTexto("Volver al catálogo"), "Volver al catálogo");
      await paso(() => clickTexto("Pedidos"), "el botón Pedidos del catálogo");
    }
  } catch {
    await ctx.close();
    return null;
  }

  await page.waitForTimeout(600);
  const url = page.url();
  const llego = url.includes(destino);
  // Y para el admin: que sea la pestaña de la lista, no «Faltan foto».
  const enLista = role === "admin"
    ? await page.evaluate(
        (etapa) =>
          // Esta rama: el filtro por tipo solo lo dibuja la pestaña de la lista.
          !!document.querySelector('[data-medir="filtro-tipo-comprobante"]') ||
          // `origin/main` (y cualquier caso sin filas): el buscador de la lista.
          !!document.querySelector('input[placeholder^="Buscar por cliente"]') ||
          (etapa === "antes" && document.querySelectorAll("table thead th").length > 0),
        ETAPA,
      )
    : true;
  if (!llego) fallos.push(`toques ${marca}/${role}: terminó en ${url} y no en ${destino}`);
  if (!enLista) fallos.push(`toques ${marca}/${role}: llegó a ${url} pero no a la lista`);
  await ctx.close();
  return n;
}

for (const marca of MARCAS) {
  for (const role of ROLES) {
    const n = await contarToques(marca, role);
    toques.push({ marca, role, toques: n });
    console.log(`TOQUES ${marca}/${role}: ${n ?? "—"}`);
  }
}

// ═══ RESUMEN ═════════════════════════════════════════════════════════════════

console.log(`\n${"═".repeat(78)}\nRESUMEN (ETAPA=${ETAPA})\n${"═".repeat(78)}`);
console.log("PANEL      ancho  arrastre  recorte  táctil<44  texto<12  alto");
for (const r of resumen) {
  console.log(`${r.marca.padEnd(10)} ${String(r.ancho).padStart(5)}  ${String(r.arrastre).padStart(8)}  ${String(r.recorte).padStart(7)}  ${String(r.tactiles).padStart(9)}  ${String(r.textos).padStart(8)}  ${String(r.alto).padStart(4)}`);
}
console.log("\nCONFIRMACIÓN            ancho  arrastre  recorte  táctil<44  texto<12  alto");
for (const r of resumenConf) {
  console.log(`${(r.marca + "/" + r.role).padEnd(22)} ${String(r.ancho).padStart(5)}  ${String(r.arrastre).padStart(8)}  ${String(r.recorte).padStart(7)}  ${String(r.tactiles).padStart(9)}  ${String(r.textos).padStart(8)}  ${String(r.alto).padStart(4)}`);
}
console.log("\nTOQUES de la confirmación a la lista:");
for (const t of toques) console.log(`  ${(t.marca + "/" + t.role).padEnd(22)} ${t.toques ?? "—"}`);
console.log(`\nEscrituras bloqueadas por el navegador: ${escriturasBloqueadas}`);
if (heredados.length) {
  console.log(`\n⚠️  ${heredados.length} recortes de tabla (overflow-x-auto declarado; comparar contra ETAPA=antes):`);
  for (const h of heredados.slice(0, 12)) console.log(`   · ${h}`);
  if (heredados.length > 12) console.log(`   · … y ${heredados.length - 12} más`);
}

await browser.close();
if (fallos.length) {
  console.log(`\n🔴 ${fallos.length} FALLOS:`);
  for (const f of fallos) console.log(`   · ${f}`);
  process.exit(1);
}
console.log("\n✅ TODO EN VERDE");
