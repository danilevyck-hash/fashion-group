// Medición del SALDO DE VACACIONES en los tres anchos: 390 · 834 · 1440 (más
// 1024, el iPad acostado, que es donde este repo ya se quemó dos veces).
//
// Se mide DOS VECES y las dos importan:
//
//   A. COMO ESTÁ HOY, con datos de producción y SIN la migración del saldo
//      inicial corrida (la corre Daniel a mano). Nadie tiene saldo, así que la
//      pantalla NO puede mostrar un solo número: tiene que decir qué falta.
//      🩸 Es el estado en el que va a estar producción al mergear, y el que
//      antes mostraba los 245 días de ANGELA GARCIA.
//
//   B. CON EL SALDO CARGADO, interceptando la respuesta de la API para darle a
//      la pantalla la forma EXACTA que va a tener cuando el DDL esté corrido.
//      Los componentes que se miden son los REALES.
//
// Qué mide, en `/asistencia?tab=vacaciones`:
//   1. la sección «Saldo por persona» existe y trae UNA fila por persona activa;
//   2. 🔴 a quien le falta un dato APARECE y dice CUÁL —«Falta la fecha de
//      ingreso» / «Falta el saldo»—, y su renglón NO tiene ningún número;
//   3. la línea que cuenta cuántas se quedaron sin saldo, con el DÓNDE;
//   4. al elegir una persona en el formulario, su saldo se dice ahí mismo;
//   5. con el saldo cargado: «20 días» y de dónde salió («12 al 25 ago 2026 ·
//      +8 ganados · tomó 10»);
//   6. y en Configuración, que se puedan editar la fecha de ingreso Y el saldo
//      (es lo que Daniel decidió que haga contabilidad).
//
// Y en los cuatro anchos: ARRASTRE de página · RECORTES · blancos táctiles
// <44 px · textos <12 px.
//
// 🔴 SOLO LECTURA: el navegador ABORTA cualquier pedido que no sea GET. Medir
// no puede depender de que nadie toque un botón por accidente.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`,
// `delete Navigator.prototype.serviceWorker` antes de navegar, la pestaña vive
// en la URL (`?tab=`), esta app NO tiene <main> (el primer
// `div[class*="transition-"]` es un overlay VACÍO: mediría 0 en todo), y los
// rótulos llevan `uppercase` POR CSS — `innerText` los devuelve en MAYÚSCULAS.
//
//   npm run build && npx next start -p 3471
//   BASE=http://localhost:3471 node scripts/_medir-vacaciones-saldo.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3471";
const OUT = process.env.OUT ?? "/tmp/asistencia-saldo";
mkdirSync(OUT, { recursive: true });

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPadAcostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

function cookieDeSesion() {
  // 🩸 La cookie se FIRMA acá, no se toma de un archivo compartido: `/tmp` lo
  // usan varios scripts a la vez y una cookie de otra corrida deja la medición
  // en la pantalla de login — con TODO en cero y en verde si nadie lo mira.
  const propia = process.env.COOKIE_FILE;
  if (propia && existsSync(propia)) return readFileSync(propia, "utf8").trim();
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const body = Buffer.from(
    JSON.stringify({ role: "admin", userId: "medicion", userName: "Daniel", sessionToken: "medicion%local" }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
const COOKIE = cookieDeSesion();

const MEDIR = () => {
  const raiz = [...document.querySelectorAll('div[class*="transition-"]')]
    .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0]
    ?? document.body;
  const arrastre = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
  const recortados = [];
  const tactiles = [];
  const textosChicos = [];
  for (const el of raiz.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    const ox = cs.overflowX;
    // `auto`/`scroll` es un scroller DECLARADO: se arrastra, no es un recorte.
    // El `h1.sr-only` de la página mide 1 px a propósito y siempre "recorta":
    // contarlo es ruido PRE-EXISTENTE, no un defecto de esta pantalla.
    if (!el.classList.contains("sr-only")
        && (ox === "hidden" || ox === "clip") && el.scrollWidth - el.clientWidth > 4) {
      recortados.push({ el: `${el.tagName}.${String(el.className).slice(0, 60)}`, px: el.scrollWidth - el.clientWidth });
    }
    // 🔑 Un checkbox de 16 px DENTRO de una etiqueta de 44 cumple la regla: lo
    // que se toca es la etiqueta entera.
    if (el.matches("button, a[href], select, textarea, [role=button], input:not([type=checkbox]):not([type=radio])")
        && r.height < 43.5) {
      tactiles.push({
        el: `${el.tagName}[${el.getAttribute("type") ?? ""}]`,
        alto: Math.round(r.height * 10) / 10,
        txt: (el.textContent ?? "").trim().slice(0, 28),
      });
    }
    if (el.children.length === 0 && (el.textContent ?? "").trim()) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) textosChicos.push({ fs, txt: (el.textContent ?? "").trim().slice(0, 30) });
    }
  }
  return { arrastre, innerW: window.innerWidth, recortados, tactiles, textosChicos };
};

/** Lo que este PR cambió, leído del DOM de la pestaña Vacaciones. */
const LEER_SALDO = () => {
  // 🔑 `textContent` y no `innerText`: los rótulos llevan `uppercase` por CSS y
  // un `sr-only` está clipeado — `innerText` devuelve mayúsculas o vacío, y
  // compararlos tal cual da SIEMPRE `false`, o sea verde (o rojo) sin haber
  // mirado nada.
  const txt = (document.body.textContent ?? "").replace(/\s+/g, " ");
  const filas = [...document.querySelectorAll("li[data-saldo-codigo]")].map((li) => ({
    codigo: li.getAttribute("data-saldo-codigo"),
    texto: (li.textContent ?? "").replace(/\s+/g, " ").trim(),
    // 🩸 El VALOR, aparte del nombre: los códigos sin ficha se llaman «50», o
    // sea que el nombre de esa persona ES un número. Mirar el renglón entero
    // acusaba de «saldo inventado» a un renglón perfectamente honesto.
    valor: (li.querySelector("[data-saldo-valor]")?.textContent ?? "").replace(/\s+/g, " ").trim(),
  }));
  const sinDato = filas.filter((f) => /^Falta/.test(f.valor));
  return {
    haySeccion: txt.includes("Saldo por persona"),
    diceLaRegla: txt.includes("30 días por cada 11 meses trabajados"),
    diceDesdeCuando: txt.includes("Arranca del saldo que carga contabilidad"),
    avisoSinSaldo: /(\d+) personas? no tienen? saldo/.exec(txt)?.[0] ?? null,
    avisoDiceDonde: txt.includes("Se cargan en Configuración"),
    filas: filas.length,
    conNumero: filas.filter((f) => /\d+ días?/.test(f.valor)).length,
    sinDato: sinDato.length,
    // 🔴 El renglón de quien no tiene el dato NO puede traer un número: un
    // «0 días» se leería como «no le queda ni uno».
    sinDatoConNumero: sinDato.filter((f) => /\d/.test(f.valor)).length,
    // 🩸 EL NÚMERO QUE ESTE PR VINO A MATAR. ANGELA GARCIA entró en 2019 y sin
    // saldo cargado NO puede figurar con 245 días disponibles.
    dice245: /245/.test(txt),
    angela: filas.find((f) => f.codigo === "7")?.valor ?? null,
    eloyn: filas.find((f) => f.codigo === "29")?.valor ?? null,
    // El detalle auditable, cuando hay saldo.
    hayDetalle: /\d+ al \d+ \w+ \d{4}/.test(txt),
    // 🔴 EL ENTERO NO SE ENSUCIA. Un «10.0 días» en la columna hace que el caso
    // raro —el medio día— deje de saltar a la vista, que es para lo que está.
    conCeroDecimal: filas.filter((f) => /\.0\b/.test(f.valor)).length,
  };
};

/** El saldo dicho en el formulario, al elegir la persona. */
const LEER_ELEGIDO = () => {
  const select = document.querySelector("select");
  const p = select?.parentElement?.querySelector("p");
  return (p?.textContent ?? "").replace(/\s+/g, " ").trim();
};

/** Configuración: ¿se pueden EDITAR la fecha de ingreso y el saldo? */
const LEER_CONFIG = () => {
  const fechas = [...document.querySelectorAll('input[type="date"]')];
  // 🩸 Se busca el INPUT por su `aria-label`: el botón ⓘ de ayuda lleva el
  // MISMO texto y sale primero en el DOM.
  const saldo = document.querySelector(
    'input[aria-label="Días de vacaciones que le quedan hoy"]',
  );
  return {
    diceEmpezoATrabajar: (document.body.textContent ?? "").includes("Empezó a trabajar"),
    camposFecha: fechas.length,
    editables: fechas.filter((i) => !i.disabled && !i.readOnly).length,
    haySaldo: !!saldo,
    saldoEditable: !!saldo && !saldo.disabled && !saldo.readOnly,
    // 🔴 De a MEDIO día. Con `step=1` las flechitas nunca llegarían a un 12,5.
    paso: saldo?.getAttribute("step") ?? null,
    // En el iPhone `numeric` no trae el punto en el teclado.
    teclado: saldo?.getAttribute("inputmode") ?? null,
    diceQueFaltaElDdl: (document.body.textContent ?? "")
      .includes("Todavía no se puede cargar el saldo"),
  };
};

const browser = await chromium.launch();
// El contador vive afuera del bucle: las dos pasadas suman al mismo.
let escriturasBloqueadas = 0;

const hallazgos = [];
const acusar = (m) => { hallazgos.push(m); console.log(`  🔴 ${m}`); };

// ── PASADA B: la respuesta con el saldo YA CARGADO ─────────────────────────
//
// 🔑 Se toma la respuesta REAL y se le pisan solo los saldos: las personas, las
// vacaciones y todo lo demás siguen siendo los de producción, y el componente
// que se mide es el de verdad. Es la forma EXACTA que va a tener la API cuando
// el DDL esté corrido — ver `saldoDe` en `lib/asistencia/saldo-vacaciones.ts`.
const CON_SALDO = {
  // ANGELA GARCIA: el ejemplo de la cabecera del módulo. 12 al corte, +8
  // ganados, 10 tomados → 10 días. ENTERO: no puede verse «10.0».
  "7": { saldo: 10, saldoInicial: 12, corte: "2026-08-25", ganadosDesdeCorte: 8, tomados: 10, yaPagados: 0, falta: null },
  // ELOYN MENDOZA: días COBRADOS (restan igual, se nombran aparte) y MEDIO día,
  // que es lo que este PR agrega. 12,5 − 3 = 9,5.
  "29": { saldo: 9.5, saldoInicial: 12.5, corte: "2026-08-25", ganadosDesdeCorte: 0, tomados: 0, yaPagados: 3, falta: null },
};

async function interceptarConSaldo(ctx) {
  await ctx.route("**/api/asistencia/vacaciones*", async (route) => {
    const res = await route.fetch();
    const d = await res.json().catch(() => null);
    if (!d?.saldos) return route.fulfill({ response: res });
    const saldos = d.saldos.map((s) => (CON_SALDO[s.codigo] ? { ...s, ...CON_SALDO[s.codigo] } : s));
    const sinFecha = saldos.filter((s) => s.falta === "fecha" || s.falta === "ambos").length;
    const sinSaldo = saldos.filter((s) => s.falta === "saldo").length;
    const total = sinFecha + sinSaldo;
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        ...d, saldos,
        avisoSaldo: total === 0 ? null
          : `${total} personas no tienen saldo: a ${sinFecha} les falta la fecha de ingreso y a ${sinSaldo} el saldo. Se cargan en Configuración.`,
      }),
    });
  });
  // Y en Configuración, que el campo se vea HABILITADO (o sea, con el DDL ya
  // corrido). Sin esto solo se podría medir la mitad deshabilitada.
  await ctx.route("**/api/asistencia/configuracion*", async (route) => {
    const res = await route.fetch();
    const d = await res.json().catch(() => null);
    if (!d?.personas) return route.fulfill({ response: res });
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        ...d,
        puedeCargarSaldoVacaciones: true,
        avisoMigracionSaldoVacaciones: null,
        personas: d.personas.map((p) =>
          p.codigo === "7"
            ? { ...p, saldoVacacionesDias: 12, saldoVacacionesCorte: "2026-08-25" }
            : p),
      }),
    });
  });
}

for (const pasada of ["A-como-esta-hoy", "B-con-saldo-cargado"]) {
  const ctx2 = await browser.newContext();
  await ctx2.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx2.addInitScript(() => {
    try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
    try { delete Navigator.prototype.serviceWorker; } catch {}
  });
  // 🔴 NADA QUE NO SEA GET SALE DE ACÁ. No se escribe una fila.
  await ctx2.route("**/*", async (route) => {
    if (route.request().method() !== "GET") { escriturasBloqueadas += 1; return route.abort(); }
    return route.fallback();
  });
  const conSaldo = pasada.startsWith("B");
  if (conSaldo) await interceptarConSaldo(ctx2);

  console.log(`\n════════ PASADA ${pasada} ════════`);

  for (const a of ANCHOS) {
    const page = await ctx2.newPage();
    await page.setViewportSize({ width: a.w, height: a.h });

    // ── La pestaña Vacaciones ────────────────────────────────────────────
    await page.goto(`${BASE}/asistencia?tab=vacaciones`, { waitUntil: "networkidle" });
    await page.waitForSelector("li[data-saldo-codigo]", { timeout: 30_000 }).catch(() => {});
    const m = await page.evaluate(MEDIR);
    const sd = await page.evaluate(LEER_SALDO);
    await page.screenshot({ path: `${OUT}/${pasada}-${a.w}.png`, fullPage: true });

    console.log(`\n── ${a.nombre} (${a.w}px, útil ${m.innerW}) ──`);
    console.log(`   arrastre ${m.arrastre}px · recortados ${m.recortados.length} · táctiles<44 ${m.tactiles.length} · textos<12 ${m.textosChicos.length}`);
    console.log(`   saldos: ${sd.filas} filas · ${sd.conNumero} con número · ${sd.sinDato} con «Falta…»`);
    console.log(`   ANGELA (7)  → ${sd.angela}`);
    console.log(`   ELOYN  (29) → ${sd.eloyn}`);
    console.log(`   aviso       → ${sd.avisoSinSaldo}`);

    if (m.arrastre > 0) acusar(`${pasada}/${a.nombre}: la página arrastra ${m.arrastre}px`);
    for (const r of m.recortados) acusar(`${pasada}/${a.nombre}: recortado ${r.px}px — ${r.el}`);
    for (const t of m.tactiles) acusar(`${pasada}/${a.nombre}: táctil de ${t.alto}px — ${t.el} "${t.txt}"`);
    for (const t of m.textosChicos) acusar(`${pasada}/${a.nombre}: texto de ${t.fs}px — "${t.txt}"`);

    // 🩸 El script FALLA si mide cero sin haber mirado nada.
    if (!sd.haySeccion) acusar(`${pasada}/${a.nombre}: no aparece «Saldo por persona»`);
    if (!sd.diceLaRegla) acusar(`${pasada}/${a.nombre}: no dice la regla de los 30 días`);
    if (!sd.diceDesdeCuando) acusar(`${pasada}/${a.nombre}: no dice desde cuándo cuenta la resta`);
    if (sd.filas < 10) acusar(`${pasada}/${a.nombre}: solo ${sd.filas} filas de saldo (¿cargó?)`);
    if (sd.sinDato === 0) acusar(`${pasada}/${a.nombre}: nadie aparece con «Falta…»`);
    if (sd.sinDatoConNumero > 0) acusar(`${pasada}/${a.nombre}: ${sd.sinDatoConNumero} renglones sin dato traen un número`);
    if (!sd.avisoSinSaldo) acusar(`${pasada}/${a.nombre}: falta la línea de cuántas personas no tienen saldo`);
    if (!sd.avisoDiceDonde) acusar(`${pasada}/${a.nombre}: el aviso no dice DÓNDE se carga`);
    // 🔴 EL CANDADO DE ESTE PR: los 245 días no vuelven nunca.
    if (sd.dice245) acusar(`${pasada}/${a.nombre}: reapareció el 245 de ANGELA GARCIA`);

    if (!conSaldo) {
      // Sin el DDL corrido NADIE puede tener un número.
      if (sd.conNumero > 0) acusar(`A/${a.nombre}: ${sd.conNumero} renglones muestran un saldo sin que nadie lo haya cargado`);
      if (!/^Falta/.test(sd.angela ?? "")) acusar(`A/${a.nombre}: ANGELA no dice qué falta → ${sd.angela}`);
    } else {
      if (!/10 días/.test(sd.angela ?? "")) acusar(`B/${a.nombre}: ANGELA no dice «10 días» → ${sd.angela}`);
      if (!/12 al 25 ago 2026/.test(sd.angela ?? "")) acusar(`B/${a.nombre}: falta el detalle auditable → ${sd.angela}`);
      if (!/\+8 ganados/.test(sd.angela ?? "")) acusar(`B/${a.nombre}: no dice lo ganado desde el corte → ${sd.angela}`);
      if (!/tomó 10/.test(sd.angela ?? "")) acusar(`B/${a.nombre}: no dice lo tomado → ${sd.angela}`);
      if (!/ya pagados 3/.test(sd.eloyn ?? "")) acusar(`B/${a.nombre}: los días cobrados no se nombran aparte → ${sd.eloyn}`);
      // 🔴 EL MEDIO DÍA: se ve donde lo hay, y NO se inventa donde no.
      if (!/9\.5 días/.test(sd.eloyn ?? "")) acusar(`B/${a.nombre}: el medio día no se ve → ${sd.eloyn}`);
      if (!/12\.5 al 25 ago 2026/.test(sd.eloyn ?? "")) acusar(`B/${a.nombre}: el arranque de medio día no se ve → ${sd.eloyn}`);
      if (sd.conCeroDecimal > 0) acusar(`B/${a.nombre}: ${sd.conCeroDecimal} renglones enteros muestran un «.0»`);
    }

    // Elegir una persona en el formulario dice su saldo ahí mismo.
    await page.selectOption("select", "7").catch(() => {});
    const elegido = await page.evaluate(LEER_ELEGIDO);
    console.log(`   elegido(7)  → ${elegido}`);
    if (conSaldo) {
      if (!/Le quedan 10 días/.test(elegido)) acusar(`B/${a.nombre}: al elegir a ANGELA no dice su saldo → "${elegido}"`);
    } else {
      if (!/^Falta/.test(elegido)) acusar(`A/${a.nombre}: al elegir a ANGELA no dice qué falta → "${elegido}"`);
      if (/\d/.test(elegido)) acusar(`A/${a.nombre}: el aviso de falta trae un número → "${elegido}"`);
    }

    // ── Configuración: la fecha de ingreso Y el saldo se pueden EDITAR ───
    await page.goto(`${BASE}/asistencia?tab=configuracion`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.getByText("Empezó a trabajar").first().waitFor({ timeout: 3000 }).catch(async () => {
      const b = page.locator("button").filter({ hasText: /ANGELA|ALEJANDRA|ANDRE/ }).first();
      await b.click({ timeout: 3000 }).catch(() => {});
    });
    const c = await page.evaluate(LEER_CONFIG);
    console.log(`   configuración: «Empezó a trabajar» ${c.diceEmpezoATrabajar ? "SÍ" : "NO"} · ${c.editables}/${c.camposFecha} fechas editables`
      + ` · campo del saldo ${c.haySaldo ? (c.saldoEditable ? "EDITABLE" : "deshabilitado") : "NO ESTÁ"} · paso ${c.paso} · teclado ${c.teclado}`);
    if (a.w === 1440) {
      if (!c.diceEmpezoATrabajar) acusar(`${pasada}/Configuración: no se encontró «Empezó a trabajar»`);
      if (c.editables === 0) acusar(`${pasada}/Configuración: la fecha de ingreso NO se puede editar`);
      if (!c.haySaldo) acusar(`${pasada}/Configuración: no está el campo del saldo`);
      // ⚠️ La migración que CREA la columna ya está corrida en producción, así
      // que el campo tiene que estar habilitado en las DOS pasadas. La que
      // agrega los medios días va aparte y no cambia la pantalla.
      if (!c.saldoEditable) acusar(`${pasada}/Configuración: el saldo NO se puede editar`);
      if (c.paso !== "0.5") acusar(`${pasada}/Configuración: el campo no se mueve de a medio día (step=${c.paso})`);
      if (c.teclado !== "decimal") acusar(`${pasada}/Configuración: el teclado del iPhone no trae el punto (inputmode=${c.teclado})`);
    }

    await page.close();
  }
  await ctx2.close();
}

await browser.close();
console.log(`\nEscrituras bloqueadas: ${escriturasBloqueadas}`);
console.log(hallazgos.length === 0 ? "\n🟢 SIN HALLAZGOS" : `\n🔴 ${hallazgos.length} hallazgos`);
process.exit(hallazgos.length === 0 ? 0 : 1);
