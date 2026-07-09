// ─────────────────────────────────────────────────────────────────────────────
// Constructores PUROS del correo de estado de cuenta (sin dependencias de
// servidor → se importan igual en el modal (cliente) y en la ruta (servidor)).
//
// La MISMA `composeEmailHtml` arma el preview del modal y el HTML que sale por
// Resend, y la MISMA `buildTablaHtml` arma la tabla — así lo que el usuario ve
// en el preview es EXACTAMENTE lo que se envía.
//
// IMPORTANTE: `dias` es la EDAD del documento desde su emisión, NO días de mora.
// Los buckets se rotulan sólo por su rango de días. PROHIBIDO usar la palabra
// "vencido"/"vencida" en el correo.
// ─────────────────────────────────────────────────────────────────────────────

import type { EstadoCuentaEmpresa } from "@/lib/cxc/estado-cuenta-data";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Mes en español capitalizado + año, ej. "Julio 2026". */
export function mesLabel(d: Date = new Date()): string {
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br>");
}

/** Dinero con signo legible: crédito → "-$1,234.00". */
export function money(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

/** Sanitiza un fragmento para usarlo en el nombre de archivo del PDF. */
export function sanitizeFilenamePart(s: string): string {
  return s.replace(/[/\\]/g, "-").replace(/\s+/g, " ").trim();
}

/**
 * Fecha de vencimiento = fecha_creacion + plazo_credito días. Si no hay plazo
 * (0/null → todas las NC y Recibos) devuelve "—". Formato dd/mm/aaaa.
 */
export function fmtVence(fecha: string | null, plazoCredito: number | null): string {
  if (!fecha || !plazoCredito || plazoCredito <= 0) return "—";
  // fecha viene como date/ISO; anclar a mediodía evita corrimientos por zona.
  const base = new Date(fecha.includes("T") ? fecha : `${fecha}T12:00:00`);
  if (isNaN(base.getTime())) return "—";
  base.setDate(base.getDate() + Math.round(plazoCredito));
  const dd = String(base.getDate()).padStart(2, "0");
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${base.getFullYear()}`;
}

// Buckets por EDAD en días (no mora). 0-30, 31-60, 61-90, 91-120, 121+.
export const BUCKET_LABELS = ["0-30", "31-60", "61-90", "91-120", "121+"] as const;

/** Índice de bucket (0..4) para una edad en días. null/negativo cae en 0-30. */
export function bucketIndex(dias: number | null): number {
  const d = dias == null ? 0 : dias;
  if (d <= 30) return 0;
  if (d <= 60) return 1;
  if (d <= 90) return 2;
  if (d <= 120) return 3;
  return 4;
}

const round = (n: number) => Math.round(n * 100) / 100;

const TH = "padding:6px 8px;font-size:11px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;background:#f9fafb";
const TD = "padding:6px 8px;font-size:12px;color:#111827;border-bottom:1px solid #f3f4f6";

/**
 * Tabla HTML por empresa: título "{Empresa} — {Cliente}" + columnas
 * Doc. | Vence | Saldo | [Antigüedad (días): 0-30 | 31-60 | 61-90 | 91-120 | 121+].
 * Cada documento coloca su saldo firmado en SU bucket según la edad; la fila
 * Total suma saldo y cada bucket.
 */
export function buildTablaHtml(empresas: EstadoCuentaEmpresa[], cliente: string): string {
  const clienteSafe = escapeHtml(cliente);
  return empresas
    .map((emp) => {
      const totals = [0, 0, 0, 0, 0];
      const rows = emp.documentos
        .map((doc) => {
          const bi = bucketIndex(doc.dias);
          totals[bi] = round(totals[bi] + doc.saldo);
          const cells = BUCKET_LABELS.map((_, i) =>
            `<td style="${TD};text-align:right;font-variant-numeric:tabular-nums">${i === bi ? money(doc.saldo) : ""}</td>`,
          ).join("");
          return `<tr>
            <td style="${TD}">${escapeHtml(doc.numero)}</td>
            <td style="${TD};white-space:nowrap">${fmtVence(doc.fecha, doc.plazoCredito)}</td>
            <td style="${TD};text-align:right;font-variant-numeric:tabular-nums">${money(doc.saldo)}</td>
            ${cells}
          </tr>`;
        })
        .join("");
      const totalCells = totals
        .map((t) => `<td style="${TD};text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${money(t)}</td>`)
        .join("");
      return `
      <div style="margin:0 0 20px">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#111827">${escapeHtml(emp.empresa_nombre)} — ${clienteSafe}</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
          <thead>
            <tr>
              <th rowspan="2" style="${TH};text-align:left">Doc.</th>
              <th rowspan="2" style="${TH};text-align:left">Vence</th>
              <th rowspan="2" style="${TH};text-align:right">Saldo</th>
              <th colspan="5" style="${TH};text-align:center">Antigüedad (días)</th>
            </tr>
            <tr>
              ${BUCKET_LABELS.map((l) => `<th style="${TH};text-align:right">${l}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr>
              <td style="${TD};font-weight:700">Total</td>
              <td style="${TD}"></td>
              <td style="${TD};text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${money(emp.subtotal)}</td>
              ${totalCells}
            </tr>
          </tbody>
        </table>
      </div>`;
    })
    .join("");
}

/** Firma del correo: nombre del usuario + línea fija (sin cargo). */
export function buildFirma(nombreCompleto: string): string {
  return `${nombreCompleto}\nFashion Group Panamá`;
}

/** Cuerpo editable por defecto. */
export function defaultCuerpo(mes: string): string {
  return [
    "Buen día,",
    "",
    "Espero se encuentren bien.",
    "",
    `Adjunto encontrarán los estados de cuenta correspondientes al cierre del mes de ${mes}.`,
    "",
    "Favor confirmar su programación de pagos.",
  ].join("\n");
}

/** Asunto por defecto: "{Empresas} — Estado de cuenta {Mes}". */
export function defaultAsunto(empresasNombres: string[], mes: string): string {
  const empresas = empresasNombres.join(" - ");
  return `${empresas} — Estado de cuenta ${mes}`;
}

/**
 * HTML completo del correo = encabezado + cuerpo editable + tablas + cierre +
 * firma. `cuerpo` es texto plano (se escapa + nl2br). `tablaHtml` ya es HTML
 * (viene de buildTablaHtml, no editable). `firma` es texto plano.
 */
export function composeEmailHtml(opts: { cuerpo: string; tablaHtml: string; firma: string }): string {
  const { cuerpo, tablaHtml, firma } = opts;
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:0 auto;color:#111827">
    <div style="background:#111827;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
      <h2 style="margin:0;font-size:18px;letter-spacing:0.02em">FASHION GROUP</h2>
      <p style="margin:4px 0 0;font-size:12px;opacity:0.75">Departamento de Cobros · Panamá</p>
    </div>
    <div style="padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
      <p style="font-size:13px;line-height:1.6;margin:0 0 18px">${nl2br(cuerpo)}</p>
      ${tablaHtml}
      <p style="font-size:13px;line-height:1.6;margin:18px 0 0">Quedamos atentos a sus comentarios.</p>
      <p style="font-size:13px;line-height:1.6;margin:12px 0 0">Saludos,<br>${nl2br(firma)}</p>
      <p style="color:#9ca3af;font-size:11px;margin:20px 0 0;border-top:1px solid #e5e7eb;padding-top:12px">
        Este correo fue generado desde fashiongr.com
      </p>
    </div>
  </div>`;
}
