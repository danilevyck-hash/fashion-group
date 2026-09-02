/**
 * FASE 2 — descubrimiento del reporte «Reportes → Venta artículos» de ACS.
 *
 * Daniel indicó dónde está. Lo que hay que averiguar es la RUTA real, el
 * endpoint de export, y sobre todo si cada renglón trae el NÚMERO DE DOCUMENTO
 * (sin eso, 4 de las 5 preguntas no se pueden contestar).
 *
 * ⚠️ SOLO LECTURA. No escribe una fila en la base. Todo va a disco local.
 * ⚠️ Abre sesión con changesession="SI" → EXPULSA a Daniel del panel.
 *    Correr SOLO en la ventana aprobada (05:00–06:10 UTC = 00:00–01:10 Panamá).
 *
 * Usa `loginSwitchWeb` de web-client.ts — el MISMO código que el cron.
 *
 * Uso:
 *   SWITCH_MULTIFASHION_API_URL=https://americanclassicstore.switch-soft.com \
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_diag-acs-lineas-descubrir.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loginSwitchWeb, cerrarSesionWeb, type WebSession } from "../src/lib/switch-api/web-client";

const OUT = process.env.OUT ?? "/tmp/acs/descubrir";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

const cookieHeader = (jar: Map<string, string>) =>
  [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

/** El HTML de excepción de Switch llega con HTTP 200 — el status no alcanza. */
const esError = (b: string) =>
  /Exception - SWITCH SOFT|Whoops|Controller method not found|404 Not Found/i.test(b.slice(0, 4000));

async function get(s: WebSession, ruta: string) {
  const res = await fetch(`${s.baseUrl}${ruta}`, {
    redirect: "manual",
    headers: { "User-Agent": UA, Cookie: cookieHeader(s.cookies), Accept: "text/html,*/*" },
  });
  return { status: res.status, body: await res.text() };
}

function guardar(nombre: string, contenido: string) {
  mkdirSync(OUT, { recursive: true });
  const ruta = join(OUT, nombre.replace(/[/?=&]/g, "_"));
  writeFileSync(ruta, contenido, "utf8");
  return ruta;
}

/** Toda ruta del panel y todo .js que la página referencia. */
function referencias(html: string) {
  const rutas = new Set<string>();
  const scripts = new Set<string>();
  for (const m of html.matchAll(/(?:href|src|url|action)\s*[:=]\s*["']([^"']+)["']/gi)) {
    const v = m[1].replace(/^https?:\/\/[^/]+/, "");
    if (/\.js(\?|$)/i.test(v)) scripts.add(v);
    else if (v.startsWith("/") && !/\.(css|png|jpg|jpeg|svg|ico|woff2?|ttf)/i.test(v)) rutas.add(v);
  }
  for (const m of html.matchAll(/["'](\/[a-z0-9_-]+\/[a-z0-9_/-]+)["']/gi)) rutas.add(m[1]);
  return { rutas: [...rutas], scripts: [...scripts] };
}

/** Los <a> del menú con su TEXTO — así se reconoce «Venta artículos» sin adivinar. */
function enlacesConTexto(html: string): { ruta: string; texto: string }[] {
  const out: { ruta: string; texto: string }[] = [];
  for (const m of html.matchAll(/<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const ruta = m[1].replace(/^https?:\/\/[^/]+/, "");
    const texto = m[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (ruta.startsWith("/") && texto) out.push({ ruta, texto });
  }
  return out;
}

const MENUS = [
  "/dashboard/vendedor", "/dashboard",
  "/menu/reportes", "/menu/reportesventa", "/menu/ventasreportes",
  "/menu/ventas", "/menu/stockreportes", "/menu/inventario", "/menu/caja",
];

async function main() {
  console.log("Login web a american_classic… ⚠️ TOMA la sesión del panel.");
  const s = await loginSwitchWeb("american_classic");
  console.log(`Login OK → ${s.baseUrl}\n`);

  try {
    const todos: { ruta: string; texto: string }[] = [];
    const rutas = new Set<string>();
    const scripts = new Set<string>();

    console.log("── Menús ──");
    for (const p of MENUS) {
      const { status, body } = await get(s, p);
      const malo = status !== 200 || esError(body);
      console.log(`${malo ? "✗" : "✓"} ${p} → HTTP ${status}, ${body.length} bytes`);
      if (malo) continue;
      guardar(`menu${p}.html`, body);
      todos.push(...enlacesConTexto(body));
      const r = referencias(body);
      r.rutas.forEach((x) => rutas.add(x));
      r.scripts.forEach((x) => scripts.add(x));
    }

    // 🔑 Lo que Daniel nombró: un enlace cuyo TEXTO hable de venta + artículo.
    console.log("\n── Enlaces cuyo TEXTO menciona artículos/ventas ──");
    const vistos = new Set<string>();
    const candidatos: string[] = [];
    for (const { ruta, texto } of todos) {
      if (!/art[íi]culo|venta|comprobante|producto/i.test(texto)) continue;
      const k = `${ruta}|${texto}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      console.log(`   "${texto}"  →  ${ruta}`);
      if (/art[íi]culo/i.test(texto)) candidatos.push(ruta);
    }

    // Además, rutas que huelan a lo mismo aunque el texto no lo diga.
    const porNombre = [...rutas].filter((r) => /ventaarticulo|articuloventa|ventasarticulo/i.test(r));
    for (const r of porNombre) if (!candidatos.includes(r)) candidatos.push(r);

    console.log(`\n── ${candidatos.length} candidatas a «Venta artículos» ──`);
    for (const c of candidatos) console.log("   ", c);

    // Abrir cada candidata y mirar QUÉ COLUMNAS declara y a qué endpoint exporta.
    console.log("\n── Abriendo las candidatas ──");
    for (const c of candidatos.slice(0, 8)) {
      const { status, body } = await get(s, c);
      if (status !== 200 || esError(body)) { console.log(`   ✗ ${c} (HTTP ${status})`); continue; }
      const f = guardar(`pagina${c}.html`, body);
      console.log(`   ✓ ${c} → ${f} (${body.length} bytes)`);
      // Encabezados de la tabla = las columnas del reporte.
      const ths = [...body.matchAll(/<th[^>]*>([\s\S]{0,120}?)<\/th>/gi)]
        .map((m) => m[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim())
        .filter(Boolean);
      if (ths.length) console.log(`      columnas: ${ths.join(" | ")}`);
      const r = referencias(body);
      const exp = r.rutas.filter((x) => /export|descarg|detalle|consola|reportesmanager/i.test(x));
      if (exp.length) console.log(`      endpoints de export: ${[...new Set(exp)].join(", ")}`);
      r.scripts.forEach((x) => scripts.add(x));
    }

    // Los .js propios del panel: ahí viven los nombres reales de los endpoints.
    console.log("\n── JS del panel ──");
    for (const js of scripts) {
      if (/jquery|bootstrap|waves|wow|fastclick|nicescroll|slimscroll|inputmask|validate|detect|moment|select2|datatable|chart|sweetalert/i.test(js)) continue;
      const { status, body } = await get(s, js);
      if (status !== 200 || esError(body)) continue;
      console.log(`   ✓ ${js} (${body.length} bytes)`);
      guardar(`js_${js}`, body);
      const hits = [...new Set(referencias(body).rutas.filter((x) => /venta|articulo|export|descarg|detalle|consola/i.test(x)))];
      if (hits.length) console.log(`      → ${hits.join(", ")}`);
    }

    guardar("rutas-todas.txt", [...rutas].sort().join("\n"));
    console.log(`\nTodo guardado en ${OUT}`);
  } finally {
    await cerrarSesionWeb(s);
    console.log("Sesión cerrada.");
  }
}

main().catch((e) => {
  console.error("FALLÓ:", e instanceof Error ? e.message : e);
  process.exit(1);
});
