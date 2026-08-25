/**
 * DIAGNÓSTICO READ-ONLY del mecanismo NUEVO de reportes de Switch (24-ago-2026).
 *
 * Switch cambió el motor de sus reportes el 19-ago-2026 12:37:21 y
 * `POST /estadodecuenta/obtener` dejó de existir (devuelve la página de excepción
 * con HTTP 200). El reemplazo, según el código público del panel, sería:
 *   1. POST reportesmanager/crearreporteconsola  → número de orden
 *   2. GET  reportesmanager/buscarreporteconsola/<n> cada ~2 s hasta TERMINADO
 *   3. leer el resultado
 *
 * Este script NO ESCRIBE NADA: ni en Supabase ni en Switch. Abre UNA sesión web,
 * baja la página del reporte y su JavaScript, extrae de ahí cómo se llama de
 * verdad al endpoint nuevo, lo ejecuta, y vuelca TODO en crudo a disco para
 * poder leerlo con los ojos antes de escribir una sola línea de parser.
 *
 * ⚠️ Abre una sesión WEB de Boston con `changesession=SI`: EXPULSA a quien esté
 * en el panel. Corrida ÚNICA y corta; la sesión se cierra en el `finally`.
 *
 * 🔴 GOTCHA DE LA CASA: un endpoint de Switch se juzga por el SHAPE de la
 * respuesta, NUNCA por el status. El catch-all devuelve 200 con el HTML de
 * excepción (~1.606 bytes, empieza con <!DOCTYPE).
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_diag-boston-reportesmanager.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { loginSwitchWeb, cerrarSesionWeb, type WebSession } from "../src/lib/switch-api/web-client";
import { EMPRESA_CARTERA_WEB } from "../src/lib/switch-api/sync-estadocuenta-web";

const SALIDA = "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

mkdirSync(SALIDA, { recursive: true });

const cookieHeader = (jar: Map<string, string>) =>
  [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

function guardar(nombre: string, contenido: string): string {
  const ruta = `${SALIDA}/${nombre}`;
  writeFileSync(ruta, contenido, "utf8");
  return ruta;
}

/** ¿Esto es la página de excepción de Switch en vez de un dato? */
function esPaginaDeError(texto: string): boolean {
  const t = texto.trimStart();
  return t.startsWith("<!DOCTYPE") || t.startsWith("<html") || /Controller method not found/i.test(texto);
}

function resumir(nombre: string, texto: string, status: number): void {
  const marca = esPaginaDeError(texto) ? "🔴 HTML de excepción" : "🟢 parece dato";
  console.log(`  ${nombre.padEnd(34)} status ${status}  ${String(texto.length).padStart(8)} bytes  ${marca}`);
}

async function pedir(
  s: WebSession,
  url: string,
  init: RequestInit = {},
): Promise<{ status: number; texto: string }> {
  const res = await fetch(url, {
    ...init,
    redirect: "manual",
    headers: { "User-Agent": UA, Cookie: cookieHeader(s.cookies), ...(init.headers || {}) },
  });
  const texto = await res.text();
  return { status: res.status, texto };
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("[1] login web de Boston (UNA sola sesión)…");
  const s = await loginSwitchWeb(EMPRESA_CARTERA_WEB);
  console.log("    ok\n");

  try {
    // ── 2. La página del reporte ────────────────────────────────────────────
    console.log("[2] GET /estadodecuenta");
    const pagina = await pedir(s, `${s.baseUrl}/estadodecuenta`, { headers: { Accept: "text/html" } });
    resumir("/estadodecuenta", pagina.texto, pagina.status);
    console.log(`    → ${guardar("01-estadodecuenta.html", pagina.texto)}`);

    const token =
      pagina.texto.match(/name="_token"[^>]*value="([^"]+)"/)?.[1] ??
      pagina.texto.match(/var\s+token\s*=\s*['"]([^'"]+)['"]/)?.[1] ??
      pagina.texto.match(/csrf-token"\s+content="([^"]+)"/)?.[1] ??
      null;
    console.log(`    _token: ${token ? "encontrado" : "🔴 NO encontrado"}`);

    // ── 3. El JavaScript del panel — de ahí sale cómo se llama de verdad ────
    console.log("\n[3] JS que carga la página");
    const srcs = [...pagina.texto.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]);
    const VENDOR = /jquery|bootstrap|moment|select2|datatable|sweetalert|chart|fastclick|waves|wow|slimscroll|nicescroll|scrollTo|detect|inputmask|validate|toastr|switchery|pace|modernizr/i;
    const propios = srcs.filter((u) => !VENDOR.test(u));
    console.log(`    ${srcs.length} scripts, ${propios.length} candidatos propios`);

    const jsConLaLlamada: { url: string; cuerpo: string }[] = [];
    for (const [i, src] of (process.env.SALTAR_JS === "1" ? [] : propios).entries()) {
      const url = src.startsWith("http") ? src : new URL(src, `${s.baseUrl}/`).toString();
      const js = await pedir(s, url, { headers: { Accept: "*/*" } });
      const nombre = `02-js-${String(i).padStart(2, "0")}-${url.split("/").pop()!.split("?")[0]}`;
      resumir(nombre, js.texto, js.status);
      guardar(nombre, js.texto);
      if (/reportesmanager|crearreporteconsola|buscarreporteconsola/i.test(js.texto)) {
        jsConLaLlamada.push({ url, cuerpo: js.texto });
        console.log(`       ⭐ menciona reportesmanager`);
      }
    }

    // ── 4. Los fragmentos que importan ──────────────────────────────────────
    console.log("\n[4] fragmentos con la llamada nueva");
    let fragmentos = "";
    for (const { url, cuerpo } of jsConLaLlamada) {
      for (const re of [/crearreporteconsola/gi, /buscarreporteconsola/gi]) {
        for (const m of cuerpo.matchAll(re)) {
          const desde = Math.max(0, m.index! - 1800);
          fragmentos += `\n\n═══ ${url} @${m.index} (${m[0]}) ═══\n` + cuerpo.slice(desde, m.index! + 1800);
        }
      }
    }
    if (fragmentos) {
      console.log(`    → ${guardar("03-fragmentos.js", fragmentos)}`);
    } else {
      console.log("    🔴 ningún JS de la página menciona reportesmanager");
    }

    // ── 5. Probar el mecanismo nuevo ────────────────────────────────────────
    // El cuerpo son los MISMOS filtros que usaba /estadodecuenta/obtener (es el
    // mismo reporte), más lo que el JS revele. `pais`/`provincia`/... en CADENA
    // VACÍA, nunca la palabra "null": con "null" el endpoint devuelve 0 sin dar
    // error, que es el modo de fallo más peligroso de este reporte.
    if (!token) {
      console.log("\n[5] sin _token no se puede probar el endpoint nuevo. Paro acá.");
      return;
    }
    // 🔑 Los parámetros REALES, leídos del propio panel (assets/js/estadodecuenta.js):
    //   $(".searchButton").click(() => generarEstadoCuentaCliente(today, today, '4'))
    // O sea: la ANTIGÜEDAD es desde=hasta=hoy con claseReporte '4' — la rama que
    // dibuja las dos tablas (saldos y antigüedad). `chunk`/`key`/`chkSaldo0`/
    // `fechaHasta` YA NO EXISTEN: el acumulador por rondas se fue con el motor
    // viejo. Los filtros geográficos siguen yendo en CADENA VACÍA (con la palabra
    // "null" el reporte devuelve 0 sin dar error); los de segmentación van con
    // JSON.stringify(null) = "null", igual que en el JS.
    const hoy = new Date();
    const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    const filtros: Record<string, string> = {
      desde: fechaHoy,
      hasta: fechaHoy,
      sucursalId: "1",
      saldomayora: "",
      incluirSaldoCero: "false",
      clientesInactivo: "false",
      clientes: "[]",
      vendedores: "[]",
      pais: "",
      provincia: "",
      distrito: "",
      corregimiento: "",
      clienteindustria: "null",
      clientezona: "null",
      clientecategoria: "null",
      clientetamano: "null",
      crmleadreferencia: "null",
      claseReporte: "4",
      tipoReporte: "ESTADOCUENTACLIENTE",
      _token: token,
    };

    console.log("\n[5] POST /reportesmanager/crearreporteconsola");
    const crear = await pedir(s, `${s.baseUrl}/reportesmanager/crearreporteconsola`, {
      method: "POST",
      body: new URLSearchParams(filtros).toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
        Origin: s.baseUrl,
        Referer: `${s.baseUrl}/estadodecuenta`,
      },
    });
    resumir("crearreporteconsola", crear.texto, crear.status);
    console.log(`    → ${guardar("04-crearreporteconsola.txt", crear.texto)}`);
    console.log(`    primeros 400: ${crear.texto.slice(0, 400).replace(/\s+/g, " ")}`);

    if (esPaginaDeError(crear.texto)) {
      console.log("\n    🔴 la ruta tampoco existe o pide otros parámetros. PARO — no adivino.");
      return;
    }

    // 🔑 NO es un número de orden: es un UUID (`{response: true, uuid}`).
    let orden: string | null = null;
    try {
      const j = JSON.parse(crear.texto) as Record<string, unknown>;
      console.log(`    JSON con llaves: ${Object.keys(j).join(", ")}`);
      if (typeof j.uuid === "string" && j.uuid) orden = j.uuid;
    } catch { /* no es JSON */ }
    console.log(`    uuid: ${orden ?? "🔴 no lo pude leer"}`);
    if (!orden) {
      console.log("    PARO — sin uuid no hay qué consultar.");
      return;
    }

    // ── 6. Sondeo hasta TERMINADO ───────────────────────────────────────────
    console.log(`\n[6] GET /reportesmanager/buscarreporteconsola/${orden} cada 2 s`);
    let ultimo = "";
    for (let intento = 1; intento <= 90; intento++) {
      const r = await pedir(s, `${s.baseUrl}/reportesmanager/buscarreporteconsola/${orden}`, {
        headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json", Referer: `${s.baseUrl}/estadodecuenta` },
      });
      ultimo = r.texto;
      if (intento === 1 || intento % 10 === 0) resumir(`buscar (intento ${intento})`, r.texto, r.status);
      if (esPaginaDeError(r.texto)) {
        console.log("    🔴 el sondeo devuelve el HTML de excepción. PARO.");
        console.log(`    → ${guardar("05-buscarreporteconsola-error.txt", r.texto)}`);
        return;
      }
      let estatus = "";
      try { estatus = String((JSON.parse(r.texto) as Record<string, unknown>).estatus ?? ""); } catch { /* */ }
      if (estatus === "TERMINADO") {
        console.log(`    ✅ TERMINADO en el intento ${intento} (~${intento * 2} s)`);
        break;
      }
      if (estatus === "ERROR" || estatus === "CANCELADO") {
        console.log(`    🔴 el reporte terminó en ${estatus}. PARO.`);
        guardar("05-buscarreporteconsola-fallo.json", r.texto);
        return;
      }
      await dormir(2000);
    }
    console.log(`    → ${guardar("05-buscarreporteconsola.json", ultimo)}`);

    // ── 7. La forma del resultado ───────────────────────────────────────────
    //
    // 🔑 Según el propio JS del panel (assets/js/estadodecuenta.js):
    //     var reporte   = data.data || {};
    //     var registros = reporte.data || [];
    //     var totales   = reporte.totales || {};
    //   "El .jsonl ahora viene como {data:[...], totales:{...}} en vez de un array
    //    plano, para traer los totales ya calculados y no tener que sumarlos en JS"
    //
    // O sea: los totales dejaron de llamarse `saldosTotales` (array de
    // {title, saldo}) y ahora son `totales` (objeto {bucket: valor, total: N}).
    console.log("\n[7] forma del resultado");
    try {
      const j = JSON.parse(ultimo) as Record<string, unknown>;
      const describir = (v: unknown): string =>
        Array.isArray(v) ? `array[${v.length}]` : v === null ? "null" : typeof v;
      console.log("    nivel 1:");
      for (const [k, v] of Object.entries(j)) console.log(`      ${k}: ${describir(v)}`);

      const reporte = (j.data ?? {}) as Record<string, unknown>;
      console.log("    nivel 2 (data):");
      for (const [k, v] of Object.entries(reporte)) console.log(`      ${k}: ${describir(v)}`);

      const registros = (reporte.data ?? []) as Record<string, unknown>[];
      const totales = (reporte.totales ?? {}) as Record<string, unknown>;

      console.log(`\n    registros: ${registros.length}`);
      console.log(`    TOTALES: ${JSON.stringify(totales)}`);

      if (registros.length) {
        const r0 = registros[0];
        console.log(`\n    llaves de un registro: ${Object.keys(r0).join(", ")}`);
        console.log(`    registro[0] completo:\n${JSON.stringify(r0, null, 2).slice(0, 3000)}`);

        // 🔴 LA PREGUNTA QUE DECIDE TODO: ¿vienen los DOCUMENTOS, o solo el
        // agregado por cliente? `switch_estadocuenta` guarda UNA FILA POR
        // DOCUMENTO (llave empresa_key + ccte_id). Sin documentos, este reporte
        // no puede alimentar esa tabla.
        const conArrays = Object.entries(r0).filter(([, v]) => Array.isArray(v));
        console.log(`\n    🔴 arrays dentro del registro: ${conArrays.length ? conArrays.map(([k, v]) => `${k}[${(v as unknown[]).length}]`).join(", ") : "NINGUNO — solo el agregado por cliente"}`);
        for (const [k, v] of conArrays) {
          const arr = v as unknown[];
          if (arr.length) console.log(`    ${k}[0] = ${JSON.stringify(arr[0]).slice(0, 1500)}`);
        }
        const conObjetos = Object.entries(r0).filter(([, v]) => v && typeof v === "object" && !Array.isArray(v));
        for (const [k, v] of conObjetos) console.log(`    ${k} = ${JSON.stringify(v).slice(0, 600)}`);
      }

      guardar("06-payload-completo.json", JSON.stringify(j, null, 2));
      console.log(`\n    → ${SALIDA}/06-payload-completo.json`);
    } catch (e) {
      console.log(`    no es JSON (${String(e)}). primeros 600: ${ultimo.slice(0, 600).replace(/\s+/g, " ")}`);
    }
  } finally {
    // ⛔ Sesión única: se cierra pase lo que pase.
    console.log("\n[8] cerrando la sesión web…");
    await cerrarSesionWeb(s);
    console.log("    cerrada");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
