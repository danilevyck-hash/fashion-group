// STUB SOLO PARA EL BACKTESTING (no se commitea). Reemplaza `@/lib/asistencia/guard`
// vía `paths` del tsconfig del script: la ruta REAL corre entera, pero entra como admin
// sin cookie. Nada más cambia.
import type { NextRequest, NextResponse } from "next/server";
export const MODULO_ASISTENCIA = "asistencia";
export const MODULOS_PLANILLA = ["asistencia", "boston"] as const;
export function requireAsistencia(_req: NextRequest, _roles: string[], _mods?: readonly string[]): any | NextResponse {
  return { role: "admin", userId: "backtest", userName: "backtest", sessionToken: "x", modules: ["asistencia"] };
}
