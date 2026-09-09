// ─────────────────────────────────────────────────────────────────────────────
// EL ESTADO DE CUENTA SALE CON LA FORMA DE SWITCH (9-sep-2026). Módulo PURO.
//
// Daniel, textual: *«el sistema debe de mandar el estado de cuenta tal cual como
// sale en Switch cuando descargas el historial. Mismos números, mismos nombres,
// mismo todo!!!!»* — y, al elegir entre copiar la historia completa o copiar la
// FORMA con los documentos abiertos, eligió lo segundo: es lo mismo que hace el
// botón del avioncito de Switch, que «envía el estado de cuenta pendiente».
//
// Acá vive lo que se DECIDE; el dibujo está en `lib/pdf-estado-cuenta.ts`.
//
// 🔴 LAS CINCO DECISIONES DE DANIEL, en su orden:
//   1. Solo los documentos ABIERTOS (saldo ≠ 0). Medido para D-25 en Fashion
//      Wear: 31 documentos contra los 1.354 que imprime Switch, y el total
//      cuadra igual — $130.699,36 en los dos papeles.
//   2. LOS TRES TRAMOS DE LA PANTALLA, no los ocho de Switch: *«solo los 3 de
//      mi lista»*.
//   3. Un documento por compañía, como ya era.
//   4. TODOS los documentos, sin plegar los de menos de $50: *«En ninguno.
//      Quiero ver todo.»*
//   5. El nombre del cliente como lo escribe Switch, no en MAYÚSCULAS.
//
// 🔑 LOS NÚMEROS NO SE INVENTAN NI SE RECALCULAN. Débitos, Créditos y el saldo
// corrido salen de columnas que ya guardábamos y que nadie miraba: `debito` y
// `credito` de `switch_estadocuenta`. Medido sobre los 943 documentos abiertos
// de las 6 empresas: `debito − credito` de cada fila da EXACTAMENTE el saldo
// firmado que ya calculaba `signo(tipo) × saldo`, así que las dos fuentes se
// cuadran solas y ninguna reemplaza a la otra.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mínimo que este módulo mira de un documento del estado de cuenta. */
export interface DocDelPapel {
  numero: string;
  fecha: string | null;
  tipo: string;
  debito: number;
  credito: number;
  dias: number | null;
  plazoCredito: number | null;
  numeroFiscal: string | null;
}

/** Una línea ya lista para dibujar, con el saldo corrido. */
export interface FilaDelPapel {
  fecha: string;        // DD-MM-AAAA
  comprobante: string;  // "Factura", "Nota de Débito"…
  comentario: string;   // Switch no lo manda por el API (ver abajo)
  numeroInterno: string;
  debito: string;       // "" cuando es cero — Switch deja la celda en 0.00
  credito: string;
  saldo: string;        // saldo CORRIDO, no el del documento
  vence: string;        // "" con plazo 0, igual que Switch
  plazo: string;
  dias: string;
  numeroFiscal: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** «1,006.80» — sin signo de dólar: el papel de Switch tampoco lo lleva. */
export function monto(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * «2026-06-16» → «16-06-2026». El papel de Switch usa DD-MM-AAAA en el
 * encabezado, en la columna Fecha y en la columna Vence: las tres con la misma
 * forma. Se parte la cadena ISO a mano, sin `new Date`, para que no haya
 * madrugada que corra el día.
 */
export function fechaDMY(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * 🔴 LA FECHA DE VENCIMIENTO SE DERIVA, PORQUE SWITCH NO LA GUARDA. El sistema
 * tiene la fecha del documento y su `plazo_credito`; el papel de Switch imprime
 * la suma de los dos. Comprobado renglón por renglón contra el papel de Daniel:
 * la factura 11-000003121 del 16-06-2026 con plazo 90 vence el 14-09-2026.
 *
 * ⚠️ Con plazo 0 la celda va VACÍA, igual que en Switch — un recibo o una nota
 * de crédito no vencen, y escribirles una fecha sería inventarla.
 */
export function fechaVence(iso: string | null | undefined, plazo: number | null | undefined): string {
  if (!iso || !plazo || plazo <= 0) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + Math.round(plazo));
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

/**
 * 🔴 EL NOMBRE DEL CLIENTE ES EL QUE ESCRIBE SWITCH, NUNCA EL NORMALIZADO.
 *
 * 🩸 El papel salía con «CITY MALL PASO CANOA» a los gritos porque la pantalla
 * de Cuentas por Cobrar le pasaba `nombre_normalized` —que existe para PAREAR,
 * no para leerse—. Switch tiene el nombre bien escrito («City Mall Paso
 * Canoa»), y viaja en cada documento (`switch_estadocuenta.cliente_nombre`).
 *
 * ⚠️ Se usa TAL CUAL: «ACTIVE SHOES, S.A.» está en mayúsculas en Switch y así
 * sale, porque así lo escribe el papel que Daniel comparó. Solo cuando el
 * nombre de Switch falta se capitaliza el que llegue, para no volver a mandar
 * un grito.
 */
export function nombreDelPapel(nombreSwitch: string | null | undefined, respaldo: string): string {
  const v = (nombreSwitch ?? "").trim();
  if (v) return v;
  return capitalizarNombre(respaldo);
}

/**
 * «CITY MALL PASO CANOA» → «City Mall Paso Canoa».
 *
 * ⚠️ Solo se respetan las siglas de UNA letra («City Mall S A») y las abreviadas
 * con puntos («S.A.»). Dos letras NO alcanza: «EL», «DE», «LA» son palabras, no
 * siglas — «C/C EL DOLLAR» tiene que salir «C/C El Dollar».
 */
export function capitalizarNombre(nombre: string): string {
  const v = (nombre ?? "").trim();
  if (!v) return "";
  return v
    .split(/(\s+)/)
    .map((token) => {
      if (/^\s+$/.test(token) || token === "") return token;
      const letras = token.replace(/[^\p{L}]/gu, "");
      if (letras.length <= 1 && token === token.toLocaleUpperCase("es")) return token;
      if (/^(?:\p{Lu}\.)+$/u.test(token)) return token;
      return token
        .toLocaleLowerCase("es")
        .replace(/(^|[\s\-'/.])(\p{L})/gu, (_m, sep: string, l: string) => sep + l.toLocaleUpperCase("es"));
    })
    .join("");
}

/**
 * Las líneas del papel, con el SALDO CORRIDO.
 *
 * 🔑 El corrido se acumula de `débito − crédito`, que es el mismo número que el
 * `saldoConsecutivo` que manda Switch (verificado documento por documento en
 * D-25 · Fashion Wear: 1.006,80 → 3.708,15 → 3.716,31 → … → 130.699,36). Se
 * calcula en vez de leerse del crudo para que el último renglón sea, por
 * construcción, el total del papel.
 *
 * ⚠️ LA COLUMNA «COMENTARIO» VA VACÍA Y NO ES UN OLVIDO: el API de Switch
 * (`/apicliente/estadocuenta`) NO manda el comentario del documento — se
 * revisaron las 20 llaves que trae cada renglón y ninguna lo tiene. En el papel
 * de Switch solo las notas lo llevan («RET NC 0928»); las facturas van vacías
 * igual. Inventarlo sería escribir en el papel del cliente algo que el sistema
 * no sabe.
 */
export function filasDelPapel(docs: DocDelPapel[]): { filas: FilaDelPapel[]; total: number } {
  let corrido = 0;
  const filas = docs.map((d) => {
    corrido = round2(corrido + d.debito - d.credito);
    return {
      fecha: fechaDMY(d.fecha),
      comprobante: d.tipo,
      comentario: "",
      numeroInterno: d.numero,
      debito: d.debito ? monto(d.debito) : "",
      credito: d.credito ? monto(d.credito) : "",
      saldo: monto(corrido),
      vence: fechaVence(d.fecha, d.plazoCredito),
      plazo: d.plazoCredito != null ? String(Math.round(d.plazoCredito)) : "",
      dias: d.dias != null ? String(d.dias) : "",
      numeroFiscal: (d.numeroFiscal ?? "").trim() || null,
    };
  });
  return { filas, total: corrido };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LOS TRES TRAMOS, NO LOS OCHO
//
// El papel de Switch trae ocho columnas de antigüedad (0-30, 31-60, 61-90,
// 91-120, 121-180, 181-270, 271-365, más de 365). Daniel, textual: *«solo los 3
// de mi lista»* — los mismos de la pantalla de Cuentas por Cobrar.
//
// Los cortes NO se escriben acá: son los de `cxc-aging`, la misma lista que
// rotula la pantalla, el celular y las dos descargas.
// ─────────────────────────────────────────────────────────────────────────────

export interface TramosDelPapel {
  current: number; // 0 a 90 días
  watch: number;   // 91 a 120
  overdue: number; // 121 y más
}

/** Reparte los documentos en los TRES tramos por su `dias` (edad del documento,
 *  no mora). Sin `dias` cae en el primero, que es donde no acusa a nadie. */
export function tramosDelPapel(docs: Array<{ debito: number; credito: number; dias: number | null }>): TramosDelPapel {
  const t: TramosDelPapel = { current: 0, watch: 0, overdue: 0 };
  for (const d of docs) {
    const v = d.debito - d.credito;
    const dias = d.dias ?? 0;
    if (dias <= 90) t.current += v;
    else if (dias <= 120) t.watch += v;
    else t.overdue += v;
  }
  return { current: round2(t.current), watch: round2(t.watch), overdue: round2(t.overdue) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL CUADRE CONTRA SWITCH — Y SI NO CUADRA, SE DICE
//
// `/apicliente/estadocuenta` devuelve, además de los documentos, el `saldoTotal`
// que Switch mismo calculó. Se descartaba a propósito desde que nació el sync
// (`docs/switch-referencia.md`): «Descartamos `Saldos[]` y `saldoTotal`». Ahora
// se guarda y se usa como lo que es — un cuadre gratis.
//
// ⚠️ Ante la duda, CALLAR: sin dato de Switch no se afirma nada. Y la
// diferencia se dice EN PANTALLA, nunca en el papel que lee el cliente: el
// cliente no tiene qué hacer con nuestro desfase de sincronización.
// ─────────────────────────────────────────────────────────────────────────────

/** Un centavo de diferencia es redondeo de Switch, no un dato malo. Medido: el
 *  propio papel de Switch cierra su saldo corrido en 130.699,35 y su «Total
 *  General» en 130.699,36. */
export const TOLERANCIA_CUADRE = 0.01;

export interface Cuadre {
  cuadra: boolean;
  diferencia: number;
  /** Qué decir en pantalla. `null` cuando cuadra o cuando no hay con qué comparar. */
  aviso: string | null;
}

export function cuadrarConSwitch(totalSistema: number, saldoSwitch: number | null | undefined): Cuadre {
  if (saldoSwitch == null || !Number.isFinite(saldoSwitch)) {
    return { cuadra: true, diferencia: 0, aviso: null };
  }
  const diferencia = round2(totalSistema - saldoSwitch);
  if (Math.abs(diferencia) <= TOLERANCIA_CUADRE) {
    return { cuadra: true, diferencia, aviso: null };
  }
  return {
    cuadra: false,
    diferencia,
    aviso:
      `Switch dice $${monto(saldoSwitch)} y aquí sale $${monto(totalSistema)} ` +
      `(${diferencia > 0 ? "+" : "−"}$${monto(Math.abs(diferencia))}). ` +
      `Los documentos todavía no terminaron de sincronizarse — revisa antes de mandarlo.`,
  };
}
