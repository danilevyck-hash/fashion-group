// Sonda puntual: Caja › tabla de gastos › editar la ÚLTIMA fila › Categoría.
//
// Va aparte de `_medir-desplegables.mjs` porque este control necesita una
// coreografía que el barrido genérico no hace bien: hay que entrar en modo
// edición desde el menú ⋯ de la fila Y VACIAR el campo con Backspace, con el
// foco DENTRO del input. Vaciarlo importa: con la categoría escrita la lista
// filtra a 1 opción de 39 px y no se ve el bug; vacío muestra la lista larga,
// que es lo que ve quien va a CAMBIAR la categoría de un gasto. (`fill("")` y
// `Meta+a` no sirven: pierden el foco y cierran la lista.)
//
// MEDIDO a 834 px, editando la última fila:
//   ANTES   → 62 px de la lista RECORTADOS por `DIV.overflow-x-auto`, y ese
//             contenedor pasaba de 0 a 62 px scrolleables (el bug de Guías: la
//             fila que se está editando se puede ir de la vista)
//   DESPUÉS → recorte null, `position: fixed`, `enBody: true`
//
// Solo lectura: nunca guarda el gasto.
import { chromium } from "playwright";
import { readFileSync } from "fs";
const BASE = "http://localhost:3131";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

for (const [W, H] of [[834, 1194], [1440, 900]]) {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: W, height: H } });
  await c.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await c.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await c.addInitScript(() => { sessionStorage.setItem("cxc_role","admin"); sessionStorage.setItem("fg_is_owner","1"); });
  const p = await c.newPage();
  await p.goto(BASE + "/caja", { waitUntil: "networkidle" }); await p.waitForTimeout(2500);
  await p.locator(".caja-row, div.cursor-pointer").filter({ hasText: "Abierto" }).locator("visible=true").first().click().catch(()=>{});
  await p.waitForTimeout(3000);
  const menus = p.getByRole("button", { name: /más opciones/i }).locator("visible=true");
  const n = await menus.count();
  await menus.nth(n - 1).scrollIntoViewIfNeeded().catch(()=>{});
  await menus.nth(n - 1).click().catch(()=>{});
  await p.waitForTimeout(600);
  await p.getByRole("menuitem", { name: /^Editar$/ }).locator("visible=true").first().click().catch(()=>{});
  await p.waitForTimeout(1000);
  const inp = p.locator('input[placeholder="Categoría"]').locator("visible=true").first();
  await inp.scrollIntoViewIfNeeded().catch(()=>{});
  await p.waitForTimeout(400);
  console.log(`\n=== ${W}px · valor inicial:`, await inp.inputValue().catch(()=>"?"));
  await inp.click().catch(()=>{});
  await p.waitForTimeout(500);
  // Borrar carácter por carácter con el foco DENTRO del input (fill/Meta+a
  // pierden el foco y cierran la lista).
  for (let i = 0; i < 20; i++) await p.keyboard.press("Backspace");
  await p.waitForTimeout(900);
  console.log("valor tras borrar:", await inp.inputValue().catch(()=>"?"));
  const m = await p.evaluate(() => {
    const inp = [...document.querySelectorAll('input[placeholder="Categoría"]')].find(e=>e.getBoundingClientRect().width>0);
    // Después del arreglo la lista vive en un PORTAL; antes era hermana del
    // input. Se buscan las dos para poder medir "antes" y "después" igual.
    const panel = document.querySelector('[data-desplegable="caja-categoria"]')
      || (inp && [...inp.parentElement.children].find(e => e !== inp && getComputedStyle(e).position === "absolute" && e.getBoundingClientRect().height > 10));
    if (!panel) return { panel: null, inputY: inp && Math.round(inp.getBoundingClientRect().y) };
    const r = panel.getBoundingClientRect();
    let peor = null, q = panel.parentElement;
    while (q && q !== document.body) {
      const cs = getComputedStyle(q);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
        const pr = q.getBoundingClientRect();
        const abajo = Math.round(Math.max(0, r.bottom - pr.bottom));
        const der = Math.round(Math.max(0, r.right - pr.right));
        if ((abajo + der) > 0 && (!peor || abajo + der > peor.total))
          peor = { por: q.tagName + "." + String(q.className).slice(0,44), perdidoAbajo: abajo, perdidoDer: der, total: abajo + der,
                   contenedor: { y: Math.round(pr.y), h: Math.round(pr.height), scrollable: q.scrollHeight - q.clientHeight } };
      }
      q = q.parentElement;
    }
    return {
      panel: { y: Math.round(r.y), h: Math.round(r.height), opciones: panel.querySelectorAll("button").length,
               posicion: getComputedStyle(panel).position, enBody: panel.parentElement === document.body },
      recorte: peor,
      fueraDePantalla: Math.round(Math.max(0, r.bottom - innerHeight)),
    };
  });
  console.log(JSON.stringify(m, null, 1));
  await b.close();
}
