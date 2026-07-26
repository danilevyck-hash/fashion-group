// Snapshot HISTÓRICO de los slots de switch-sync tal como quedaron el
// 26-jul-2026 a las 06:14 UTC, cuando el PR #295 ("Calendario paso 1") llevó
// vercel.json de 47 a 52 entradas: nacieron facturas-1300/1700/1900/2100/2300 y
// facturas-1500 pasó de 1 empresa (american_classic) a las 8 con facturas.
//
// POR QUÉ EXISTE: los tests del incidente de ese día usan filas REALES de
// switch_sync_log y cron_heartbeats. Evaluados contra el calendario VIVO
// (SWITCH_SYNC_SLOTS) el próximo cambio de horario los rompería o —peor— los
// volvería verdes por la razón equivocada. Mismo criterio que
// fixtures/slots-jul2026.ts (incidente del 25-jul).
//
// Es un fixture congelado: NO actualizarlo cuando cambie vercel.json.
import type { SwitchSyncSlot } from "@/lib/cron-telemetry";

/** Las 8 empresas con facturas, en el orden de vercel.json (ACS primero). */
const OCHO = [
  "american_classic",
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
  "joystep",
  "confecciones_boston",
] as const;

export const SLOTS_26JUL2026: SwitchSyncSlot[] = [
  { slot: "all-0530", tipo: "all", hhmmUtc: "0530", empresas: ["vistana", "active_wear"] },
  { slot: "all-0535", tipo: "all", hhmmUtc: "0535", empresas: ["fashion_shoes", "fashion_wear"] },
  { slot: "all-0540", tipo: "all", hhmmUtc: "0540", empresas: ["active_shoes", "joystep"] },
  { slot: "all-0630", tipo: "all", hhmmUtc: "0630", empresas: ["american_classic", "confecciones_boston"] },
  // ── nacidos el 26-jul a las 06:14 UTC ──────────────────────────────────────
  { slot: "facturas-1300", tipo: "facturas", hhmmUtc: "1300", empresas: ["american_classic"] },
  { slot: "facturas-1500", tipo: "facturas", hhmmUtc: "1500", empresas: [...OCHO] }, // era solo ACS
  { slot: "estadocuenta-1600", tipo: "estadocuenta", hhmmUtc: "1600", empresas: ["active_shoes", "joystep"] },
  { slot: "estadocuenta-1605", tipo: "estadocuenta", hhmmUtc: "1605", empresas: ["fashion_shoes", "fashion_wear"] },
  { slot: "estadocuenta-1610", tipo: "estadocuenta", hhmmUtc: "1610", empresas: ["vistana", "active_wear"] },
  { slot: "facturas-1700", tipo: "facturas", hhmmUtc: "1700", empresas: ["american_classic"] },
  { slot: "facturas-1900", tipo: "facturas", hhmmUtc: "1900", empresas: [...OCHO] },
  { slot: "facturas-2100", tipo: "facturas", hhmmUtc: "2100", empresas: ["american_classic"] },
  { slot: "estadocuenta-2110", tipo: "estadocuenta", hhmmUtc: "2110", empresas: ["vistana", "active_wear"] },
  { slot: "estadocuenta-2115", tipo: "estadocuenta", hhmmUtc: "2115", empresas: ["fashion_shoes", "fashion_wear"] },
  { slot: "estadocuenta-2120", tipo: "estadocuenta", hhmmUtc: "2120", empresas: ["active_shoes", "joystep"] },
  { slot: "facturas-2300", tipo: "facturas", hhmmUtc: "2300", empresas: [...OCHO] },
  { slot: "facturas-0015", tipo: "facturas", hhmmUtc: "0015", empresas: ["american_classic"] },
];
