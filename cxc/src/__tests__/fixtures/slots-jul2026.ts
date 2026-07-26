// Snapshot HISTÓRICO de los slots de switch-sync tal como estaban el
// 25-jul-2026 — el día de los incidentes que motivaron `clasificarSlots()` y
// `slotsHuerfanos()`.
//
// POR QUÉ EXISTE: los tests de esos incidentes reproducen filas REALES de
// switch_sync_log y cron_heartbeats de ese día. Si se evalúan contra el
// calendario VIVO (SWITCH_SYNC_SLOTS), cada cambio de horario los rompe o —peor—
// los vuelve verdes por la razón equivocada. El algoritmo es lo que se está
// probando, no el calendario del día; el calendario vivo tiene sus propios tests
// (cron-calendario.test.ts).
//
// Es un fixture congelado: NO actualizarlo cuando cambie vercel.json.
import type { SwitchSyncSlot } from "@/lib/cron-telemetry";

export const SLOTS_JUL2026: SwitchSyncSlot[] = [
  { slot: "all-0530", tipo: "all", hhmmUtc: "0530", empresas: ["vistana", "active_wear"] },
  { slot: "all-0535", tipo: "all", hhmmUtc: "0535", empresas: ["fashion_shoes", "fashion_wear"] },
  { slot: "all-0540", tipo: "all", hhmmUtc: "0540", empresas: ["active_shoes", "joystep"] },
  { slot: "all-0630", tipo: "all", hhmmUtc: "0630", empresas: ["american_classic", "confecciones_boston"] },
  { slot: "facturas-1500", tipo: "facturas", hhmmUtc: "1500", empresas: ["american_classic"] },
  { slot: "estadocuenta-1600", tipo: "estadocuenta", hhmmUtc: "1600", empresas: ["active_shoes", "joystep"] },
  { slot: "estadocuenta-1605", tipo: "estadocuenta", hhmmUtc: "1605", empresas: ["fashion_shoes", "fashion_wear"] },
  { slot: "estadocuenta-1610", tipo: "estadocuenta", hhmmUtc: "1610", empresas: ["vistana", "active_wear"] },
  { slot: "estadocuenta-2110", tipo: "estadocuenta", hhmmUtc: "2110", empresas: ["vistana", "active_wear"] },
  { slot: "estadocuenta-2115", tipo: "estadocuenta", hhmmUtc: "2115", empresas: ["fashion_shoes", "fashion_wear"] },
  { slot: "estadocuenta-2120", tipo: "estadocuenta", hhmmUtc: "2120", empresas: ["active_shoes", "joystep"] },
  { slot: "facturas-2315", tipo: "facturas", hhmmUtc: "2315", empresas: ["american_classic"] },
  { slot: "facturas-0015", tipo: "facturas", hhmmUtc: "0015", empresas: ["american_classic"] },
];
