/* Candado de `feriadosNacionales` / `juntarFeriados` (19-nov-2026, Daniel: «los
 * días feriados los debes cargar ya para siempre»). Lo calculado da EXACTAMENTE
 * las filas tipo «feriado» que estaban cargadas en `asistencia_feriados` para
 * 2026 y 2027 (copiadas de producción el 19-nov-2026), y la tabla manda. */
import { describe, it, expect } from "vitest";

import { feriadosNacionales, juntarFeriados } from "@/lib/asistencia/feriados";

const CARGADOS_2026 = [
  "2026-01-01", "2026-01-09", "2026-02-17", "2026-04-03", "2026-05-01", "2026-11-03",
  "2026-11-05", "2026-11-10", "2026-11-28", "2026-12-08", "2026-12-20", "2026-12-25",
];
const CARGADOS_2027 = [
  "2027-01-01", "2027-01-09", "2027-02-09", "2027-03-26", "2027-05-01", "2027-11-03",
  "2027-11-05", "2027-11-10", "2027-11-28", "2027-12-08", "2027-12-20", "2027-12-25",
];

describe("feriados nacionales calculados", () => {
  it("2026 y 2027: las mismas fechas que ya estaban cargadas", () => {
    expect(feriadosNacionales(2026).map((f) => f.fecha)).toEqual(CARGADOS_2026);
    expect(feriadosNacionales(2027).map((f) => f.fecha)).toEqual(CARGADOS_2027);
  });

  it("Pascua de otros años: Carnaval y Viernes Santo", () => {
    const f = (a: number) => feriadosNacionales(a).map((x) => x.fecha);
    expect(f(2028)).toEqual(expect.arrayContaining(["2028-02-29", "2028-04-14"]));
    expect(f(2030)).toEqual(expect.arrayContaining(["2030-03-05", "2030-04-19"]));
  });

  it("la fila de la tabla manda, y un rango de dos años trae los dos", () => {
    const r = juntarFeriados("2026-12-01", "2027-01-31", [
      { fecha: "2026-12-08", nombre: "Otro nombre", tipo: "dia_libre" },
    ]);
    expect(r.feriados.has("2026-12-08")).toBe(false);
    expect(r.diasLibres.get("2026-12-08")).toBe("Otro nombre");
    expect([...r.feriados.keys()].sort()).toEqual(["2026-12-20", "2026-12-25", "2027-01-01", "2027-01-09"]);
  });
});
