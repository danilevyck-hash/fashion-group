/**
 * Baja la plantilla de importación de artículos (Stock → Artículos →
 * Importar/Editar → «Descargar Plantilla Modelo») del panel web de Switch de
 * una o varias empresas y la deja en disco con su MD5, para compararla contra
 * la que Daniel bajó a mano (`b622f171…`, Fashion Shoes = Multifashion).
 *
 * ⚠️ SOLO LECTURA. No escribe nada en la base.
 * ⚠️ Abre sesión con changesession="SI" → EXPULSA a quien esté en el panel de
 *    esa empresa. Correr SOLO en la ventana avisada, lejos (≥15 min) de los
 *    crons de esa empresa (`SWITCH_CRON_ENTRADAS`, src/lib/cron-telemetry.ts).
 *
 * Usa `loginSwitchWeb` / `cerrarSesionWeb` de web-client.ts — el MISMO código
 * que los crons. Si `RUTA_PLANTILLA` viene por env (ya se conoce el enlace),
 * primero prueba bajarla SIN sesión: si el servidor la sirve estática, no se
 * expulsa a nadie.
 *
 * Uso:
 *   EMPRESAS=vistana,fashion_wear,active_wear,active_shoes OUT=/tmp/plantillas \
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_bajar-plantilla-articulos-switch.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loginSwitchWeb, cerrarSesionWeb, type WebSession } from "../src/lib/switch-api/web-client";
import { resolveSwitchEnvKey } from "../src/lib/switch-api/empresas";

const OUT = process.env.OUT ?? "/tmp/plantillas";
const EMPRESAS = (process.env.EMPRESAS ?? "vistana").split(",").map((s) => s.trim()).filter(Boolean);
const RUTA_CONOCIDA = process.env.RUTA_PLANTILLA ?? "";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

const cookieHeader = (jar: Map<string, string>) =>
  [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

/** El HTML de excepción de Switch llega con HTTP 200 — el status no alcanza. */
const esError = (b: string) =>
  /Exception - SWITCH SOFT|Whoops|Controller method not found|404 Not Found/i.test(b.slice(0, 4000));

const esXlsx = (buf: Buffer) => buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b; // "PK"

function baseUrlDe(empresaKey: string): string {
  const envKey = resolveSwitchEnvKey(empresaKey);
  const url = process.env[`SWITCH_${envKey}_API_URL`];
  if (!url) throw new Error(`falta SWITCH_${envKey}_API_URL`);
  return url.replace(/\/+$/, "");
}

async function getHtml(s: WebSession, ruta: string) {
  const res = await fetch(`${s.baseUrl}${ruta}`, {
    redirect: "manual",
    headers: { "User-Agent": UA, Cookie: cookieHeader(s.cookies), Accept: "text/html,*/*" },
  });
  return { status: res.status, body: await res.text() };
}

async function getBin(baseUrl: string, ruta: string, jar?: Map<string, string>) {
  const url = ruta.startsWith("http") ? ruta : `${baseUrl}${ruta}`;
  const res = await fetch(url, {
    redirect: "manual",
    headers: { "User-Agent": UA, ...(jar ? { Cookie: cookieHeader(jar) } : {}), Accept: "*/*" },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, ct: res.headers.get("content-type") ?? "" };
}

/** Los <a> con su TEXTO, para reconocer «Importar» / «Plantilla» sin adivinar. */
function enlaces(html: string): { ruta: string; texto: string }[] {
  const out: { ruta: string; texto: string }[] = [];
  for (const m of html.matchAll(/<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
    const ruta = m[1].replace(/^https?:\/\/[^/]+/, "");
    const texto = m[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (ruta.startsWith("/") && texto) out.push({ ruta, texto });
  }
  return out;
}

function guardar(nombre: string, contenido: string | Buffer) {
  mkdirSync(OUT, { recursive: true });
  const ruta = join(OUT, nombre.replace(/[/?=&\s]/g, "_"));
  writeFileSync(ruta, contenido);
  return ruta;
}

const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");

/** Busca en el panel la página de Importar/Editar artículos y el enlace de la plantilla. */
async function descubrirRuta(s: WebSession): Promise<string> {
  const MENUS = ["/menu/stockarticulos", "/menu/stock", "/articulos"];
  const vistos = new Set<string>();
  const candidatos: string[] = [];
  for (const m of MENUS) {
    const { status, body } = await getHtml(s, m);
    if (status !== 200 || esError(body)) continue;
    guardar(`${s.empresaKey}_menu_${m}.html`, body);
    for (const a of enlaces(body)) {
      if (vistos.has(a.ruta)) continue;
      vistos.add(a.ruta);
      if (/importar|plantilla|upload|cargar/i.test(a.texto + " " + a.ruta)) candidatos.push(a.ruta);
    }
    for (const m of body.matchAll(/href\s*=\s*["']([^"']*articulos?[^"']*(?:importar|plantilla|upload|cargar|editar)[^"']*)["']/gi)) {
      const r = m[1].replace(/^https?:\/\/[^/]+/, "");
      if (!vistos.has(r)) { vistos.add(r); candidatos.push(r); }
    }
  }
  console.log(`  páginas candidatas (importar/plantilla): ${candidatos.join(" · ") || "(ninguna)"}`);
  for (const ruta of candidatos) {
    if (/\.(xlsx?|csv)(\?|$)/i.test(ruta)) return ruta; // el enlace ya es el archivo
    const { status, body } = await getHtml(s, ruta);
    if (status !== 200 || esError(body)) continue;
    guardar(`${s.empresaKey}_pagina_${ruta}.html`, body);
    for (const a of enlaces(body)) {
      if (/plantilla|modelo|\.xlsx?/i.test(a.texto + " " + a.ruta) && /descargar|plantilla|modelo|\.xlsx?/i.test(a.texto + " " + a.ruta)) {
        console.log(`  enlace en ${ruta}: «${a.texto}» → ${a.ruta}`);
        return a.ruta;
      }
    }
    // href en un botón/onclick/window.open
    const m = body.match(/["']([^"']*(?:plantilla|modelo)[^"']*\.xlsx?)["']/i);
    if (m) { console.log(`  referencia en ${ruta}: ${m[1]}`); return m[1].replace(/^https?:\/\/[^/]+/, ""); }
  }
  throw new Error("no encontré el enlace de la plantilla; revisa los HTML guardados en " + OUT);
}

async function main() {
  const resumen: { empresa: string; ruta: string; md5: string; bytes: number; conSesion: boolean }[] = [];
  let ruta = RUTA_CONOCIDA;
  for (const empresa of EMPRESAS) {
    const baseUrl = baseUrlDe(empresa);
    console.log(`\n▶ ${empresa} (${baseUrl})`);

    // 1) Si ya se conoce la ruta, probar SIN sesión (no expulsa a nadie).
    if (ruta) {
      const r = await getBin(baseUrl, ruta);
      if (r.status === 200 && esXlsx(r.buf)) {
        const f = guardar(`${empresa}.xlsx`, r.buf);
        console.log(`  ✓ estática sin sesión · ${r.buf.length} bytes · md5 ${md5(r.buf)} → ${f}`);
        resumen.push({ empresa, ruta, md5: md5(r.buf), bytes: r.buf.length, conSesion: false });
        continue;
      }
      console.log(`  la ruta conocida no se sirve sin sesión (HTTP ${r.status}, ${r.ct}) → abro sesión`);
    }

    // 2) Con sesión. ⚠️ EXPULSA a quien esté en el panel de esta empresa.
    console.log("  login web… ⚠️ TOMA la sesión del panel.");
    const s = await loginSwitchWeb(empresa);
    try {
      if (!ruta) ruta = await descubrirRuta(s);
      console.log(`  ruta de la plantilla: ${ruta}`);
      const r = await getBin(s.baseUrl, ruta, s.cookies);
      if (r.status !== 200 || !esXlsx(r.buf)) {
        guardar(`${empresa}_respuesta_plantilla.txt`, r.buf);
        throw new Error(`la plantilla no bajó como xlsx (HTTP ${r.status}, ${r.ct})`);
      }
      const f = guardar(`${empresa}.xlsx`, r.buf);
      console.log(`  ✓ con sesión · ${r.buf.length} bytes · md5 ${md5(r.buf)} → ${f}`);
      resumen.push({ empresa, ruta, md5: md5(r.buf), bytes: r.buf.length, conSesion: true });
    } finally {
      await cerrarSesionWeb(s);
      console.log("  sesión cerrada.");
    }
  }
  guardar("_resumen.json", JSON.stringify(resumen, null, 2));
  console.log("\nRESUMEN");
  for (const r of resumen) console.log(`  ${r.empresa.padEnd(14)} ${r.md5}  ${r.bytes} B  ${r.conSesion ? "con sesión" : "sin sesión"}  ${r.ruta}`);
}

main().catch((e) => { console.error("ERROR:", e instanceof Error ? e.message : e); process.exit(1); });
