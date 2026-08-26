/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL SALDO DE VACACIONES — los candados, no la aritmética.
 *
 * Lo que se sostiene acá:
 *   1. 🔴 SIN FECHA DE INGRESO NO SALE UN NÚMERO. Ni cero. Ni negativo. `null`,
 *      y en pantalla la frase que dice qué falta hacer.
 *   2. 🔴 UNA VACACIÓN MARCADA «YA SE LE PAGÓ» SÍ BAJA EL SALDO — resta
 *      exactamente lo mismo que una sin marcar. Es la regla de la contadora: el
 *      derecho se consumió igual, se cobró en vez de disfrutarse.
 *   3. EL PRORRATEO DEL PERÍODO EN CURSO, con el caso a mano de la cabecera del
 *      módulo (ANGELA GARCIA, 16-feb-2019 → 25-ago-2026 = 245 días).
 *   4. Los días se cuentan DE CALENDARIO —fines de semana y feriados adentro—,
 *      que es el mismo criterio que ya usa `diasDeVacacion` en la pantalla.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import {
  avisoSinFechaIngreso,
  diasGanados,
  diasGastados,
  mesesCumplidos,
  saldoDe,
  textoGastados,
  textoSaldo,
  SIN_FECHA_INGRESO,
  DIAS_POR_PERIODO,
  MESES_POR_PERIODO,
} from "@/lib/asistencia/saldo-vacaciones";
import type { Vacacion } from "@/lib/asistencia/vacaciones";

const vac = (desde: string, hasta: string, yaPagadas = false, codigo = "29"): Vacacion => ({
  empleado_codigo: codigo,
  desde,
  hasta,
  ya_pagadas: yaPagadas,
});

// ─────────────────────────────────────────────────────────────────────────────

describe("la ley, en dos números", () => {
  it("son 30 días por cada 11 meses — ONCE, no doce", () => {
    expect(DIAS_POR_PERIODO).toBe(30);
    expect(MESES_POR_PERIODO).toBe(11);
  });
});

describe("meses cumplidos", () => {
  it("el mes cierra el MISMO día del mes, no el 1º", () => {
    expect(mesesCumplidos("2026-02-16", "2026-03-16")).toBe(1);
    // Un día antes todavía no cerró.
    expect(mesesCumplidos("2026-02-16", "2026-03-15")).toBe(0);
  });

  it("nunca es negativo: quien entra mañana lleva cero meses, no menos uno", () => {
    expect(mesesCumplidos("2026-09-01", "2026-08-25")).toBe(0);
  });

  it("cruza años sin perder meses", () => {
    expect(mesesCumplidos("2019-02-16", "2026-08-25")).toBe(90);
  });
});

describe("días ganados", () => {
  it("11 meses cumplidos = 30 días enteros", () => {
    expect(diasGanados("2025-09-25", "2026-08-25")).toBe(30);
  });

  it("22 meses = dos períodos = 60 días", () => {
    expect(diasGanados("2024-10-25", "2026-08-25")).toBe(60);
  });

  it("🔴 EL PRORRATEO: el período en curso se TRUNCA, nunca se redondea para arriba", () => {
    // 10 meses: 10 × 30/11 = 27,27… → 27. Mostrar 28 sería habilitar un día que
    // todavía no se ganó, y eso después se paga en plata.
    expect(diasGanados("2025-10-25", "2026-08-25")).toBe(27);
  });

  it("🔴 EL EJEMPLO DE LA CABECERA, tal cual: ANGELA GARCIA entró el 16-feb-2019", () => {
    // 90 meses = 8 bloques × 30 = 240, más ⌊2 × 30/11⌋ = 5 → 245.
    expect(diasGanados("2019-02-16", "2026-08-25")).toBe(245);
  });

  it("una fecha de ingreso FUTURA da cero, y ese cero SÍ es real", () => {
    expect(diasGanados("2026-09-01", "2026-08-25")).toBe(0);
  });

  it("🔴 SIN FECHA DE INGRESO devuelve null, NUNCA cero", () => {
    expect(diasGanados(null, "2026-08-25")).toBeNull();
    expect(diasGanados("", "2026-08-25")).toBeNull();
    expect(diasGanados("   ", "2026-08-25")).toBeNull();
    // Y un texto que parece fecha pero no existe tampoco pasa.
    expect(diasGanados("2026-02-31", "2026-08-25")).toBeNull();
  });
});

describe("días gastados", () => {
  it("cuenta días de CALENDARIO, con los dos extremos adentro", () => {
    // 16-jul → 13-ago-2026 son 29 días corridos (la vacación real de ELOYN).
    expect(diasGastados([vac("2026-07-16", "2026-08-13")], "29").tomados).toBe(29);
  });

  it("🔴 LOS FINES DE SEMANA CUENTAN: un sábado+domingo son 2 días, no 0", () => {
    // 2026-08-08 es sábado y 2026-08-09 domingo.
    expect(diasGastados([vac("2026-08-08", "2026-08-09")], "29").tomados).toBe(2);
  });

  it("separa lo tomado de lo ya pagado, y solo mira a esa persona", () => {
    const todas = [
      vac("2026-08-03", "2026-08-07"), // 5 días, tomados
      vac("2026-08-10", "2026-08-12", true), // 3 días, ya pagados
      vac("2026-08-03", "2026-08-30", false, "7"), // de OTRA persona
    ];
    expect(diasGastados(todas, "29")).toEqual({ tomados: 5, yaPagados: 3 });
  });
});

describe("🔴 el candado: sin fecha de ingreso NO hay saldo numérico", () => {
  const s = saldoDe("22", "ALEJANDRA CAMAÑO", null, [], "2026-08-25");

  it("saldo y ganados son null, y la bandera lo dice", () => {
    expect(s.saldo).toBeNull();
    expect(s.ganados).toBeNull();
    expect(s.faltaFechaIngreso).toBe(true);
  });

  it("la pantalla dice qué falta hacer, y NO escribe un cero", () => {
    expect(textoSaldo(s)).toBe(SIN_FECHA_INGRESO);
    expect(textoSaldo(s)).not.toMatch(/\d/);
  });

  it("y aunque tenga vacaciones cargadas sigue sin producir un número", () => {
    const conVacaciones = saldoDe(
      "22", "ALEJANDRA CAMAÑO", null, [vac("2026-08-03", "2026-08-07", false, "22")], "2026-08-25",
    );
    expect(conVacaciones.saldo).toBeNull();
    // Los días gastados SÍ se saben y se conservan: lo que falta es el techo.
    expect(conVacaciones.tomados).toBe(5);
  });
});

describe("🔴 el candado: una vacación «ya se le pagó» BAJA el saldo", () => {
  const INGRESO = "2025-09-25"; // 11 meses al 25-ago-2026 → 30 días ganados.

  it("resta exactamente lo mismo que una sin marcar", () => {
    const sinMarcar = saldoDe("29", "ELOYN", INGRESO, [vac("2026-08-03", "2026-08-07")], "2026-08-25");
    const marcada = saldoDe("29", "ELOYN", INGRESO, [vac("2026-08-03", "2026-08-07", true)], "2026-08-25");
    expect(sinMarcar.saldo).toBe(25);
    expect(marcada.saldo).toBe(25);
  });

  it("pero se cuentan APARTE: quien mira tiene que poder distinguir descansó de cobró", () => {
    const marcada = saldoDe("29", "ELOYN", INGRESO, [vac("2026-08-03", "2026-08-07", true)], "2026-08-25");
    expect(marcada.tomados).toBe(0);
    expect(marcada.yaPagados).toBe(5);
    expect(textoGastados(marcada)).toBe("ya pagados 5");
  });

  it("las dos clases restan juntas", () => {
    const s = saldoDe("29", "ELOYN", INGRESO, [
      vac("2026-08-03", "2026-08-07"),        // 5 tomados
      vac("2026-08-10", "2026-08-12", true),  // 3 ya pagados
    ], "2026-08-25");
    expect(s.saldo).toBe(30 - 5 - 3);
    expect(textoGastados(s)).toBe("tomó 5 · ya pagados 3");
  });
});

describe("el caso real, el único cargado en el sistema", () => {
  it("ELOYN MENDOZA: entró el 25-jul-2023, se tomó 29 días → 71 de 100", () => {
    const s = saldoDe("29", "ELOYN MENDOZA", "2023-07-25", [vac("2026-07-16", "2026-08-13")], "2026-08-25");
    expect(s.ganados).toBe(100);
    expect(s.tomados).toBe(29);
    expect(s.saldo).toBe(71);
    expect(textoSaldo(s)).toBe("71 de 100");
  });
});

describe("cómo se lee", () => {
  it("«18 de 30»: corto, sin párrafos", () => {
    const s = saldoDe("1", "X", "2025-09-25", [vac("2026-08-01", "2026-08-12", false, "1")], "2026-08-25");
    expect(textoSaldo(s)).toBe("18 de 30");
  });

  it("sin días gastados no hay renglón de detalle — un «tomó 0» se deja de leer", () => {
    expect(textoGastados(saldoDe("1", "X", "2025-09-25", [], "2026-08-25"))).toBeNull();
  });

  it("🔑 el saldo NEGATIVO se muestra negativo: adelantar vacaciones existe", () => {
    // 11 meses = 30 ganados, y se tomó un mes y medio corrido.
    const s = saldoDe("1", "X", "2025-09-25", [vac("2026-06-01", "2026-07-15", false, "1")], "2026-08-25");
    expect(s.saldo).toBe(30 - 45);
    expect(textoSaldo(s)).toBe("-15 de 30");
  });
});

describe("el aviso de quién se quedó sin saldo", () => {
  it("sin nadie no hay cartel — uno permanente se deja de leer", () => {
    expect(avisoSinFechaIngreso(0)).toBeNull();
    expect(avisoSinFechaIngreso(-3)).toBeNull();
  });

  it("dice CUÁNTAS y DÓNDE se arregla", () => {
    expect(avisoSinFechaIngreso(1)).toContain("1 persona no tiene saldo");
    const veinte = avisoSinFechaIngreso(20)!;
    expect(veinte).toContain("20 personas no tienen saldo");
    expect(veinte).toContain("fecha de ingreso");
    expect(veinte).toContain("Configuración");
  });
});
