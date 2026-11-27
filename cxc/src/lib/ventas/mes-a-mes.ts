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
import { porcentajeDeLaTabla } from "@/lib/ventas/celular";
import { MONTHS } from "@/lib/ventas/format";

export interface MesDeLaTarjeta {
  /** 1–12. */
  mes: number;
  actual: number;
  previo: number | null;
  /** Rótulo propio («Nov 25») cuando la lista cruza años (la ficha de artículos). */
  rotulo?: string;
}

export interface CambioDelMes {
  texto: string;
  tono: "up" | "dn" | "fl";
  /** El color propio de la pantalla que la abre (Multifashion pinta su rojo). */
  clase?: string;
}

/**
 * «▲ +12%» verde · «▼ −8%» rojo · «+3%» gris: el MISMO texto, color y umbral
 * (±5 %) que el % de las tablas (`porcentajeDeLaTabla`), para que la tarjeta y
 * la pantalla nunca se contradigan. Sin base del año pasado: «Nuevo» (nunca
 * «+0 %»); sin venta en ninguno de los dos: «—».
 */
export function cambioDelMes(actual: number, previo: number | null | undefined): CambioDelMes {
  const r = variacionPct(actual, previo);
  if (r == null) return actual !== 0 ? { texto: "Nuevo", tono: "fl" } : { texto: "—", tono: "fl" };
  return porcentajeDeLaTabla(r);
}

/** Ancho de la barrita (0–100 %) de cada mes, proporcional al mayor del año. */
export function anchoDeBarras(valores: number[]): number[] {
  const max = Math.max(0, ...valores);
  return valores.map((v) => (max > 0 && v > 0 ? (v / max) * 100 : 0));
}

/** «Nov va al 26 nov y se compara con los mismos días de 2025.» o null. */
export function notaDelMesEnCurso(anio: number, corte: string | null): string | null {
  if (!corte || Number(corte.slice(0, 4)) !== anio) return null;
  const mes = Number(corte.slice(5, 7));
  const dia = Number(corte.slice(8, 10));
  const fin = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  if (dia >= fin) return null;
  const corto = MONTHS[mes - 1];
  return `${corto} va al ${dia} ${corto.toLowerCase()} y se compara con los mismos días de ${anio - 1}.`;
}

/** El mes en curso (barra gris), si el corte cae en el año. */
export function mesEnCursoDelCorte(anio: number, corte: string | null): number | null {
  if (!corte || Number(corte.slice(0, 4)) !== anio) return null;
  return Number(corte.slice(5, 7));
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

/**
 * Tocar un mes de la tarjeta del Resumen → Ventas › Clientes de ESA empresa en
 * ESE mes, con los filtros que ya existen: `?periodo=desde_hasta` (rango) y
 * `?empresa=`. El mes en curso va hasta el corte; uno cerrado, al último día.
 */
export function urlClientesDelMes(anio: number, mes: number, empresaKey: string, corte: string | null): string {
  const mm = String(mes).padStart(2, "0");
  const fin = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const enCurso = corte && corte.slice(0, 7) === `${anio}-${mm}`;
  const hasta = enCurso ? corte!.slice(0, 10) : `${anio}-${mm}-${String(fin).padStart(2, "0")}`;
  return `/ventas?tab=clientes&periodo=${anio}-${mm}-01_${hasta}&empresa=${encodeURIComponent(empresaKey)}`;
}
