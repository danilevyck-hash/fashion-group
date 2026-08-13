// SOLO LECTURA. Dos verificaciones de click-through sobre el build de
// producción, que un test de fuente no puede dar:
//
//   1. TOCAR la pestaña cambia de vista Y escribe el `?tab=` en la URL (y el
//      Atrás del navegador vuelve a la anterior).
//   2. EL PERMISO: quien NO es admin no llega a la pantalla — ni siquiera
//      teniendo la key `usuarios` puesta a mano, que es el caso REAL de Angela
//      (secretaria) medido en producción el 13-ago-2026.
//
// ⚠️ Lo que la verificación 2 prueba y lo que no: siembra el rol y los módulos
// en `sessionStorage`, que es exactamente lo que lee el guard del navegador
// (`hasModuleAccess`). La cookie sigue siendo la de un admin, así que esto mide
// LA PUERTA DEL CLIENTE. La del servidor se prueba aparte y ya existía:
// `/api/admin/data-health` es `requireRole(req, ["admin"])`.
//
// 🔴 NO TOCA NINGÚN BOTÓN QUE ESCRIBA. Solo pestañas y navegación.
//
//   BASE=http://localhost:3181 node scripts/_verif-usuarios-tab-permiso.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3181";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const nav = await chromium.launch();
let fallas = 0;
const decir = (ok, msg) => { if (!ok) fallas += 1; console.log(`${ok ? "🟢" : "🔴"} ${msg}`); };

async function contexto(role, modulos) {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(([r, m]) => {
    sessionStorage.setItem("cxc_role", r);
    sessionStorage.setItem("fg_user_name", "prueba");
    if (m) sessionStorage.setItem("fg_modules", JSON.stringify(m));
  }, [role, modulos]);
  return ctx;
}

// ── 1. La pestaña cambia de vista y escribe la URL ───────────────────────────
{
  const ctx = await contexto("admin", null);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/usuarios`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  decir(/Nuevo Usuario/.test(await page.innerText("body")), "arranca en Usuarios");

  await page.getByRole("tab", { name: /Data Health/ }).click();
  await page.waitForTimeout(3500);
  const url = page.url();
  const cuerpo = await page.innerText("body");
  decir(url.includes("tab=data-health"), `tocar la pestaña escribe el ?tab= → ${url.replace(BASE, "")}`);
  decir(/Estado actual por check/.test(cuerpo) && /Correr checks ahora/.test(cuerpo), "se ve la pantalla de Data Health entera");
  decir(!/Nuevo Usuario/.test(cuerpo), "y la de Usuarios dejó de estar montada");

  // 🔴 LA PESTAÑA NO DEJA ENTRADA DE HISTORIAL, y eso es la regla de la casa,
  // no un descuido: "filtro / tab / sort en el MISMO nivel → replace; Back no
  // debe ciclar por tabs" (CLAUDE.md › Navegación e Historial). `useUrlState`
  // usa `replace` por defecto, igual que las pestañas de Ventas y Multifashion.
  // Lo que se verifica es justamente eso: el Atrás SALE del módulo en vez de
  // volver a la pestaña anterior.
  await page.goBack();
  await page.waitForTimeout(3000);
  decir(!page.url().includes("/admin/usuarios"),
    `el Atrás sale del módulo en vez de ciclar pestañas (quedó en ${page.url().replace(BASE, "") || "la página anterior"})`);
  await ctx.close();
}

// ── 2. El permiso: nadie que no sea admin entra ──────────────────────────────
for (const [role, modulos, quien] of [
  // El caso REAL medido en producción: Angela, secretaria, con `usuarios` en
  // su `modulos_override`. Es la persona por la que el guard NO se pudo aflojar.
  ["secretaria", ["directorio", "marketing", "cheques", "caja", "comisiones", "guias",
    "packing-lists", "reclamos", "catalogos", "cargar", "cxc", "usuarios"], "Angela (secretaria, con `usuarios` a mano)"],
  // Y por si alguien todavía tuviera la key vieja guardada en la base.
  ["secretaria", ["catalogos", "guias", "data-health"], "una secretaria con la key vieja `data-health`"],
  ["vendedor", ["cxc", "directorio"], "un vendedor cualquiera"],
]) {
  for (const destino of ["/admin/usuarios", "/admin/usuarios?tab=data-health", "/admin/data-health"]) {
    const ctx = await contexto(role, modulos);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${destino}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    const cuerpo = await page.innerText("body");
    const fuera = !page.url().includes("/admin/usuarios") || (!/Estado actual por check/.test(cuerpo) && !/Nuevo Usuario/.test(cuerpo));
    decir(fuera, `${quien} → ${destino} rebota (quedó en ${page.url().replace(BASE, "")})`);
    decir(!/Estado actual por check/.test(cuerpo), `   …y NO ve Data Health`);
    await ctx.close();
  }
}

await nav.close();
console.log(`\n${fallas === 0 ? "🟢 TODO BIEN" : `🔴 ${fallas} fallas`}`);
