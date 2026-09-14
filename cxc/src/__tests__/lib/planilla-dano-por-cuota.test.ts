/* ─────────────────────────────────────────────────────────────────────────────
 * EL DAÑO DE MERCANCÍA ENTRA A LA PLANILLA POR CUOTA — el candado (14-sep-2026).
 *
 * Daniel, textual: *«Si está en cuota, que se haga automático»*, *«Si alguien
 * tiene uno grande, igual debería ir por cuota, ¿no?»* y, cerrando: *«Tanto el
 * chico como el grande que sea por cuota, ¿no? Agregan el daño como se hace un
 * préstamo, se elige la cuota y listo»*.
 *
 * 🩸 Del 10 al 14-sep-2026 el daño NO proponía cuota: la casilla «Mercancía»
 * se escribía a mano cada quincena (la contadora: *«debe permanecer en blanco y
 * que nos permita colocar quincenalmente la cantidad a descontar»*). Medido el
 * 14-sep contra producción: 24 cargos de daño en la historia, 9 personas,
 * $1.896,02, mediana $19,62 — y uno de $1.261,50, el que justifica la cuota.
 * Hoy debe UNA persona (STEPHANY MORALES, $254,50) y **0 de 31 fichas tienen
 * cuota de daño cargada**: al encender esto NADIE cambia de neto. Ése es el
 * control principal (bloque B).
 *
 * 🔴 LO QUE SE PROTEGE:
 *
 *   A. Con cuota cargada, el daño entra SOLO a `dinero.mercancia`, capeado a SU
 *      saldo (`min(cuota, saldo)`), y mueve deducciones y neto por la misma
 *      cuenta que préstamo y terceros. El hecho consumado le gana a la cuota.
 *   B. CONTROL: con la casilla vacía y SIN cuota (hoy, las 31 fichas) no cambia
 *      NADA: misma referencia, mismo neto, la casilla sigue a mano.
 *   C. Un 0 explícito en «Mercancía» no descuenta, y se DICE (celda y «Antes de
 *      cerrar»). Lo escrito a mano manda.
 *   D. Sin `dinero` (servicio profesional, «Tú decides») no se toca nada.
 *   E. La casilla tiene los tres estados de punta a punta: `valorTecleado`,
 *      `normalizarManuales`, la lectura del servidor y la migración.
 *   F. Se registra COMO UN PRÉSTAMO: el formulario pregunta la cuota en «Daño de
 *      mercancía» y la escribe en la ficha por la MISMA segunda llamada.
 *   G. ⚠️ El cierre NO se tocó (decisión pendiente de Daniel): ya lee
 *      `dinero.mercancia` y anota «Pago de responsabilidad» sobre lo que haya.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  CASILLAS_AUTOMATICAS,
  esCasillaAutomatica,
  estadoCasilla,
  prestamosSinDescontar,
  textoSinDescontar,
  valorTecleado,
} from "@/lib/asistencia/casilla-sin-descontar";
import {
  MANUALES_CERO,
  calcularDinero,
  normalizarManuales,
  type DineroLinea,
  type LineaPlanilla,
  type ManualesLinea,
} from "@/lib/asistencia/planilla";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  aplicarPrestamoEnLinea,
  avisosDeUltimaCuota,
  montoDanoDeFicha,
  montoDeFicha,
  sugerirPrestamos,
  textoAvisoPrestamo,
  type FichaPrestamo,
  type PersonaEnCuadro,
} from "@/lib/asistencia/prestamos-planilla";
import { calcularSaldoPrestamo } from "@/lib/prestamos-saldo";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const sinComentarios = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const MIGRACION = "supabase/migrations/20261122120000_planilla_manual_mercancia_nullable.sql";

// ── Andamiaje ────────────────────────────────────────────────────────────────
const DINERO = (o: Partial<DineroLinea> = {}): DineroLinea => ({
  rataHora: 3, valorMinuto: 0.05, salarioQuincenal: 260,
  extraDiurno: 0, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0,
  ausencias: 0, ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0, vacacionesYaPagadas: 0,
  tardanzas: 0, salidaTemprana: 0, totalBruto: 260, baseSeguros: null,
  seguroSocial: 0, seguroEducativo: 0, isr: 0, prestamo: 0, terceros: 0, mercancia: 0,
  totalDeducciones: 0, otrosServicios: 0, netoPagar: 260, ...o,
});
const MANUAL = (o: Partial<ManualesLinea> = {}): ManualesLinea => ({ ...MANUALES_CERO, ...o });

/** Una ficha de Préstamos. Por defecto SIN cuota de daño: como las 31 de hoy. */
function ficha(p: Partial<FichaPrestamo> & { nombre: string; codigo: string }): FichaPrestamo {
  const saldoP = p.saldoPrestamo ?? 0;
  const saldoD = p.saldoDano ?? 0;
  const saldoT = p.saldoTerceros ?? 0;
  return {
    id: p.id ?? p.nombre,
    codigo: p.codigo,
    nombre: p.nombre,
    cuota: p.cuota ?? 0,
    cuotaDano: p.cuotaDano ?? 0,
    cuotaTerceros: p.cuotaTerceros ?? 0,
    saldo: p.saldo ?? saldoP + saldoD + saldoT,
    saldoPrestamo: saldoP,
    saldoDano: saldoD,
    saldoTerceros: saldoT,
    yaDescontado: p.yaDescontado ?? 0,
    yaDescontadoTerceros: p.yaDescontadoTerceros ?? 0,
    yaDescontadoDano: p.yaDescontadoDano ?? 0,
  };
}
function persona(codigo: string, etiqueta: string, enCasillaDano = 0): PersonaEnCuadro {
  return { codigo, etiqueta, empresa: "vistana", empresaEtiqueta: "Vistana", enCasilla: 0, enCasillaTerceros: 0, enCasillaDano };
}
const linea = (manuales: ManualesLinea, etiqueta = "STEPHANY MORALES", codigo = "30") =>
  ({ codigo, etiqueta, nombre: etiqueta, horas: {}, manuales, dinero: DINERO() }) as unknown as LineaPlanilla;

/** STEPHANY MORALES: la única que hoy debe daño ($254,50), medida el 14-sep-2026. */
const STEPHANY = { nombre: "STEPHANY MORALES", codigo: "30", saldoDano: 254.5 };

// ─────────────────────────────────────────────────────────────────────────────
describe("A. con cuota cargada, el daño entra solo, capeado a SU saldo", () => {
  it("`montoDanoDeFicha`: min(cuota, saldo), y sin saldo o sin cuota no propone nada", () => {
    expect(montoDanoDeFicha(ficha({ ...STEPHANY, cuotaDano: 25 })).monto).toBe(25);
    // 🔴 La ÚLTIMA cuota se capea al saldo: nunca se descuenta más de lo que debe.
    expect(montoDanoDeFicha(ficha({ ...STEPHANY, cuotaDano: 300 }))).toEqual({ monto: 254.5, origen: "cuota" });
    expect(montoDanoDeFicha(ficha({ ...STEPHANY, cuotaDano: 0 })).monto).toBe(0);
    expect(montoDanoDeFicha(ficha({ nombre: "SIN DAÑO", codigo: "1", cuotaDano: 25, saldoDano: 0 })).monto).toBe(0);
    // Un saldo a favor (negativo) tampoco propone.
    expect(montoDanoDeFicha(ficha({ nombre: "A FAVOR", codigo: "2", cuotaDano: 25, saldoDano: -10 })).monto).toBe(0);
  });

  it("🔴 el hecho consumado le gana a la cuota — el caso KEVIN LUBO, sobre la cuenta daño", () => {
    // Cerrada la quincena, el cierre anotó «Pago de responsabilidad» por $25 y el
    // saldo ya bajó: regenerar tiene que decir $25, no la cuota de la SIGUIENTE.
    const f = ficha({ ...STEPHANY, cuotaDano: 25, saldoDano: 0, yaDescontadoDano: 25 });
    expect(montoDanoDeFicha(f)).toEqual({ monto: 25, origen: "descontado" });
    expect(Math.min(f.cuotaDano, f.saldoDano)).toBe(0); // lo que daría la fórmula ingenua
  });

  it("🔴 la casilla «Préstamo» sigue SIN mirar la cuota de daño: cada cuenta en su casilla", () => {
    const f = ficha({ ...STEPHANY, cuota: 30, saldoPrestamo: 220, cuotaDano: 25 });
    expect(montoDeFicha(f).monto).toBe(30);
    const [sug] = sugerirPrestamos({ fichas: [f], personas: [persona("30", "STEPHANY MORALES")] });
    expect(sug.sugerido).toBe(30);
    expect(sug.sugeridoDano).toBe(25);
    expect(sug.sugeridoTerceros).toBe(0);
    expect(sug.cuotaDano).toBe(25);
    expect(sug.saldoDano).toBe(254.5);
  });

  it("alguien que SOLO debe daño (con cuota) entra a la lista de sugerencias", () => {
    const out = sugerirPrestamos({
      fichas: [ficha({ ...STEPHANY, cuotaDano: 25 })],
      personas: [persona("30", "STEPHANY MORALES")],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ codigo: "30", sugerido: 0, sugeridoTerceros: 0, sugeridoDano: 25, enCasillaDano: 0 });
  });

  it("🔴 entra a `dinero.mercancia`, al total de deducciones y al neto — y NUNCA a `manuales`", () => {
    const [sug] = sugerirPrestamos({ fichas: [ficha({ ...STEPHANY, cuotaDano: 25 })], personas: [persona("30", "STEPHANY MORALES")] });
    const l = linea(MANUAL());
    const con = aplicarPrestamoEnLinea(l, sug);
    expect(con.dinero!.mercancia).toBe(25);
    expect(con.dinero!.totalDeducciones).toBe(25);
    expect(con.dinero!.netoPagar).toBe(235);
    expect(con.dinero!.prestamo).toBe(0);
    expect(con.dinero!.terceros).toBe(0);
    expect(con.prestamoAutomatico).toEqual({ prestamo: 0, terceros: 0, mercancia: 25 });
    // `manuales` es la foto de la tabla: sigue vacía.
    expect(con.manuales.mercancia).toBeNull();
    // Y la línea original no se muta.
    expect(l.dinero!.mercancia).toBe(0);
    expect(l.dinero!.netoPagar).toBe(260);
  });

  it("las tres cuotas juntas mueven el neto por la MISMA cuenta", () => {
    const f = ficha({ ...STEPHANY, cuota: 30, saldoPrestamo: 220, cuotaTerceros: 40, saldoTerceros: 100, cuotaDano: 25 });
    const [sug] = sugerirPrestamos({ fichas: [f], personas: [persona("30", "STEPHANY MORALES")] });
    const con = aplicarPrestamoEnLinea(linea(MANUAL()), sug);
    expect(con.dinero!.prestamo).toBe(30);
    expect(con.dinero!.terceros).toBe(40);
    expect(con.dinero!.mercancia).toBe(25);
    expect(con.dinero!.totalDeducciones).toBe(95);
    expect(con.dinero!.netoPagar).toBe(165);
  });

  it("lo escrito a mano MANDA: con $10 en la casilla no entra la cuota de $25", () => {
    const [sug] = sugerirPrestamos({ fichas: [ficha({ ...STEPHANY, cuotaDano: 25 })], personas: [persona("30", "STEPHANY MORALES", 10)] });
    const l = linea(MANUAL({ mercancia: 10 }));
    const con = aplicarPrestamoEnLinea(l, sug);
    expect(con).toBe(l); // misma referencia: nada que meter
  });

  it("se avisa la ÚLTIMA cuota del daño: cuota $300 sobre saldo $254,50 → se descuenta $254,50, y se dice", () => {
    const out = sugerirPrestamos({ fichas: [ficha({ ...STEPHANY, cuotaDano: 300 })], personas: [persona("30", "STEPHANY MORALES")] });
    expect(out[0].sugeridoDano).toBe(254.5);
    const avisos = avisosDeUltimaCuota(out);
    expect(avisos).toEqual([{ tipo: "ultima-cuota", codigo: "30", etiqueta: "STEPHANY MORALES", cuenta: "dano", cuota: 300, saldo: 254.5 }]);
    const texto = textoAvisoPrestamo(avisos)!;
    expect(texto).toContain("$254.50");
    expect(texto).toContain("del daño de mercancía");
    expect(texto).toContain("termina de pagar");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B. CONTROL: con la casilla vacía y sin cuota (hoy, las 31 fichas) NADA cambia", () => {
  it("🔴 sin cuota de daño, aunque deba, no propone y la línea vuelve con la MISMA referencia", () => {
    // STEPHANY debe $254,50 de daño y tiene la cuota en 0: como las 31 fichas de hoy.
    const out = sugerirPrestamos({ fichas: [ficha(STEPHANY)], personas: [persona("30", "STEPHANY MORALES")] });
    expect(out).toHaveLength(0);
    const l = linea(MANUAL());
    expect(aplicarPrestamoEnLinea(l, undefined)).toBe(l);
    expect(l.dinero!.netoPagar).toBe(260);
  });

  it("🔴 el motor da el MISMO neto con la casilla en null que con el 0 de antes de la migración", () => {
    const conNull = calcularDinero(600, 40, { extra125: 0 } as never, MANUAL({ mercancia: null }), REGLAS_DEFAULT)!;
    const conCero = calcularDinero(600, 40, { extra125: 0 } as never, MANUAL({ mercancia: 0 }), REGLAS_DEFAULT)!;
    expect(conNull.mercancia).toBe(0);
    expect(conCero.mercancia).toBe(0);
    expect(conNull.netoPagar).toBe(conCero.netoPagar);
    expect(conNull.totalDeducciones).toBe(conCero.totalDeducciones);
    // Y con un monto escrito a mano, se resta como siempre.
    const conMonto = calcularDinero(600, 40, { extra125: 0 } as never, MANUAL({ mercancia: 16 }), REGLAS_DEFAULT)!;
    expect(conMonto.mercancia).toBe(16);
    expect(conMonto.netoPagar).toBe(Math.round((conNull.netoPagar - 16) * 100) / 100);
  });

  it("con cuota de préstamo y SIN cuota de daño, la línea es exactamente la de ayer", () => {
    const f = ficha({ ...STEPHANY, cuota: 30, saldoPrestamo: 220 });
    const [sug] = sugerirPrestamos({ fichas: [f], personas: [persona("30", "STEPHANY MORALES")] });
    const con = aplicarPrestamoEnLinea(linea(MANUAL()), sug);
    expect(con.dinero!.prestamo).toBe(30);
    expect(con.dinero!.mercancia).toBe(0);
    expect(con.dinero!.netoPagar).toBe(230);
    expect(con.prestamoAutomatico).toEqual({ prestamo: 30, terceros: 0, mercancia: 0 });
  });

  it("el saldo del daño sale de `calcularSaldoPrestamo`, la única cuenta — no de una segunda", () => {
    const s = calcularSaldoPrestamo([
      { concepto: "Responsabilidad por daño", monto: 1261.5, estado: "aprobado", fecha: "2026-06-01" },
      { concepto: "Pago de responsabilidad", monto: 1007, estado: "aprobado", fecha: "2026-08-15" },
    ]);
    expect(s.cuentas.dano.saldo).toBeCloseTo(254.5, 2);
    expect(montoDanoDeFicha(ficha({ ...STEPHANY, saldoDano: s.cuentas.dano.saldo, cuotaDano: 25 })).monto).toBe(25);
    // Y este módulo no vuelve a sumar movimientos: el servidor pasa `s.cuentas.dano.saldo`.
    const srv = sinComentarios("src/lib/asistencia/prestamos-planilla-server.ts");
    expect(srv).toMatch(/saldoDano: s\.cuentas\.dano\.saldo/);
    expect(srv).toMatch(/cuotaDano: num\(e\.deduccion_dano\)/);
    expect(srv).toMatch(/yaDescontadoDano: descontadoDanoDe\.get/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("C. un 0 explícito en «Mercancía» no descuenta, y se dice", () => {
  it("«Mercancía» es la tercera casilla automática, con los tres estados", () => {
    expect([...CASILLAS_AUTOMATICAS]).toEqual(["prestamo", "terceros", "mercancia"]);
    expect(esCasillaAutomatica("mercancia")).toBe(true);
    expect(estadoCasilla(null)).toBe("vacia");
    expect(estadoCasilla(0)).toBe("sin-descontar");
    expect(estadoCasilla(16)).toBe("escrita");
  });

  it("🔴 casilla en 0: NO entra la cuota, el neto no baja, y `sinDescontar.mercancia` dice los $25 que se saltaron", () => {
    const [sug] = sugerirPrestamos({ fichas: [ficha({ ...STEPHANY, cuotaDano: 25 })], personas: [persona("30", "STEPHANY MORALES", 0)] });
    const con = aplicarPrestamoEnLinea(linea(MANUAL({ mercancia: 0 })), sug);
    expect(con.dinero!.mercancia).toBe(0);
    expect(con.dinero!.netoPagar).toBe(260);
    expect(con.prestamoAutomatico).toEqual({
      prestamo: 0, terceros: 0, mercancia: 0,
      sinDescontar: { prestamo: 0, terceros: 0, mercancia: 25 },
    });
    expect(con.manuales.mercancia).toBe(0);
  });

  it("un 0 en mercancía no toca el préstamo, y viceversa", () => {
    const f = ficha({ ...STEPHANY, cuota: 30, saldoPrestamo: 220, cuotaDano: 25 });
    const [sug] = sugerirPrestamos({ fichas: [f], personas: [persona("30", "STEPHANY MORALES", 0)] });
    const con = aplicarPrestamoEnLinea(linea(MANUAL({ mercancia: 0 })), sug);
    expect(con.dinero!.prestamo).toBe(30);
    expect(con.dinero!.mercancia).toBe(0);
    expect(con.dinero!.netoPagar).toBe(230);
    expect(con.prestamoAutomatico!.sinDescontar).toEqual({ prestamo: 0, terceros: 0, mercancia: 25 });
  });

  it("un 0 sobre alguien SIN cuota de daño que saltar no anota nada: es la misma línea (como hoy)", () => {
    const l = linea(MANUAL({ mercancia: 0 }));
    expect(aplicarPrestamoEnLinea(l, undefined)).toBe(l);
    const [sug] = sugerirPrestamos({ fichas: [ficha({ ...STEPHANY, cuota: 30, saldoPrestamo: 220 })], personas: [persona("30", "STEPHANY MORALES", 0)] });
    expect(aplicarPrestamoEnLinea(l, sug).prestamoAutomatico!.sinDescontar).toBeUndefined();
  });

  it("«Antes de cerrar» lo lista con la cuenta, y el texto dice «(daño de mercancía)»", () => {
    const [sug] = sugerirPrestamos({ fichas: [ficha({ ...STEPHANY, cuotaDano: 25 })], personas: [persona("30", "STEPHANY MORALES", 0)] });
    const con = aplicarPrestamoEnLinea(linea(MANUAL({ mercancia: 0 })), sug);
    const items = prestamosSinDescontar([con as LineaPlanilla]);
    expect(items).toEqual([{ codigo: "30", etiqueta: "STEPHANY MORALES", cuenta: "mercancia", monto: 25 }]);
    expect(textoSinDescontar(items)).toBe("préstamo sin descontar esta quincena, a propósito (STEPHANY MORALES (daño de mercancía) · $25.00)");
  });

  it("la celda de la pantalla reconoce la mercancía por `esCasillaAutomatica`, sin un camino aparte", () => {
    const pantalla = sinComentarios("src/app/asistencia/PlanillaTab.tsx");
    // Las tres funciones de la celda preguntan por `esCasillaAutomatica(campo)` y
    // leen `prestamoAutomatico[campo]`: ningún `if (campo === "mercancia")`.
    expect(pantalla).toMatch(/if \(esCasillaAutomatica\(campo\)\) \{/);
    expect(pantalla).toMatch(/l\.prestamoAutomatico\?\.\[campo\]/);
    expect(pantalla).toMatch(/l\.prestamoAutomatico\?\.sinDescontar\?\.\[campo\]/);
    expect(pantalla).not.toMatch(/campo === "mercancia"/);
    // Y las cuatro casillas que restan pasan por la MISMA `CeldaManual` con `sinDescontar`.
    expect((pantalla.match(/sinDescontar=\{esSinDescontar\(l, campo\)\}/g) ?? []).length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D. sin `dinero` (servicio profesional, «Tú decides») no se toca nada", () => {
  it("la línea vuelve tal cual, con o sin sugerencia", () => {
    const [sug] = sugerirPrestamos({ fichas: [ficha({ ...STEPHANY, cuotaDano: 25 })], personas: [persona("30", "STEPHANY MORALES")] });
    const l = { codigo: "30", manuales: MANUAL(), dinero: null };
    expect(aplicarPrestamoEnLinea(l, sug)).toBe(l);
    expect(aplicarPrestamoEnLinea(l, undefined)).toBe(l);
    expect(aplicarPrestamoEnLinea({ ...l, manuales: MANUAL({ mercancia: 0 }) }, sug).prestamoAutomatico).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("E. los tres estados, de punta a punta", () => {
  it("`valorTecleado` y `normalizarManuales` en mercancía: vacío → null · «0» → 0 · «16» → 16 · basura → null", () => {
    expect(valorTecleado("mercancia", "")).toBeNull();
    expect(valorTecleado("mercancia", "0")).toBe(0);
    expect(valorTecleado("mercancia", "16")).toBe(16);
    expect(valorTecleado("mercancia", "-4")).toBeNull();
    expect(valorTecleado("mercancia", "abc")).toBeNull();
    expect(normalizarManuales({}).mercancia).toBeNull();
    expect(normalizarManuales({ mercancia: 0 }).mercancia).toBe(0);
    expect(normalizarManuales({ mercancia: 16 }).mercancia).toBe(16);
    expect(MANUALES_CERO.mercancia).toBeNull();
  });

  it("el servidor conserva el NULL al leer (un `?? 0` convertiría cada casilla vacía en «no descontar»)", () => {
    const srv = sinComentarios("src/lib/asistencia/planilla-server.ts");
    expect(srv).toMatch(/mercancia: f\.mercancia === null \|\| f\.mercancia === undefined \? null : Number\(f\.mercancia\)/);
    expect(srv).not.toMatch(/mercancia: Number\(f\.mercancia \?\? 0\)/);
  });

  it("la migración existe, quita NOT NULL y DEFAULT SOLO de mercancia, y el backfill es `= 0` exacto", () => {
    const sql = leer(MIGRACION);
    const puro = sql.replace(/^\s*--.*$/gm, "");
    expect(puro).toMatch(/ALTER COLUMN mercancia DROP NOT NULL/);
    expect(puro).toMatch(/ALTER COLUMN mercancia DROP DEFAULT/);
    for (const col of ["isr", "prestamo", "terceros", "otros_servicios"]) {
      expect(puro, col).not.toMatch(new RegExp(`ALTER COLUMN ${col}`));
    }
    expect(puro).toMatch(/UPDATE asistencia_planilla_manual SET mercancia = NULL WHERE mercancia = 0;/);
    expect(puro).not.toMatch(/updated_at/);
    expect(puro).not.toMatch(/LIKE|DELETE|DROP TABLE|DROP COLUMN/i);
    const m = sql.match(/COMMENT ON COLUMN asistencia_planilla_manual\.mercancia IS\s+'([^']+)'/);
    expect(m).toBeTruthy();
    expect(m![1]).toMatch(/NULL = /);
    expect(m![1]).toMatch(/0 = /);
    expect(m![1]).toMatch(/no se descuenta/i);
    // Y trae la cita de Daniel: la regla no se inventó acá.
    expect(sql).toMatch(/se elige la cuota y listo/);
  });

  // El tuteo de todo `src/**` lo barre `nada-de-voseo.test.ts`; la migración
  // vive fuera de `src` y se barre acá con las mismas palabras.
  it("la migración va en tuteo, sin voseo", () => {
    expect(leer(MIGRACION)).not.toMatch(/ (vos|acá|tenés|podés|elegí|escribí|mirá|tocá|guardá) /);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("F. se registra COMO UN PRÉSTAMO: la cuota se elige al cargarlo y va a la ficha", () => {
  it("🔴 el formulario pregunta la cuota en «Daño de mercancía», por la MISMA casilla que préstamo y terceros", () => {
    const modal = sinComentarios("src/app/prestamos/components/NuevoMovimientoModal.tsx");
    expect(modal).toMatch(/const preguntaCuota = !!cuotaActual && \(concepto === CONCEPTO_PRESTAMO \|\| concepto === CONCEPTO_TERCEROS \|\| concepto === CONCEPTO_DANO\);/);
    // Una sola casilla «Cuota por quincena», no una segunda para el daño.
    expect((modal.match(/Cuota por quincena/g) ?? []).length).toBe(1);
    // Abre con la cuota de daño que YA tiene la ficha.
    expect(modal).toMatch(/if \(concepto === CONCEPTO_DANO\) return actual\.dano \?\? 0;/);
    // Un pago sigue sin preguntar.
    expect(modal).not.toMatch(/concepto === CONCEPTO_PAGO \|\|/);
  });

  it("🔴 la cuota del daño se escribe en `deduccion_dano` por la MISMA segunda llamada (PUT a la ficha)", () => {
    const form = sinComentarios("src/app/prestamos/components/useMovimientoForm.ts");
    expect(form).toMatch(/concepto === CONCEPTO_DANO\s*\?\s*"deduccion_dano"/);
    expect((form.match(/fetch\(`\/api\/prestamos\/empleados\/\$\{empleadoId\}`/g) ?? []).length).toBe(1);
    const put = sinComentarios("src/app/api/prestamos/empleados/[id]/route.ts");
    expect(put).toMatch(/update\.deduccion_dano = v;/);
  });

  it("las dos puertas del formulario pasan la cuota de daño actual", () => {
    expect(sinComentarios("src/app/asistencia/PrestamosTab.tsx")).toMatch(/dano: filaDelModulo\?\.cuotaDano \?\? 0/);
    expect(sinComentarios("src/app/prestamos/[id]/page.tsx")).toMatch(/dano: Number\(empleado\.deduccion_dano \?\? 0\)/);
  });

  it("la casilla de la planilla se llena desde la ruta con lo escrito en «Mercancía» (`enCasillaDano`)", () => {
    const ruta = sinComentarios("src/app/api/asistencia/planilla/route.ts");
    expect(ruta).toMatch(/enCasillaDano: l\.manuales\.mercancia \?\? 0/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("G. ⚠️ el cierre NO se tocó: es una decisión pendiente de Daniel", () => {
  it("`cierre-prestamo.ts` no nombra la cuota de daño ni `montoDanoDeFicha`, y sigue leyendo `dinero.mercancia`", () => {
    const cierre = sinComentarios("src/lib/asistencia/cierre-prestamo.ts");
    expect(cierre).not.toMatch(/montoDanoDeFicha|sugeridoDano|cuotaDano/);
    // Lo que ya hacía: anota «Pago de responsabilidad» sobre lo que haya en la
    // casilla «Mercancía» de `dinero`, capeado al saldo de daño.
    expect(cierre).toMatch(/\{ cuenta: CUENTA_DANO, campo: "mercancia", yaDescontado: "yaDescontadoDano", saldo: "saldoDano" \}/);
    expect(cierre).toMatch(/dano: "Pago de responsabilidad"/);
  });
});
