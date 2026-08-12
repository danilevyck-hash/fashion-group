/**
 * Baja el CSV de "Descargar Detalle" del reporte `Stock → Reportes → Reporte
 * ingreso mercancía` de la web de Switch, y lo guarda CRUDO a disco.
 *
 * ⚠️ El login web usa `changesession="SI"`: **TOMA la sesión y expulsa a quien
 * esté en el panel de esa empresa** (el usuario configurado es el de Daniel).
 * Por eso: UNA sola sesión por empresa, secuencial, nunca en paralelo, y
 * `cerrarSesionWeb` al terminar. Correr fuera de las ventanas de cron.
 *
 * NO carga nada a la base: eso lo hace `_cargar-ingresos-mercancia.ts` desde los
 * archivos ya guardados. Separado a propósito — si la carga falla, no hay que
 * volver a entrar a Switch.
 *
 * Modo DESCUBRIR (`--descubrir`): en la MISMA sesión busca la página del reporte
 * en el menú, saca de su JavaScript las URLs de descarga y las prueba. Existe
 * para no gastar dos expulsiones (una para mirar y otra para bajar).
 *
 * Uso:
 *   ENVFILE=<ruta/.env> EMPRESA=vistana DESDE=2022-01-01 HASTA=2026-08-10 \
 *     OUT=<carpeta> npx tsx scripts/_bajar-ingresos-mercancia.ts [--descubrir]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { config as cargarEnv } from "dotenv";
import { loginSwitchWeb, cerrarSesionWeb, type WebSession } from "../src/lib/switch-api/web-client";

if (process.env.ENVFILE) cargarEnv({ path: process.env.ENVFILE });

const EMPRESA = process.env.EMPRESA ?? "vistana";
const DESDE = process.env.DESDE ?? "2022-01-01";
const HASTA = process.env.HASTA ?? new Date().toISOString().slice(0, 10);
const OUT = process.env.OUT ?? "/tmp/ingresos";
const DESCUBRIR = process.argv.includes("--descubrir");
const SUFIJO = process.env.SUFIJO ?? "";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

/** Lo que manda el JS de la página. No se toca: es el tamaño que el servidor espera. */
const CHUNK = 500;
/** Techo del acumulador. Frena un bucle infinito si el servidor nunca dijera
 *  `response:false`; a 500 por ronda cubre 2 millones de renglones. */
const MAX_RONDAS = 4000;

const cookieHeader = (jar: Map<string, string>) =>
  [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

interface Respuesta {
  status: number;
  ct: string;
  disp: string;
  body: string;
}

async function pedir(
  s: WebSession,
  path: string,
  init: RequestInit = {},
): Promise<Respuesta> {
  const url = path.startsWith("http") ? path : `${s.baseUrl}${path}`;
  const res = await fetch(url, {
    ...init,
    redirect: "manual",
    headers: {
      "User-Agent": UA,
      Cookie: cookieHeader(s.cookies),
      Accept: "text/html,application/json,text/csv,*/*",
      ...(init.headers ?? {}),
    },
  });
  return {
    status: res.status,
    ct: res.headers.get("content-type") ?? "",
    disp: res.headers.get("content-disposition") ?? "",
    body: await res.text(),
  };
}

/** El HTML de excepción de Switch llega con HTTP 200 — hay que reconocerlo. */
const esPaginaDeError = (b: string) =>
  /Whoops|exception|Sorry, the page you are looking for|no se encontr|404 Not Found/i.test(b.slice(0, 4000));

const extraerToken = (html: string): string | null =>
  html.match(/name="_token"[^>]*value="([^"]+)"/)?.[1] ??
  html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1] ??
  html.match(/var\s+token\s*=\s*['"]([^'"]+)['"]/)?.[1] ??
  null;

/** ¿Esto que volvió es el CSV del reporte y no una página HTML? */
function pareceCsvDelReporte(r: Respuesta): boolean {
  if (/text\/html/i.test(r.ct)) return false;
  const primera = r.body.split(/\r?\n/)[0] ?? "";
  return primera.includes(";") && /FECHA/i.test(primera) && /N\.?INTERNO/i.test(primera);
}

function rutasDeDescarga(html: string): string[] {
  const out = new Set<string>();
  const patrones = [
    /url\s*:\s*["'`]([^"'`]+)["'`]/gi,
    /action\s*=\s*["']([^"']+)["']/gi,
    /window\.open\(\s*["'`]([^"'`]+)["'`]/gi,
    /(?:location\.href|href)\s*=\s*["'`]([^"'`]+)["'`]/gi,
    /["'`](\/[A-Za-z0-9_\-/]*(?:descarg|export|excel|csv|detalle|ingresomercancia)[A-Za-z0-9_\-/]*)["'`]/gi,
  ];
  for (const re of patrones) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) if (m[1].startsWith("/")) out.add(m[1]);
  }
  return [...out].sort();
}

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
    // ── 1) encontrar la página del reporte ────────────────────────────────
    // El menú es de dos niveles: el dashboard solo enlaza `/menu/stock`, y el
    // reporte cuelga de ahí. Se recorre en anchura y NUNCA más allá de 2 saltos:
    // buscar a ciegas por todo el sitio sería raspar, no usar el menú.
    let pagina = process.env.PAGINA ?? "";
    if (!pagina) {
      const vistos = new Set<string>();
      let frontera = ["/dashboard/vendedor", "/dashboard"];
      for (let nivel = 0; nivel < 3 && !pagina; nivel++) {
        const siguiente: string[] = [];
        for (const p of frontera) {
          if (vistos.has(p)) continue;
          vistos.add(p);
          const r = await pedir(s, p);
          if (r.status !== 200 || esPaginaDeError(r.body)) continue;
          const links = enlacesDelMenu(r.body);
          console.log(`\nMenú ${p}: ${links.length} enlaces candidatos`);
          for (const l of links) console.log("   ", l);
          const elegido = links.find((l) => /ingreso.*mercanc|mercanc.*ingreso|ingresomercancia/i.test(l));
          if (elegido) {
            pagina = elegido;
            break;
          }
          siguiente.push(...links.filter((l) => !vistos.has(l)));
        }
        frontera = siguiente;
      }
    }
    if (!pagina) {
      console.log("\n🔴 No encontré en el menú el enlace del reporte de ingreso de mercancía.");
      console.log("   PARO ACÁ. No voy a raspar la tabla HTML ni a inventar un endpoint.");
      return;
    }
    console.log(`\nPágina del reporte: ${pagina}`);

    const rep = await pedir(s, pagina);
    console.log(`GET ${pagina} → ${rep.status} (${rep.ct}) ${rep.body.length} bytes`);
    if (rep.status !== 200 || esPaginaDeError(rep.body)) {
      console.log("🔴 La página del reporte no cargó. PARO ACÁ.");
      return;
    }
    const token = extraerToken(rep.body);
    console.log("   _token:", token ? "sí" : "NO");
    const rutas = rutasDeDescarga(rep.body);
    console.log("   rutas candidatas en el JS:");
    for (const u of rutas) console.log("     ", u);

    if (DESCUBRIR) {
      const campos = new Set<string>();
      const re = /<(?:input|select|textarea)[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(rep.body))) campos.add(m[1]);
      console.log("   campos del formulario:", [...campos].sort().join(", "));
      guardar(`_pagina_${EMPRESA}.html`, rep.body);
    }

    if (!token) {
      console.log("🔴 La página no trae `_token`. PARO ACÁ.");
      return;
    }

    // ── 2) disparar los DOS botones del reporte ───────────────────────────
    //
    // Sacado del propio JS de la página (`/assets/js/reportes/ingresomercancia.js`,
    // funciones `descargarreporte` y `descargardetallereporte`), no adivinado:
    //
    //   POST /reportes/stockingresomercancia         ← botón "Descargar" (resumen)
    //   POST /reportes/stockingresomercanciadetalle  ← botón "Descargar Detalle"
    //
    // Los dos son ACUMULADORES, igual que `/estadodecuenta/obtener`: mientras la
    // respuesta traiga `response: true` hay que volver a pedir con `key += chunk`
    // y el `file` que devolvió. La ronda que responde `response: false` deja el
    // archivo listo en `GET /log/<file>`.
    const bajado: Record<string, boolean> = {};

    async function descargar(etiqueta: "detalle" | "resumen"): Promise<boolean> {
      const ruta =
        etiqueta === "detalle"
          ? "/reportes/stockingresomercanciadetalle"
          : "/reportes/stockingresomercancia";
      let key = 0;
      let file = "";
      let ronda = 0;

      console.log(`\n── ${etiqueta.toUpperCase()} · POST ${ruta}`);
      while (ronda < MAX_RONDAS) {
        ronda++;
        const body = new URLSearchParams({
          chunk: String(CHUNK),
          key: String(key),
          file,
          // Vacío = "Todas" / "Todos" (así vienen los <select> de la página).
          sucursalId: process.env.SUCURSAL_ID ?? "",
          proveedorId: "",
          search: "",
          articulos: "[]",
          marcas: "[]",
          rubros: "[]",
          subrubros: "[]",
          desde: DESDE,
          hasta: HASTA,
          _token: token!,
        }).toString();

        const r = await pedir(s, ruta, {
          method: "POST",
          body,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            Accept: "application/json",
            Origin: s.baseUrl,
            Referer: `${s.baseUrl}${pagina}`,
          },
        });
        let j: { response?: boolean; file?: string };
        try {
          j = JSON.parse(r.body);
        } catch {
          console.log(`   🔴 ronda ${ronda}: respuesta no-JSON (${r.status}, ct="${r.ct}")`);
          console.log(`      primeros 300: ${JSON.stringify(r.body.slice(0, 300))}`);
          return false;
        }
        if (j.file) file = j.file;
        if (j.response === true) {
          key += CHUNK;
          if (ronda % 10 === 0) process.stdout.write(`\r   acumulando… ronda ${ronda} (key=${key})`);
          continue;
        }
        console.log(`\n   listo en ${ronda} ronda(s). archivo: ${file}`);
        break;
      }
      if (!file) {
        console.log("   🔴 el servidor nunca devolvió un nombre de archivo.");
        return false;
      }
      if (ronda >= MAX_RONDAS) {
        console.log(`   🔴 no terminó en ${MAX_RONDAS} rondas — NO se guarda un archivo a medias.`);
        return false;
      }

      const dl = await pedir(s, `/log/${file}`);
      console.log(`   GET /log/${file} → ${dl.status} ct="${dl.ct}" ${dl.body.length} bytes`);
      if (dl.status !== 200 || !pareceCsvDelReporte(dl)) {
        console.log(`   🔴 lo que bajó no es el CSV del reporte. primeros 200: ${JSON.stringify(dl.body.slice(0, 200))}`);
        return false;
      }
      guardar(`${EMPRESA}__${etiqueta}${SUFIJO}.csv`, dl.body);
      return true;
    }

    bajado.detalle = await descargar("detalle");
    bajado.resumen = await descargar("resumen");

    console.log(
      `\nDetalle: ${bajado.detalle ? "✅" : "🔴 NO SE PUDO"} · Resumen: ${bajado.resumen ? "✅" : "🔴 NO SE PUDO"}`,
    );
    if (!bajado.detalle) {
      console.log("🔴 No pude disparar 'Descargar Detalle' por HTTP. PARO ACÁ y lo reporto.");
      console.log("   No raspo la tabla HTML paginada.");
    }
  } finally {
    await cerrarSesionWeb(s);
    console.log("\nSesión cerrada.");
  }
}

main().catch((e) => {
  console.error("FALLÓ:", e instanceof Error ? e.message : e);
  process.exit(1);
});
