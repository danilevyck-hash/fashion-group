// La comisión de un vendedor MES A MES (tarjeta de mantener presionado,
// 27-nov-2026). Lee el `por_mes` de `/api/ventas/comisiones?porMes=1`: cada mes
// ya neteado en el servidor (`netearComisiones`), las MISMAS filas que suman
// «Todo el año». Sin flechas: en 2025 solo se comisionaba el cobro.
import { hoyPanama } from "@/lib/fecha-panama";
import type { MesDeLaTarjeta } from "@/lib/ventas/mes-a-mes";

export interface ComisionPorMes {
  por_mes?: { mes: number; vendedores: { vendedor: string; comision_total: number }[] }[];
}

export function comisionMesAMes(datos: ComisionPorMes, vendedor: string): MesDeLaTarjeta[] {
  return (datos.por_mes ?? []).map((m) => ({
    mes: m.mes,
    actual: Number(m.vendedores.find((v) => v.vendedor === vendedor)?.comision_total ?? 0),
    previo: null,
  }));
}

/** El mes en curso (Panamá) si el año es el de hoy. */
export function mesEnCursoDeComisiones(year: number, hoy: string = hoyPanama()): number | null {
  return Number(hoy.slice(0, 4)) === year ? Number(hoy.slice(5, 7)) : null;
}
