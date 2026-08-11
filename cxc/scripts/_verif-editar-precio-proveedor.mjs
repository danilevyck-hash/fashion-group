// ============================================================================
// Verifica el flujo de EDITAR / AGREGAR / BORRAR un precio del proveedor
// desde el "?" de Mobiliario — SIN ESCRIBIR NI UN BYTE EN PRODUCCIÓN.
//
//   BASE=http://localhost:3195 node scripts/_verif-editar-precio-proveedor.mjs
//
// 🩸 QUÉ PRUEBA Y POR QUÉ ASÍ.
//
// Lo que hay que demostrar es que el PUT que sale del "?" **no menciona
// fotos**. Si las mencionara, la validación del servidor lo leería como "este
// renglón no tiene fotos" y le vaciaría `foto_paths` — que es de donde
// salieron las fotos que hoy se ven en la tabla de Productos. Eso no se puede
// verificar leyendo el código: hay que ver el cuerpo que sale de verdad.
//
// Se intercepta la petición ANTES de que salga del navegador y se responde
// con un OK fabricado, así que la base de producción **nunca se toca**. Se
// hace exactamente lo que Daniel haría —abrir el "?", tocar Editar, cambiar
// el precio, tocar Guardar— y se imprime el método, la URL y el cuerpo.
//
// Y como interceptar prueba lo que MANDA el navegador pero no que la ruta
// exista, aparte se golpea la ruta REAL con un cuerpo INVÁLIDO: tiene que
// contestar un error de validación, que demuestra que está viva y autenticada
// sin escribir nada.
//
// Gotchas heredados: cookie de sesión firmada, sessionStorage (`cxc_role`,
// `fg_modules`) y `delete Navigator.prototype.serviceWorker` antes de navegar.
// ============================================================================

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3195";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const RUTA = "/api/marketing/mobiliario/notas-proveedor";

const capturadas = [];

function ok(cond, msg) {
  console.log(`  ${cond ? "🟢" : "🔴"} ${msg}`);
  return cond;
}

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await ctx.addInitScript(() => {
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_is_owner", "1");
  sessionStorage.setItem("fg_modules", JSON.stringify(["marketing", "clientes", "admin"]));
});
const page = await ctx.newPage();

// 🔴 EL CORTAFUEGOS: nada que no sea GET llega a la base.
await page.route(`**${RUTA}**`, async (route) => {
  const req = route.request();
  const metodo = req.method();
  if (metodo === "GET") return route.fallback();
  let cuerpo = null;
  try { cuerpo = JSON.parse(req.postData() ?? "null"); } catch { /* sin cuerpo */ }
  capturadas.push({ metodo, url: new URL(req.url()).pathname, cuerpo });
  // Respuesta fabricada: la escritura NO ocurre.
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ id: "simulado", producto: "simulado", precio: null, nota: null, fotoPaths: [], fotoUrls: [], orden: 0 }),
  });
});

let todo = true;
const dialogo = () => page.getByRole("dialog");

await page.goto(BASE + "/marketing/mobiliario", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);

console.log("\n1) EDITAR el precio de un renglón\n" + "=".repeat(72));
await page.locator('[aria-haspopup="dialog"]').first().click();
await page.waitForTimeout(2000);
await dialogo().getByRole("button", { name: /^Editar el precio de/ }).first().click();
await page.waitForTimeout(700);
const campoPrecio = dialogo().locator("input").nth(1);
console.log(`  precio que traía: ${JSON.stringify(await campoPrecio.inputValue())}`);
await campoPrecio.fill("66.25");
await dialogo().getByRole("button", { name: "Guardar" }).click();
await page.waitForTimeout(1500);

const put = capturadas.find((c) => c.metodo === "PUT");
todo = ok(!!put, "salió un PUT") && todo;
if (put) {
  console.log(`     ${put.metodo} ${put.url}`);
  console.log(`     cuerpo: ${JSON.stringify(put.cuerpo)}`);
  todo = ok(put.cuerpo?.precio === "66.25", "manda el precio nuevo") && todo;
  todo = ok(!("fotoPaths" in (put.cuerpo ?? {})), "🔴 NO manda fotoPaths (las fotos se conservan)") && todo;
  todo = ok(!("foto_paths" in (put.cuerpo ?? {})), "tampoco foto_paths") && todo;
  todo = ok(Object.keys(put.cuerpo ?? {}).sort().join(",") === "nota,precio,producto", "manda exactamente producto, precio y nota") && todo;
}

console.log("\n2) AGREGAR un precio nuevo\n" + "=".repeat(72));
await page.waitForTimeout(1200);
await dialogo().getByRole("button", { name: "+ Agregar precio" }).click();
await page.waitForTimeout(700);
await dialogo().locator("input").nth(0).fill("Mueble de prueba");
await dialogo().locator("input").nth(1).fill("12.34");
await dialogo().locator("input").nth(2).fill("nota de prueba");
await dialogo().getByRole("button", { name: "Guardar" }).click();
await page.waitForTimeout(1500);
const post = capturadas.find((c) => c.metodo === "POST");
todo = ok(!!post, "salió un POST") && todo;
if (post) {
  console.log(`     ${post.metodo} ${post.url}`);
  console.log(`     cuerpo: ${JSON.stringify(post.cuerpo)}`);
  todo = ok(post.cuerpo?.producto === "Mueble de prueba", "manda el producto nuevo") && todo;
  todo = ok(post.cuerpo?.nota === "nota de prueba", "manda la aclaración") && todo;
}

console.log("\n3) BORRAR (se llega a la confirmación y se confirma)\n" + "=".repeat(72));
await page.waitForTimeout(1200);
await dialogo().getByRole("button", { name: /^Editar el precio de/ }).first().click();
await page.waitForTimeout(700);
await dialogo().getByRole("button", { name: "Borrar" }).click();
await page.waitForTimeout(700);
const avisa = await dialogo().getByText(/La foto del mueble en la tabla de Productos no se toca/).count();
todo = ok(avisa > 0, "la confirmación aclara que la foto no se toca") && todo;
await dialogo().getByRole("button", { name: "Sí, borrar" }).click();
await page.waitForTimeout(1500);
const del = capturadas.find((c) => c.metodo === "DELETE");
todo = ok(!!del, "salió un DELETE") && todo;
if (del) console.log(`     ${del.metodo} ${del.url}`);

console.log("\n4) Escape NO cierra los dos de una\n" + "=".repeat(72));
await page.waitForTimeout(1200);
await dialogo().getByRole("button", { name: /^Editar el precio de/ }).first().click();
await page.waitForTimeout(700);
await dialogo().getByRole("button", { name: "Borrar" }).click();
await page.waitForTimeout(700);
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
todo = ok(await dialogo().count() > 0, "tras Escape sobre la confirmación, el ? SIGUE abierto") && todo;
todo = ok((await dialogo().getByRole("button", { name: "Sí, borrar" }).count()) === 0, "y la confirmación se fue") && todo;
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
todo = ok(await dialogo().count() > 0, "otro Escape cierra la edición, no la ventana") && todo;
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
todo = ok((await dialogo().count()) === 0, "el tercer Escape sí cierra la ventana") && todo;

console.log("\n5) Con cambios sin guardar, el clic afuera NO borra lo escrito\n" + "=".repeat(72));
await page.locator('[aria-haspopup="dialog"]').first().click();
await page.waitForTimeout(1500);
await dialogo().getByRole("button", { name: /^Editar el precio de/ }).first().click();
await page.waitForTimeout(700);
await dialogo().locator("input").nth(1).fill("99.99");
await page.mouse.click(5, 5); // el backdrop
await page.waitForTimeout(600);
todo = ok(await dialogo().count() > 0, "el ? sigue abierto") && todo;
todo = ok((await dialogo().locator("input").nth(1).inputValue()) === "99.99", "lo escrito sigue ahí") && todo;

console.log("\n6) La ruta REAL está viva (cuerpo inválido → no escribe)\n" + "=".repeat(72));
const resp = await ctx.request.post(BASE + RUTA, { data: { producto: "" } });
console.log(`     POST ${RUTA} con producto vacío → ${resp.status()} ${JSON.stringify(await resp.json().catch(() => null))}`);
todo = ok(resp.status() === 400, "responde 400: viva, autenticada y validando") && todo;

console.log("\n" + "=".repeat(72));
console.log(`Peticiones de escritura INTERCEPTADAS (ninguna llegó a la base): ${capturadas.length}`);
console.log(todo ? "\n🟢 TODO EN ORDEN — y NO se escribió nada en producción.\n" : "\n🔴 HAY ALGO MAL.\n");
await navegador.close();
process.exit(todo ? 0 : 1);
