/* ─────────────────────────────────────────────────────────────────────────────
 * «NO DESCONTAR EL PRÉSTAMO ESTA QUINCENA» — el candado.
 *
 * Daniel (11-sep-2026): *«sí»* a poder saltarse una quincena.
 *
 * 🩸 Hasta ese día la columna era `NOT NULL DEFAULT 0` y el 0 se leía como
 * «vacío → va la cuota»: borrar la casilla traía la cuota, escribir 0 traía la
 * cuota. Medido en producción antes de la migración: 28 filas, `prestamo = 0`
 * en 6, `terceros = 0` en las 28, ninguna NULL. Todas pasan a NULL: hasta hoy
 * un 0 solo podía significar «vacío», y así nadie cambia de neto.
 *
 * 🔴 LO QUE SE PROTEGE:
 *
 *   A. Los TRES estados de la casilla (`null` vacía · `0` no descontar · monto).
 *   B. Con 0 escrito la cuota NO entra a la línea, y se anota cuánto se saltó.
 *   C. El cierre respeta el 0: no anota pago, y lo dice como decisión.
 *   D. «Antes de cerrar» lo lista en la parte informativa, con nombre y monto.
 *   E. La migración es aditiva, el backfill es `= 0` exacto, y el COMMENT dice
 *      qué significa cada estado.
 *   F. La pantalla: la celda dice «No se descuenta esta quincena» (visible, no
 *      solo en el `title`), el guardado pasa por `valorTecleado`, y la ficha del
 *      préstamo y «Anotar abono» NO se tocaron.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  CASILLAS_AUTOMATICAS,
  TEXTO_SIN_DESCONTAR,
  TITULO_SIN_DESCONTAR,
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
  casillaAutomatica,
  type SugerenciaPrestamo,
} from "@/lib/asistencia/prestamos-planilla";
import { TEXTO_OMISION, planDeCierre, type DeudaDePersona } from "@/lib/asistencia/cierre-prestamo";
import { armarAntesDeCerrar, type EntradaAntesDeCerrar } from "@/lib/asistencia/antes-de-cerrar";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const sinComentarios = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const MIGRACION = "supabase/migrations/20261115120000_planilla_manual_prestamo_nullable.sql";

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
const SUG = (o: Partial<SugerenciaPrestamo> = {}): SugerenciaPrestamo => ({
  codigo: "10", etiqueta: "LUIS PARAJON", empresa: "fashion_wear", empresaEtiqueta: "Fashion Wear",
  nombrePrestamos: "LUIS PARAJON", cuota: 70, saldo: 500, sugerido: 70, origen: "cuota", enCasilla: 0,
  cuotaTerceros: 0, saldoTerceros: 0, sugeridoTerceros: 0, enCasillaTerceros: 0, ...o,
});
const linea = (manuales: ManualesLinea, etiqueta = "LUIS PARAJON", codigo = "10") =>
  ({ codigo, etiqueta, nombre: etiqueta, horas: {}, manuales, dinero: DINERO() }) as unknown as LineaPlanilla;
const deuda = (o: Partial<DeudaDePersona> & { codigo: string }): DeudaDePersona => ({
  fichaId: `f-${o.codigo}`, nombrePrestamos: "X", saldoPrestamo: 0, saldoDano: 0, saldoTerceros: 0,
  cuotaPrestamo: 0, cuotaTerceros: 0, yaDescontado: 0, yaDescontadoTerceros: 0, yaDescontadoDano: 0, ...o,
});
const mapa = (...ds: DeudaDePersona[]) => new Map(ds.map((d) => [d.codigo, d]));

// ─────────────────────────────────────────────────────────────────────────────
describe("A. los tres estados de la casilla: null · 0 · monto", () => {
  it("null/undefined/basura/negativo = vacía; 0 exacto = sin-descontar; monto = escrita", () => {
    expect(estadoCasilla(null)).toBe("vacia");
    expect(estadoCasilla(undefined)).toBe("vacia");
    expect(estadoCasilla(NaN)).toBe("vacia");
    expect(estadoCasilla(-3)).toBe("vacia");
    expect(estadoCasilla(0)).toBe("sin-descontar");
    expect(estadoCasilla(0.004)).toBe("sin-descontar"); // es 0 al centavo
    expect(estadoCasilla(0.01)).toBe("escrita");
    expect(estadoCasilla(50)).toBe("escrita");
  });

  it("solo Préstamo y Terceros son automáticas: en las otras tres 0 y vacío dicen lo mismo", () => {
    expect([...CASILLAS_AUTOMATICAS]).toEqual(["prestamo", "terceros"]);
    expect(esCasillaAutomatica("prestamo")).toBe(true);
    expect(esCasillaAutomatica("terceros")).toBe(true);
    expect(esCasillaAutomatica("mercancia")).toBe(false);
    expect(esCasillaAutomatica("isr")).toBe(false);
    expect(esCasillaAutomatica("otrosServicios")).toBe(false);
  });

  it("🔴 lo tecleado: vacío → null (vuelve la cuota) · «0» → 0 (no descontar) · «50» → 50 · basura → null", () => {
    expect(valorTecleado("prestamo", "")).toBeNull();
    expect(valorTecleado("prestamo", "   ")).toBeNull();
    expect(valorTecleado("prestamo", "0")).toBe(0);
    expect(valorTecleado("prestamo", "0.00")).toBe(0);
    expect(valorTecleado("prestamo", "50")).toBe(50);
    expect(valorTecleado("prestamo", "12,5")).toBe(12.5);
    expect(valorTecleado("prestamo", "abc")).toBeNull();
    expect(valorTecleado("prestamo", "-5")).toBeNull();
    expect(valorTecleado("terceros", "0")).toBe(0);
    expect(valorTecleado("terceros", null)).toBeNull();
    // Las otras tres: como siempre, número > 0 o 0.
    expect(valorTecleado("isr", "")).toBe(0);
    expect(valorTecleado("isr", "0")).toBe(0);
    expect(valorTecleado("mercancia", "-4")).toBe(0);
    expect(valorTecleado("otrosServicios", "20")).toBe(20);
  });

  it("`normalizarManuales` conserva el null y el 0 en las dos automáticas (es la MISMA función del guardado)", () => {
    expect(normalizarManuales({}).prestamo).toBeNull();
    expect(normalizarManuales({}).terceros).toBeNull();
    expect(normalizarManuales({ prestamo: 0 }).prestamo).toBe(0);
    expect(normalizarManuales({ prestamo: "0" as unknown as number }).prestamo).toBe(0);
    expect(normalizarManuales({ prestamo: 35 }).prestamo).toBe(35);
    expect(normalizarManuales({ prestamo: null }).prestamo).toBeNull();
    expect(normalizarManuales({ mercancia: undefined }).mercancia).toBe(0);
    expect(MANUALES_CERO.prestamo).toBeNull();
    expect(MANUALES_CERO.terceros).toBeNull();
  });

  it("el motor suma 0 con la casilla en null Y con 0: la diferencia la hace `aplicarPrestamoEnLinea`", () => {
    const conNull = calcularDinero(600, 40, { extra125: 0 } as never, MANUAL(), REGLAS_DEFAULT)!;
    const conCero = calcularDinero(600, 40, { extra125: 0 } as never, MANUAL({ prestamo: 0 }), REGLAS_DEFAULT)!;
    expect(conNull.prestamo).toBe(0);
    expect(conCero.prestamo).toBe(0);
    expect(conNull.netoPagar).toBe(conCero.netoPagar);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B. con 0 escrito la cuota NO entra, y se anota cuánto se saltó", () => {
  it("`casillaAutomatica`: null → la cuota · 0 → nada · monto → nada", () => {
    expect(casillaAutomatica(null, 70)).toBe(70);
    expect(casillaAutomatica(0, 70)).toBe(0);
    expect(casillaAutomatica(35, 70)).toBe(0);
  });

  it("🔴 casilla en null: entra la cuota de $70 y el neto baja", () => {
    const con = aplicarPrestamoEnLinea(linea(MANUAL()), SUG());
    expect(con.dinero!.prestamo).toBe(70);
    expect(con.dinero!.netoPagar).toBe(190);
    expect(con.prestamoAutomatico).toEqual({ prestamo: 70, terceros: 0 });
  });

  it("🔴 casilla en 0: NO entra la cuota, el neto no baja, y `sinDescontar` dice los $70 que se saltaron", () => {
    const con = aplicarPrestamoEnLinea(linea(MANUAL({ prestamo: 0 })), SUG());
    expect(con.dinero!.prestamo).toBe(0);
    expect(con.dinero!.netoPagar).toBe(260);
    expect(con.prestamoAutomatico).toEqual({ prestamo: 0, terceros: 0, sinDescontar: { prestamo: 70, terceros: 0 } });
    // Y `manuales` sigue siendo la foto de la tabla: el 0 no se toca.
    expect(con.manuales.prestamo).toBe(0);
  });

  it("préstamo en 0 y terceros en null: se salta uno y entra el otro", () => {
    const sug = SUG({ cuotaTerceros: 40, saldoTerceros: 100, sugeridoTerceros: 40 });
    const con = aplicarPrestamoEnLinea(linea(MANUAL({ prestamo: 0 })), sug);
    expect(con.dinero!.prestamo).toBe(0);
    expect(con.dinero!.terceros).toBe(40);
    expect(con.dinero!.netoPagar).toBe(220);
    expect(con.prestamoAutomatico).toEqual({ prestamo: 0, terceros: 40, sinDescontar: { prestamo: 70, terceros: 0 } });
  });

  it("un 0 sobre alguien SIN cuota que saltar no anota nada: es la misma línea", () => {
    const l = linea(MANUAL({ prestamo: 0 }));
    expect(aplicarPrestamoEnLinea(l, SUG({ sugerido: 0 }))).toBe(l);
    expect(aplicarPrestamoEnLinea(l, undefined)).toBe(l);
  });

  it("`prestamosSinDescontar` lista SOLO las casillas con 0 y cuota saltada, por cuenta", () => {
    const a = aplicarPrestamoEnLinea(linea(MANUAL({ prestamo: 0 })), SUG());
    const b = aplicarPrestamoEnLinea(
      linea(MANUAL({ terceros: 0 }), "ANDRES GONZALEZ", "23"),
      SUG({ codigo: "23", sugerido: 0, cuotaTerceros: 40, saldoTerceros: 79.94, sugeridoTerceros: 40 }),
    );
    const c = aplicarPrestamoEnLinea(linea(MANUAL(), "YULICAR", "15"), SUG({ codigo: "15", sugerido: 25 }));
    const d = linea(MANUAL({ prestamo: 0 }), "SIN PRÉSTAMO", "99"); // 0 sin nada que saltar
    expect(prestamosSinDescontar([a, b, c, d] as LineaPlanilla[])).toEqual([
      { codigo: "10", etiqueta: "LUIS PARAJON", cuenta: "prestamo", monto: 70 },
      { codigo: "23", etiqueta: "ANDRES GONZALEZ", cuenta: "terceros", monto: 40 },
    ]);
  });

  it("el texto: «N préstamos sin descontar esta quincena, a propósito», con nombre y monto; null sin ninguno", () => {
    expect(textoSinDescontar([])).toBeNull();
    expect(textoSinDescontar([{ codigo: "10", etiqueta: "Luis Parajón", cuenta: "prestamo", monto: 70 }]))
      .toBe("préstamo sin descontar esta quincena, a propósito (Luis Parajón · $70.00)");
    expect(textoSinDescontar([
      { codigo: "10", etiqueta: "Luis Parajón", cuenta: "prestamo", monto: 70 },
      { codigo: "23", etiqueta: "Andrés González", cuenta: "terceros", monto: 40 },
    ])).toBe("préstamos sin descontar esta quincena, a propósito (Luis Parajón · $70.00 — Andrés González (terceros) · $40.00)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("C. el cierre respeta el 0: no anota pago, y lo dice como decisión", () => {
  it("🔴 casilla en 0 de alguien que debe: cero pagos, omisión «sin-descontar» (no «casilla-en-cero»)", () => {
    const plan = planDeCierre({
      lineas: [linea(MANUAL({ prestamo: 0 }))],
      deudas: mapa(deuda({ codigo: "10", saldoPrestamo: 500, cuotaPrestamo: 70 })),
      fecha: "2026-09-15",
    });
    expect(plan.pagos).toHaveLength(0);
    expect(plan.total).toBe(0);
    expect(plan.omisiones).toEqual([
      { codigo: "10", etiqueta: "LUIS PARAJON", monto: 0, motivo: "sin-descontar" },
    ]);
  });

  it("CONTROL: casilla en null (vacía, sin cuota metida) sigue siendo «casilla-en-cero»", () => {
    const plan = planDeCierre({
      lineas: [linea(MANUAL())],
      deudas: mapa(deuda({ codigo: "10", saldoPrestamo: 500 })),
      fecha: "2026-09-15",
    });
    expect(plan.omisiones[0]).toMatchObject({ motivo: "casilla-en-cero" });
  });

  it("CONTROL: con la cuota metida en `dinero` (casilla null) SÍ se anota el pago", () => {
    const con = aplicarPrestamoEnLinea(linea(MANUAL()), SUG());
    const plan = planDeCierre({
      lineas: [con as LineaPlanilla],
      deudas: mapa(deuda({ codigo: "10", saldoPrestamo: 500, cuotaPrestamo: 70 })),
      fecha: "2026-09-15",
    });
    expect(plan.pagos).toHaveLength(1);
    expect(plan.pagos[0]).toMatchObject({ cuenta: "prestamo", monto: 70 });
  });

  it("un 0 en terceros no toca el préstamo, y viceversa", () => {
    const l = aplicarPrestamoEnLinea(
      linea(MANUAL({ terceros: 0 })),
      SUG({ cuotaTerceros: 40, saldoTerceros: 100, sugeridoTerceros: 40 }),
    );
    const plan = planDeCierre({
      lineas: [l as LineaPlanilla],
      deudas: mapa(deuda({ codigo: "10", saldoPrestamo: 500, saldoTerceros: 100 })),
      fecha: "2026-09-15",
    });
    expect(plan.pagos.map((p) => p.cuenta)).toEqual(["prestamo"]);
    expect(plan.omisiones).toEqual([{ codigo: "10", etiqueta: "LUIS PARAJON", monto: 0, motivo: "sin-descontar" }]);
  });

  it("un 0 de alguien sin deuda no es noticia, y «mercancía» en 0 nunca es «sin-descontar»", () => {
    const plan = planDeCierre({
      lineas: [linea(MANUAL({ prestamo: 0, terceros: 0 }))],
      deudas: mapa(deuda({ codigo: "10" })),
      fecha: "2026-09-15",
    });
    expect(plan.omisiones).toHaveLength(0);
    const conDano = planDeCierre({
      lineas: [linea(MANUAL({ mercancia: 0 }))],
      deudas: mapa(deuda({ codigo: "10", saldoDano: 30 })),
      fecha: "2026-09-15",
    });
    expect(conDano.omisiones.some((o) => o.motivo === "sin-descontar")).toBe(false);
  });

  it("la redacción dice que fue a propósito, en tuteo y sin voseo", () => {
    expect(TEXTO_OMISION["sin-descontar"]).toBe("esta quincena no se le descuenta, a propósito (casilla en 0)");
    expect(TEXTO_OMISION["sin-descontar"]).not.toMatch(/\b(vos|acá|tenés|podés)\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D. «Antes de cerrar» lo lista en la parte informativa, con nombre y monto", () => {
  const VACIA: EntradaAntesDeCerrar = {
    periodoAbierto: { diasHabiles: 3 }, esQuincena: true,
    rango: { desde: "2026-09-01", hasta: "2026-09-15" },
    extraSinAprobar: [], sinFicha: [], sinHorario: 0, corte: null, hasta: "2026-09-15",
    fueraPorBaja: 0, marcoDespuesDeIrse: 0, avisoRepartoRechazado: null, prestamoSinAtar: [],
    avisoPrestamo: null, avisoVacacionesNoPagadas: null, conSabado: 0, rangoLibre: false,
    factorBase: 1, diasCalendario: 15, migraciones: [], pestanaFichas: "Colaboradores",
  };

  it("con dos casillas en 0: una línea gris «2 préstamos sin descontar esta quincena, a propósito (…)», sin enlace", () => {
    const r = armarAntesDeCerrar({
      ...VACIA,
      sinDescontar: [
        { codigo: "10", etiqueta: "Luis Parajón", cuenta: "prestamo", monto: 70 },
        { codigo: "23", etiqueta: "Andrés González", cuenta: "prestamo", monto: 25 },
      ],
    });
    const l = r.info.find((x) => x.clave === "sin-descontar")!;
    expect(l).toBeTruthy();
    expect(l.numero).toBe(2);
    expect(l.tono).toBe("info");
    expect(l.enlace).toBeNull();
    expect(l.texto).toBe("préstamos sin descontar esta quincena, a propósito (Luis Parajón · $70.00 — Andrés González · $25.00)");
    // Es informativo: no impide cerrar.
    expect(r.arreglar.some((x) => x.clave === "sin-descontar")).toBe(false);
    expect(r.todoListo).toBe(true);
  });

  it("sin ninguno (o sin pasarlo) la línea no existe", () => {
    expect(armarAntesDeCerrar({ ...VACIA, sinDescontar: [] }).info.some((x) => x.clave === "sin-descontar")).toBe(false);
    expect(armarAntesDeCerrar(VACIA).info.some((x) => x.clave === "sin-descontar")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("E. la migración: aditiva, backfill `= 0` exacto, COMMENT con los tres estados", () => {
  const sql = leer(MIGRACION);
  const sinComentariosSql = sql.replace(/^\s*--.*$/gm, "");

  it("existe y quita el NOT NULL y el DEFAULT de prestamo y terceros — y de nada más", () => {
    expect(sinComentariosSql).toMatch(/ALTER COLUMN prestamo DROP NOT NULL/);
    expect(sinComentariosSql).toMatch(/ALTER COLUMN prestamo DROP DEFAULT/);
    expect(sinComentariosSql).toMatch(/ALTER COLUMN terceros DROP NOT NULL/);
    expect(sinComentariosSql).toMatch(/ALTER COLUMN terceros DROP DEFAULT/);
    for (const col of ["isr", "mercancia", "otros_servicios"]) {
      expect(sinComentariosSql).not.toMatch(new RegExp(`ALTER COLUMN ${col}`));
    }
  });

  it("🔴 el backfill es un UPDATE acotado al valor EXACTO 0, y no toca `updated_at`", () => {
    expect(sinComentariosSql).toMatch(/UPDATE asistencia_planilla_manual SET prestamo = NULL WHERE prestamo = 0;/);
    expect(sinComentariosSql).toMatch(/UPDATE asistencia_planilla_manual SET terceros = NULL WHERE terceros = 0;/);
    expect(sinComentariosSql).not.toMatch(/updated_at/);
    expect(sinComentariosSql).not.toMatch(/LIKE|DELETE|DROP TABLE|DROP COLUMN/i);
  });

  it("el COMMENT de cada columna dice qué significa NULL, 0 y monto", () => {
    for (const col of ["prestamo", "terceros"]) {
      const m = sql.match(new RegExp(`COMMENT ON COLUMN asistencia_planilla_manual\\.${col} IS\\s+'([^']+)'`));
      expect(m, col).toBeTruthy();
      expect(m![1]).toMatch(/NULL = /);
      expect(m![1]).toMatch(/0 = /);
      expect(m![1]).toMatch(/no se descuenta/i);
    }
  });

  it("el servidor conserva el NULL al leer (un `?? 0` convertiría cada casilla vacía en «no descontar»)", () => {
    const srv = sinComentarios("src/lib/asistencia/planilla-server.ts");
    expect(srv).toMatch(/prestamo: f\.prestamo === null \|\| f\.prestamo === undefined \? null : Number\(f\.prestamo\)/);
    expect(srv).toMatch(/terceros: f\.terceros === null \|\| f\.terceros === undefined \? null : Number\(f\.terceros\)/);
    expect(srv).not.toMatch(/prestamo: Number\(f\.prestamo \?\? 0\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("F. la pantalla: la decisión se toma en la FILA de la planilla, y en ningún otro lado", () => {
  const pantalla = sinComentarios("src/app/asistencia/PlanillaTab.tsx");

  it("el guardado pasa por `valorTecleado` (la misma función del servidor), no por un `n > 0 ? n : 0`", () => {
    expect(pantalla).toMatch(/const limpio = valorTecleado\(campo, valor\);/);
    expect(pantalla).not.toMatch(/Number\.isFinite\(n\) && n > 0 \? n : 0/);
  });

  it("🔴 la celda dice «No se descuenta esta quincena» VISIBLE (no solo en el title), en gris, y el title dice cómo deshacerlo", () => {
    expect(pantalla).toMatch(/\{sinDescontar && !bloqueada && \(\s*<span[^>]*text-gray-500[^>]*>\s*\{TEXTO_SIN_DESCONTAR\}/);
    expect(pantalla).toMatch(/sinDescontar\s*\?\s*TITULO_SIN_DESCONTAR/);
    expect(TEXTO_SIN_DESCONTAR).toBe("No se descuenta esta quincena");
    expect(TITULO_SIN_DESCONTAR).toMatch(/Borra el 0/);
  });

  it("las DOS celdas (escritorio y tarjeta) reciben `sinDescontar`, y la lista lo calcula de las mismas líneas", () => {
    expect((pantalla.match(/sinDescontar=\{esSinDescontar\(l, campo\)\}/g) ?? []).length).toBe(2);
    expect(pantalla).toMatch(/sinDescontar: prestamosSinDescontar\(data\.lineas\),/);
  });

  it("la casilla muestra el 0 SOLO cuando había una cuota que saltar", () => {
    expect(pantalla).toMatch(/if \(estado === "sin-descontar"\) return esSinDescontar\(l, campo\) \? 0 : null;/);
    expect(pantalla).toMatch(/v === null \|\| \(v === 0 && !sinDescontar\) \? "" : String\(v\)/);
  });

  it("⚠️ la ficha del préstamo y «Anotar abono» NO saben de esto", () => {
    for (const p of [
      "src/app/prestamos/[id]/page.tsx",
      "src/lib/asistencia/abono-extra.ts",
    ]) {
      if (!fs.existsSync(path.join(RAIZ, p))) continue;
      expect(leer(p), p).not.toMatch(/sin-descontar|sinDescontar|TEXTO_SIN_DESCONTAR/);
    }
    // Y nadie más que la planilla escribe en la tabla.
    expect(leer("src/lib/asistencia/planilla-server.ts")).toMatch(/\.from\(TABLA_MANUAL\)\.upsert\(/);
  });
});
