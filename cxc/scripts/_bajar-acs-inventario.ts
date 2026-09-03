/**
 * Baja el reporte de INVENTARIO de American Classic (Multifashion) del panel
 * web de Switch, en UNA sola sesión, para el estudio de sobre stock.
 *
 * Dos reportes, los dos de solo lectura:
 *   1. /reportestock/listadoinventario  → existencia HOY por artículo (+costo)
 *   2. /reportes/listadoinventario      → existencia A UNA FECHA (12 meses atrás)
 *
 * El mecanismo (DataTables server-side, POST a la misma URL con `_token` y los
 * filtros) se saca del .js de cada página en la MISMA sesión: primero baja el
 * HTML y el JS (quedan en OUT para no tener que volver a entrar), lee las
 * claves `d.xxx = …` del bloque `ajax.data` y arma el cuerpo con los valores
 * por defecto de la página. Si algo no cuadra, el HTML y el JS ya quedaron en
 * disco para corregir sin abrir otra sesión.
 *
 * 🔴 SOLO LECTURA. No escribe nada en la base ni en Switch.
 * ⚠️ Abre sesión con changesession="SI" → EXPULSA a quien esté en el panel.
 *
 * Uso:
 *   FECHA_ATRAS=2025-09-02 OUT=/tmp/acs/inventario \
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_bajar-acs-inventario.ts
 */
import { writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loginSwitchWeb, cerrarSesionWeb, type WebSession } from "../src/lib/switch-api/web-client";

const OUT = process.env.OUT ?? "/tmp/acs/inventario";
const FECHA_ATRAS = process.env.FECHA_ATRAS ?? "";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
const MAX_LENGTH = 2000;

const FECHA_HOY = process.env.FECHA_HOY ?? "";
const SIN_HOY = process.env.SIN_HOY === "1";
// `sucursal` es un <select multiple>: el servidor exige un ARRAY JSON (medido 3-sep-2026:
// con "1" pelado responde «parameterize() must be of the type array»). `costos` es un
// checkbox marcado → true.
const PAGINAS: { nombre: string; ruta: string; extra: Record<string, string> }[] = [
  ...(SIN_HOY ? [] : [{ nombre: "hoy", ruta: "/reportestock/listadoinventario", extra: { sucursalId: '["1"]', costos: "true" } }]),
  ...(FECHA_ATRAS
    ? [{ nombre: "fecha", ruta: "/reportes/listadoinventario", extra: { hasta: FECHA_ATRAS } }]
    : []),
  ...(FECHA_HOY
    ? [{ nombre: "fecha-hoy", ruta: "/reportes/listadoinventario", extra: { hasta: FECHA_HOY } }]
    : []),
];

const cookieHeader = (jar: Map<string, string>) =>
  [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
const esError = (b: string) =>
  /Exception - SWITCH SOFT|Whoops|Controller method not found/i.test(b.slice(0, 4000));

function extraerToken(html: string): string | null {
  return (
    html.match(/name="_token"[^>]*value="([^"]+)"/)?.[1] ??
    html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1] ??
    html.match(/var\s+token\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? null
  );
}

function guardar(nombre: string, contenido: string) {
  mkdirSync(OUT, { recursive: true });
  const ruta = join(OUT, nombre.replace(/[/?=&]/g, "_"));
  writeFileSync(ruta, contenido, "utf8");
  return ruta;
}

async function getTexto(s: WebSession, ruta: string, accept = "text/html") {
  const res = await fetch(`${s.baseUrl}${ruta}`, {
    headers: { "User-Agent": UA, Cookie: cookieHeader(s.cookies), Accept: accept },
  });
  return { status: res.status, body: await res.text() };
}

/** Valor seleccionado de un <select id="..."> en el HTML de la página. */
function valorSelect(html: string, id: string): string | null {
  const m = html.match(new RegExp(`<select[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)</select>`, "i"));
  if (!m) return null;
  const sel = m[1].match(/<option[^>]*selected[^>]*value=["']([^"']*)["']/i)
    ?? m[1].match(/<option[^>]*value=["']([^"']*)["'][^>]*selected/i);
  if (sel) return sel[1];
  const first = m[1].match(/<option[^>]*value=["']([^"']*)["']/i);
  return first ? first[1] : null;
}

/**
 * Lee el bloque `"ajax": { "url": …, "data": function(d){ d.x = …; } }` del JS
 * y devuelve la URL y las claves con su expresión, más las columnas.
 */
function leerMecanismo(js: string, html: string) {
  const url = js.match(/["']?url["']?\s*:\s*BASEURL\s*\+\s*["']([^"']+)["']/)?.[1] ?? null;
  const bloque = js.match(/["']?data["']?\s*:\s*function\s*\(\s*d\s*\)\s*\{([\s\S]*?)\n\s*\}\s*\n?\s*\}/)?.[1] ?? "";
  const claves: Record<string, string> = {};
  for (const m of bloque.matchAll(/d\.(\w+)\s*=\s*([^;\n]+);/g)) claves[m[1]] = m[2].trim();
  // columnas: la variable que se pasa a "columns"
  const varCols = js.match(/["']columns["']\s*:\s*(\w+)/)?.[1];
  const cols: string[] = [];
  if (varCols) {
    const decl = js.match(new RegExp(`${varCols}\\s*=\\s*\\[([\\s\\S]*?)\\];`))?.[1] ?? "";
    for (const m of decl.matchAll(/["']data["']\s*:\s*["']([^"']+)["']/g)) cols.push(m[1]);
  }
  // valores por defecto de las variables globales del JS (var x = [] / 'null' / today)
  const globales: Record<string, string> = {};
  for (const m of js.matchAll(/^\s*var\s+(\w+)\s*=\s*([^;\n]+);/gm)) globales[m[1]] = m[2].trim();
  const resolver = (expr: string, extra: Record<string, string>): string => {
    const sel = expr.match(/\$\(\s*["']#(\w+)["']\s*\)\.val\(\)/)?.[1];
    if (sel) return valorSelect(html, sel) ?? "";
    const js1 = expr.match(/JSON\.stringify\(\s*(\w+)\s*\)/)?.[1];
    if (js1) {
      if (js1 in extra) return extra[js1];
      const g = globales[js1] ?? "";
      if (/^\[\s*\]$/.test(g)) return "[]";
      if (/^\$\(/.test(g)) { const id = g.match(/#(\w+)/)?.[1]; return id ? JSON.stringify(valorSelect(html, id) ?? "") : "null"; }
      if (/^["']/.test(g)) return JSON.stringify(g.replace(/^["']|["']$/g, ""));
      if (/^\d/.test(g)) return g;
      return "null";
    }
    const v = expr.match(/^(\w+)$/)?.[1];
    if (v) {
      if (v in extra) return extra[v];
      const g = globales[v] ?? "";
      if (/^["']/.test(g)) return g.replace(/^["']|["']$/g, "");
      if (/^\d+$/.test(g)) return g;
      if (/^\$\(/.test(g)) { const id = g.match(/#(\w+)/)?.[1]; return id ? (valorSelect(html, id) ?? "") : ""; }
      return "";
    }
    if (/^["']/.test(expr)) return expr.replace(/^["']|["']$/g, "");
    return "";
  };
  return { url, claves, cols, resolver };
}

async function main() {
  console.log("Login web a american_classic… ⚠️ TOMA la sesión del panel.");
  const s = await loginSwitchWeb("american_classic");
  console.log(`Login OK → ${s.baseUrl}\n`);
  const resumen: Record<string, unknown>[] = [];

  try {
    for (const pg of PAGINAS) {
      console.log(`── ${pg.nombre}: ${pg.ruta} ──`);
      const { status, body: html } = await getTexto(s, pg.ruta);
      if (status !== 200 || esError(html)) { console.log(`   ✗ HTTP ${status} / página de excepción`); continue; }
      guardar(`pagina${pg.ruta}.html`, html);
      const token = extraerToken(html);
      if (!token) { console.log("   ✗ sin _token"); continue; }

      // columnas del <th>
      const ths = [...html.matchAll(/<th[^>]*>([\s\S]{0,120}?)<\/th>/gi)]
        .map((m) => m[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
      console.log(`   columnas <th>: ${ths.join(" | ")}`);

      // el JS propio de la página
      const scripts = [...html.matchAll(/src\s*=\s*["']([^"']+\.js[^"']*)["']/gi)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, ""));
      const propio = scripts.find((x) => /listadoinventario/i.test(x)) ?? scripts.find((x) => /\/assets\/js\/report/i.test(x));
      console.log(`   js propio: ${propio ?? "(no encontrado)"}`);
      let js = "";
      if (propio) {
        const r = await getTexto(s, propio, "*/*");
        js = r.body;
        guardar(`js${propio}`, js);
      }
      const mec = leerMecanismo(js, html);
      console.log(`   ajax url: ${mec.url ?? "(no encontrada)"} · claves: ${Object.keys(mec.claves).join(", ") || "(ninguna)"} · columnas data: ${mec.cols.join(", ") || "(ninguna)"}`);
      const rutaPost = mec.url ? `/${mec.url.replace(/^\//, "")}` : pg.ruta;

      const cuerpo = (start: number, length: number) => {
        const p = new URLSearchParams({ draw: "1", start: String(start), length: String(length), "order[0][column]": "0", "order[0][dir]": "asc" });
        for (const [k, expr] of Object.entries(mec.claves)) {
          if (k === "_token") { p.set(k, token); continue; }
          if (k === "currentPage") { p.set(k, String(Math.floor(start / Math.max(length, 1)) + 1)); continue; }
          p.set(k, mec.resolver(expr, pg.extra));
        }
        for (const [k, v] of Object.entries(pg.extra)) if (!(k in mec.claves)) p.set(k, v);
        p.set("_token", token);
        mec.cols.forEach((c, i) => {
          p.set(`columns[${i}][data]`, c); p.set(`columns[${i}][name]`, "");
          p.set(`columns[${i}][searchable]`, "true"); p.set(`columns[${i}][orderable]`, "true");
        });
        return p;
      };
      const sonda = cuerpo(0, 1);
      console.log(`   cuerpo: ${[...sonda.entries()].filter(([k]) => !k.startsWith("columns[") && k !== "_token").map(([k, v]) => `${k}=${v}`).join(" ")}`);

      const pedir = async (start: number, length: number) => {
        const res = await fetch(`${s.baseUrl}${rutaPost}`, {
          method: "POST", body: cuerpo(start, length).toString(),
          headers: {
            "User-Agent": UA, Cookie: cookieHeader(s.cookies),
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest", Accept: "application/json",
            Origin: s.baseUrl, Referer: `${s.baseUrl}${pg.ruta}`,
          },
        });
        const txt = await res.text();
        return { status: res.status, txt };
      };

      const pr = await pedir(0, 1);
      guardar(`sonda-${pg.nombre}.txt`, pr.txt);
      if (esError(pr.txt)) { console.log(`   ✗ sonda: página de excepción (HTTP ${pr.status})`); continue; }
      let j: { data?: unknown[]; recordsTotal?: number };
      try { j = JSON.parse(pr.txt); } catch { console.log(`   ✗ sonda no-JSON (HTTP ${pr.status}): ${pr.txt.slice(0, 300)}`); continue; }
      const total = Number(j.recordsTotal ?? 0);
      console.log(`   sonda OK: recordsTotal=${total} · muestra: ${JSON.stringify((j.data ?? [])[0] ?? null).slice(0, 400)}`);

      const archivo = join(OUT, `${pg.nombre}.jsonl`);
      writeFileSync(archivo, "");
      let leidas = 0;
      for (let start = 0; start < total; start += MAX_LENGTH) {
        const r = await pedir(start, MAX_LENGTH);
        let jj: { data?: unknown[] };
        try { jj = JSON.parse(r.txt); } catch { console.log(`   🔴 página ${start} no-JSON`); break; }
        const filas = Array.isArray(jj.data) ? jj.data : [];
        if (!filas.length) break;
        appendFileSync(archivo, filas.map((f) => JSON.stringify(f)).join("\n") + "\n");
        leidas += filas.length;
        process.stdout.write(`\r   ${leidas}/${total} filas`);
      }
      console.log(`\r   ${leidas}/${total} filas ${leidas === total ? "✓" : "🔴 NO CUADRA"} → ${archivo}`);
      resumen.push({ pagina: pg.nombre, ruta: pg.ruta, total, leidas, ok: leidas === total });
    }
  } finally {
    await cerrarSesionWeb(s);
    console.log("\nSesión cerrada.");
  }
  writeFileSync(join(OUT, "_resumen.json"), JSON.stringify(resumen, null, 2));
  console.log(JSON.stringify(resumen));
}

main().catch((e) => { console.error("FALLÓ:", e instanceof Error ? e.message : e); process.exit(1); });
