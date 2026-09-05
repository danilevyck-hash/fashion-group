// ─────────────────────────────────────────────────────────────────────────────
// MANDAR A VARIOS — UN CORREO POR DIRECCIÓN, NO POR CLIENTE. Módulo PURO.
//
// 🔴 LA REGLA. Trece clientes distintos comparten `oficina@citymoda.store`.
// Mandar «uno por cliente» le pone trece correos en la bandeja a la misma
// persona el mismo minuto, cada uno con un pedazo de lo que debe. Lo que sale
// es UN correo por DIRECCIÓN, con UN PDF que trae una hoja por cliente y un
// total al final.
//
// Medido contra producción el 5-sep-2026, sobre los 100 clientes con saldo:
//   · 79 tienen correo · 21 no lo tienen
//   · 31 de esos 79 comparten 9 direcciones → 57 correos, no 79
//   · el caso grande: `oficina@citymoda.store`, 13 clientes, $402.376,67
//   · el segundo: `contabilidad@citymall.com.pa`, los dos City Mall, $480.784,72
//
// 🔴 LOS QUE NO TIENEN CORREO NO ABORTAN EL LOTE. Se manda a los que se puede
// y se dicen POR NOMBRE los que quedaron fuera. Cancelar 57 correos porque 21
// clientes no tienen dirección es castigar al que sí la tiene.
//
// ⚠️ La dirección se compara en minúsculas y sin espacios de los bordes, pero
// NO se «arregla» de ninguna otra forma: no se quitan puntos, no se normalizan
// alias con `+`, no se adivina nada. Dos direcciones distintas son dos correos.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mínimo de un cliente para armar el lote. */
export interface DestinoCliente {
  /** Código Switch (D-XXX) — la identidad. */
  codigo: string | null;
  /** Cómo se lee en pantalla. Solo para decirle a la persona quién quedó fuera. */
  nombre: string;
  /** Correo tal como está guardado. Vacío o `null` = no tiene. */
  correo: string | null;
  /** Lo que debe, para el resumen de la barra. */
  total: number;
}

export interface EnvioAgrupado {
  /** La dirección, ya normalizada para comparar (minúsculas, sin bordes). */
  correo: string;
  /** Los clientes que van en ESE correo, en el orden en que entraron. */
  clientes: DestinoCliente[];
  /** Suma de lo que deben los clientes de este envío. */
  total: number;
}

export interface LoteDeCobro {
  /** Un elemento por DIRECCIÓN. `envios.length` = cuántos correos salen. */
  envios: EnvioAgrupado[];
  /** Los que no tienen correo — se dicen por nombre, no se cuentan y ya. */
  sinCorreo: DestinoCliente[];
  /** Cuántos clientes van repartidos en direcciones compartidas. */
  clientesQueComparten: number;
  /** Cuántas direcciones están compartidas por más de un cliente. */
  correosCompartidos: number;
}

/** Minúsculas y sin espacios de los bordes. Nada más: no se adivina. */
export function normalizarCorreo(correo: string | null | undefined): string {
  return (correo ?? "").trim().toLowerCase();
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Agrupa por DIRECCIÓN y aparta a los que no tienen. */
export function agruparPorCorreo(clientes: DestinoCliente[]): LoteDeCobro {
  const porCorreo = new Map<string, EnvioAgrupado>();
  const sinCorreo: DestinoCliente[] = [];

  for (const c of clientes) {
    const correo = normalizarCorreo(c.correo);
    if (!correo) { sinCorreo.push(c); continue; }
    let envio = porCorreo.get(correo);
    if (!envio) { envio = { correo, clientes: [], total: 0 }; porCorreo.set(correo, envio); }
    envio.clientes.push(c);
    envio.total = redondear(envio.total + c.total);
  }

  const envios = [...porCorreo.values()];
  const compartidos = envios.filter((e) => e.clientes.length > 1);
  return {
    envios,
    sinCorreo,
    clientesQueComparten: compartidos.reduce((n, e) => n + e.clientes.length, 0),
    correosCompartidos: compartidos.length,
  };
}

/**
 * La línea de la barra de selección: «31 comparten correo → 57 correos».
 * Sin ninguna dirección compartida no se dice nada (`null`): un renglón que
 * siempre dice «0 comparten» es ruido pegado a un número.
 */
export function textoCorreosCompartidos(lote: LoteDeCobro): string | null {
  if (lote.correosCompartidos === 0) return null;
  return `${lote.clientesQueComparten} comparten correo → ${lote.envios.length} correos`;
}

/** «Estos 3 no tienen correo: Jocuran, Larious, Waco, S.A.» */
export function textoSinCorreo(lote: LoteDeCobro): string | null {
  const n = lote.sinCorreo.length;
  if (n === 0) return null;
  const nombres = lote.sinCorreo.map((c) => c.nombre).join(", ");
  return n === 1
    ? `Este no tiene correo: ${nombres}`
    : `Estos ${n} no tienen correo: ${nombres}`;
}

/** «12 clientes · $45,231.00» — lo que se seleccionó, sin más adornos. */
export function textoSeleccion(clientes: DestinoCliente[], fmtMonto: (n: number) => string): string {
  const total = redondear(clientes.reduce((s, c) => s + c.total, 0));
  return `${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"} · $${fmtMonto(total)}`;
}
