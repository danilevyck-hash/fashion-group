// ─────────────────────────────────────────────────────────────────────────────
// Constructores PUROS del correo de estado de cuenta (sin dependencias de
// servidor → se importan igual en el modal (cliente) y en la ruta (servidor)).
//
// La MISMA `composeEmailHtml` arma el preview del modal y el HTML que sale por
// Resend, y la MISMA `buildResumenHtml` arma la tabla — así lo que el usuario ve
// en el preview es EXACTAMENTE lo que se envía.
//
// El cuerpo lleva SOLO un resumen (una fila por empresa: saldo total y saldo con
// más de 90 días). El detalle documento por documento vive en los PDFs adjuntos.
//
// IMPORTANTE: `dias` es la EDAD del documento desde su emisión, NO días de mora.
// La columna se rotula sólo por su rango de días. PROHIBIDO usar la palabra
// "vencido"/"vencida" en el correo.
// ─────────────────────────────────────────────────────────────────────────────

import type { EstadoCuentaDoc, EstadoCuentaEmpresa } from "@/lib/cxc/estado-cuenta-data";
import { comoPagar, lineasDePago, type ComoPagar } from "@/lib/cxc/empresa-fiscal";

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

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Saldo firmado de los documentos con más de 90 días de EDAD (dias >= 91). No
 * es mora: es antigüedad desde la emisión. `dias` null se trata como 0.
 */
export function saldoMas90(docs: EstadoCuentaDoc[]): number {
  return round(docs.reduce((s, d) => ((d.dias ?? 0) > 90 ? s + d.saldo : s), 0));
}

const TH = "padding:6px 8px;font-size:11px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;background:#f9fafb";
const TD = "padding:6px 8px;font-size:12px;color:#111827;border-bottom:1px solid #f3f4f6";

/**
 * Tabla RESUMEN del cuerpo: una fila por empresa con Saldo total y el saldo con
 * más de 90 días de antigüedad, + fila Total. El detalle documento por documento
 * NO va en el correo: vive en los PDFs adjuntos (uno por empresa).
 *
 * Los montos salen de `EstadoCuentaEmpresa.subtotal` y de los mismos documentos
 * que arman el PDF (helper compartido) → cuadran al centavo con la pantalla.
 */
export function buildResumenHtml(empresas: EstadoCuentaEmpresa[], cliente: string): string {
  const rows = empresas
    .map(
      (emp) => `<tr>
        <td style="${TD}">${escapeHtml(emp.empresa_nombre)}</td>
        <td style="${TD};text-align:right;font-variant-numeric:tabular-nums">${money(emp.subtotal)}</td>
        <td style="${TD};text-align:right;font-variant-numeric:tabular-nums">${money(saldoMas90(emp.documentos))}</td>
      </tr>`,
    )
    .join("");

  const total = round(empresas.reduce((s, e) => s + e.subtotal, 0));
  const totalMas90 = round(empresas.reduce((s, e) => s + saldoMas90(e.documentos), 0));

  return `
  <div style="margin:0 0 18px">
    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#111827">${escapeHtml(cliente)}</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
      <thead>
        <tr>
          <th style="${TH};text-align:left">Empresa</th>
          <th style="${TH};text-align:right">Saldo total</th>
          <th style="${TH};text-align:right">Más de 90 días</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr>
          <td style="${TD};font-weight:700">Total</td>
          <td style="${TD};text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${money(total)}</td>
          <td style="${TD};text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${money(totalMas90)}</td>
        </tr>
      </tbody>
    </table>
    <p style="margin:8px 0 0;font-size:12px;color:#6b7280">
      El detalle de cada documento está en los estados de cuenta adjuntos.
    </p>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DÓNDE PAGAR — TODAS LAS EMPRESAS QUE VAN EN ESE CORREO (20-sep-2026).
//
// 🔴 UN CORREO LLEVA VARIAS EMPRESAS. El envío manda SIEMPRE las 6 del grupo,
// con un PDF por empresa (y el lote, además, varios clientes en un solo papel).
// Poner una sola cuenta sería decirle al cliente que pague seis saldos en el
// banco de una — así que van TODAS las que viajan en ese correo, cada una con la
// suya, en el mismo orden en que salen los adjuntos.
//
// 🔴 LAS TRES LÍNEAS SON LAS MISMAS DEL PAPEL (`lineasDePago`): el cliente no
// tiene que decidir cuál de las dos versiones copia.
//
// 🔑 En texto plano y suelto, no en una tabla: esto se copia y se pega en la app
// del banco. **Falla ABIERTO**: una empresa sin cuenta cargada no sale, y si no
// sale ninguna el bloque entero desaparece y el correo queda como estaba.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mínimo que hace falta saber de una empresa para decir dónde se le paga. */
export interface EmpresaDelCorreo {
  empresa_key: string;
  empresa_nombre: string;
}

export function buildCuentasHtml(empresas: readonly EmpresaDelCorreo[]): string {
  const vistas = new Set<string>();
  const pagos: ComoPagar[] = [];

  for (const e of empresas) {
    if (vistas.has(e.empresa_key)) continue;
    vistas.add(e.empresa_key);
    const pago = comoPagar(e.empresa_key, e.empresa_nombre);
    if (pago) pagos.push(pago);
  }
  if (pagos.length === 0) return "";

  // ⚠️ EL TELÉFONO, UNA SOLA VEZ CUANDO ES EL MISMO. Hoy las ocho contestan en
  // el mismo número, así que repetirlo seis veces son doce palabras que tapan
  // las seis cuentas, que es lo que se vino a leer. Si alguna llega a tener el
  // suyo, cada bloque vuelve a llevar el propio y no hay línea al pie.
  const telefonos = new Set(pagos.map((p) => p.telefono).filter(Boolean));
  const telefonoComun = telefonos.size === 1 && pagos.every((p) => p.telefono)
    ? [...telefonos][0]
    : "";

  const bloques = pagos.map((p) => {
    const lineas = lineasDePago(telefonoComun ? { ...p, telefono: "" } : p)
      .map((l, i) => (i === 0 ? `<strong>${escapeHtml(l)}</strong>` : escapeHtml(l)))
      .join("<br>");
    return `<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#111827">${lineas}</p>`;
  });

  return `
  <div style="margin:18px 0 0;padding-top:14px;border-top:1px solid #e5e7eb">
    <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#111827">Dónde pagar</p>
    ${bloques.length > 1
      ? `<p style="margin:0 0 12px;font-size:12px;color:#6b7280">Cada empresa recibe su pago en su propia cuenta.</p>`
      : ""}
    ${bloques.join("")}
    ${telefonoComun
      ? `<p style="margin:0;font-size:13px;line-height:1.6;color:#111827">Tel: ${escapeHtml(telefonoComun)}</p>`
      : ""}
  </div>`;
}

/** Firma del correo: nombre del usuario + línea fija (sin cargo). */
export function buildFirma(nombreCompleto: string): string {
  return `${nombreCompleto}\nFashion Group Panamá`;
}

/**
 * Cuerpo editable por defecto.
 *
 * 🔴 SALUDA POR EL NOMBRE DEL CONTACTO CUANDO HAY UNO (5-sep-2026) — la casilla
 * nueva de la ficha del cliente. Sin contacto, el texto es EXACTAMENTE el de
 * siempre: no se inventa un nombre ni se saluda con la razón social, que es lo
 * que dice la factura y no cómo se llama la persona. Del saludo para abajo no
 * cambió una coma.
 */
export function defaultCuerpo(mes: string, contacto?: string | null): string {
  const nombre = (contacto ?? "").trim();
  return [
    nombre ? `Buen día ${nombre},` : "Buen día,",
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
 * HTML completo del correo = encabezado + cuerpo editable + resumen + dónde
 * pagar + cierre + firma. `cuerpo` es texto plano (se escapa + nl2br).
 * `resumenHtml` y `cuentasHtml` ya son HTML (no editables). `firma` es texto
 * plano.
 *
 * 🔴 «Dónde pagar» va al CIERRE, después de los saldos: primero cuánto debe,
 * después dónde lo deposita. El «Favor confirmar su programación de pagos» del
 * cuerpo no se tocó — sigue siendo el texto editable de siempre.
 *
 * ⚠️ `cuentasHtml` es opcional para que ningún papel se quede sin salir por no
 * pasarlo: sin él, el correo es EXACTAMENTE el de antes.
 */
export function composeEmailHtml(opts: {
  cuerpo: string;
  resumenHtml: string;
  firma: string;
  cuentasHtml?: string;
}): string {
  const { cuerpo, resumenHtml, firma, cuentasHtml = "" } = opts;
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:0 auto;color:#111827">
    <div style="background:#111827;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
      <h2 style="margin:0;font-size:18px;letter-spacing:0.02em">FASHION GROUP</h2>
      <p style="margin:4px 0 0;font-size:12px;opacity:0.75">Departamento de Cobros · Panamá</p>
    </div>
    <div style="padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
      <p style="font-size:13px;line-height:1.6;margin:0 0 18px">${nl2br(cuerpo)}</p>
      ${resumenHtml}
      ${cuentasHtml}
      <p style="font-size:13px;line-height:1.6;margin:18px 0 0">Quedamos atentos a sus comentarios.</p>
      <p style="font-size:13px;line-height:1.6;margin:12px 0 0">Saludos,<br>${nl2br(firma)}</p>
      <p style="color:#9ca3af;font-size:11px;margin:20px 0 0;border-top:1px solid #e5e7eb;padding-top:12px">
        Este correo fue generado desde fashiongr.com
      </p>
    </div>
  </div>`;
}
