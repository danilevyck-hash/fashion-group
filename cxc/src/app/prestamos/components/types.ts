export interface Movimiento {
  id: string;
  empleado_id: string;
  fecha: string;
  concepto: string;
  monto: number;
  notas: string;
  estado: string;
  created_at: string;
}

export interface Empleado {
  id: string;
  nombre: string;
  empresa: string | null;
  deduccion_quincenal: number;
  notas: string | null;
  activo: boolean;
  created_at: string;
  prestamos_movimientos: Movimiento[];
}

export function progressColor(pct: number) {
  if (pct >= 75) return "bg-green-500";
  if (pct >= 25) return "bg-amber-500";
  return "bg-red-500";
}

export function progressColorText(pct: number) {
  if (pct >= 75) return "text-green-600";
  if (pct >= 25) return "text-amber-600";
  return "text-red-600";
}

export const MESES_FULL = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const MESES_DET = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function getQuincenaRange() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  if (now.getDate() <= 15) {
    return { start: new Date(y, m, 1), end: new Date(y, m, 15), label: `1 al 15 de ${MESES_FULL[m + 1]} ${y}` };
  } else {
    return { start: new Date(y, m, 16), end: new Date(y, m + 1, 0), label: `16 al ${new Date(y, m + 1, 0).getDate()} de ${MESES_FULL[m + 1]} ${y}` };
  }
}

export function hasDeduccionEnQuincena(movs: Movimiento[], qStart: Date, qEnd: Date): boolean {
  const tolerance = 3 * 86400000;
  return movs.some(m => {
    if (m.estado !== "aprobado") return false;
    if (m.concepto !== "Pago" && m.concepto !== "Abono extra") return false;
    const fecha = new Date(m.fecha + "T12:00:00");
    return fecha.getTime() >= qStart.getTime() - tolerance && fecha.getTime() <= qEnd.getTime() + tolerance;
  });
}

export function getLast12Quincenas(): { label: string; start: Date; end: Date }[] {
  const result: { label: string; start: Date; end: Date }[] = [];
  const now = new Date();
  let y = now.getFullYear(), m = now.getMonth();
  let isSecond = now.getDate() > 15;

  for (let i = 0; i < 12; i++) {
    const mes = MESES_DET[m + 1];
    if (isSecond) {
      result.push({ label: `${mes} ${y} 2da`, start: new Date(y, m, 16), end: new Date(y, m + 1, 0) });
    } else {
      result.push({ label: `${mes} ${y} 1ra`, start: new Date(y, m, 1), end: new Date(y, m, 15) });
    }
    if (isSecond) {
      isSecond = false;
    } else {
      isSecond = true;
      m--;
      if (m < 0) { m = 11; y--; }
    }
  }
  return result;
}

export const MOV_TYPES = [
  { key: "pago_quincenal", label: "Pago Quincenal", concepto: "Pago", icon: "💳", color: "bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-400", sign: "−", effect: "Reduce la deuda", effectColor: "text-green-600" },
  { key: "prestamo", label: "Préstamo", concepto: "Préstamo", icon: "➕", color: "bg-red-50 border-red-200 text-red-700 hover:border-red-400", sign: "+", effect: "Aumenta la deuda", effectColor: "text-red-600" },
  { key: "pago_extra", label: "Pago Extra", concepto: "Pago", icon: "💰", color: "bg-green-50 border-green-200 text-green-700 hover:border-green-400", sign: "−", effect: "Reduce la deuda", effectColor: "text-green-600" },
  { key: "responsabilidad", label: "Responsabilidad por daño", concepto: "Responsabilidad por daño", icon: "⚠️", color: "bg-amber-50 border-amber-200 text-amber-700 hover:border-amber-400", sign: "+", effect: "Aumenta la deuda", effectColor: "text-red-600" },
  { key: "abono_extra", label: "Abono Extra", concepto: "Abono extra", icon: "🔄", color: "bg-blue-50 border-blue-200 text-blue-700 hover:border-blue-400", sign: "−", effect: "Reduce la deuda", effectColor: "text-green-600" },
  { key: "pago_resp", label: "Pago de responsabilidad", concepto: "Pago de responsabilidad", icon: "✅", color: "bg-purple-50 border-purple-200 text-purple-700 hover:border-purple-400", sign: "−", effect: "Reduce la deuda", effectColor: "text-green-600" },
] as const;

export const CONCEPTO_COLORS: Record<string, string> = {
  "Préstamo": "text-red-600",
  "Pago": "text-green-600",
  "Abono extra": "text-blue-600",
  "Responsabilidad por daño": "text-amber-600",
  "Pago de responsabilidad": "text-purple-600",
};
