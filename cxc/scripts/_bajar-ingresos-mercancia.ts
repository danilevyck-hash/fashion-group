/**
 * Baja a disco, CRUDOS, los dos CSV del reporte `Stock → Reportes → Reporte
 * ingreso mercancía` de la web de Switch.
 *
 * 🔑 **USA EXACTAMENTE EL MISMO CÓDIGO QUE EL CRON.** La descarga es
 * `fetchIngresosMercancia` de `web-client.ts` — la misma función que llama
 * `/api/cron/sync-ingresos-mercancia`. Antes este script tenía su propia copia
 * del acumulador (`chunk`/`key`/`file`), su propio `webFetch` y su propio
 * `_token`; dos copias del mismo mecanismo son dos cosas que se pueden separar,
 * y entonces "lo probé a mano y funcionaba" deja de decir nada sobre el cron.
 *
 * ⚠️ El login web usa `changesession="SI"`: **TOMA la sesión y expulsa a quien
 * esté en el panel de esa empresa** (el usuario configurado es el de Daniel).
 * Por eso: UNA sola sesión por empresa, secuencial, nunca en paralelo, y
 * `cerrarSesionWeb` al terminar. Correr fuera de las ventanas de cron y fuera
 * del horario de oficina de Panamá.
 *
 * NO carga nada a la base: eso lo hace `_cargar-ingresos-mercancia.ts` desde los
 * archivos ya guardados. Separado a propósito — si la carga falla, no hay que
 * volver a entrar a Switch. (El cron sí hace las dos cosas en una pasada, para
 * no gastar dos expulsiones.)
 *
 * Modo DESCUBRIR (`--descubrir`): recorre el menú y lista los enlaces del módulo
 * de Stock. Es lo que encontró `/reportes/ingresomercancia` el 24-ago-2026, y
 * queda como diagnóstico para el día en que Switch mueva la página y el cron
 * empiece a fallar — **el cron NO rastrea el menú a propósito**: uno que se
 * adapta solo terminaría bajando otro reporte sin avisar.
 *
 * Uso:
 *   ENVFILE=<ruta/.env> EMPRESA=vistana DESDE=2022-01-01 HASTA=2026-08-10 \
 *     OUT=<carpeta> npx tsx scripts/_bajar-ingresos-mercancia.ts [--descubrir]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { config as cargarEnv } from "dotenv";
import {
  loginSwitchWeb,
  fetchIngresosMercancia,
  cerrarSesionWeb,
  type WebSession,
} from "../src/lib/switch-api/web-client";

if (process.env.ENVFILE) cargarEnv({ path: process.env.ENVFILE });

const EMPRESA = process.env.EMPRESA ?? "vistana";
const DESDE = process.env.DESDE ?? "2022-01-01";
const HASTA = process.env.HASTA ?? new Date().toISOString().slice(0, 10);
const OUT = process.env.OUT ?? "/tmp/ingresos";
const DESCUBRIR = process.argv.includes("--descubrir");
const SUFIJO = process.env.SUFIJO ?? "";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

const cookieHeader = (jar: Map<string, string>) =>
  [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

/** El HTML de excepción de Switch llega con HTTP 200 — hay que reconocerlo. */
const esPaginaDeError = (b: string) =>
  /Whoops|exception|Sorry, the page you are looking for|no se encontr|404 Not Found/i.test(
    b.slice(0, 4000),
  );

function enlacesDelMenu(html: string): string[] {
  const out = new Set<string>();
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (/ingreso|mercanc|stock|inventario/i.test(m[1])) {
      out.add(m[1].replace(/^https?:\/\/[^/]+/, ""));
    }
  }
  return [...out].sort();
}

/** Solo para `--descubrir`: recorre el menú en anchura, 2 saltos como máximo. */
async function rastrearMenu(s: WebSession): Promise<void> {
  const vistos = new Set<string>();
  let frontera = ["/dashboard/vendedor", "/dashboard"];
  for (let nivel = 0; nivel < 3; nivel++) {
    const siguiente: string[] = [];
    for (const p of frontera) {
      if (vistos.has(p)) continue;
      vistos.add(p);
      const res = await fetch(`${s.baseUrl}${p}`, {
        redirect: "manual",
        headers: { "User-Agent": UA, Cookie: cookieHeader(s.cookies), Accept: "text/html" },
      });
      const body = await res.text();
      if (res.status !== 200 || esPaginaDeError(body)) continue;
      const links = enlacesDelMenu(body);
      console.log(`\nMenú ${p}: ${links.length} enlaces candidatos`);
      for (const l of links) console.log("   ", l);
      siguiente.push(...links.filter((l) => !vistos.has(l)));
    }
    frontera = siguiente;
  }
}

function guardar(nombre: string, contenido: string): string {
  mkdirSync(OUT, { recursive: true });
  const ruta = join(OUT, nombre);
  writeFileSync(ruta, contenido, "utf8");
  const lineas = contenido.split(/\r?\n/).filter((l) => l.trim()).length;
  console.log(`   💾 ${ruta}  (${contenido.length} bytes, ${lineas} líneas)`);
  return ruta;
}

async function main() {
  console.log(`Empresa ${EMPRESA} · rango ${DESDE} → ${HASTA}`);
  console.log("Login web… ⚠️ TOMA la sesión de Switch de esta empresa.");
  const s = await loginSwitchWeb(EMPRESA);
  console.log("Login OK.");

  try {
    if (DESCUBRIR) await rastrearMenu(s);

    // 🔑 La MISMA función que usa el cron. Si esto baja bien, el cron baja bien.
    const d = await fetchIngresosMercancia(s, DESDE, HASTA);
    console.log(
      `\nDetalle: ${d.rondas.detalle} ronda(s) · ${d.archivos.detalle}` +
        `\nResumen: ${d.rondas.resumen} ronda(s) · ${d.archivos.resumen}`,
    );
    guardar(`${EMPRESA}__detalle${SUFIJO}.csv`, d.detalleCsv);
    guardar(`${EMPRESA}__resumen${SUFIJO}.csv`, d.resumenCsv);
    console.log("\n✅ Los dos archivos bajaron. Verificar con _verif-ingresos-parser.ts.");
  } finally {
    await cerrarSesionWeb(s);
    console.log("\nSesión cerrada.");
  }
}

main().catch((e) => {
  console.error("FALLÓ:", e instanceof Error ? e.message : e);
  process.exit(1);
});
