import {
  CONCEPTO_DANO,
  CONCEPTO_PAGO,
  CONCEPTO_PRESTAMO,
  CONCEPTO_TERCEROS,
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
  /** ⚠️ SIN LECTORES desde el 10-sep-2026: el daño no propone cuota. La
   *  contadora escribe el monto de cada quincena en la casilla. */
  deduccion_dano: number;
  /** 🔴 La cuota quincenal de «Descuento a terceros» (10-sep-2026). */
  deduccion_terceros: number;
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
 * 🔴 CUATRO CONCEPTOS, NO SEIS TARJETAS.
 *
 * Había SEIS tarjetas para CINCO conceptos («Pago Quincenal» y «Pago Extra» eran
 * las dos el mismo `Pago`), y dos de esos cinco —«Abono extra» y «Pago de
 * responsabilidad»— eran un pago de otro monto con otro nombre. Daniel, al ver
 * el mockup: tres. Lo que decide a qué cuenta va un pago ya no es el concepto,
 * es la casilla «Baja de».
 *
 * 🔴 «DESCUENTO A TERCEROS» ES LA CUARTA (11-sep-2026). La cuenta existe desde
 * el 10-sep (la contadora: *«igual como un préstamo»*) y la ruta ya la
 * aceptaba, pero el formulario no la ofrecía: la orden externa se podía
 * descontar y no se podía CARGAR desde ninguna pantalla. El mockup de la
 * pestaña la lista junto a Préstamo y Daño de mercancía.
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
    concepto: CONCEPTO_TERCEROS,
    label: etiquetaConcepto(CONCEPTO_TERCEROS),
    icon: "🏛️",
    color: "bg-violet-50 border-violet-200 text-violet-700 hover:border-violet-400",
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
