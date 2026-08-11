// El mayor contable de Switch, medido contra el archivo REAL de Vistana.
//
// El fixture `mayor-vistana-2026.csv` es el CSV que devuelve Contabilidad →
// Listado de Asientos → "Descargar" para el rango 01-01-2026 … 31-12-2026,
// bajado el 10-ago-2026. 44 líneas, 6 asientos, y NADA inventado.
//
// 🔴 LOS NÚMEROS DE ESTE ARCHIVO SON LA VERDAD. Fueron medidos a mano contra el
// CSV antes de escribir una línea de parser. Si el parser da otra cosa, está mal
// el parser — no los números.
//
// Lo que más se cuida acá son los SIGNOS. Un gasto es `débito − crédito`, y dos
// cuentas de enero dan NEGATIVO (6.03.41 = −127.78 por un reverso, 6.03.42 =
// −69.30 que es solo crédito). Tomar valor absoluto o ignorar la columna crédito
// es el error clásico de este negocio, y su firma es que la diferencia da
// EXACTAMENTE el doble. Por eso hay un test que lo comprueba explícitamente.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import { parsearMayorCsv, montoACentavos, fechaAIso, normalizarTexto } from "@/lib/mayor/parser";
import {
  resumirMes,
  avisosDelMes,
  esAsientoDeCierre,
  centAUsd,
  mesCubierto,
  ultimoDiaDelMes,
  CUENTAS_SIN_SALIDA_DE_CAJA,
  type Cobertura,
} from "@/lib/mayor/gastos";

const CSV = fs.readFileSync(
  path.resolve(__dirname, "../fixtures/mayor-vistana-2026.csv"),
  "utf8",
);

/** El rango que se le pidió a Switch al bajar este archivo. */
const COBERTURA: Cobertura[] = [{ desde: "2026-01-01", hasta: "2026-12-31" }];

const parsed = parsearMayorCsv(CSV);
const lineasDe = (mes: string) => parsed.lineas.filter((l) => l.mes === mes);

// ─────────────────────────────────────────────────────────────────────────────
describe("el archivo real se parsea entero", () => {
  it("44 líneas de datos, sin un solo error", () => {
    expect(parsed.errores).toEqual([]);
    expect(parsed.lineas).toHaveLength(44);
  });

  it("los 6 asientos de 2026 de Vistana", () => {
    const asientos = [...new Set(parsed.lineas.map((l) => l.asiento))].sort();
    expect(asientos).toEqual([
      "01-012026",
      "012026318",
      "02-012026",
      "022026320",
      "03-012026",
      "04-012026",
    ]);
  });

  it("los dobles espacios se colapsan en encabezados y valores", () => {
    // En el CSV crudo dice " ASIENTO  VENTA  2026-01 " y " NOMBRE  CUENTA ".
    const venta = parsed.lineas.find((l) => l.asiento === "01-012026")!;
    expect(venta.descripcion).toBe("ASIENTO VENTA 2026-01");
    const fletes = parsed.lineas.find((l) => l.cuenta === "6.03.07.00.00")!;
    expect(fletes.cuentaNombre).toBe("FLETES Y ACARREO");
  });

  it("el código de cuenta se guarda COMPLETO, con sus 5 segmentos", () => {
    for (const l of parsed.lineas) {
      expect(l.cuenta).toMatch(/^\d+(\.\d+){4}$/);
    }
    expect(parsed.lineas.some((l) => l.cuenta === "6.03.07.00.00")).toBe(true);
  });

  it("las fechas DD-MM-YYYY pasan a ISO y el rango observado es el real", () => {
    expect(parsed.rangoObservado).toEqual({ desde: "2026-01-01", hasta: "2026-02-02" });
    expect(parsed.meses).toEqual(["2026-01", "2026-02"]);
  });

  it("un MISMO asiento repite la MISMA cuenta en dos líneas distintas", () => {
    // 02-012026 trae 6.03.41 dos veces: una por débito y otra por crédito.
    // Por eso (asiento, cuenta) NO alcanza como llave de una línea.
    const faltantes = parsed.lineas.filter(
      (l) => l.asiento === "02-012026" && l.cuenta === "6.03.41.00.00",
    );
    expect(faltantes).toHaveLength(2);
    expect(faltantes.map((l) => l.debitoCent)).toEqual([169586, 0]);
    expect(faltantes.map((l) => l.creditoCent)).toEqual([0, 182364]);
    expect(new Set(faltantes.map((l) => l.linea)).size).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GASTOS DE ENERO 2026 — los 11 renglones medidos a mano", () => {
  const enero = resumirMes("2026-01", lineasDe("2026-01"), COBERTURA);

  /** cuenta corta → dólares, tal como se midió contra el CSV. */
  const ESPERADO: Record<string, number> = {
    "6.02.01": 6730.19, // SERVICIOS PROFESIONALES
    "6.03.29": 4071.6, // IMPUESTO MUNICIPAL
    "6.03.18": 649.5, // GASTO DE SEGUROS
    "6.03.20": 158.52, // GASTOS DE VIAJES
    "6.03.14": 132.98, // COMBUSTIBLE Y LUBRICANTES
    "6.03.12": 100.0, // REPARACION Y MANT. DE OFICINA
    "6.03.07": 20.0, // FLETES Y ACARREO
    "6.03.31": 14.6, // ATENCION A CLIENTES
    "6.04.01": 5.35, // CARGOS BANCARIOS
    "6.03.41": -127.78, // FALTANTES DE INVENTARIO ← NEGATIVO (1695.86 − 1823.64)
    "6.03.42": -69.3, // GASTO DE PERIODOS ANTERIORES ← NEGATIVO (solo crédito)
  };

  it("son exactamente 11 cuentas de gasto, ni una más", () => {
    expect(enero.cuentas).toHaveLength(11);
    expect(enero.isr).toHaveLength(0); // enero no trae ISR
  });

  for (const [corta, usd] of Object.entries(ESPERADO)) {
    it(`${corta} = ${usd.toFixed(2)}`, () => {
      const c = enero.cuentas.find((x) => x.corta === corta);
      expect(c, `falta la cuenta ${corta}`).toBeDefined();
      expect(centAUsd(c!.netoCent)).toBe(usd);
    });
  }

  it("🔑 EL TOTAL DE ENERO ES 11,685.66", () => {
    expect(centAUsd(enero.totalCent)).toBe(11685.66);
    // Y es exactamente la suma de los 11 renglones de arriba.
    const suma = Object.values(ESPERADO).reduce((a, b) => a + b, 0);
    expect(centAUsd(enero.totalCent)).toBeCloseTo(suma, 2);
  });

  it("sin ISR, operación y total son el mismo número", () => {
    expect(enero.totalIsrCent).toBe(0);
    expect(enero.totalOperacionCent).toBe(enero.totalCent);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 SIGNOS — el error que da exactamente el doble", () => {
  const enero = resumirMes("2026-01", lineasDe("2026-01"), COBERTURA);

  it("los negativos se conservan: NO se toma valor absoluto", () => {
    const faltantes = enero.cuentas.find((c) => c.corta === "6.03.41")!;
    expect(faltantes.netoCent).toBe(-12778);
    expect(faltantes.netoCent).toBeLessThan(0);
    // El débito y el crédito se conservan por separado, los dos positivos.
    expect(faltantes.debitoCent).toBe(169586);
    expect(faltantes.creditoCent).toBe(182364);
  });

  it("una cuenta SOLO de crédito queda negativa, no en cero ni positiva", () => {
    const periodos = enero.cuentas.find((c) => c.corta === "6.03.42")!;
    expect(periodos.debitoCent).toBe(0);
    expect(periodos.creditoCent).toBe(6930);
    expect(periodos.netoCent).toBe(-6930);
  });

  it("ignorar la columna crédito daría 13,578.60 — casi $1.900 de más", () => {
    // Sumar solo débitos infla el gasto de enero en $1.892,94: se comería el
    // crédito de 1.823,64 de faltantes y el de 69,30 de períodos anteriores.
    const soloDebitos = enero.cuentas.reduce((a, c) => a + c.debitoCent, 0);
    expect(centAUsd(soloDebitos)).toBe(13578.6);
    expect(centAUsd(soloDebitos - enero.totalCent)).toBe(1892.94);
  });

  it("🩸 tomar valor absoluto da la DIFERENCIA EXACTAMENTE DOBLE", () => {
    // Ésta es la firma del error clásico de este negocio. Sumar |neto| en vez
    // de neto da 12.079,82, y la diferencia contra el bueno es 394,16 =
    // EXACTAMENTE 2 × 197,08 (los dos netos negativos). Si algún día un total
    // difiere de la contadora en un número que resulta ser el doble de algo,
    // el culpable es un signo, no un redondeo.
    const conAbs = enero.cuentas.reduce((a, c) => a + Math.abs(c.netoCent), 0);
    expect(centAUsd(conAbs)).toBe(12079.82);
    expect(centAUsd(conAbs)).not.toBe(11685.66);

    const negativos = enero.cuentas
      .filter((c) => c.netoCent < 0)
      .reduce((a, c) => a + c.netoCent, 0);
    expect(centAUsd(negativos)).toBe(-197.08);
    expect(centAUsd(conAbs - enero.totalCent)).toBe(centAUsd(-2 * negativos));
    expect(centAUsd(conAbs - enero.totalCent)).toBe(394.16);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔑 un mes SIN contabilidad NO es un mes que gastó $0", () => {
  it("enero está CERRADO: tiene los asientos de cierre mensual", () => {
    const enero = resumirMes("2026-01", lineasDe("2026-01"), COBERTURA);
    expect(enero.estado).toBe("cerrado");
  });

  it("febrero tiene UN asiento suelto y NINGÚN gasto → INCOMPLETO, no cero", () => {
    // Es el caso más peligroso del archivo: febrero SÍ tiene movimiento (un
    // pago de préstamo) pero ni una cuenta del grupo 6. Un módulo que solo
    // guardara el grupo 6 no podría distinguirlo de un mes nunca cerrado.
    const feb = resumirMes("2026-02", lineasDe("2026-02"), COBERTURA);
    expect(feb.lineasTotal).toBe(2);
    expect(feb.lineasGasto).toBe(0);
    expect(feb.totalCent).toBe(0);
    expect(feb.estado).toBe("parcial"); // ← NO "cerrado"
    expect(feb.estado).not.toBe("cerrado");
  });

  it("marzo a diciembre se pidieron y vinieron vacíos → SIN CERRAR", () => {
    for (const mes of ["2026-03", "2026-06", "2026-08", "2026-12"]) {
      const r = resumirMes(mes, lineasDe(mes), COBERTURA);
      expect(r.lineasTotal).toBe(0);
      expect(r.estado, mes).toBe("sin_cerrar");
    }
  });

  it("un mes FUERA del rango pedido es 'no traído', que es otra cosa", () => {
    // 2025-12 nunca se le pidió a Switch: no sabemos nada de él, y decir
    // "sin cerrar" afirmaría algo que no medimos.
    const r = resumirMes("2025-12", [], COBERTURA);
    expect(r.estado).toBe("sin_datos");
  });

  it("los 4 estados son distinguibles y solo UNO autoriza a mostrar el monto", () => {
    const estados = ["2026-01", "2026-02", "2026-05", "2025-11"].map(
      (m) => resumirMes(m, lineasDe(m), COBERTURA).estado,
    );
    expect(estados).toEqual(["cerrado", "parcial", "sin_cerrar", "sin_datos"]);
    expect(estados.filter((e) => e === "cerrado")).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("esAsientoDeCierre — qué cuenta como mes cerrado", () => {
  it("reconoce los 4 asientos de cierre de enero", () => {
    for (const d of [
      "ASIENTO VENTA 2026-01",
      "ASIENTO STOCK 2026-01",
      "ASIENTO MOVIMIENTOS FONDOS 2026-01",
      "ASIENTO PROVEEDORES 2026-01",
    ]) {
      expect(esAsientoDeCierre({ descripcion: d, mes: "2026-01" }), d).toBe(true);
    }
  });

  it("un movimiento suelto del día a día NO es cierre", () => {
    for (const d of [
      "REGISTRA PRESTAMO - ROXANA HERNANDEZ",
      "REGISTRA PAGO DE PRESTAMO BIENVENIDO MORALES",
    ]) {
      expect(esAsientoDeCierre({ descripcion: d, mes: "2026-01" }), d).toBe(false);
    }
  });

  it("un asiento de cierre de OTRO mes no cierra este mes", () => {
    // Un ajuste de enero posteado en marzo no vuelve "cerrado" a marzo.
    expect(esAsientoDeCierre({ descripcion: "ASIENTO VENTA 2026-01", mes: "2026-03" })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("cuentas que NO son plata que salió del banco", () => {
  const enero = resumirMes("2026-01", lineasDe("2026-01"), COBERTURA);

  it("las 4 cuentas marcadas son las que decidió Daniel", () => {
    expect(Object.keys(CUENTAS_SIN_SALIDA_DE_CAJA).sort()).toEqual([
      "6.03.38",
      "6.03.39",
      "6.03.41",
      "6.03.42",
    ]);
  });

  it("en enero las dos que aparecen son justo las negativas, y van MARCADAS", () => {
    const marcadas = enero.cuentas.filter((c) => c.sinSalidaDeCaja);
    expect(marcadas.map((c) => c.corta).sort()).toEqual(["6.03.41", "6.03.42"]);
    for (const c of marcadas) expect(c.netoCent).toBeLessThan(0);
  });

  it("PERO SIGUEN CONTANDO en el total — se cuadra con la contadora", () => {
    expect(centAUsd(enero.totalSinSalidaDeCajaCent)).toBe(-197.08);
    // Sacarlas cambiaría el total, y el total tiene que ser el de la contadora.
    const sinEllas = enero.totalCent - enero.totalSinSalidaDeCajaCent;
    expect(centAUsd(sinEllas)).toBe(11882.74);
    expect(centAUsd(enero.totalCent)).toBe(11685.66);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("avisos de la pantalla", () => {
  const enero = resumirMes("2026-01", lineasDe("2026-01"), COBERTURA);

  it("🔴 enero de Vistana NO tiene un solo peso de salarios → avisa", () => {
    // La empresa vendió $92.833 ese mes y la cuenta 6.01 no aparece. O falta el
    // asiento de planilla, o los salarios se registran en otro lado. NO se
    // estima ni se inventa: se avisa y queda pendiente con la contadora.
    expect(enero.salarios.totalCent).toBe(0);
    const avisos = avisosDelMes("vistana", enero, null);
    expect(avisos.some((a) => a.tipo === "salarios")).toBe(true);
  });

  it("avisa que parte del gasto no salió del banco", () => {
    const avisos = avisosDelMes("vistana", enero, null);
    expect(avisos.some((a) => a.tipo === "sin_caja")).toBe(true);
  });

  it("el aviso del alquiler sale SOLO en Boston y Fashion Wear", () => {
    const conAlquiler = ["confecciones_boston", "fashion_wear"];
    for (const emp of conAlquiler) {
      const avisos = avisosDelMes(emp, enero, null);
      expect(avisos.some((a) => a.tipo === "alquiler"), emp).toBe(true);
    }
    for (const emp of ["vistana", "active_wear", "active_shoes", "american_classic"]) {
      const avisos = avisosDelMes(emp, enero, null);
      expect(avisos.some((a) => a.tipo === "alquiler"), emp).toBe(false);
    }
  });

  it("un mes incompleto lo dice", () => {
    const feb = resumirMes("2026-02", lineasDe("2026-02"), COBERTURA);
    const avisos = avisosDelMes("vistana", feb, enero);
    expect(avisos.some((a) => a.tipo === "incompleto")).toBe(true);
  });

  it("el ISR que aparece un mes y el anterior no, se avisa", () => {
    const conIsr = resumirMes(
      "2026-02",
      [
        {
          asiento: "05-022026",
          descripcion: "ASIENTO CIERRE 2026-02",
          fecha: "2026-02-28",
          mes: "2026-02",
          cuenta: "6.05.01.00.00",
          cuentaNombre: "IMPUESTO SOBRE LA RENTA",
          debitoCent: 500000,
          creditoCent: 0,
          netoCent: 500000,
          linea: 1,
        },
      ],
      COBERTURA,
    );
    expect(conIsr.estado).toBe("cerrado");
    expect(centAUsd(conIsr.totalIsrCent)).toBe(5000);
    // El ISR va DENTRO del total…
    expect(centAUsd(conIsr.totalCent)).toBe(5000);
    // …pero en su propia lista, no revuelto con los de operación.
    expect(conIsr.cuentas).toHaveLength(0);
    expect(conIsr.isr).toHaveLength(1);

    const avisos = avisosDelMes("vistana", conIsr, enero);
    expect(avisos.some((a) => a.tipo === "isr")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("salarios: el catálogo SÍ separa comisiones del salario fijo", () => {
  it("6.01.01 y 6.01.02 se cuentan por separado", () => {
    // En el fixture NO hay ninguna línea 6.01, así que esto se prueba con la
    // forma que tendría el dato. Cuando lleguen meses con planilla hay que
    // verificarlo contra el archivo real.
    const conPlanilla = resumirMes(
      "2026-03",
      [
        {
          asiento: "01-032026", descripcion: "ASIENTO PLANILLA 2026-03", fecha: "2026-03-31",
          mes: "2026-03", cuenta: "6.01.01.00.00", cuentaNombre: "SALARIOS",
          debitoCent: 800000, creditoCent: 0, netoCent: 800000, linea: 1,
        },
        {
          asiento: "01-032026", descripcion: "ASIENTO PLANILLA 2026-03", fecha: "2026-03-31",
          mes: "2026-03", cuenta: "6.01.02.00.00", cuentaNombre: "COMISIONES",
          debitoCent: 150000, creditoCent: 0, netoCent: 150000, linea: 2,
        },
        {
          asiento: "01-032026", descripcion: "ASIENTO PLANILLA 2026-03", fecha: "2026-03-31",
          mes: "2026-03", cuenta: "6.01.05.00.00", cuentaNombre: "CUOTA PATRONAL",
          debitoCent: 90000, creditoCent: 0, netoCent: 90000, linea: 3,
        },
      ],
      COBERTURA,
    );
    expect(centAUsd(conPlanilla.salarios.fijoCent)).toBe(8000);
    expect(centAUsd(conPlanilla.salarios.comisionesCent)).toBe(1500);
    expect(centAUsd(conPlanilla.salarios.otrosCent)).toBe(900);
    expect(centAUsd(conPlanilla.salarios.totalCent)).toBe(10400);
    // Con planilla cargada, el aviso de "faltan salarios" NO sale.
    expect(avisosDelMes("vistana", conPlanilla, null).some((a) => a.tipo === "salarios")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("solo el grupo 6 es gasto", () => {
  it("ni ventas, ni costos, ni inventario entran en el total", () => {
    const enero = resumirMes("2026-01", lineasDe("2026-01"), COBERTURA);
    for (const c of [...enero.cuentas, ...enero.isr]) {
      expect(c.cuenta.startsWith("6."), c.cuenta).toBe(true);
    }
    // El asiento de venta trae 4.01/4.02 (ventas) y 5.01 (costo de ventas):
    // están en el archivo y NO se cuelan en el gasto.
    const crudas = lineasDe("2026-01").map((l) => l.cuenta);
    expect(crudas.some((c) => c.startsWith("4."))).toBe(true);
    expect(crudas.some((c) => c.startsWith("5."))).toBe(true);
    expect(centAUsd(enero.totalCent)).toBe(11685.66);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("helpers", () => {
  it("montoACentavos sin pasar por float", () => {
    expect(montoACentavos("1695.86")).toBe(169586);
    expect(montoACentavos("0.00")).toBe(0);
    expect(montoACentavos("")).toBe(0);
    expect(montoACentavos("20")).toBe(2000);
    expect(montoACentavos("1,695.86")).toBe(169586); // miles con coma
    expect(montoACentavos("(69.30)")).toBe(-6930); // paréntesis contable
    expect(montoACentavos("-69.30")).toBe(-6930);
  });

  it("montoACentavos devuelve null en vez de inventar un 0", () => {
    // Un monto ilegible contado como 0 es un gasto perdido en silencio.
    expect(montoACentavos("abc")).toBeNull();
    expect(montoACentavos("1.2.3")).toBeNull();
  });

  it("el clásico 0.1+0.2 no arrastra error", () => {
    const a = montoACentavos("0.10")!;
    const b = montoACentavos("0.20")!;
    expect(centAUsd(a + b)).toBe(0.3);
  });

  it("fechaAIso rechaza fechas que no existen", () => {
    expect(fechaAIso("31-01-2026")).toBe("2026-01-31");
    expect(fechaAIso("02-02-2026")).toBe("2026-02-02");
    expect(fechaAIso("31-02-2026")).toBeNull();
    expect(fechaAIso("2026-01-31")).toBeNull();
  });

  it("normalizarTexto colapsa y recorta", () => {
    expect(normalizarTexto("  ASIENTO   VENTA  2026-01 ")).toBe("ASIENTO VENTA 2026-01");
  });

  it("ultimoDiaDelMes y mesCubierto", () => {
    expect(ultimoDiaDelMes("2026-02")).toBe("2026-02-28");
    expect(ultimoDiaDelMes("2024-02")).toBe("2024-02-29");
    expect(ultimoDiaDelMes("2026-12")).toBe("2026-12-31");
    expect(mesCubierto("2026-03", COBERTURA)).toBe(true);
    expect(mesCubierto("2025-12", COBERTURA)).toBe(false);
    // Un rango que corta el mes por la mitad NO lo cubre.
    expect(mesCubierto("2026-03", [{ desde: "2026-03-01", hasta: "2026-03-20" }])).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el parser no se traga basura en silencio", () => {
  it("un archivo que no es el mayor se rechaza con un motivo claro", () => {
    const r = parsearMayorCsv("hola;mundo\n1;2");
    expect(r.lineas).toEqual([]);
    expect(r.errores[0].motivo).toMatch(/no parece el archivo del mayor/i);
  });

  it("una fila con cuenta inválida se REPORTA, no se descarta callada", () => {
    const csv =
      "ASIENTO;DESCRIPCION;FECHA; NOMBRE  CUENTA ;CUENTA;DEBITO;CREDITO\n" +
      "A1; X ;01-01-2026; MALA ;6.03;10.00;0.00\n" +
      "A1; X ;01-01-2026; BUENA ;6.03.07.00.00;10.00;0.00\n";
    const r = parsearMayorCsv(csv);
    expect(r.lineas).toHaveLength(1);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0].motivo).toMatch(/cuenta inválido/i);
  });

  it("tolera BOM, CRLF y comillas", () => {
    const csv =
      "﻿ASIENTO;DESCRIPCION;FECHA; NOMBRE  CUENTA ;CUENTA;DEBITO;CREDITO\r\n" +
      'A1;"ASIENTO VENTA 2026-01";31-01-2026;"FLETES  Y  ACARREO";6.03.07.00.00;20.00;0.00\r\n';
    const r = parsearMayorCsv(csv);
    expect(r.errores).toEqual([]);
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0].cuentaNombre).toBe("FLETES Y ACARREO");
    expect(r.lineas[0].netoCent).toBe(2000);
  });
});
