/**
 * FASE 2 — baja el reporte «Producto/Servicio más vendidos» de ACS
 * (/reportesventa/ventasarticulos), UN RENGLÓN POR LÍNEA DE VENTA.
 *
 * Cada fila trae: fecha · secuencial (N. Interno = el ticket) · codigo ·
 * cantidad · descripcion · precioventa · subTotalConDescuento.
 *
 * 🔴 SOLO LECTURA. No escribe una fila en la base. Todo va a JSONL local.
 * ⚠️ Abre sesión con changesession="SI" → EXPULSA a quien esté en el panel.
 * ⚠️ Se baja MES POR MES y cada mes verifica lo traído contra `recordsTotal`
 *    que declara el propio servidor: un corte silencioso se ve, no se supone.
 *
 * Uso:
 *   SWITCH_MULTIFASHION_API_URL=https://americanclassicstore.switch-soft.com \
 *   MESES=2026-08 OUT=/tmp/acs/datos \
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_bajar-acs-ventasarticulos.ts
 */
import { writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loginSwitchWeb, cerrarSesionWeb, type WebSession } from "../src/lib/switch-api/web-client";

const OUT = process.env.OUT ?? "/tmp/acs/datos";
const PAGINA = "/reportesventa/ventasarticulos";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
/** Techo por pedido. El panel usa chunk=2000 para exportar; no pedimos más de lo que él pide. */
const MAX_LENGTH = 2000;

const COLUMNAS = [
  "fecha", "clienteCodigo", "cliente", "vendedor", "secuencial", "codigo",
  "codigoActividad", "cantidad", "descripcion", "referencia",
  "itbmsPorcentaje", "precioventa", "subTotalConDescuento", "itbms", "total",
] as const;

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

/** Los mismos parámetros que manda el JS del panel. Vacíos = "todos". */
function cuerpo(token: string, desde: string, hasta: string, start: number, length: number) {
  const p = new URLSearchParams({
    draw: "1",
    start: String(start),
    length: String(length),
    currentPage: String(Math.floor(start / Math.max(length, 1)) + 1),
    "order[0][column]": "4",   // secuencial: agrupa el ticket y da orden estable
    "order[0][dir]": "asc",
    desde, hasta,
    sucursalId: "1",
    articulotipo: "null",
    tipoCliente: "null",
    articulos: "[]",
    proveedores: "[]",
    vendedores: "[]",
    clientes: "[]",
    marcas: "[]",
    rubros: "[]",
    subrubros: "[]",
    temporada: "[]",
    clienteindustria: "null",
    clientezona: "null",
    clientecategoria: "null",
    clientetamano: "null",
    crmleadreferencia: "null",
    pais: "null",
    _token: token,
  });
  COLUMNAS.forEach((c, i) => {
    p.set(`columns[${i}][data]`, c);
    p.set(`columns[${i}][name]`, "");
    p.set(`columns[${i}][searchable]`, "true");
    p.set(`columns[${i}][orderable]`, "true");
  });
  return p.toString();
}

async function pedir(s: WebSession, token: string, desde: string, hasta: string, start: number, length: number) {
  const res = await fetch(`${s.baseUrl}${PAGINA}`, {
    method: "POST",
    body: cuerpo(token, desde, hasta, start, length),
    headers: {
      "User-Agent": UA,
      Cookie: cookieHeader(s.cookies),
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json",
      Origin: s.baseUrl,
      Referer: `${s.baseUrl}${PAGINA}`,
    },
  });
  const txt = await res.text();
  if (esError(txt)) throw new Error(`Switch devolvió su página de excepción (HTTP ${res.status})`);
  let j: { data?: unknown[]; recordsTotal?: number; recordsFiltered?: number };
  try { j = JSON.parse(txt); }
  catch { throw new Error(`respuesta no-JSON (HTTP ${res.status}): ${txt.slice(0, 300)}`); }
  return { filas: Array.isArray(j.data) ? j.data : [], total: Number(j.recordsTotal ?? 0) };
}

const ultimoDia = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  return `${m}-${String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, "0")}`;
};

async function main() {
  const meses = (process.env.MESES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!meses.length) throw new Error("falta MESES=2025-09,2025-10,…");
  mkdirSync(OUT, { recursive: true });

  console.log("Login web a american_classic… ⚠️ TOMA la sesión del panel.");
  const s = await loginSwitchWeb("american_classic");
  console.log(`Login OK → ${s.baseUrl}`);

  const resumen: { mes: string; total: number; leidas: number; tickets: number; ok: boolean }[] = [];
  try {
    const pg = await fetch(`${s.baseUrl}${PAGINA}`, {
      headers: { "User-Agent": UA, Cookie: cookieHeader(s.cookies), Accept: "text/html" },
    });
    const html = await pg.text();
    const token = extraerToken(html);
    if (!token) throw new Error("no se encontró el _token de la página del reporte");
    console.log("Token del reporte OK.\n");

    for (const mes of meses) {
      const desde = `${mes}-01`, hasta = ultimoDia(mes);
      const archivo = join(OUT, `${mes}.jsonl`);
      if (existsSync(archivo)) writeFileSync(archivo, "");

      // 1) cuántas filas dice el servidor que hay
      const sonda = await pedir(s, token, desde, hasta, 0, 1);
      const total = sonda.total;

      // 2) traerlas paginando, y CONTAR lo que llegó
      let leidas = 0;
      const tickets = new Set<string>();
      for (let start = 0; start < total; start += MAX_LENGTH) {
        const { filas } = await pedir(s, token, desde, hasta, start, MAX_LENGTH);
        if (!filas.length) break;
        const lineas = filas.map((f) => {
          const r = f as Record<string, unknown>;
          const doc = String(r.secuencial ?? "");
          tickets.add(doc);
          return JSON.stringify({
            documento: doc,
            // 11- = Factura, 13- = Nota de Crédito (verificado contra switch_facturas)
            tipo: doc.startsWith("13-") ? "Nota de Crédito" : "Factura",
            fecha: String(r.fecha ?? "").slice(0, 10),
            codigo: String(r.codigo ?? ""),
            descripcion: String(r.descripcion ?? ""),
            cantidad: Number(String(r.cantidad ?? "0").replace(/,/g, "")),
            precio: Number(String(r.precioventa ?? "0").replace(/,/g, "")),
            subtotal: Number(String(r.subTotalConDescuento ?? "0").replace(/,/g, "")),
          });
        });
        appendFileSync(archivo, lineas.join("\n") + "\n");
        leidas += filas.length;
        process.stdout.write(`\r  ${mes}: ${leidas}/${total} renglones`);
      }
      const ok = leidas === total;
      console.log(`\r  ${mes}: ${leidas}/${total} renglones · ${tickets.size} documentos ${ok ? "✓" : "🔴 NO CUADRA"}`);
      resumen.push({ mes, total, leidas, tickets: tickets.size, ok });
    }
  } finally {
    await cerrarSesionWeb(s);
    console.log("\nSesión cerrada.");
  }

  console.log("\n── Resumen ──");
  let L = 0, T = 0;
  for (const r of resumen) { L += r.leidas; T += r.tickets; if (!r.ok) console.log(`🔴 ${r.mes} cortó: ${r.leidas} de ${r.total}`); }
  console.log(`renglones ${L} · documentos ${T} · meses ${resumen.length}`);
  writeFileSync(join(OUT, "_resumen.json"), JSON.stringify(resumen, null, 2));
}

main().catch((e) => { console.error("FALLÓ:", e instanceof Error ? e.message : e); process.exit(1); });
