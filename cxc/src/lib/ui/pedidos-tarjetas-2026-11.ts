// ─────────────────────────────────────────────────────────────────────────────
// Despachos › Pedidos — las 4 tarjetas de resumen (Daniel, 24-nov-2026).
// Pendientes · En preparación · Preparados · Recibidos, cada una con su conteo
// y «el más viejo N días»; en ROJO si pasa de 3 días. Tocar una abre esa lista
// y reemplaza al segmentado de pestañas. Solo pantalla: no cambia nada que se
// guarda ni lo que trae el servidor. `false` = las pestañas de siempre.
// 🔴 Solo para las personas de la lista; el resto sigue con las pestañas.
// ─────────────────────────────────────────────────────────────────────────────

import { diasDesde, fechaDeAntiguedad, type PedidoBodega } from "@/lib/guias/pedidos-bodega";
import { ESTADOS_FLUJO_SIMPLE, PESTANA_FLUJO_SIMPLE, type EstadoFlujoSimple } from "@/lib/guias/pedidos-flujo-simple";

export const PEDIDOS_TARJETAS_2026_11 = true;

/** Usuarios (`fg_users.name`, el `userName` de la cookie firmada) que ven las tarjetas: Daniel y Rey (Reynaldo Espinosa). */
export const USUARIOS_CON_TARJETAS: readonly string[] = ["daniel", "rey"];

/** Pasado este número de días, «el más viejo» va en rojo. */
export const DIAS_TARJETA_EN_ROJO = 3;

/** ¿Esta persona ve las tarjetas? El nombre sale de la sesión firmada por el servidor. */
export function veTarjetasDePedidos(userName: string | null | undefined): boolean {
  return PEDIDOS_TARJETAS_2026_11 && USUARIOS_CON_TARJETAS.includes((userName ?? "").trim().toLowerCase());
}

export interface TarjetaPedidos {
  estado: EstadoFlujoSimple;
  rotulo: string;
  cantidad: number;
  /** Días del que más lleva en el estado; `null` = sin pedidos o Recibidos (cerrados, sin antigüedad). */
  masViejoDias: number | null;
  enRojo: boolean;
}

type Fila = Pick<PedidoBodega, "estado" | "fecha" | "en_preparacion_en" | "preparado_en">;

/** La MISMA antigüedad de la fila y la línea de arriba (`fechaDeAntiguedad`, día de Panamá). */
const diasEnElEstado = (p: Fila, hoy: string): number => diasDesde(fechaDeAntiguedad(p), hoy);

export function tarjetasDePedidos(rows: readonly Fila[], hoy: string): TarjetaPedidos[] {
  return ESTADOS_FLUJO_SIMPLE.map((estado) => {
    const del = rows.filter((p) => p.estado === estado);
    const masViejoDias = estado === "recibido" || del.length === 0
      ? null
      : Math.max(...del.map((p) => diasEnElEstado(p, hoy)));
    return {
      estado,
      rotulo: PESTANA_FLUJO_SIMPLE[estado],
      cantidad: del.length,
      masViejoDias,
      enRojo: masViejoDias != null && masViejoDias > DIAS_TARJETA_EN_ROJO,
    };
  });
}

/** «el más viejo 14 días» · «el más viejo 1 día» · «el más viejo, de hoy». */
export function lineaMasViejo(dias: number | null): string {
  if (dias == null) return "";
  return dias === 0 ? "el más viejo, de hoy" : `el más viejo ${dias} ${dias === 1 ? "día" : "días"}`;
}
