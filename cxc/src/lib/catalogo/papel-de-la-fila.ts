// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL PDF SE VE DESDE LA FILA — Y DICE LA MISMA PALABRA QUE EL DETALLE
// (6-sep-2026)
//
// Hasta hoy el PDF vivía SOLO adentro del pedido: para ver el papel que se le
// mandó al cliente había que abrir el pedido, esperar y bajarlo. En la fila, en
// cambio, el botón más a la vista era **«Eliminar»**.
//
// Este módulo es la parte PURA de «Ver PDF» desde la lista: qué palabra lleva
// el papel y cómo se llama el archivo. La regla NO se reescribió — es la misma
// `palabraDelPapel` del detalle, alimentada con lo que la fila ya sabe
// (`en_switch` + `switch_documento`), así que la lista y el detalle no pueden
// decir cosas distintas del mismo pedido.
//
// 🔴 MANDA LO QUE HAY EN SWITCH. Si salió como COTIZACIÓN, el papel dice
// «Cotización» aunque el `status` diga `confirmado` (mandar a Switch escribe
// `confirmado`, así que el status solo no alcanza: TOM-027 se bajaba como
// «Pedido-TOM-027.pdf» siendo cotización). Mientras no salió, no es ninguna de
// las dos y se usa la regla de siempre: borrador = Cotización, confirmado =
// Pedido.
// ─────────────────────────────────────────────────────────────────────────────

import { palabraDelPapel } from "./documento-switch";
import type { DocumentoSwitch } from "./documento-switch";

/** Lo mínimo de la fila para saber qué palabra lleva su papel. */
export interface FilaConPapel {
  en_switch?: boolean;
  switch_documento?: DocumentoSwitch | string | null;
  status?: string | null;
  numero_pedido?: string | null;
}

/** «Pedido» o «Cotización», con la MISMA regla que usa el detalle. */
export function palabraDelPapelDeFila(f: FilaConPapel): string {
  return palabraDelPapel(
    f.en_switch ? { estado: "enviado", documento: f.switch_documento } : null,
    f.status === "confirmado" ? "Pedido" : "Cotización",
  );
}

/**
 * El nombre del archivo: «Pedido-TOM-026-2026-09-07.pdf».
 *
 * Es lo PRIMERO que ve el cliente en WhatsApp o en su correo, antes de abrirlo.
 * `hoyYmd` llega por parámetro: el módulo no lee el reloj.
 */
export function nombreArchivoPapel(f: FilaConPapel, hoyYmd: string): string {
  const palabra = palabraDelPapelDeFila(f);
  const numero = (f.numero_pedido ?? "").trim() || "sin-numero";
  return `${palabra}-${numero}-${hoyYmd}.pdf`;
}
