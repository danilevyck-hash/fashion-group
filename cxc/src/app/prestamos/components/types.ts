import {
  CONCEPTO_DANO,
  CONCEPTO_PAGO,
  CONCEPTO_PRESTAMO,
  etiquetaConcepto,
} from "@/lib/prestamos-conceptos";

export interface Movimiento {
  id: string;
  empleado_id: string;
  fecha: string;
  concepto: string;
  monto: number;
  notas: string | null;
  estado: string;
  cuenta: string | null;
  origen_pago: string | null;
  created_at: string;
}

export interface Empleado {
  id: string;
  nombre: string;
  empresa: string | null;
  empleado_codigo: string | null;
  deduccion_quincenal: number;
  deduccion_dano: number;
  notas: string | null;
  salario_mensual: number | null;
  trabaja: boolean;
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

/**
 * 🔴 TRES CONCEPTOS, NO SEIS TARJETAS.
 *
 * Había SEIS tarjetas para CINCO conceptos («Pago Quincenal» y «Pago Extra» eran
 * las dos el mismo `Pago`), y dos de esos cinco —«Abono extra» y «Pago de
 * responsabilidad»— eran un pago de otro monto con otro nombre. Daniel, al ver
 * el mockup: tres. Lo que decide a qué cuenta va un pago ya no es el concepto,
 * es la casilla «Baja de».
 *
 * ⚠️ El VALOR guardado de «Daño de mercancía» sigue siendo `Responsabilidad por
 * daño`: renombrarlo en la base dejaría de contar las 24 filas que ya existen,
 * en silencio. Solo cambia cómo se lee (`etiquetaConcepto`).
 */
export const MOV_TIPOS = [
  {
    concepto: CONCEPTO_PRESTAMO,
    label: etiquetaConcepto(CONCEPTO_PRESTAMO),
    icon: "➕",
    color: "bg-red-50 border-red-200 text-red-700 hover:border-red-400",
    efecto: "Aumenta la deuda",
  },
  {
    concepto: CONCEPTO_DANO,
    label: etiquetaConcepto(CONCEPTO_DANO),
    icon: "⚠️",
    color: "bg-amber-50 border-amber-200 text-amber-700 hover:border-amber-400",
    efecto: "Aumenta la deuda",
  },
  {
    concepto: CONCEPTO_PAGO,
    label: etiquetaConcepto(CONCEPTO_PAGO),
    icon: "💳",
    color: "bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-400",
    efecto: "Baja la deuda",
  },
] as const;

/** Conceptos válidos de movimiento nuevo. La fuente sigue siendo `lib/`. */
export const MOV_CONCEPTOS: string[] = MOV_TIPOS.map((t) => t.concepto);
