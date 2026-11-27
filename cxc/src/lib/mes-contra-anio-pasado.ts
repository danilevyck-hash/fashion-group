// ─────────────────────────────────────────────────────────────────────────────
// MES A MES CONTRA EL AÑO PASADO — módulo PURO (27-nov-2026,
// `MANTENER_PRESIONADO_2026_11`). Lo usan los pagos de un cliente (CxC) y las
// compras de una empresa (Proveedores).
//
// · El año es el de HOY en Panamá; los meses van de enero al mes en curso.
// · El mes en curso se compara contra los MISMOS DÍAS del año pasado (1 al día
//   de hoy), cortando a la medianoche de Panamá: quien llama pasa `hoyPanama()`.
// · Un monto desconocido (`null`, p. ej. una línea sin costo CIF) deja ESE mes
//   en `null` —nunca se suma como cero— y el total también.
// ─────────────────────────────────────────────────────────────────────────────

export interface FilaConMonto {
  /** `YYYY-MM-DD` (o un ISO; se leen los 10 primeros). */
  fecha: string;
  monto: number | null;
}

export interface MesContraAnioPasado {
  mes: number;
  actual: number | null;
  previo: number | null;
}

export interface MesesContraAnioPasado {
  anio: number;
  /** El día de corte (hoy en Panamá). */
  corte: string;
  meses: MesContraAnioPasado[];
  total: { actual: number | null; previo: number | null };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Desde qué fecha hay que leer: el 1 de enero del año pasado. */
export function desdeParaComparar(hoy: string): string {
  return `${Number(hoy.slice(0, 4)) - 1}-01-01`;
}

export function mesesContraAnioPasado(filas: readonly FilaConMonto[], hoy: string): MesesContraAnioPasado {
  const anio = Number(hoy.slice(0, 4));
  const mesHoy = Number(hoy.slice(5, 7));
  const diaHoy = Number(hoy.slice(8, 10));
  const suma = new Map<string, number | null>(); // "a|m" → suma (null = desconocido)
  for (const f of filas) {
    const d = (f.fecha ?? "").slice(0, 10);
    if (d.length < 10 || d > hoy) continue;
    const a = Number(d.slice(0, 4));
    const m = Number(d.slice(5, 7));
    if (a !== anio && a !== anio - 1) continue;
    if (m > mesHoy) continue;
    // El mes en curso del año pasado: solo hasta el mismo día.
    if (a === anio - 1 && m === mesHoy && Number(d.slice(8, 10)) > diaHoy) continue;
    const k = `${a}|${m}`;
    const antes = suma.has(k) ? suma.get(k)! : 0;
    // En millonésimas ENTERAS: la suma es exacta y el redondeo a centavos da
    // lo mismo que la base (NUMERIC), no lo que deja el error del flotante.
    suma.set(k, antes == null || f.monto == null || !Number.isFinite(f.monto) ? null : antes + Math.round(f.monto * 1e6));
  }
  const de = (a: number, m: number) => {
    const v = suma.has(`${a}|${m}`) ? suma.get(`${a}|${m}`)! : 0;
    return v == null ? null : Math.round(v / 1e4) / 100;
  };
  const meses: MesContraAnioPasado[] = [];
  for (let m = 1; m <= mesHoy; m++) meses.push({ mes: m, actual: de(anio, m), previo: de(anio - 1, m) });
  const totalDe = (k: "actual" | "previo") =>
    meses.some((x) => x[k] == null) ? null : r2(meses.reduce((s, x) => s + (x[k] as number), 0));
  return { anio, corte: hoy, meses, total: { actual: totalDe("actual"), previo: totalDe("previo") } };
}

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** «Nov al 27, contra 1–27 nov 2025.» — solo si el mes en curso no está completo. */
export function notaDelCorte(corte: string): string | null {
  const anio = Number(corte.slice(0, 4));
  const mes = Number(corte.slice(5, 7));
  const dia = Number(corte.slice(8, 10));
  const fin = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  if (!anio || !mes || dia >= fin) return null;
  const m = MESES_CORTOS[mes - 1];
  return `${m} al ${dia}, contra 1–${dia} ${m.toLowerCase()} ${anio - 1}.`;
}
