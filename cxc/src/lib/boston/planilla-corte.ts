// ─────────────────────────────────────────────────────────────────────────────
// EL CORTE DE LA PLANILLA DE BOSTON — el mismo que ve la contadora. Módulo PURO.
//
// 🩸 `/boston` › Planilla pedía `/api/asistencia/planilla` SIN `corte`, mientras
// la Planilla del grupo propone el corte 13/28 por defecto y lo GUARDA al
// cerrar (auditoría del 11-sep-2026). Así, para la MISMA quincena, David leía
// el reloj hasta el 15 y Yulissa hasta el 13: dos netos distintos para la misma
// persona, y con la primera quincena cerrada el ajuste de la anterior entraba en
// las columnas de Boston sin que su pantalla lo supiera.
//
// Regla, en este orden:
//   1. Si la quincena YA SE CERRÓ con un corte, ESE corte (lo que se pagó).
//   2. Si no, el SUGERIDO (13 o 28) — el mismo que `PlanillaTab` pone al elegir
//      la quincena (`corteInicial`).
//   3. Un rango que no es una quincena no lleva corte (igual que en el grupo).
//
// ⚠️ David no elige el corte: mira. La contadora sí lo puede cambiar al armar
// la suya; si lo cambia y CIERRA, Boston lo hereda por (1).
// ─────────────────────────────────────────────────────────────────────────────

import { periodoDesdeRango } from "@/lib/asistencia/planilla";
import { corteValido } from "@/lib/asistencia/corte-quincena";
import { corteInicial } from "@/lib/asistencia/elegir-quincena";
import { PLANILLA_UNIDA } from "@/lib/asistencia/planilla-unida";

export function corteParaBoston(
  desde: string,
  hasta: string,
  corteGuardado: string | null | undefined,
  planillaUnida: boolean = PLANILLA_UNIDA,
): string | null {
  if (!planillaUnida) return null;
  const p = periodoDesdeRango(desde, hasta);
  if (!p?.esQuincena || !p.quincena) return null;
  const guardado = String(corteGuardado ?? "").trim();
  if (guardado && corteValido(desde, hasta, guardado)) return guardado;
  const sugerido = corteInicial(p.quincena);
  return sugerido || null;
}
