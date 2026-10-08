"use client";

// ============================================================================
// «Solo lo cobrable» POR PANTALLA (8-oct-2026). El interruptor de #671
// (`MKT_SOLO_COBRABLE_2026_10`) es una constante: prende o apaga para todos.
// El Marketing nuevo lo prende SOLO dentro de su pantalla (para quien tiene
// `veMarketingNuevo`), así que las piezas que comparte (el registro de la
// factura, la ficha del gasto, Proveedores) leen este contexto. Sin
// proveedor, vale lo de la constante: la pantalla de hoy, sin cambios.
// ============================================================================

import { createContext, useContext } from "react";
import { MKT_SOLO_COBRABLE_2026_10 } from "./solo-cobrable-2026-10";

export const SoloCobrableContexto = createContext<boolean>(MKT_SOLO_COBRABLE_2026_10);

/** ¿Esta pantalla registra «solo lo cobrable»? */
export function useSoloCobrable(): boolean {
  return useContext(SoloCobrableContexto);
}
