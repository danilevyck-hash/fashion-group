// ─────────────────────────────────────────────────────────────────────────────
// AUDITORÍA DE BOTONES — «todo botón visible tiene que hacer algo» (2-oct-2026)
//
// Daniel: *«auditar todos los botones para asegurarse que funcionen»*. Este
// script recorre las pantallas principales de cada módulo, como admin, en el
// celular (390×844, con dedo) y en la computadora (1440×900), y TOCA cada
// botón, pestaña, «···», chip, selector y buscador visible que NO guarda nada.
// Después de cada toque mira si algo pasó: cambió la dirección, apareció un
// diálogo o una hoja, cambió el contenido, bajó un archivo o se abrió el menú.
//
// Lo que reporta, por pantalla y por ancho:
//   · NADA ....... se tocó y no pasó nada (el defecto que se busca).
//   · TAPADO ..... otro elemento se queda con el toque (en el iPhone, el botón
//                  no responde). Dice cuál lo tapa.
//   · DESBORDE ... la página es más ancha que el teléfono (se arrastra de lado
//                  y lo del borde, como el ☰, queda fuera del dedo).
//   · ENLACE ROTO  un enlace interno que contesta 404 o 500.
//   · GUARDA ..... botones que guardan, borran o mandan: NO se tocan; solo se
//                  dice si están y si están habilitados.
//
// 🔴 SOLO LECTURA. Se bloquea TODO POST, PUT, PATCH y DELETE (también el
// registro de visitas) y todo GET a `/api/cron/*` o a un sync. Los botones que
// guardan ni se tocan: el bloqueo es la red de seguridad, no el plan.
//
// ── CÓMO SE CORRE ───────────────────────────────────────────────────────────
//
//   1. Un servidor local (nunca producción):  npx next dev -p 3460
//   2. Una cookie de sesión de admin en /tmp/fg-cookie.txt. La arma
//      `node scripts/_cookie-medicion.mjs` (toma prestado, solo leyendo, el
//      token de una sesión de admin viva). O pásala en COOKIE=… .
//   3. npx tsx scripts/auditar-botones.ts
//
//   Variables (todas opcionales):
//     BASE=http://localhost:3460      a dónde apunta
//     SOLO=asistencia,catalogo        solo las pantallas cuya ruta contenga eso
//     ANCHOS=390,1440                 qué anchos (390 = celular con dedo)
//     MAX=60                          tope de controles por pantalla
//     SALIDA=/tmp/auditar-botones.json  el detalle completo
//     NAVEGADOR=webkit|chromium       webkit se parece más al iPhone, si está
//                                     instalado (npx playwright install webkit)
//
// ⚠️ Un «NADA» no siempre es un defecto: un botón que abre algo que ya estaba
// abierto, o un chip que filtra una lista que ya estaba filtrada, no cambia la
// pantalla. Cada «NADA» se mira a mano antes de arreglarlo.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium, webkit, type Browser, type BrowserContext, type Page } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3460";
const SOLO = process.env.SOLO ? process.env.SOLO.split(",") : null;
const ANCHOS = (process.env.ANCHOS ?? "390,1440").split(",").map(Number);
const MAX = Number(process.env.MAX ?? 60);
const SALIDA = process.env.SALIDA ?? "/tmp/auditar-botones.json";
const COOKIE =
  process.env.COOKIE ??
  (existsSync("/tmp/fg-cookie.txt") ? readFileSync("/tmp/fg-cookie.txt", "utf8").trim() : "");

/** Las pantallas principales de cada módulo, y las pestañas que son pantallas. */
const PANTALLAS: string[] = [
  "/home",
  "/vista-general",
  "/ventas", "/ventas?tab=clientes", "/ventas?tab=productos",
  "/comisiones",
  "/referencia",
  "/cxc",
  "/multifashion",
  "/boston",
  "/clientes",
  "/proveedores",
  "/catalogos/marcas", "/catalogo/reebok", "/catalogo/reebok/pedidos", "/catalogos/admin/reebok",
  "/guias",
  "/asistencia?tab=asistencia", "/asistencia?tab=aprobaciones", "/asistencia?tab=planilla",
  "/asistencia?tab=prestamos", "/asistencia?tab=colaboradores", "/asistencia?tab=marcaciones",
  "/reclamos",
  "/productos/cargar",
  "/marketing",
  "/caja",
  "/gastos-contabilidad",
  "/recordatorios",
  "/admin/usuarios",
];

/** Lo que guarda, borra, manda o sincroniza: NO se toca. */
const GUARDA =
  /guardar|eliminar|borrar|anular|enviar|mandar|aprobar|rechazar|reabrir|cerrar (la |el )?(planilla|quincena|per[ií]odo|caja|mes)|crear|registrar|marcar|subir|importar|sincroniz|actualizar ahora|actualizar datos|traer ahora|duplicar|confirmar|aplicar|procesar|generar|cobrar|pagar|deshacer|vaciar|quitar|cerrar sesi[oó]n|salir|contrase[ñn]a|restablecer|desactivar|activar|revocar|decidir|justificar|aceptar|^(s[ií]|no) a /i;

/** Lo que se toca: botones, pestañas, chips, «···», selectores, enlaces y buscadores. */
const SELECTOR =
  'button, [role="button"], [role="tab"], [role="menuitem"], a[href], select, summary, input[type="search"], input[placeholder*="uscar"]';

type Resultado = "ok" | "nada" | "tapado" | "desborde" | "error" | "guarda" | "enlace-roto" | "enlace-ok";

interface Control {
  id: number;
  /** Etiqueta + nombre + vez: así se vuelve a encontrar después de recargar. */
  clave: string;
  tag: string;
  nombre: string;
  href: string | null;
  deshabilitado: boolean;
}

interface Fila {
  pantalla: string;
  ancho: number;
  control: string;
  resultado: Resultado;
  detalle?: string;
}

// ── En la página ────────────────────────────────────────────────────────────

/** Marca cada control visible con `data-auditoria` y devuelve su descripción. */
function marcarControles(selector: string): Control[] {
  const vistos = new Map<string, number>();
  const out: Control[] = [];
  let id = 0;
  document.querySelectorAll("[data-auditoria]").forEach((e) => e.removeAttribute("data-auditoria"));
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || cs.visibility === "hidden" || cs.display === "none") continue;
    if (el.closest("[aria-hidden='true'], [inert]")) continue;
    // Un <select> invisible que cubre su rótulo (el patrón de iOS) SÍ cuenta.
    if (Number(cs.opacity) === 0 && el.tagName !== "SELECT") continue;
    const nombre = (
      el.getAttribute("aria-label") ||
      (el as HTMLInputElement).placeholder ||
      el.innerText ||
      el.getAttribute("title") ||
      ""
    ).replace(/\s+/g, " ").trim().slice(0, 60);
    const clave = `${el.tagName}|${nombre}`;
    // Las filas repetidas (200 «···» de una tabla) se prueban dos veces, no 200.
    const n = (vistos.get(clave) ?? 0) + 1;
    vistos.set(clave, n);
    if (n > 2) continue;
    el.setAttribute("data-auditoria", String(id));
    out.push({
      id,
      clave: `${clave}|${n}`,
      tag: el.tagName.toLowerCase(),
      nombre: nombre || `(${el.tagName.toLowerCase()} sin nombre)`,
      href: el.tagName === "A" ? (el as HTMLAnchorElement).getAttribute("href") : null,
      deshabilitado: (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true",
    });
    id++;
  }
  return out;
}

/** Una firma de lo que se ve: si cambia, el toque hizo algo. */
function firma(): string {
  const t = document.body.innerText;
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  const cuenta = (s: string) => document.querySelectorAll(s).length;
  const w = window as unknown as { __efectos?: string[] };
  return [
    h, t.length, cuenta("*"),
    cuenta('[role="dialog"], [aria-modal="true"], dialog[open]'),
    cuenta('[aria-expanded="true"]'), cuenta('[aria-pressed="true"]'),
    cuenta('[aria-selected="true"]'), cuenta("[aria-current]"),
    Math.round(window.scrollY), (w.__efectos ?? []).length,
  ].join(":");
}

/** ¿Quién recibe el dedo en el centro del control? */
function quienRecibe(id: number): string | null {
  const el = document.querySelector(`[data-auditoria="${id}"]`);
  if (!el) return "desapareció";
  const r = el.getBoundingClientRect();
  const arriba = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  if (!arriba || arriba === el || el.contains(arriba) || arriba.contains(el)) return null;
  // Recortado por un contenedor plegado (un acordeón cerrado): no está a la
  // vista, no está tapado.
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (getComputedStyle(p).overflow === "visible") continue;
    const c = p.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    if (c.width < 1 || c.height < 1 || x < c.left || x > c.right || y < c.top || y > c.bottom) return "oculto";
  }
  const nombre = (arriba.getAttribute("aria-label") || (arriba as HTMLElement).innerText || "").trim().slice(0, 40);
  return `${arriba.tagName.toLowerCase()}.${String(arriba.className).slice(0, 50)} «${nombre}»`;
}

// ── El recorrido ────────────────────────────────────────────────────────────

async function prepararContexto(navegador: Browser, ancho: number): Promise<BrowserContext> {
  const celular = ancho < 640;
  const ctx = await navegador.newContext(
    celular
      ? { viewport: { width: ancho, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
      : { viewport: { width: ancho, height: 900 } },
  );
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  // 🔴 SOLO LECTURA: nada que escriba sale de este navegador.
  await ctx.route("**/*", (route) => {
    const req = route.request();
    const url = req.url();
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) return route.abort();
    // Solo las RUTAS de la API: un archivo de la página que se llame «sync»
    // (un componente) no se bloquea, o la pantalla entra en un bucle de
    // recargas y el navegador se cae.
    const ruta = new URL(url).pathname;
    if (ruta.startsWith("/api/") && /\/api\/cron\/|sync|sincroniz/i.test(ruta)) return route.abort();
    return route.continue();
  });
  // tsx compila con `keepNames` y envuelve las funciones internas en `__name`,
  // que en la página no existe: sin esto, `firma()` revienta adentro.
  await ctx.addInitScript({ content: "window.__name = (f) => f;" });
  // La sesión del navegador se siembra con lo MISMO que contesta el login.
  const r = await ctx.request.get(`${BASE}/api/auth/sesion`, { timeout: 120000 });
  if (!r.ok()) throw new Error(`La cookie no sirve: /api/auth/sesion contestó ${r.status()}`);
  const s = (await r.json()) as Record<string, unknown>;
  await ctx.addInitScript((ses: Record<string, unknown>) => {
    // Solo en la página, nunca en sus marcos internos (el de imprimir no
    // tiene almacenamiento y el script reventaba ahí).
    if (window !== window.top) return;
    delete (Navigator.prototype as unknown as { serviceWorker?: unknown }).serviceWorker;
    // Cada carga empieza sin memoria: la pantalla recuerda lo último elegido
    // (período, pestaña, filtro) y, al recargar, abriría en otro lado.
    try { localStorage.clear(); } catch { /* sin almacenamiento */ }
    sessionStorage.setItem("cxc_role", String(ses.role ?? ""));
    if (ses.userId) sessionStorage.setItem("fg_user_id", String(ses.userId));
    if (ses.userName) sessionStorage.setItem("fg_user_name", String(ses.userName));
    if (ses.modules) sessionStorage.setItem("fg_modules", JSON.stringify(ses.modules));
    if (ses.isOwner) sessionStorage.setItem("fg_is_owner", "1");
    // Imprimir, compartir, copiar y abrir otra ventana también son «algo pasó».
    const w = window as unknown as { __efectos: string[] };
    w.__efectos = [];
    window.print = () => { w.__efectos.push("imprimir"); };
    window.open = (() => { w.__efectos.push("ventana"); return null; }) as typeof window.open;
    // El calendario nativo no deja rastro en la página: se anota al pedirlo.
    HTMLInputElement.prototype.showPicker = function () { w.__efectos.push("calendario"); };
    Object.defineProperty(navigator, "share", { value: async () => { w.__efectos.push("compartir"); }, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    try {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: async () => { w.__efectos.push("copiar"); }, write: async () => { w.__efectos.push("copiar"); } },
        configurable: true,
      });
    } catch { /* sin portapapeles */ }
  }, s);
  return ctx;
}

async function abrir(page: Page, ruta: string): Promise<void> {
  await page.goto(BASE + ruta, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  // Los datos llegan DESPUÉS de hidratar: se espera a que el texto deje de
  // crecer (dos lecturas iguales), con un piso y un techo de tiempo.
  let antes = -1;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(600);
    const largo = await page.evaluate(() => document.body.innerText.length).catch(() => 0);
    if (largo === antes && i >= 2) break;
    antes = largo;
  }
}

async function probarPantalla(ctx: BrowserContext, ruta: string, ancho: number): Promise<Fila[]> {
  const filas: Fila[] = [];
  const celular = ancho < 640;
  let page = await ctx.newPage();
  let bajo = false;
  page.on("download", () => { bajo = true; });
  // Elegir un archivo abre la ventana del sistema, que no deja rastro en la página.
  page.on("filechooser", () => { bajo = true; });
  let otraPestana = false;
  // Una pestaña que abre un botón cuenta como «algo pasó» y se cierra. 🔑 Solo
  // las abiertas DESDE esta pantalla: la siguiente pantalla del recorrido
  // también nace como pestaña nueva y no se toca.
  const alAbrir = async (p: Page) => {
    if (p === page || (await p.opener()) !== page) return;
    otraPestana = true;
    await p.close().catch(() => {});
  };
  ctx.on("page", alAbrir);
  try {

    await abrir(page, ruta);
    const urlBase = page.url();
  // Una página más ancha que el teléfono se achica o se arrastra de lado, y lo
  // que queda en el borde (el ☰) se sale del dedo.
  const anchoReal = await page.evaluate(() => document.documentElement.scrollWidth);
  if (anchoReal > ancho + 1) {
    filas.push({ pantalla: ruta, ancho, control: "(la pantalla)", resultado: "desborde", detalle: `mide ${anchoReal} px de ancho` });
  }
    const controles = (await page.evaluate(marcarControles, SELECTOR)).slice(0, MAX);
    let base = await page.evaluate(firma);
    let sucia = false;
    let ids = new Map(controles.map((c) => [c.clave, c.id]));

    for (const c of controles) {
      const fila = (resultado: Resultado, detalle?: string) =>
        filas.push({ pantalla: ruta, ancho, control: `${c.tag} «${c.nombre}»`, resultado, detalle });

      if (GUARDA.test(c.nombre) && c.tag !== "a") {
        fila("guarda", c.deshabilitado ? "deshabilitado" : "habilitado");
        continue;
      }
      if (c.deshabilitado) continue;

      // Los enlaces se comprueban sin salir de la pantalla.
      if (c.tag === "a" && c.href && !c.href.startsWith("#")) {
        if (/^(mailto|tel|https?:\/\/(wa\.me|api\.whatsapp))/i.test(c.href)) { fila("enlace-ok", c.href); continue; }
        const destino = new URL(c.href, urlBase);
        if (destino.origin !== new URL(BASE).origin) { fila("enlace-ok", c.href); continue; }
        if (destino.pathname.startsWith("/api/") && /cron|sync|sincroniz/i.test(destino.pathname)) { fila("guarda", "enlace a un sync"); continue; }
        const r = await ctx.request.get(destino.toString(), { maxRedirects: 5 }).catch(() => null);
        const st = r?.status() ?? 0;
        fila(st > 0 && st < 400 ? "enlace-ok" : "enlace-roto", `${c.href} → ${st}`);
        continue;
      }

      if (sucia) {
        try {
          await abrir(page, ruta);
        } catch {
          // 🩸 Una pestaña que se cae (le pasó a Guías en Chromium) no se lleva
          // lo ya medido: se abre otra y se sigue.
          filas.push({ pantalla: ruta, ancho, control: "(la pantalla)", resultado: "error", detalle: "la pestaña se cayó al recargar; se abrió otra" });
          await page.close().catch(() => {});
          page = await ctx.newPage();
          page.on("download", () => { bajo = true; });
          page.on("filechooser", () => { bajo = true; });
          await abrir(page, ruta);
        }
        ids = new Map((await page.evaluate(marcarControles, SELECTOR)).map((n) => [n.clave, n.id]));
        base = await page.evaluate(firma);
        sucia = false;
      }
      const id = ids.get(c.clave);
      const loc = page.locator(`[data-auditoria="${id}"]`);
      if (id === undefined || (await loc.count()) === 0) { if (process.env.DEPURAR) console.log("FALTA", c.clave, page.url(), [...ids.keys()].join(" ; ")); fila("error", "no se volvió a encontrar"); continue; }
      bajo = false;
      otraPestana = false;

      // Lo que solo aparece después de otro toque (dentro de un desplegable que
      // ya se cerró) no está a la vista ahora: no es un defecto.
      if (!(await loc.isVisible())) continue;
      // Un chip o una pestaña YA elegidos no cambian nada al tocarlos otra vez.
      const yaElegido = await loc.evaluate((el) =>
        ["aria-pressed", "aria-selected", "aria-checked"].some((a) => el.getAttribute(a) === "true") ||
        (el.getAttribute("aria-current") ?? "false") !== "false");
      if (yaElegido && c.tag !== "select") { fila("ok", "ya elegido"); continue; }
      try {
        // Al CENTRO, como lo deja el dedo: pegado al borde de abajo, cualquier
        // fila queda bajo el ☰ flotante y se leería como tapada.
        await loc.evaluate((e) => e.scrollIntoView({ block: "center", inline: "center" }));
        await page.waitForTimeout(150);
        const tapa = await page.evaluate(quienRecibe, id);
        if (tapa === "oculto") continue;
      if (tapa) { fila("tapado", tapa); continue; }

        if (c.tag === "select") {
          const valores = await loc.evaluate((s) => Array.from((s as HTMLSelectElement).options).map((o) => o.value));
          const actual = await loc.inputValue();
          const otro = valores.find((v) => v !== actual);
          if (otro === undefined) { fila("ok", "una sola opción"); continue; }
          await loc.selectOption(otro, { timeout: 3000 });
        } else if (c.tag === "input") {
          await loc.fill("zzqx", { timeout: 3000 });
          await page.waitForTimeout(800);
        } else if (celular) {
          await loc.tap({ timeout: 3000 });
        } else {
          await loc.click({ timeout: 3000 });
        }
        await page.waitForTimeout(700);
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

        const ahora = await page.evaluate(firma).catch(() => "navegó");
        const cambioUrl = page.url() !== urlBase;
        if (cambioUrl || ahora !== base || bajo || otraPestana) {
          fila("ok", cambioUrl ? `→ ${page.url().replace(BASE, "")}` : bajo ? "descarga o archivo" : otraPestana ? "otra pestaña" : "cambió la pantalla");
          // Se intenta volver con Escape; si no alcanza, se recarga antes del siguiente.
          await page.keyboard.press("Escape").catch(() => {});
          await page.waitForTimeout(300);
          sucia = page.url() !== urlBase || (await page.evaluate(firma).catch(() => "")) !== base;
        } else {
          fila("nada");
        }
      } catch (e) {
        const msg = String((e as Error).message ?? e);
        const tapa = /intercepts pointer events/.exec(msg) ? msg.split("\n").find((l) => l.includes("intercepts")) : null;
        fila(tapa ? "tapado" : "error", (tapa ?? msg.split("\n")[0]).slice(0, 160));
        sucia = true;
      }
    }
  } finally {
    ctx.off("page", alAbrir);
    await page.close().catch(() => {});
  }
  return filas;
}

async function main(): Promise<void> {
  if (!COOKIE) throw new Error("Falta la cookie: corre `node scripts/_cookie-medicion.mjs` o pasa COOKIE=…");
  if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error("Solo contra un servidor local: BASE tiene que ser localhost.");
  const tipo = process.env.NAVEGADOR === "webkit" ? webkit : chromium;
  const navegador = await tipo.launch(tipo === chromium ? { channel: "chromium" } : {});
  const todas: Fila[] = [];
  for (const ancho of ANCHOS) {
    const ctx = await prepararContexto(navegador, ancho);
    for (const ruta of PANTALLAS) {
      if (SOLO && !SOLO.some((s) => ruta.includes(s))) continue;
      const filas = await probarPantalla(ctx, ruta, ancho).catch((e) => [
        { pantalla: ruta, ancho, control: "(la pantalla)", resultado: "error" as Resultado, detalle: String(e).slice(0, 160) },
      ]);
      todas.push(...filas);
      const malos = filas.filter((f) => ["nada", "tapado", "desborde", "error", "enlace-roto"].includes(f.resultado));
      console.log(`${String(ancho).padStart(4)} ${ruta.padEnd(34)} ${filas.length} controles · ${malos.length} por mirar`);
      for (const m of malos) console.log(`       ${m.resultado.toUpperCase().padEnd(11)} ${m.control}${m.detalle ? ` — ${m.detalle}` : ""}`);
    }
    await ctx.close();
  }
  await navegador.close();
  writeFileSync(SALIDA, JSON.stringify(todas, null, 2));
  const cuenta = (r: Resultado) => todas.filter((f) => f.resultado === r).length;
  console.log(
    `\nok ${cuenta("ok")} · enlaces ok ${cuenta("enlace-ok")} · guardan (sin tocar) ${cuenta("guarda")} · ` +
    `NADA ${cuenta("nada")} · TAPADO ${cuenta("tapado")} · DESBORDE ${cuenta("desborde")} · ENLACE ROTO ${cuenta("enlace-roto")} · error ${cuenta("error")}`,
  );
  console.log(`Detalle: ${SALIDA}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
