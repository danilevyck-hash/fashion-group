/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 EL PRÉSTAMO DEJA DE DESCONTARSE SOLO — el candado (15-sep-2026).
 *
 * Daniel, textual: *«que no se descuente hasta que contabilidad lo haga a mano
 * por ahora, hasta que el módulo esté terminado»*.
 *
 * 🩸 POR QUÉ. Medido el 15-sep-2026: el Excel de la contadora descontó $773,01
 * del 1 al 15 de septiembre en 13 personas (préstamo $624,28 · terceros $130,93
 * · mercancía $17,80). El sistema tiene anotados DOS movimientos, los que
 * escribió el cierre de Fashion Wear: Luis Parajón $70,00 (correcto) y Eloyn
 * Mendoza $25,00, que su planilla NO le descontó. O sea que el automático ya
 * escribió un pago que no fue, y los otros $703,01 no están registrados.
 *
 * 🔴 LO QUE SE PROTEGE:
 *
 *   A. El interruptor está en `false`, en UN solo archivo.
 *   B. Apagado, las tres casillas arrancan VACÍAS: no entra ninguna cuota, ni
 *      al dinero, ni al total de deducciones, ni al neto.
 *   C. Vale exactamente lo que teclea contabilidad, y el CIERRE anota eso mismo.
 *   D. La fila sigue MOSTRANDO cuánto debe y cuál sería su cuota: se le quita al
 *      sistema la decisión, no la información.
 *   E. Lo que describía el automático deja de decirse (la «última cuota»), y lo
 *      que no depende de él sigue (quien debe y no cobra acá).
 *   F. CONTROL: con el automático PRENDIDO todo vuelve a funcionar igual.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  MANUALES_CERO,
  type DineroLinea,
  type LineaPlanilla,
  type ManualesLinea,
} from "@/lib/asistencia/planilla";
import {
  PRESTAMO_AUTOMATICO,
  aplicarPrestamoEnLinea,
  avisosDeUltimaCuota,
  casillaAutomatica,
  prestamosDeQuienNoCobra,
  textoDeudaCasilla,
  type SugerenciaPrestamo,
} from "@/lib/asistencia/prestamos-planilla";
import { planDeCierre, type DeudaDePersona } from "@/lib/asistencia/cierre-prestamo";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const sinComentarios = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

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
  cuotaTerceros: 0, saldoTerceros: 0, sugeridoTerceros: 0, enCasillaTerceros: 0,
  cuotaDano: 0, saldoDano: 0, sugeridoDano: 0, enCasillaDano: 0, ...o,
});
const linea = (manuales: ManualesLinea, dinero: Partial<DineroLinea> = {}) =>
  ({
    codigo: "10", etiqueta: "LUIS PARAJON", nombre: "LUIS PARAJON", horas: {},
    manuales, dinero: DINERO(dinero),
  }) as unknown as LineaPlanilla;
const deuda = (o: Partial<DeudaDePersona> & { codigo: string }): DeudaDePersona => ({
  fichaId: `f-${o.codigo}`, nombrePrestamos: "X", saldoPrestamo: 0, saldoDano: 0, saldoTerceros: 0,
  cuotaPrestamo: 0, cuotaTerceros: 0, yaDescontado: 0, yaDescontadoTerceros: 0, yaDescontadoDano: 0, ...o,
});

// ═════════════════════════════════════════════════════════════════════════════
describe("A. 🔴 el interruptor, en UN solo lugar", () => {
  it("hoy está APAGADO", () => {
    expect(PRESTAMO_AUTOMATICO).toBe(false);
  });

  it("vive SOLO en `prestamos-planilla.ts`: ningún otro archivo de la app lo mira", () => {
    // Un segundo lugar que DECIDA lo mismo es cómo se prende a medias. Se barre
    // con los comentarios borrados: nombrarlo en una nota está bien y ayuda.
    const dir = path.join(RAIZ, "src");
    const encontrados: string[] = [];
    const barrer = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== "__tests__") barrer(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        if (sinComentarios(path.relative(RAIZ, p)).includes("PRESTAMO_AUTOMATICO")) {
          encontrados.push(path.relative(RAIZ, p));
        }
      }
    };
    barrer(dir);
    expect(encontrados).toEqual(["src/lib/asistencia/prestamos-planilla.ts"]);
  });

  it("🔑 el automático entero cuelga de UNA función (`cuotaPropuesta`)", () => {
    const src = sinComentarios("src/lib/asistencia/prestamos-planilla.ts");
    // La constante se lee solo como valor por defecto de un parámetro y dentro
    // de esa función: nadie más pregunta por ella.
    const usos = src.match(/PRESTAMO_AUTOMATICO/g) ?? [];
    expect(usos.length).toBeGreaterThan(0);
    expect(src).toContain("function cuotaPropuesta(sugerido: number, automatico: boolean)");
    expect(src).toContain("if (!automatico) return 0;");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("B. 🔴 apagado: las casillas arrancan VACÍAS", () => {
  it("`casillaAutomatica` devuelve 0 aunque el módulo proponga $70", () => {
    expect(casillaAutomatica(null, 70)).toBe(0);
    expect(casillaAutomatica(undefined, 70)).toBe(0);
  });

  it("🔴 no entra nada a `dinero`: ni préstamo, ni deducciones, ni neto", () => {
    const con = aplicarPrestamoEnLinea(
      linea(MANUAL()),
      SUG({ sugeridoTerceros: 30, cuotaTerceros: 30, saldoTerceros: 200, sugeridoDano: 10, cuotaDano: 10, saldoDano: 50 }),
    );
    expect(con.dinero!.prestamo).toBe(0);
    expect(con.dinero!.terceros).toBe(0);
    expect(con.dinero!.mercancia).toBe(0);
    expect(con.dinero!.totalDeducciones).toBe(0);
    expect(con.dinero!.netoPagar).toBe(260);
    expect(con.prestamoAutomatico?.prestamo).toBe(0);
    expect(con.prestamoAutomatico?.terceros).toBe(0);
    expect(con.prestamoAutomatico?.mercancia).toBe(0);
  });

  it("un 0 en la casilla ya no dice «me salté una cuota»: no había ninguna", () => {
    const con = aplicarPrestamoEnLinea(linea(MANUAL({ prestamo: 0 })), SUG());
    expect(con.prestamoAutomatico?.sinDescontar).toBeUndefined();
  });

  it("⚠️ los TRES estados de la casilla NO cambiaron: un monto escrito sigue mandando", () => {
    // Lo escrito a mano ya está adentro de `dinero` (lo pone el motor); acá lo
    // que importa es que no se le SUME nada encima.
    const con = aplicarPrestamoEnLinea(
      linea(MANUAL({ prestamo: 35 }), { prestamo: 35, totalDeducciones: 35, netoPagar: 225 }),
      SUG(),
    );
    expect(con.dinero!.prestamo).toBe(35);
    expect(con.dinero!.netoPagar).toBe(225);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("C. 🔴 el cierre anota EXACTAMENTE lo tecleado", () => {
  const deudas = new Map([["10", deuda({ codigo: "10", saldoPrestamo: 500, cuotaPrestamo: 70 })]]);

  it("🩸 el caso de Eloyn: sin nada tecleado, el cierre NO anota ningún pago", () => {
    // Es el defecto que esto viene a cerrar: el automático escribió $25 de pago
    // sobre una planilla que no le descontó nada.
    const l = aplicarPrestamoEnLinea(linea(MANUAL()), SUG()) as LineaPlanilla;
    const plan = planDeCierre({ lineas: [l], deudas, fecha: "2026-09-15" });
    expect(plan.pagos).toEqual([]);
  });

  it("con $45 tecleados, el pago anotado es $45 — ni la cuota de $70 ni otra cosa", () => {
    const l = aplicarPrestamoEnLinea(
      linea(MANUAL({ prestamo: 45 }), { prestamo: 45, totalDeducciones: 45, netoPagar: 215 }),
      SUG(),
    ) as LineaPlanilla;
    const plan = planDeCierre({ lineas: [l], deudas, fecha: "2026-09-15" });
    expect(plan.pagos).toHaveLength(1);
    expect(plan.pagos[0].monto).toBe(45);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("D. 🔴 la fila sigue MOSTRANDO cuánto debe y cuál sería su cuota", () => {
  it("«Debe $500.00 · cuota $70.00» debajo de la casilla", () => {
    const con = aplicarPrestamoEnLinea(linea(MANUAL()), SUG());
    expect(textoDeudaCasilla(con, "prestamo")).toBe("Debe $500.00 · cuota $70.00");
  });

  it("🔑 una deuda SIN cuota cargada también se dice — no se descontaría sola ni prendido", () => {
    // 🔴 Y la deuda está SOLO en el daño: si esto se mirara preguntando por el
    // saldo del préstamo, esta persona no tendría ninguna pista en pantalla.
    const con = aplicarPrestamoEnLinea(
      linea(MANUAL()),
      SUG({ saldo: 0, cuota: 0, sugerido: 0, saldoDano: 254.5, cuotaDano: 0, sugeridoDano: 0 }),
    );
    expect(textoDeudaCasilla(con, "mercancia")).toBe("Debe $254.50 · sin cuota");
  });

  it("lo mismo con una deuda SOLO de terceros: las tres cuentas se miran igual", () => {
    const con = aplicarPrestamoEnLinea(
      linea(MANUAL()),
      SUG({ saldo: 0, cuota: 0, sugerido: 0, saldoTerceros: 80, cuotaTerceros: 20, sugeridoTerceros: 20 }),
    );
    expect(textoDeudaCasilla(con, "terceros")).toBe("Debe $80.00 · cuota $20.00");
  });

  it("🔴 la cuenta que NO debe nada queda callada, aunque otra sí deba", () => {
    // Un «Debe $0.00» debajo de dos de las tres casillas es exactamente el
    // ruido que tapa el dato que sí importa.
    const con = aplicarPrestamoEnLinea(linea(MANUAL()), SUG());
    expect(textoDeudaCasilla(con, "prestamo")).toBe("Debe $500.00 · cuota $70.00");
    expect(textoDeudaCasilla(con, "terceros")).toBeNull();
    expect(textoDeudaCasilla(con, "mercancia")).toBeNull();
  });

  it("sin deuda en ninguna cuenta, la línea ni siquiera trae el dato", () => {
    const con = aplicarPrestamoEnLinea(linea(MANUAL()), SUG({ saldo: 0, cuota: 0, sugerido: 0 }));
    expect(con.prestamoAutomatico).toBeUndefined();
    expect(textoDeudaCasilla(con, "prestamo")).toBeNull();
  });

  it("la pantalla lo dibuja VISIBLE, en las dos formas, y no solo en un `title`", () => {
    const tab = sinComentarios("src/app/asistencia/PlanillaTab.tsx");
    expect(tab).toContain('data-testid="deuda-casilla"');
    // La fila (escritorio) y la tarjeta (celular), las dos.
    expect((tab.match(/deuda=\{deudaDe\(l, campo\)\}/g) ?? []).length).toBe(2);
    // Y la condición que lo dibuja es la que es: se ve cuando hay deuda y la
    // casilla no está apagada. Apagarla con un `false` pone esto rojo.
    expect(tab).toContain("{deuda && !bloqueada && (");
    expect(tab).toContain("{deuda}");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("E. lo que se DICE cambia con el interruptor, y lo que no depende de él se queda", () => {
  it("🔴 el aviso de la «última cuota» no sale: no entra ninguna cuota", () => {
    expect(avisosDeUltimaCuota([SUG({ cuota: 70, saldo: 40, sugerido: 40 })])).toEqual([]);
  });

  it("⚠️ quien debe y NO cobra acá se sigue avisando: eso es cierto pase lo que pase", () => {
    const avisos = prestamosDeQuienNoCobra({
      fichas: [{ codigo: "99", nombre: "SE FUE", saldo: 120 } as never],
      fuera: new Set(["99"]),
      nombreDe: () => null,
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].tipo).toBe("no-cobra");
  });

  it("⚠️ la ruta llama sin forzar nada: usa el interruptor", () => {
    const ruta = sinComentarios("src/app/api/asistencia/planilla/route.ts");
    expect(ruta).toContain("aplicarPrestamoEnLinea(l, sugerenciaDe.get(l.codigo))");
    expect(ruta).not.toMatch(/aplicarPrestamoEnLinea\([^)]*,\s*true\)/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("F. 🔴 CONTROL: con el automático PRENDIDO todo vuelve a funcionar igual", () => {
  it("la cuota entra a la casilla, al total de deducciones y al neto", () => {
    const con = aplicarPrestamoEnLinea(linea(MANUAL()), SUG(), true);
    expect(con.dinero!.prestamo).toBe(70);
    expect(con.dinero!.totalDeducciones).toBe(70);
    expect(con.dinero!.netoPagar).toBe(190);
    expect(con.prestamoAutomatico?.prestamo).toBe(70);
  });

  it("y ahí la fila NO repite la deuda: la casilla ya trae el número", () => {
    const con = aplicarPrestamoEnLinea(linea(MANUAL()), SUG(), true);
    expect(con.prestamoAutomatico?.deuda).toBeUndefined();
    expect(textoDeudaCasilla(con, "prestamo")).toBeNull();
  });

  it("el 0 a propósito vuelve a decir cuánto se saltó", () => {
    const con = aplicarPrestamoEnLinea(linea(MANUAL({ prestamo: 0 })), SUG(), true);
    expect(con.prestamoAutomatico?.sinDescontar?.prestamo).toBe(70);
  });

  it("y el aviso de la última cuota vuelve a salir", () => {
    const avisos = avisosDeUltimaCuota([SUG({ cuota: 70, saldo: 40, sugerido: 40 })], true);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].tipo).toBe("ultima-cuota");
  });
});
