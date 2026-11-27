// ─────────────────────────────────────────────────────────────────────────────
// LA VENTA MES A MES DE LA TARJETA (27-nov-2026, `GESTOS_IPHONE_2026_11`).
// Daniel: «me gusta ver todo pero por la falta de espacio quedó como está hoy».
// Mantener presionada una empresa (Ventas › Resumen) o un cliente (Ventas ›
// Clientes) abre su venta mes a mes del año elegido, cada mes con ▲/▼ y el %
// contra el MISMO mes del año pasado. La pantalla no cambia.
//
// 🔴 Ninguna cifra se calcula aquí: los montos son los que ya trae la pantalla
// (Resumen) o la hoja del cliente (`/api/clientes/[codigo]/por-empresa-anual`),
// con las notas de crédito restando. El mes en curso ya viene contra los
// MISMOS DÍAS del año pasado (`clientes-corte-comparativo.ts`).
// ─────────────────────────────────────────────────────────────────────────────

import { variacionPct } from "@/lib/variacion";

export interface MesDeLaTarjeta {
  /** 1–12. */
  mes: number;
  actual: number;
  previo: number | null;
}

export interface CambioDelMes {
  texto: string;
  tono: "up" | "dn" | "fl";
}

/** «▲ +12%» verde · «▼ −8%» rojo · «Nuevo» sin base del año pasado (nunca «+0 %»). */
export function cambioDelMes(actual: number, previo: number | null | undefined): CambioDelMes {
  const r = variacionPct(actual, previo);
  if (r == null) return actual !== 0 ? { texto: "Nuevo", tono: "up" } : { texto: "—", tono: "fl" };
  const entero = Math.round(Math.abs(r * 100));
  if (entero === 0) return { texto: "0%", tono: "fl" };
  return r > 0 ? { texto: `▲ +${entero}%`, tono: "up" } : { texto: `▼ −${entero}%`, tono: "dn" };
}

/** «hasta el 27» para el mes en curso, o null. */
export function marcaDelMesEnCurso(mes: number, anio: number, corte: string | null): string | null {
  if (!corte || Number(corte.slice(0, 4)) !== anio || Number(corte.slice(5, 7)) !== mes) return null;
  const dia = Number(corte.slice(8, 10));
  const fin = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return dia < fin ? `hasta el ${dia}` : null;
}

/** Los meses de una empresa del Resumen: las MISMAS series de la pantalla. */
export function mesesDeSeries(
  actual: (number | null)[],
  previo: (number | null)[],
  hasta: number,
): MesDeLaTarjeta[] {
  const salida: MesDeLaTarjeta[] = [];
  for (let m = 1; m <= hasta; m++) {
    salida.push({ mes: m, actual: actual[m - 1] ?? 0, previo: previo[m - 1] ?? null });
  }
  return salida;
}

/** Lo que trae `/api/clientes/[codigo]/por-empresa-anual` (solo lo que se usa). */
export interface AnualDelCliente {
  corte: string;
  empresas: { empresaKey: string; actual: number; previo: number; meses: { mes: number; actual: number; previo: number }[] }[];
}

/**
 * El cliente de UNA fila de Ventas › Clientes: la fila es (cliente, empresa),
 * así que con una sola empresa se mira esa; con varias («N empresas»), la suma.
 * Los meses futuros no (el corte de la ruta dice hasta cuál).
 */
export function delClienteEnLaFila(
  datos: AnualDelCliente,
  fila: { empresaKey: string; empresas_count: number },
): { meses: MesDeLaTarjeta[]; actual: number; previo: number } {
  const empresas = fila.empresas_count > 1 ? datos.empresas : datos.empresas.filter((e) => e.empresaKey === fila.empresaKey);
  const hasta = Number(datos.corte.slice(5, 7));
  const meses: MesDeLaTarjeta[] = [];
  for (let m = 1; m <= hasta; m++) {
    let a = 0, p = 0;
    for (const e of empresas) {
      const x = e.meses.find((y) => y.mes === m);
      a += x?.actual ?? 0;
      p += x?.previo ?? 0;
    }
    meses.push({ mes: m, actual: a, previo: p });
  }
  return {
    meses,
    actual: empresas.reduce((s, e) => s + e.actual, 0),
    previo: empresas.reduce((s, e) => s + e.previo, 0),
  };
}
