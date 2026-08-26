/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL SALDO DE VACACIONES — los candados, no la aritmética.
 *
 * Lo que se sostiene acá:
 *   1. 🔴 SIN SALDO INICIAL NO SALE UN NÚMERO. Y sin fecha de ingreso tampoco.
 *      Ni cero, ni el saldo pelado, ni los 245 días de ANGELA que este módulo
 *      vino a matar: `null`, y en pantalla la frase que dice QUÉ falta cargar.
 *   2. 🔴 LO ANTERIOR AL CORTE NO SE VUELVE A RESTAR. Ya está adentro del
 *      número que escribió contabilidad; restarlo otra vez sería cobrarle dos
 *      veces los mismos días. Y una vacación que CRUZA el corte se parte.
 *   3. 🔴 UNA VACACIÓN MARCADA «YA SE LE PAGÓ» SÍ BAJA EL SALDO — resta
 *      exactamente lo mismo que una sin marcar.
 *   4. EL PRORRATEO y el INCREMENTO desde el corte, con el caso a mano de la
 *      cabecera del módulo (ANGELA GARCIA: 12 al 25-ago → 20 al 25-nov).
 *   5. Los días se cuentan DE CALENDARIO —fines de semana y feriados adentro—,
 *      el mismo criterio que ya usa `diasDeVacacion` en la pantalla.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import {
  avisoSinSaldo,
  diasDespuesDelCorte,
  diasGanados,
  diasGastados,
  ganadosDesdeElCorte,
  mesesCumplidos,
  saldoDe,
  textoDetalle,
  textoSaldo,
  validarSaldoInicial,
  DIAS_POR_PERIODO,
  MESES_POR_PERIODO,
  SALDO_INICIAL_MAX,
  TEXTO_FALTA,
  type DatosSaldo,
} from "@/lib/asistencia/saldo-vacaciones";
import type { Vacacion } from "@/lib/asistencia/vacaciones";

const vac = (desde: string, hasta: string, yaPagadas = false, codigo = "7"): Vacacion => ({
  empleado_codigo: codigo,
  desde,
  hasta,
  ya_pagadas: yaPagadas,
});

/** ANGELA GARCIA, el caso de la cabecera: entró el 16-feb-2019. */
const ANGELA = (over: Partial<DatosSaldo> = {}): DatosSaldo => ({
  fechaIngreso: "2019-02-16",
  saldoInicial: 12,
  corte: "2026-08-25",
  ...over,
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

  it("🔴 EL EJEMPLO DE LA CABECERA: ANGELA al 25-ago-2026 y al 25-nov-2026", () => {
    expect(diasGanados("2019-02-16", "2026-08-25")).toBe(245); // 8×30 + ⌊2×30/11⌋
    expect(diasGanados("2019-02-16", "2026-11-25")).toBe(253); // 8×30 + ⌊5×30/11⌋
  });

  it("🔴 SIN FECHA DE INGRESO devuelve null, NUNCA cero", () => {
    expect(diasGanados(null, "2026-08-25")).toBeNull();
    expect(diasGanados("", "2026-08-25")).toBeNull();
    expect(diasGanados("2026-02-31", "2026-08-25")).toBeNull();
  });
});

describe("lo ganado ENTRE el corte y hoy", () => {
  it("el mismo día del corte no ganó nada todavía", () => {
    expect(ganadosDesdeElCorte("2019-02-16", "2026-08-25", "2026-08-25")).toBe(0);
  });

  it("🔴 tres meses después son 8 días: 253 − 245, sobre el MISMO calendario", () => {
    expect(ganadosDesdeElCorte("2019-02-16", "2026-08-25", "2026-11-25")).toBe(8);
  });

  it("nunca es negativo: un corte en el futuro no le quita días a nadie", () => {
    expect(ganadosDesdeElCorte("2019-02-16", "2026-11-25", "2026-08-25")).toBe(0);
  });

  it("sin fecha de ingreso, o sin corte, no se puede saber", () => {
    expect(ganadosDesdeElCorte(null, "2026-08-25", "2026-11-25")).toBeNull();
    expect(ganadosDesdeElCorte("2019-02-16", null, "2026-11-25")).toBeNull();
  });
});

describe("🔴 el corte: lo de antes NO se vuelve a restar", () => {
  const CORTE = "2026-08-25";

  it("una vacación entera ANTERIOR al corte no resta nada", () => {
    // La de ELOYN: 16-jul → 13-ago, toda antes del corte.
    expect(diasDespuesDelCorte("2026-07-16", "2026-08-13", CORTE)).toBe(0);
  });

  it("el día del corte cuenta como YA absorbido", () => {
    expect(diasDespuesDelCorte("2026-08-20", "2026-08-25", CORTE)).toBe(0);
  });

  it("una vacación entera POSTERIOR resta completa", () => {
    expect(diasDespuesDelCorte("2026-10-01", "2026-10-10", CORTE)).toBe(10);
  });

  it("🔴 una que CRUZA el corte se parte: solo los días de después", () => {
    // 20-ago → 30-ago son 11 días; los posteriores al 25 son 26,27,28,29,30 = 5.
    expect(diasDespuesDelCorte("2026-08-20", "2026-08-30", CORTE)).toBe(5);
  });
});

describe("días gastados", () => {
  const CORTE = "2026-08-25";

  it("cuenta días de CALENDARIO, con los dos extremos adentro", () => {
    expect(diasGastados([vac("2026-10-01", "2026-10-10")], "7", CORTE).tomados).toBe(10);
  });

  it("🔴 LOS FINES DE SEMANA CUENTAN: un sábado+domingo son 2 días, no 0", () => {
    // 2026-10-03 es sábado y 2026-10-04 domingo.
    expect(diasGastados([vac("2026-10-03", "2026-10-04")], "7", CORTE).tomados).toBe(2);
  });

  it("separa lo tomado de lo ya pagado, y solo mira a esa persona", () => {
    const todas = [
      vac("2026-10-01", "2026-10-05"),        // 5 días, tomados
      vac("2026-10-10", "2026-10-12", true),  // 3 días, ya pagados
      vac("2026-10-01", "2026-10-30", false, "29"), // de OTRA persona
      vac("2026-07-01", "2026-07-30"),        // ANTES del corte: no cuenta
    ];
    expect(diasGastados(todas, "7", CORTE)).toEqual({ tomados: 5, yaPagados: 3 });
  });
});

describe("🔴 el candado: sin los dos datos NO hay saldo numérico", () => {
  it("sin saldo inicial: null, y dice «Falta el saldo»", () => {
    const s = saldoDe("7", "ANGELA", ANGELA({ saldoInicial: null, corte: null }), [], "2026-08-25");
    expect(s.saldo).toBeNull();
    expect(s.falta).toBe("saldo");
    expect(textoSaldo(s)).toBe("Falta el saldo");
    expect(textoSaldo(s)).not.toMatch(/\d/);
  });

  it("🩸 NUNCA vuelven los 245 días: con fecha de ingreso de 2019 y sin saldo, no sale número", () => {
    const s = saldoDe("7", "ANGELA GARCIA", ANGELA({ saldoInicial: null, corte: null }), [], "2026-08-25");
    expect(s.saldo).toBeNull();
    expect(JSON.stringify(s)).not.toContain("245");
  });

  it("sin fecha de ingreso: null, y dice cuál falta", () => {
    const s = saldoDe("22", "ALEJANDRA", ANGELA({ fechaIngreso: null }), [], "2026-08-25");
    expect(s.saldo).toBeNull();
    expect(s.falta).toBe("fecha");
    expect(textoSaldo(s)).toBe("Falta la fecha de ingreso");
  });

  it("sin ninguno de los dos lo dice sin hacer elegir cuál mirar primero", () => {
    const s = saldoDe("50", "50", { fechaIngreso: null, saldoInicial: null, corte: null }, [], "2026-08-25");
    expect(s.falta).toBe("ambos");
    expect(textoSaldo(s)).toBe(TEXTO_FALTA.ambos);
  });

  it("🔑 un saldo SIN fecha de corte no vale: es un saldo a un día que nadie sabe", () => {
    const s = saldoDe("7", "ANGELA", ANGELA({ corte: null }), [], "2026-08-25");
    expect(s.saldo).toBeNull();
    expect(s.falta).toBe("saldo");
  });

  it("y sin saldo tampoco se muestra el detalle", () => {
    const s = saldoDe("7", "ANGELA", ANGELA({ saldoInicial: null, corte: null }), [], "2026-08-25");
    expect(textoDetalle(s)).toBeNull();
  });
});

describe("🔴 EL EJEMPLO DE LA CABECERA, tal cual", () => {
  it("el mismo día del corte devuelve EXACTAMENTE lo que escribió contabilidad", () => {
    const s = saldoDe("7", "ANGELA GARCIA", ANGELA(), [], "2026-08-25");
    expect(s.saldo).toBe(12);
    expect(textoSaldo(s)).toBe("12 días");
  });

  it("tres meses después, sin tomarse nada: 12 + 8 = 20", () => {
    const s = saldoDe("7", "ANGELA GARCIA", ANGELA(), [], "2026-11-25");
    expect(s.ganadosDesdeCorte).toBe(8);
    expect(s.saldo).toBe(20);
  });

  it("con 10 días tomados en octubre: 12 − 10 + 8 = 10", () => {
    const s = saldoDe("7", "ANGELA GARCIA", ANGELA(), [vac("2026-10-01", "2026-10-10")], "2026-11-25");
    expect(s.tomados).toBe(10);
    expect(s.saldo).toBe(10);
  });

  it("🔴 y una vacación de ANTES del corte no le quita un solo día", () => {
    const s = saldoDe("7", "ANGELA GARCIA", ANGELA(), [vac("2026-08-01", "2026-08-10")], "2026-08-25");
    expect(s.tomados).toBe(0);
    expect(s.saldo).toBe(12);
  });
});

describe("🔴 el candado: una vacación «ya se le pagó» BAJA el saldo", () => {
  it("resta exactamente lo mismo que una sin marcar", () => {
    const sinMarcar = saldoDe("7", "A", ANGELA(), [vac("2026-09-01", "2026-09-05")], "2026-09-10");
    const marcada = saldoDe("7", "A", ANGELA(), [vac("2026-09-01", "2026-09-05", true)], "2026-09-10");
    expect(sinMarcar.saldo).toBe(7);
    expect(marcada.saldo).toBe(7);
  });

  it("pero se cuentan APARTE: quien mira tiene que distinguir descansó de cobró", () => {
    const marcada = saldoDe("7", "A", ANGELA(), [vac("2026-09-01", "2026-09-05", true)], "2026-09-10");
    expect(marcada.tomados).toBe(0);
    expect(marcada.yaPagados).toBe(5);
    expect(textoDetalle(marcada)).toContain("ya pagados 5");
  });

  it("las dos clases restan juntas", () => {
    const s = saldoDe("7", "A", ANGELA(), [
      vac("2026-09-01", "2026-09-05"),       // 5 tomados
      vac("2026-09-10", "2026-09-12", true), // 3 ya pagados
    ], "2026-09-15");
    expect(s.saldo).toBe(12 - 5 - 3);
  });
});

describe("cómo se lee", () => {
  it("«20 días», corto, sin párrafos", () => {
    expect(textoSaldo(saldoDe("7", "A", ANGELA(), [], "2026-11-25"))).toBe("20 días");
  });

  it("un solo día se dice en singular", () => {
    expect(textoSaldo(saldoDe("7", "A", ANGELA({ saldoInicial: 1 }), [], "2026-08-25"))).toBe("1 día");
  });

  it("el detalle dice DE DÓNDE salió el número, para poder auditarlo", () => {
    const s = saldoDe("7", "A", ANGELA(), [vac("2026-10-01", "2026-10-10")], "2026-11-25");
    expect(textoDetalle(s)).toBe("12 al 25 ago 2026 · +8 ganados · tomó 10");
  });

  it("el día del corte, sin movimiento, el detalle es solo el arranque", () => {
    expect(textoDetalle(saldoDe("7", "A", ANGELA(), [], "2026-08-25"))).toBe("12 al 25 ago 2026");
  });

  it("🔑 el saldo NEGATIVO se muestra negativo: adelantar vacaciones existe", () => {
    // 12 de arranque − 30 días corridos tomados + 3 ganados entre el 25-ago y
    // el 30-sep (248 − 245) = −15. El signo se muestra, no se recorta a cero.
    const s = saldoDe("7", "A", ANGELA(), [vac("2026-09-01", "2026-09-30")], "2026-09-30");
    expect(s.ganadosDesdeCorte).toBe(3);
    expect(s.saldo).toBe(12 - 30 + 3);
    expect(textoSaldo(s)).toBe("-15 días");
  });
});

describe("el aviso de quién se quedó sin saldo", () => {
  it("sin nadie no hay cartel — uno permanente se deja de leer", () => {
    expect(avisoSinSaldo(0, 0)).toBeNull();
    expect(avisoSinSaldo(-3, 0)).toBeNull();
  });

  it("con las dos causas dice el total y CADA número, y suman", () => {
    const t = avisoSinSaldo(20, 16)!;
    expect(t).toContain("36 personas no tienen saldo");
    expect(t).toContain("a 20 les falta la fecha de ingreso");
    expect(t).toContain("a 16 el saldo");
    expect(t).toContain("Configuración");
  });

  it("con una sola causa no nombra la otra", () => {
    expect(avisoSinSaldo(20, 0)).toContain("les falta la fecha de ingreso");
    expect(avisoSinSaldo(20, 0)).not.toContain("el saldo.");
    expect(avisoSinSaldo(0, 16)).toContain("Días de vacaciones que le quedan hoy");
  });

  it("una sola persona se dice en singular", () => {
    expect(avisoSinSaldo(1, 0)).toContain("1 persona no tiene saldo");
  });
});

describe("validar lo que llega del navegador", () => {
  it("vacío es válido y significa «todavía no se cargó»", () => {
    expect(validarSaldoInicial({ saldoVacacionesDias: "" })).toEqual({ ok: true, valor: null });
    expect(validarSaldoInicial({})).toEqual({ ok: true, valor: null });
    expect(validarSaldoInicial({ saldoVacacionesDias: null })).toEqual({ ok: true, valor: null });
  });

  it("acepta el número y el texto, y el negativo", () => {
    expect(validarSaldoInicial({ saldoVacacionesDias: 12 })).toEqual({ ok: true, valor: 12 });
    expect(validarSaldoInicial({ saldoVacacionesDias: " 12 " })).toEqual({ ok: true, valor: 12 });
    expect(validarSaldoInicial({ saldoVacacionesDias: -3 })).toEqual({ ok: true, valor: -3 });
  });

  it("🔑 el CERO entra: «no le queda ninguno» es un saldo real", () => {
    expect(validarSaldoInicial({ saldoVacacionesDias: 0 })).toEqual({ ok: true, valor: 0 });
  });

  it("rechaza lo que no es un entero, y lo dice en español", () => {
    expect(validarSaldoInicial({ saldoVacacionesDias: "doce" }).ok).toBe(false);
    expect(validarSaldoInicial({ saldoVacacionesDias: 12.5 }).ok).toBe(false);
  });

  it("rechaza el dedo pesado, igual que el CHECK de la base", () => {
    expect(validarSaldoInicial({ saldoVacacionesDias: SALDO_INICIAL_MAX + 1 }).ok).toBe(false);
    expect(validarSaldoInicial({ saldoVacacionesDias: -SALDO_INICIAL_MAX - 1 }).ok).toBe(false);
    expect(validarSaldoInicial({ saldoVacacionesDias: SALDO_INICIAL_MAX }).ok).toBe(true);
  });
});
