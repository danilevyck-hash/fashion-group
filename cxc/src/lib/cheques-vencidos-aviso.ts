/**
 * 🔴 EL AVISO DE CHEQUE VENCIDO — el hueco que costaba plata (5-sep-2026).
 * **Módulo PURO**: sin base y sin Telegram, como su hermano
 * `cheques-aviso-ventana.ts`.
 *
 * ── EL AGUJERO, MEDIDO ───────────────────────────────────────────────────────
 *
 * El aviso de cheques mira **hoy y el próximo día hábil** (`ventanaAviso`). O
 * sea: un cheque se anuncia el día antes y el día mismo, y **después nunca
 * más**. Si nadie lo marcó como depositado, el sistema se calla para siempre.
 *
 * Estaba pasando el día que se escribió esto: **Vistana, cheque 018094, Edwin,
 * $18.393,32, vencía el 31-ago** y seguía «pendiente» cinco días después, sin
 * que nada lo volviera a mencionar.
 *
 * ── LA REGLA ─────────────────────────────────────────────────────────────────
 *
 * 🔴 **Sale UNA SOLA VEZ y no se repite nunca más**, aunque siga sin
 * depositarse. Daniel no quiere que el mismo cheque le grite todos los días: si
 * ya se avisó y decidió no hacer nada, repetirlo lo convierte en ruido y el
 * resto del mensaje se deja de leer.
 *
 * Que sea una sola vez obliga a RECORDAR que ya se avisó, y eso vive en la
 * columna `cheques.aviso_vencido_en` (timestamp; NULL = todavía no se avisó).
 * Una columna y no una tabla nueva: el dato es del cheque, muere con él, y
 * `cheques` ya está en el respaldo.
 *
 * ⚠️ **Se marca DESPUÉS de que Telegram confirme.** Marcar antes y que el envío
 * falle quemaría el único aviso que ese cheque va a tener. Al revés —marcar
 * después— lo peor que pasa es que se avise dos veces un día que Telegram se
 * cayó a mitad de camino, y eso es barato.
 *
 * ── POR QUÉ NO ES «EL DÍA SIGUIENTE AL VENCIMIENTO» A SECAS ───────────────────
 *
 * De aquí en adelante SÍ lo es, por construcción: el día que vence, el cheque
 * está en la ventana del aviso normal («HOY»); al día siguiente pasa a vencido y
 * le toca su aviso único. Pero preguntar literalmente por `fecha = ayer` habría
 * dejado afuera **los que ya estaban vencidos** el día que esto se encendió —
 * justo el caso de $18.393,32 que lo motivó. Por eso la pregunta es «vencido y
 * sin avisar», que cubre el atraso una vez y después se comporta igual.
 *
 * 🔴 **Un cheque REBOTADO no avisa** (decisión de Daniel). Solo `pendiente`.
 */

import { getCompanyDisplay } from "@/lib/companies";
import { etiquetaVencimiento } from "@/lib/cheques-aviso-ventana";

const money = (n: number) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface ChequeVencido {
  cliente: string;
  empresa: string;
  monto: number;
  fecha_deposito: string;
  vendedor?: string | null;
}

/**
 * ¿Este cheque merece su aviso único hoy?
 *
 * Se pregunta acá, en el módulo puro, y no solo en el `WHERE` de la consulta:
 * un filtro de base que se afloje no se nota, y este es un aviso que se gasta.
 */
export function mereceAvisoVencido(
  c: { estado: string; deleted?: boolean | null; fecha_deposito: string; aviso_vencido_en?: string | null },
  hoy: string,
): boolean {
  if (c.deleted) return false;
  if (c.estado !== "pendiente") return false; // rebotado y depositado NO avisan
  if (c.aviso_vencido_en) return false; // ya tuvo su única vez
  return c.fecha_deposito < hoy;
}

/**
 * El bloque de texto, tal cual se lee en el celular. La primera línea dice
 * cuántos son — es lo único que se ve en la notificación sin abrirla — y cada
 * línea siguiente dice de quién, de qué empresa, cuánto, para cuándo era y quién
 * lo trajo.
 *
 * Devuelve `""` sin ninguno: no existe el «hoy no venció nada».
 */
export function construirAvisoVencidos(cheques: ChequeVencido[], hoy: string): string {
  if (cheques.length === 0) return "";
  const n = cheques.length;
  const lineas = cheques
    .map(
      (c) =>
        `• ${c.cliente} (${getCompanyDisplay(c.empresa)}) ${money(Number(c.monto))}` +
        ` — vencía ${etiquetaVencimiento(c.fecha_deposito, hoy)}${c.vendedor ? ` · ${c.vendedor}` : ""}`,
    )
    .join("\n");

  // La concordancia se escribe entera y no se arma con un `+ "n"` pegado: es lo
  // primero que se lee en la notificación del celular.
  const titulo =
    n > 1
      ? `${n} cheques vencieron y siguen sin depositar`
      : `${n} cheque venció y sigue sin depositar`;
  return `🔴 ${titulo}\n${lineas}`;
}
