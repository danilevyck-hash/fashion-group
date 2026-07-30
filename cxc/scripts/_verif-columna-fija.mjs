// ¿La primera columna se queda QUIETA al deslizar? Y ¿se puede leer, o las
// columnas de plata se le ven por debajo?
//
// 🩸 POR QUÉ ESTE SCRIPT Y NO MIRAR EL CSS. Daniel pidió su tabla de vuelta en
// el celular, con la columna del nombre fija (30-jul-2026: *"me gusta ver mi
// tabla completa"*). Que el CSS diga `position: sticky` NO prueba nada: una
// columna fija se rompe de tres maneras que el CSS no delata —
//
//   1. NO SE QUEDA. `sticky` no hace nada si el que scrollea no es el ancestro
//      que uno cree, o si un `overflow` intermedio lo corta.
//   2. SE VE A TRAVÉS. Sin fondo OPACO, las columnas que pasan por debajo se
//      leen encima del nombre. Es el error más común y el más feo: el CSS es
//      "correcto" y la pantalla es ilegible.
//   3. SE SOLAPA. Con el z-index mal, el encabezado fijo pasa por debajo de las
//      celdas y los datos se montan.
//
// Así que se mide contra el navegador: se lleva el scroll AL EXTREMO DERECHO y
// se pregunta si la celda quedó ANCLADA AL BORDE IZQUIERDO del contenedor.
//
// ⚠️ El criterio NO es "no se movió". Una columna que no arranca pegada al borde
// —porque tiene otra a su izquierda— SÍ se mueve al deslizar: recorre hasta el
// borde y ahí se clava. Medir "se movió 0 px" la daría por rota estando bien, y
// —peor— daría por buena una columna que simplemente no llegó a despegarse
// porque había poco que deslizar. Lo que prueba que está fija es dónde TERMINA:
// pegada al borde, con el resto pasándole por debajo.
//
// Y se saca captura en ese extremo, que es donde se ve si algo se transparenta
// o se monta.
//
// LA OPACIDAD Y EL SOLAPAMIENTO SE MIDEN, NO SE SUPONEN, y no con píxeles sino
// con dos preguntas que el DOM contesta sin ambigüedad:
//   · `getComputedStyle(celda).backgroundColor` tiene que tener alfa 1. Un
//     `rgba(0,0,0,0)` es exactamente el bug de "se ve a través".
//   · `document.elementFromPoint()` en el centro de la celda, CON EL SCROLL EN
//     EL EXTREMO, tiene que devolver la celda fija (o algo adentro de ella). Si
//     devuelve una celda de datos, algo se está dibujando encima: solapamiento.
// La captura queda igual como evidencia para mirarla con los ojos.
//
// GOTCHAS heredados: sembrar la cookie firmada y `sessionStorage` (si no, todo
// al login) y `delete Navigator.prototype.serviceWorker` antes de navegar.
//
// Solo lectura: no se toca ningún botón que ejecute, guarde ni sincronice.
//
//   BASE=http://localhost:3183 node scripts/_verif-columna-fija.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3183";
const SALIDA = process.env.SALIDA ?? "/tmp/t83";
const ANCHO = Number(process.env.ANCHO ?? 390);
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const PANTALLAS = [
  {
    id: "ventas-resumen",
    url: "/ventas?tab=resumen",
    listo: "table tbody tr",
    // Celda que tiene que quedarse quieta y el texto que debe seguir legible.
    fija: "table tbody tr:first-child > td:first-child",
  },
  { id: "ventas-clientes", url: "/ventas?tab=clientes", listo: "[data-fila-cliente]", fija: '[data-fila-cliente] [data-col="celda-nombre"]' },
  { id: "ventas-utilidad", url: "/ventas?tab=utilidad", listo: "[data-fila-utilidad]", fija: '[data-fila-utilidad] [data-col="cliente"]' },
  { id: "ventas-productos", url: "/ventas?tab=productos", listo: "[data-fila-producto]", fija: '[data-fila-producto] [data-col="descripcion"]' },
];

mkdirSync(SALIDA, { recursive: true });

// 🩸 El contenedor se busca por `overflow-x`, NO por "el primero que desborde".
// Buscarlo por desborde se enganchó en un `<tr>` de Productos, que reportaba 22
// px de scrollWidth de más y NO scrollea: asignarle `scrollLeft` no hacía nada,
// así que la prueba se creía hecha sin haber deslizado un píxel. Un elemento que
// desborda no es lo mismo que un elemento que se puede deslizar.
const HELPER = `
  function scrollerDe(cel) {
    let n = cel.parentElement;
    while (n && n !== document.documentElement) {
      const ox = getComputedStyle(n).overflowX;
      if ((ox === "auto" || ox === "scroll") && n.scrollWidth - n.clientWidth > 1) return n;
      n = n.parentElement;
    }
    return null;
  }
`;

const nav = await chromium.launch();
const ctx = await nav.newContext({
  viewport: { width: ANCHO, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: ANCHO < 1200,
  isMobile: false,
});
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await ctx.addInitScript(() => {
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
  sessionStorage.setItem("fg_is_owner", "1");
  sessionStorage.setItem("fg_modules", JSON.stringify(["ventas", "cxc", "clientes", "vista-general", "admin"]));
});
const page = await ctx.newPage();

let fallas = 0;
for (const p of PANTALLAS) {
  const r = { id: p.id };
  try {
    await page.goto(BASE + p.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(p.listo, { timeout: 60000, state: "attached" });
    await page.waitForTimeout(2500);
    // La fila tiene que estar A LA VISTA: `elementFromPoint` devuelve null fuera
    // del viewport, y eso se leería como "algo la tapa" siendo que está fuera de
    // pantalla. Pasó con Resumen, que tiene los KPI arriba.
    await page.locator(p.fija).first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);

    const antes = await page.evaluate(({ sel, helper }) => {
      eval(helper);
      const cel = document.querySelector(sel);
      if (!cel) return { error: "no encontré la celda fija: " + sel };
      // El contenedor que scrollea a lo ancho.
      let cont = scrollerDe(cel);
      if (!cont) return { error: "esta pantalla NO se desliza — la columna fija no se puede probar acá" };
      const b = cel.getBoundingClientRect();
      const cs = getComputedStyle(cel);
      return {
        x: Math.round(b.left), ancho: Math.round(b.width),
        texto: (cel.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30),
        maxScroll: cont.scrollWidth - cont.clientWidth,
        contIzq: Math.round(cont.getBoundingClientRect().left),
        posicion: cs.position,
        fondo: cs.backgroundColor,
      };
    }, { sel: p.fija, helper: HELPER });

    if (antes.error) {
      console.log(`⚠️  ${p.id.padEnd(17)} ${antes.error}`);
      continue;
    }

    // Al EXTREMO derecho: es donde la columna fija se rompe si se va a romper.
    await page.evaluate(({ sel, helper }) => {
      eval(helper);
      const cel = document.querySelector(sel);
      const cont = scrollerDe(cel);
      cont.scrollLeft = cont.scrollWidth;
    }, { sel: p.fija, helper: HELPER });
    await page.waitForTimeout(600);

    const despues = await page.evaluate(({ sel, helper }) => {
      eval(helper);
      const cel = document.querySelector(sel);
      let cont = scrollerDe(cel);
      const b = cel.getBoundingClientRect();
      const cs = getComputedStyle(cel);
      // ¿Qué se dibuja ARRIBA en el centro de la celda fija? Si no es ella,
      // algo se le montó encima.
      const encima = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return {
        x: Math.round(b.left), ancho: Math.round(b.width),
        texto: (cel.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30),
        scrollLeft: Math.round(cont.scrollLeft),
        contIzq: Math.round(cont.getBoundingClientRect().left),
        fondo: cs.backgroundColor,
        // `encima === null` = el punto cayó fuera del viewport, no "la tapan".
        fueraDeVista: encima === null,
        tapada: encima !== null && !(encima === cel || cel.contains(encima)),
        quienTapa: encima ? encima.tagName.toLowerCase() + "." + String(encima.className).slice(0, 40) : null,
      };
    }, { sel: p.fija, helper: HELPER });

    const ruta = path.join(SALIDA, `columna-fija-${p.id}-${ANCHO}-extremo.png`);
    await page.screenshot({ path: ruta });

    // ANCLADA: en el extremo, su borde izquierdo coincide con el del contenedor.
    const desviacion = Math.abs(despues.x - despues.contIzq);
    const anclada = desviacion <= 1;
    const mismoTexto = antes.texto === despues.texto;
    // alfa 1: `rgba(r,g,b,0)` o `transparent` es el bug de "se ve a través".
    const opaca = /^rgb\(/.test(despues.fondo) || /,\s*1\)$/.test(despues.fondo);
    // Y que de verdad haya habido algo que deslizar: si no, no probó nada.
    const huboDesliz = antes.maxScroll > 0 && despues.scrollLeft > 0;

    const ok = anclada && mismoTexto && opaca && !despues.tapada && !despues.fueraDeVista && huboDesliz;
    if (!ok) fallas++;
    console.log(
      `${ok ? "✅" : "❌"} ${p.id.padEnd(17)} desliza ${String(antes.maxScroll).padStart(4)} px · ` +
      `${anclada ? "anclada al borde" : "NO se ancló (" + desviacion + " px del borde)"} · ` +
      `texto ${mismoTexto ? "igual" : "CAMBIÓ"} · ` +
      `fondo ${opaca ? "opaco" : "TRANSPARENTE (" + despues.fondo + ")"} · ` +
      `${despues.fueraDeVista ? "FUERA DE VISTA" : despues.tapada ? "TAPADA por " + despues.quienTapa : "al frente"}` +
      (huboDesliz ? "" : " · ⚠️ no hubo desliz: no prueba nada") +
      (ok ? "" : `   ← ${ruta}`),
    );
    if (!mismoTexto) console.log(`     antes: "${antes.texto}"  ·  extremo: "${despues.texto}"`);
  } catch (err) {
    fallas++;
    console.log(`❌ ${p.id.padEnd(17)} ${String(err?.message ?? err).slice(0, 120)}`);
  }
}

await ctx.close();
await nav.close();
console.log(`\n${fallas} pantalla(s) con problemas · capturas en ${SALIDA}`);
process.exit(fallas ? 1 : 0);
