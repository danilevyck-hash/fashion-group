// ============================================================================
// Marketing — período trabajado (quincenas de impulsadora)
// ============================================================================
// Cubre lo que puede romper plata: que dos quincenas del mismo mes convivan,
// que un pago solapado se rechace, que un pago mensual VIEJO (sin rango) siga
// leyéndose bien, y que la tarjeta no mienta cuando el mes quedó a medias.
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  coberturaDelMes,
  diasDelMes,
  esFechaISO,
  esMesCompleto,
  etiquetaPeriodo,
  etiquetaPeriodoCorta,
  mesCompleto,
  periodoEfectivo,
  primeraQuincena,
  segundaQuincena,
  seSolapan,
  validarPeriodo,
} from "@/lib/marketing/periodo";

describe("validarPeriodo", () => {
  it("acepta una quincena", () => {
    expect(validarPeriodo("2026-07-01", "2026-07-15")).toBeNull();
  });

  it("acepta un solo día (desde = hasta)", () => {
    expect(validarPeriodo("2026-07-08", "2026-07-08")).toBeNull();
  });

  it("rechaza 'hasta' anterior a 'desde' con mensaje en español", () => {
    const msg = validarPeriodo("2026-07-15", "2026-07-01");
    expect(msg).toBe("La fecha final no puede ser anterior a la inicial.");
  });

  it("rechaza fechas vacías o inválidas", () => {
    // 1-sep-2026: el texto de pantalla pasó a tuteo neutro (sin voseo) — candado en `nada-de-voseo.test.ts`.
    expect(validarPeriodo("", "2026-07-15")).toBe("Pon las dos fechas del período trabajado.");
    expect(validarPeriodo("2026-02-30", "2026-03-01")).toBe(
      "Pon las dos fechas del período trabajado.",
    );
  });
});

describe("fechas sin Date (Panamá UTC−5)", () => {
  it("febrero bisiesto y no bisiesto", () => {
    expect(diasDelMes(2024, 2)).toBe(29);
    expect(diasDelMes(2026, 2)).toBe(28);
    expect(diasDelMes(2000, 2)).toBe(29);
    expect(diasDelMes(1900, 2)).toBe(28);
  });

  it("la 2ª quincena termina en el último día real del mes", () => {
    expect(segundaQuincena("2026-02").hasta).toBe("2026-02-28");
    expect(segundaQuincena("2026-04").hasta).toBe("2026-04-30");
    expect(segundaQuincena("2026-07").hasta).toBe("2026-07-31");
  });

  it("los atajos de quincena no dejan huecos ni se pisan", () => {
    const q1 = primeraQuincena("2026-07");
    const q2 = segundaQuincena("2026-07");
    expect(q1).toEqual({ desde: "2026-07-01", hasta: "2026-07-15" });
    expect(q2).toEqual({ desde: "2026-07-16", hasta: "2026-07-31" });
    expect(seSolapan(q1, q2)).toBe(false);
    expect(coberturaDelMes("2026-07-01", [q1, q2]).estado).toBe("pagado");
  });

  it("esFechaISO rechaza días que no existen", () => {
    expect(esFechaISO("2026-07-31")).toBe(true);
    expect(esFechaISO("2026-06-31")).toBe(false);
    expect(esFechaISO("2026-13-01")).toBe(false);
    expect(esFechaISO("07/15/2026")).toBe(false);
  });
});

describe("periodoEfectivo — los pagos viejos NO se rompen", () => {
  it("un pago mensual viejo (solo impulsadora_mes) se lee como el mes completo", () => {
    expect(periodoEfectivo({ impulsadora_mes: "2026-07-01" })).toEqual({
      desde: "2026-07-01",
      hasta: "2026-07-31",
    });
  });

  it("febrero viejo cae al 28, no al 31", () => {
    expect(periodoEfectivo({ impulsadora_mes: "2026-02-01" })?.hasta).toBe("2026-02-28");
  });

  it("un pago nuevo usa su rango real", () => {
    expect(
      periodoEfectivo({
        impulsadora_mes: "2026-07-01",
        periodo_desde: "2026-07-01",
        periodo_hasta: "2026-07-15",
      }),
    ).toEqual({ desde: "2026-07-01", hasta: "2026-07-15" });
  });

  it("una factura de proyecto normal (sin nada) no tiene período", () => {
    expect(periodoEfectivo({})).toBeNull();
  });
});

describe("anti-duplicado por solapamiento", () => {
  const q1 = { desde: "2026-07-01", hasta: "2026-07-15" };

  it("PERMITE la 2ª quincena del mismo mes (era lo que bloqueaba el modelo viejo)", () => {
    expect(seSolapan(q1, { desde: "2026-07-16", hasta: "2026-07-31" })).toBe(false);
  });

  it("RECHAZA el mismo rango exacto", () => {
    expect(seSolapan(q1, { desde: "2026-07-01", hasta: "2026-07-15" })).toBe(true);
  });

  it("RECHAZA un rango que pisa un solo día", () => {
    expect(seSolapan(q1, { desde: "2026-07-15", hasta: "2026-07-20" })).toBe(true);
  });

  it("RECHAZA el mes completo si ya se pagó una quincena", () => {
    expect(seSolapan(q1, mesCompleto("2026-07"))).toBe(true);
  });

  it("un pago mensual VIEJO protege igual contra la quincena nueva", () => {
    const viejo = periodoEfectivo({ impulsadora_mes: "2026-07-01" })!;
    expect(seSolapan(viejo, q1)).toBe(true);
  });

  it("meses distintos nunca se solapan", () => {
    expect(seSolapan(q1, { desde: "2026-08-01", hasta: "2026-08-15" })).toBe(false);
  });
});

describe("coberturaDelMes — la tarjeta dice la verdad", () => {
  it("sin pagos: pendiente", () => {
    const c = coberturaDelMes("2026-07-01", []);
    expect(c.estado).toBe("pendiente");
    expect(c.faltan).toBe("");
  });

  it("mes completo: pagado", () => {
    const c = coberturaDelMes("2026-07-01", [mesCompleto("2026-07")]);
    expect(c.estado).toBe("pagado");
    expect(c.faltan).toBe("");
  });

  it("solo la 1ª quincena: parcial y dice qué falta", () => {
    const c = coberturaDelMes("2026-07-01", [primeraQuincena("2026-07")]);
    expect(c.estado).toBe("parcial");
    expect(c.faltan).toBe("16–31");
  });

  it("solo la 2ª quincena: parcial, falta la primera", () => {
    const c = coberturaDelMes("2026-07-01", [segundaQuincena("2026-07")]);
    expect(c.estado).toBe("parcial");
    expect(c.faltan).toBe("1–15");
  });

  it("dos huecos separados se listan compactos", () => {
    const c = coberturaDelMes("2026-07-01", [{ desde: "2026-07-06", hasta: "2026-07-25" }]);
    expect(c.estado).toBe("parcial");
    expect(c.faltan).toBe("1–5, 26–31");
  });

  it("un pago que cruza meses cubre la parte que toca de cada uno", () => {
    const cruzado = [{ desde: "2026-06-20", hasta: "2026-07-05" }];
    expect(coberturaDelMes("2026-06-01", cruzado).faltan).toBe("1–19");
    expect(coberturaDelMes("2026-07-01", cruzado).faltan).toBe("6–31");
  });

  it("un pago mensual viejo deja el mes en pagado (no en parcial)", () => {
    const viejo = periodoEfectivo({ impulsadora_mes: "2026-02-01" })!;
    expect(coberturaDelMes("2026-02-01", [viejo]).estado).toBe("pagado");
  });
});

describe("etiquetas", () => {
  it("mes completo conserva EXACTAMENTE el texto viejo ('Julio 2026')", () => {
    expect(etiquetaPeriodo(mesCompleto("2026-07"))).toBe("Julio 2026");
  });

  it("quincena se lee como período", () => {
    expect(etiquetaPeriodo({ desde: "2026-07-01", hasta: "2026-07-15" })).toBe(
      "1–15 de julio 2026",
    );
  });

  it("un solo día", () => {
    expect(etiquetaPeriodo({ desde: "2026-07-08", hasta: "2026-07-08" })).toBe(
      "8 de julio 2026",
    );
  });

  it("rango que cruza meses y años", () => {
    expect(etiquetaPeriodo({ desde: "2026-06-20", hasta: "2026-07-05" })).toBe(
      "20 junio – 5 julio 2026",
    );
    expect(etiquetaPeriodo({ desde: "2025-12-20", hasta: "2026-01-05" })).toBe(
      "20 diciembre 2025 – 5 enero 2026",
    );
  });

  it("etiqueta corta para tarjeta y Excel", () => {
    expect(etiquetaPeriodoCorta(mesCompleto("2026-07"))).toBe("jul 2026");
    expect(etiquetaPeriodoCorta({ desde: "2026-07-01", hasta: "2026-07-15" })).toBe(
      "1–15 jul 2026",
    );
    expect(etiquetaPeriodoCorta({ desde: "2026-06-20", hasta: "2026-07-05" })).toBe(
      "20 jun – 5 jul 2026",
    );
  });

  it("esMesCompleto distingue quincena de mes", () => {
    expect(esMesCompleto(mesCompleto("2026-02"))).toBe(true);
    expect(esMesCompleto({ desde: "2026-02-01", hasta: "2026-02-27" })).toBe(false);
  });
});
