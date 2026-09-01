// Helpers de fecha del selector de rango. Módulo APARTE y sin una sola
// importación de librería.
//
// 🩸 POR QUÉ EXISTE, MEDIDO: vivían en `CalendarioRango.tsx`. `RangoFechas` los
// importaba con `import { aIso } from "./CalendarioRango"` —estático— mientras
// cargaba el componente con `dynamic()`. El import estático GANA: arrastra el
// módulo entero, y con él `react-day-picker` y `date-fns`, al chunk del padre.
// El `dynamic()` quedaba de adorno.
//
// Medido en el build: /asistencia 210 kB → 265 kB y /boston 191 kB → 247 kB de
// First Load, o sea +55 kB para todo el que abre la pantalla, abra o no el
// calendario. Con los helpers acá, el import estático apunta a un archivo que
// no importa nada y la librería queda del otro lado del `dynamic()`.

/** `Date` → `YYYY-MM-DD` leyendo los campos LOCALES: `toISOString()` pasa por
 *  UTC y en Panamá (UTC−5) devuelve el día anterior después de las 19:00. */
export function aIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** `YYYY-MM-DD` → `Date` a mediodía local: inmune a saltos de huso. */
export function deIso(s: string): Date {
  const [a, m, d] = s.split("-").map(Number);
  return new Date(a, m - 1, d, 12, 0, 0);
}
