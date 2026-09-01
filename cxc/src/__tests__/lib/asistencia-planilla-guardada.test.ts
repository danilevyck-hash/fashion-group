// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA PLANILLA CONGELADA — la REGLA (módulo puro) y lo que la migración
//    sostiene.
//
// La JUNTURA —que la ruta congele lo que la ruta calcula, que el solapamiento
// frene ANTES de escribir, que reabrir no borre— vive en
// `src/__tests__/api/planilla-guardada-route.test.ts`, que llama a los handlers
// REALES. Acá está lo que se puede probar sin base.
//
// 🩸 El bloque de la migración lee el SQL **SIN COMENTARIOS**: el archivo NOMBRA
// lo que prohíbe (dice «CASCADE», dice «solapamiento»), y un barrido sobre el
// texto entero se engañaría con su propia explicación. Este repo ya pagó eso
// cuatro veces.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  COLUMNAS_DINERO,
  COLUMNAS_HORAS,
  ESTADOS_GUARDADO,
  MIRAN_PERO_NO_CIERRAN,
  cerrarPlanillaRoles,
  esCerrada,
  estadoDelCuadro,
  filaDeLinea,
  frenosParaCerrar,
  motivoReaperturaValido,
  puedeCerrar,
  seSolapan,
  solapadasDe,
  textoFrenos,
  textoSolapamiento,
  totalesDe,
  validarGuardado,
  versionSiguiente,
  MIGRACION_PLANILLA_GUARDADA,
  type CabeceraGuardada,
} from "@/lib/asistencia/planilla-guardada";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import type { SugerenciaPrestamo } from "@/lib/asistencia/prestamos-planilla";

import { HORAS_CERO, type DineroLinea, type LineaPlanilla } from "@/lib/asistencia/planilla";
import { EMPRESAS_ASISTENCIA } from "@/lib/asistencia/config";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const DINERO: DineroLinea = {
  rataHora: 3.02, valorMinuto: 3.02 / 60, salarioQuincenal: 261.74,
  extraDiurno: 12.58, extraNocturno: 0, excedente: 0,
  domingos: 0, feriados: 0, ausencias: 24.16, ausenciaPorTardanza: 1.51,
  ausenciaDeDiaCompleto: 22.65, vacacionesYaPagadas: 0, tardanzas: 2.37,
  totalBruto: 250.16, baseSeguros: null, seguroSocial: 24.39, seguroEducativo: 3.13,
  isr: 0, prestamo: 50, terceros: 0, mercancia: 10,
  totalDeducciones: 87.52, otrosServicios: 0, netoPagar: 162.64,
};

function linea(over: Partial<LineaPlanilla> = {}): LineaPlanilla {
  return {
    codigo: "40", etiqueta: "KEVIN LUBO", nombre: "KEVIN LUBO",
    empresa: "confecciones_boston", empresaEtiqueta: "Confecciones Boston",
    salarioMensual: 523.47, jornadaSemanal: 48,
    horas: { ...HORAS_CERO, tardanzaMin: 15.75, ausenciaMin: 480, diasTrabajados: 11 },
    faltaConfigurar: [], fueraDePlanilla: false, pagaSeguros: true, baseSeguros: null,
    noMarcaReloj: false, parte: null, decidirAMano: null, quincenalReferencia: null,
    extraMedido: { minutos: 40, diurnoMin: 40, nocturnoMin: 0, monto: 12.58 },
    extraAprobada: true, dinero: DINERO, manuales: { isr: 0, prestamo: 50, terceros: 0, mercancia: 10, otrosServicios: 0 },
    ...over,
  };
}

function cabecera(over: Partial<CabeceraGuardada> = {}): CabeceraGuardada {
  return {
    id: "c1", empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15",
    quincena: "2026-08-1", etiqueta: "1 ago 2026 al 15 ago 2026", version: 1,
    estado: "cerrada", cerradaPor: "Angela",
    cerradaEn: "2026-08-16T10:00:00Z", reabiertaPor: null, reabiertaEn: null,
    motivoReabrir: null, personas: 12, totalBruto: 1000, totalDeducciones: 110,
    totalNeto: 890, factorBase: 1, ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 se congela TODO: las 24 cifras de dinero y las 20 del reloj", () => {
  it("los dos mapas tienen todos los campos y ninguna columna repetida", () => {
    const dinero = Object.values(COLUMNAS_DINERO);
    const horas = Object.values(COLUMNAS_HORAS);
    expect(dinero.length).toBe(24);
    expect(horas.length).toBe(20);
    expect(new Set(dinero).size).toBe(24);
    expect(new Set(horas).size).toBe(20);
    // Una columna de dinero con el nombre de una de horas se pisaría en la fila.
    expect(new Set([...dinero, ...horas]).size).toBe(44);
  });

  it("la fila escrita trae TODAS las columnas, con el valor de la línea", () => {
    const f = filaDeLinea("p1", "confecciones_boston", linea());
    for (const col of Object.values(COLUMNAS_DINERO)) expect(f).toHaveProperty(col);
    for (const col of Object.values(COLUMNAS_HORAS)) expect(f).toHaveProperty(col);
    expect(f.neto_pagar).toBe(162.64);
    expect(f.tardanzas).toBe(2.37);
    expect(f.tardanza_min).toBe(15.75);
    expect(f.ausencia_min).toBe(480);
    // 🔴 `valorMinuto` NO está redondeado: es por lo que se multiplican los
    // minutos de tardanza, y redondearlo cambiaría el número.
    expect(f.valor_minuto).toBeCloseTo(3.02 / 60, 10);
  });

  it("🔴 el NOMBRE se congela: renombrar a la persona no cambia lo que se pagó", () => {
    const f = filaDeLinea("p1", "confecciones_boston", linea({ nombre: "KEVIN LUBO" }));
    expect(f.nombre).toBe("KEVIN LUBO");
    expect(f.empleado_codigo).toBe("40");
  });

  it("🔴 sin pago, el bloque de dinero va en NULL — nunca en 0", () => {
    // Un 0 dice «se le pagó cero»; `null` dice «el sistema se abstuvo». Es la
    // diferencia entre servicio profesional / «decidilo vos» y una planilla real.
    const f = filaDeLinea("p1", "vistana", linea({
      dinero: null, fueraDePlanilla: true, decidirAMano: null,
    }));
    for (const col of Object.values(COLUMNAS_DINERO)) expect(f[col]).toBeNull();
    // Las HORAS sí se congelan igual: la persona marcó, y eso se midió.
    expect(f.tardanza_min).toBe(15.75);
    expect(f.grupo).toBe("fuera");
  });

  it("🔑 el POR QUÉ no tiene número viaja congelado (grupo, motivo, faltantes)", () => {
    const f = filaDeLinea("p1", "vistana", linea({
      dinero: null, faltaConfigurar: [], decidirAMano: "entró el 10 de agosto de 2026",
    }));
    expect(f.grupo).toBe("decidir");
    expect(f.decidir_a_mano).toBe("entró el 10 de agosto de 2026");

    const g = filaDeLinea("p1", "vistana", linea({ dinero: null, faltaConfigurar: ["falta el salario"] }));
    expect(g.grupo).toBe("falta");
    expect(g.falta_configurar).toEqual(["falta el salario"]);
  });

  it("el sueldo repartido guarda SU parte, y el salario de la ficha sigue entero", () => {
    const f = filaDeLinea("p1", "fashion_wear", linea({
      empresa: "fashion_wear", salarioMensual: 1000,
      parte: { empresa: "fashion_wear", salarioMensual: 200, pagaSeguros: false, llevaHorasExtra: true, llevaElReloj: false },
    }));
    expect(f.salario_mensual).toBe(1000);
    expect(f.parte_salario_mensual).toBe(200);
    expect(f.parte_paga_horas_extra).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el solapamiento — nadie pagado dos veces por el mismo día", () => {
  it("1-15 y 10-20 se pisan", () => {
    expect(seSolapan({ desde: "2026-08-01", hasta: "2026-08-15" }, { desde: "2026-08-10", hasta: "2026-08-20" })).toBe(true);
  });

  it("🔑 el BORDE: 1-15 y 15-20 comparten el día 15, así que SÍ se pisan", () => {
    expect(seSolapan({ desde: "2026-08-01", hasta: "2026-08-15" }, { desde: "2026-08-15", hasta: "2026-08-20" })).toBe(true);
  });

  it("1-15 y 16-31 son las dos quincenas: NO se pisan", () => {
    expect(seSolapan({ desde: "2026-08-01", hasta: "2026-08-15" }, { desde: "2026-08-16", hasta: "2026-08-31" })).toBe(false);
  });

  it("uno adentro del otro se pisa, en las dos direcciones", () => {
    const grande = { desde: "2026-08-01", hasta: "2026-08-31" };
    const chico = { desde: "2026-08-10", hasta: "2026-08-12" };
    expect(seSolapan(grande, chico)).toBe(true);
    expect(seSolapan(chico, grande)).toBe(true);
  });

  it("⚠️ OTRA EMPRESA con los mismos días NO estorba: son otra planilla", () => {
    const guardadas = [cabecera({ empresa: "vistana" })];
    expect(solapadasDe("fashion_wear", { desde: "2026-08-10", hasta: "2026-08-20" }, guardadas)).toEqual([]);
    expect(solapadasDe("vistana", { desde: "2026-08-10", hasta: "2026-08-20" }, guardadas).length).toBe(1);
  });

  it("🔴 una REABIERTA no estorba — eso es lo que reabrir sirve", () => {
    const guardadas = [cabecera({ estado: "reabierta", reabiertaPor: "daniel", reabiertaEn: "2026-08-20T10:00:00Z" })];
    expect(solapadasDe("vistana", { desde: "2026-08-01", hasta: "2026-08-15" }, guardadas)).toEqual([]);
  });

  it("una a medio escribir (`cerrando`) tampoco cuenta como pagada", () => {
    const guardadas = [cabecera({ estado: "cerrando" })];
    expect(solapadasDe("vistana", { desde: "2026-08-01", hasta: "2026-08-15" }, guardadas)).toEqual([]);
    expect(esCerrada("cerrando")).toBe(false);
    // ⚠️ NO hay un estado «pagada», y tampoco una fila para el borrador.
    expect(ESTADOS_GUARDADO).toEqual(["cerrando", "cerrada", "reabierta"]);
    expect(ESTADOS_GUARDADO).not.toContain("pagada");
    expect(ESTADOS_GUARDADO).not.toContain("borrador");
  });

  it("🔴 el aviso NOMBRA la quincena que choca, no dice «rango inválido»", () => {
    const t = textoSolapamiento([cabecera({ etiqueta: "28 oct 2026 al 10 nov 2026" })]);
    expect(t).toContain("28 oct 2026 al 10 nov 2026");
  });

  it("el aviso dice las FECHAS y QUIÉN la guardó — no «hay un conflicto»", () => {
    const t = textoSolapamiento([cabecera()]);
    expect(t).toContain("1 ago 2026");
    expect(t).toContain("15 ago 2026");
    expect(t).toContain("Angela");
    expect(t).toContain("dos veces");
  });

  it("BORRADOR = un período sin cierre; CERRADA = con uno", () => {
    const rango = { desde: "2026-08-01", hasta: "2026-08-15" };
    expect(estadoDelCuadro("vistana", rango, [])).toBe("borrador");
    expect(estadoDelCuadro("vistana", rango, [cabecera()])).toBe("cerrada");
    // Reabierta → vuelve a ser un borrador. Es el flujo que aprobó Daniel.
    expect(estadoDelCuadro("vistana", rango, [cabecera({ estado: "reabierta" })])).toBe("borrador");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 versiones, no ediciones", () => {
  const rango = { desde: "2026-08-01", hasta: "2026-08-15" };

  it("el primer cierre es la v1", () => {
    expect(versionSiguiente("vistana", rango, [])).toBe(1);
  });

  it("🔴 después de reabrir, el que viene es la v2 — la v1 no se toca", () => {
    expect(versionSiguiente("vistana", rango, [cabecera({ estado: "reabierta", version: 1 })])).toBe(2);
    expect(versionSiguiente("vistana", rango, [
      cabecera({ id: "a", estado: "reabierta", version: 1 }),
      cabecera({ id: "b", estado: "reabierta", version: 2 }),
    ])).toBe(3);
  });

  it("la versión es por PERÍODO: otro rango u otra empresa arranca en 1", () => {
    const otras = [cabecera({ version: 4 })];
    expect(versionSiguiente("vistana", { desde: "2026-08-16", hasta: "2026-08-31" }, otras)).toBe(1);
    expect(versionSiguiente("fashion_wear", rango, otras)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 quién puede cerrar", () => {
  it("contabilidad y admin SÍ; la secretaria NO", () => {
    // Si este arreglo cambia, alguien agregó un rol a Asistencia y hay que
    // DECIDIR si además firma pagos. Que no pase en silencio es el punto.
    expect(cerrarPlanillaRoles()).toEqual(["admin", "contabilidad"]);
    expect(puedeCerrar("admin")).toBe(true);
    expect(puedeCerrar("contabilidad")).toBe(true);
    expect(puedeCerrar("secretaria")).toBe(false);
    expect(puedeCerrar("bodega")).toBe(false);
    expect(puedeCerrar("gerente_boston")).toBe(false);
  });

  it("⚠️ se DERIVA de `ASISTENCIA_ROLES`, no es una cuarta lista suelta", () => {
    const asistencia = asistenciaRoles();
    for (const r of cerrarPlanillaRoles()) expect(asistencia).toContain(r);
    expect(cerrarPlanillaRoles().length).toBe(asistencia.length - MIRAN_PERO_NO_CIERRAN.length);
    // La secretaria sigue entrando a Asistencia: mira, no firma.
    expect(asistencia).toContain("secretaria");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 los frenos del cierre — sin aprobar NO se cierra", () => {
  const conExtra = linea({
    extraAprobada: false,
    extraMedido: { minutos: 40, diurnoMin: 40, nocturnoMin: 0, monto: 12.58 },
  });
  const prestamo = (over: Partial<SugerenciaPrestamo> = {}): SugerenciaPrestamo => ({
    codigo: "9", etiqueta: "LUIS ARROYO", empresa: "vistana", empresaEtiqueta: "Vistana",
    nombrePrestamos: "LUIS ADRIAN ARROYO", cuota: 50, saldo: 700, sugerido: 50,
    origen: "cuota", aprobado: false, por: null, cuando: null, montoVisto: null,
    enCasilla: 0, ...over,
  } as SugerenciaPrestamo);

  it("sin nada pendiente, no hay frenos", () => {
    expect(frenosParaCerrar([linea()], [])).toEqual([]);
  });

  it("🔴 horas extra sin aprobar frenan, con el nombre y a qué pestaña ir", () => {
    const f = frenosParaCerrar([conExtra], []);
    expect(f.length).toBe(1);
    expect(f[0].tipo).toBe("horas-extra");
    expect(f[0].personas).toBe(1);
    expect(f[0].quienes).toEqual(["KEVIN LUBO"]);
    expect(f[0].texto).toContain("KEVIN LUBO");
    expect(f[0].texto).toContain("Aprobaciones");
  });

  it("🔴 un préstamo sin aprobar frena, con el monto", () => {
    const f = frenosParaCerrar([linea()], [prestamo()]);
    expect(f.length).toBe(1);
    expect(f[0].tipo).toBe("prestamo");
    expect(f[0].texto).toContain("LUIS ARROYO");
    expect(f[0].texto).toContain("$50.00");
  });

  it("⚠️ un préstamo YA escrito en la casilla no frena: la planilla SÍ lo descontó", () => {
    expect(frenosParaCerrar([linea()], [prestamo({ enCasilla: 50 })])).toEqual([]);
  });

  it("una extra APROBADA no frena, y una de 0 minutos tampoco", () => {
    expect(frenosParaCerrar([linea({ extraAprobada: true })], [])).toEqual([]);
    expect(frenosParaCerrar([linea({ extraAprobada: false, extraMedido: null })], [])).toEqual([]);
  });

  it("los dos frenos a la vez salen los dos, en un solo mensaje", () => {
    const f = frenosParaCerrar([conExtra], [prestamo()]);
    expect(f.length).toBe(2);
    const t = textoFrenos(f);
    expect(t).toContain("No se puede cerrar");
    expect(t).toContain("Aprobaciones");
    expect(t).toContain("LUIS ARROYO");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el motivo de la reapertura es obligatorio", () => {
  it("vacío, espacios o no-texto no valen", () => {
    expect(motivoReaperturaValido("")).toBeNull();
    expect(motivoReaperturaValido("   ")).toBeNull();
    expect(motivoReaperturaValido(null)).toBeNull();
    expect(motivoReaperturaValido(undefined)).toBeNull();
    expect(motivoReaperturaValido(42)).toBeNull();
  });

  it("un motivo de verdad vale, y viaja sin espacios de más", () => {
    expect(motivoReaperturaValido("  faltó una corrección  ")).toBe("faltó una corrección");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el testigo de la cabecera", () => {
  it("suma solo lo que produjo dinero, y cuenta a TODAS las personas", () => {
    const t = totalesDe([linea(), linea({ codigo: "41", dinero: null, fueraDePlanilla: true })]);
    expect(t.personas).toBe(2);
    expect(t.totalNeto).toBe(162.64);
    expect(t.totalBruto).toBe(250.16);
    expect(t.totalDeducciones).toBe(87.52);
  });

  it("dos líneas suman al centavo, sin arrastre de coma flotante", () => {
    const t = totalesDe([linea(), linea({ codigo: "41" })]);
    expect(t.totalNeto).toBe(325.28);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("lo que llega se valida acá, no en el llamador", () => {
  it("las tres empresas del reloj pasan", () => {
    for (const e of EMPRESAS_ASISTENCIA) {
      expect(validarGuardado(e, "2026-08-01", "2026-08-15").ok).toBe(true);
    }
  });

  it("🔴 sin empresa NO se guarda: el cuadro sería de las tres a la vez", () => {
    expect(validarGuardado("", "2026-08-01", "2026-08-15").ok).toBe(false);
    expect(validarGuardado(null, "2026-08-01", "2026-08-15").ok).toBe(false);
    expect(validarGuardado("american_classic", "2026-08-01", "2026-08-15").ok).toBe(false);
  });

  it("una fecha que no existe se rechaza", () => {
    expect(validarGuardado("vistana", "2026-02-31", "2026-03-05").ok).toBe(false);
    expect(validarGuardado("vistana", "ayer", "2026-03-05").ok).toBe(false);
  });

  it("al revés se rechaza", () => {
    expect(validarGuardado("vistana", "2026-08-15", "2026-08-01").ok).toBe(false);
  });

  it("un rango de diez años se rechaza (tope de 366 días)", () => {
    expect(validarGuardado("vistana", "2016-01-01", "2026-01-01").ok).toBe(false);
    expect(validarGuardado("vistana", "2026-01-01", "2026-12-31").ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 la migración sostiene lo que el código promete", () => {
  const SQL_CRUDO = readFileSync(
    path.join(process.cwd(), "supabase/migrations", MIGRACION_PLANILLA_GUARDADA),
    "utf-8",
  );
  // 🩸 SIN COMENTARIOS: el archivo NOMBRA lo que prohíbe.
  const SQL = SQL_CRUDO.replace(/^\s*--.*$/gm, "");

  it("el barrido no se quedó sin archivo", () => {
    expect(SQL.length).toBeGreaterThan(500);
  });

  it("es ADITIVA e IDEMPOTENTE: nada se dropea, nada se borra", () => {
    expect(SQL).toContain("CREATE TABLE IF NOT EXISTS asistencia_planilla_guardada");
    expect(SQL).toContain("CREATE TABLE IF NOT EXISTS asistencia_planilla_guardada_linea");
    expect(SQL).not.toMatch(/DROP\s+TABLE|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE\s+\w+\s+DROP/i);
  });

  it("RLS encendido en las DOS tablas", () => {
    expect(SQL).toContain("ALTER TABLE asistencia_planilla_guardada ENABLE ROW LEVEL SECURITY");
    expect(SQL).toContain("ALTER TABLE asistencia_planilla_guardada_linea ENABLE ROW LEVEL SECURITY");
  });

  it("🔴 el EXCLUDE del solapamiento: por empresa, por rango, y solo lo `guardada`", () => {
    expect(SQL).toMatch(/EXCLUDE\s+USING\s+gist/i);
    expect(SQL).toMatch(/empresa\s+WITH\s+=/i);
    expect(SQL).toMatch(/daterange\(desde,\s*hasta,\s*'\[\]'\)\s+WITH\s+&&/i);
    expect(SQL).toMatch(/WHERE\s*\(\s*estado\s*=\s*'cerrada'\s*\)/i);
  });

  it("🔴 los renglones cuelgan con RESTRICT, nunca con CASCADE", () => {
    expect(SQL).toContain("ON DELETE RESTRICT");
    expect(SQL).not.toMatch(/ON\s+DELETE\s+CASCADE/i);
  });

  it("una persona no puede salir dos veces en el mismo cuadro", () => {
    expect(SQL).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*\(planilla_id,\s*empleado_codigo\)/i);
  });

  it("🔴 TODA columna de los dos mapas existe en el SQL", () => {
    // Es lo que amarra el TypeScript con la base: una columna en el mapa que la
    // tabla no tenga haría fallar el INSERT entero el día de guardar.
    for (const col of [...Object.values(COLUMNAS_DINERO), ...Object.values(COLUMNAS_HORAS)]) {
      expect(SQL, `falta la columna ${col}`).toMatch(new RegExp(`^\\s*${col}\\s+numeric`, "m"));
    }
  });

  it("la firma es obligatoria y no puede ser espacios", () => {
    expect(SQL).toMatch(/cerrada_por\s+text\s+NOT\s+NULL\s+CHECK\s*\(btrim\(cerrada_por\)\s*<>\s*''\)/i);
  });

  it("🔴 una reabierta sin QUIÉN y sin MOTIVO no se puede escribir", () => {
    expect(SQL).toMatch(/estado\s*<>\s*'reabierta'\s*OR\s*\(reabierta_por IS NOT NULL/i);
    expect(SQL).toMatch(/motivo_reabrir IS NOT NULL AND btrim\(motivo_reabrir\)\s*<>\s*''/i);
  });

  it("dos filas del mismo período no pueden ser la misma versión", () => {
    expect(SQL).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*\(empresa,\s*desde,\s*hasta,\s*version\)/i);
  });

  it("el CHECK de empresas es EXACTAMENTE `EMPRESAS_ASISTENCIA`", () => {
    for (const e of EMPRESAS_ASISTENCIA) expect(SQL).toContain(`'${e}'`);
    expect(SQL).not.toContain("'american_classic'");
  });

  it("los tres estados de la máquina están en el CHECK", () => {
    for (const e of ESTADOS_GUARDADO) expect(SQL).toContain(`'${e}'`);
  });
});
