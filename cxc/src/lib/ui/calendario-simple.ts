// ─────────────────────────────────────────────────────────────────────────────
// CALENDARIO SIMPLE — un mes, dos toques, sin botón de confirmar.
//
// Daniel, 5-oct-2026, sobre los calendarios de elegir fechas: *«no sé cómo
// usarlo»*. El diseño aprobado:
//   · un solo mes (también en la computadora) con ‹ ›, y arriba un texto guía:
//     «Toca el primer día» → «Ahora el último día»;
//   · el segundo toque pinta el rango, lo APLICA y CIERRA. Mismo día dos veces
//     = ese día solo; si el segundo es anterior, se ordenan solos;
//   · atajos de un toque: Hoy · Ayer · Últimos 7 días · Este mes · Mes pasado;
//   · en el celular, hoja desde abajo con el vidrio de la casa y 44 px.
// El de un solo día sigue la misma lógica: un toque elige y cierra.
//
// 🔴 `false` = todo como antes (los `<input type="date">` nativos y el texto de
// siempre). Candado: `calendario-simple.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export const CALENDARIO_SIMPLE_2026_10 = false;

export const GUIA_PRIMER_DIA = "Toca el primer día";
export const GUIA_ULTIMO_DIA = "Ahora el último día";
export const GUIA_UN_DIA = "Toca el día";

export type ClaveAtajoFecha = "hoy" | "ayer" | "7d" | "mes" | "mes_pasado";

export const ATAJOS_FECHA: readonly { clave: ClaveAtajoFecha; rotulo: string }[] = [
  { clave: "hoy", rotulo: "Hoy" },
  { clave: "ayer", rotulo: "Ayer" },
  { clave: "7d", rotulo: "Últimos 7 días" },
  { clave: "mes", rotulo: "Este mes" },
  { clave: "mes_pasado", rotulo: "Mes pasado" },
];

const p2 = (n: number) => String(n).padStart(2, "0");
/** Aritmética de días sobre `YYYY-MM-DD` en UTC puro: sin saltos de huso. */
function sumarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + n));
  return `${f.getUTCFullYear()}-${p2(f.getUTCMonth() + 1)}-${p2(f.getUTCDate())}`;
}

/** El rango de un atajo, contado desde `hoy` (`YYYY-MM-DD`, hora Panamá). */
export function rangoDeAtajoFecha(clave: ClaveAtajoFecha, hoy: string): { desde: string; hasta: string } {
  const inicioMes = `${hoy.slice(0, 8)}01`;
  switch (clave) {
    case "hoy": return { desde: hoy, hasta: hoy };
    case "ayer": { const a = sumarDias(hoy, -1); return { desde: a, hasta: a }; }
    case "7d": return { desde: sumarDias(hoy, -6), hasta: hoy };
    case "mes": return { desde: inicioMes, hasta: hoy };
    case "mes_pasado": {
      const fin = sumarDias(inicioMes, -1);
      return { desde: `${fin.slice(0, 8)}01`, hasta: fin };
    }
  }
}

/** Dos toques → rango en orden. Mismo día dos veces = ese día solo. */
export function ordenarRango(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}
