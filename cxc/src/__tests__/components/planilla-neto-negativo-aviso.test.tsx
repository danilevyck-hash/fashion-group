/* ─────────────────────────────────────────────────────────────────────────────
 * 🩸 CAMBIÓ DE DIRECCIÓN EL 15-sep-2026, con motivo.
 *
 * Daniel: *«que no se descuente hasta que contabilidad lo haga a mano por
 * ahora, hasta que el módulo esté terminado»*. `PRESTAMO_AUTOMATICO` quedó en
 * `false` (`lib/asistencia/prestamos-planilla.ts`), así que POR DEFECTO ninguna
 * cuota entra sola.
 *
 * Todo lo que este archivo prueba sigue siendo VERDAD, y sigue probándose: pasa
 * a ser el CONTROL de que **con el automático PRENDIDO nada cambió**. Por eso
 * cada llamada lleva ahora un `true` explícito al final — el tercer parámetro
 * que fuerza el automático. El día que Daniel lo vuelva a prender, esto es lo
 * que garantiza que vuelve a funcionar exactamente igual.
 *
 * La dirección NUEVA —apagado, las casillas arrancan vacías y vale lo tecleado—
 * vive en `prestamo-no-automatico.test.ts`.
 * ────────────────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────────────
 * NADIE CIERRA UNA QUINCENA CON UN NETO NEGATIVO SIN HABERLO VISTO — el candado
 * (14-sep-2026).
 *
 * Daniel aprobó DOS AVISOS y dejó el freno del cierre para después, A
 * PROPÓSITO: el caso nunca ha pasado y la contadora recién está aprendiendo el
 * módulo, así que el aviso le enseña y el freno la bloquearía.
 *
 * 🩸 QUÉ VINO A CERRAR. `recortarAlNeto` solo achica lo AUTOMÁTICO (lo escrito
 * a mano manda), así que un neto negativo hecho de montos a mano SÍ podía salir
 * a la pantalla, al Excel, al comprobante y al cierre sin que nadie lo hubiera
 * visto: `antes-de-cerrar.ts` no nombraba `netoPagar` ni una vez y la celda no
 * miraba nada al escribir. Caso real medido el 14-sep-2026 contra producción:
 * colaborador 56 (Confecciones Boston, 1–15 sep), bruto $74,84, sin préstamo;
 * con $200 de mercancía escritos a mano el neto queda en −$125,16. Hoy solo 4
 * filas de 29 tienen mercancía a mano y ningún neto es negativo: es una red de
 * seguridad.
 *
 * 🔴 LO QUE SE PROTEGE:
 *
 *   A. La celda avisa AL ESCRIBIR, con el máximo que cabe y lo que quedaría
 *      («El máximo es $74.84. Le quedaría −$125.16.»), en ISR, mercancía y las
 *      demás casillas a mano — en la pantalla de verdad, tecla por tecla.
 *   B. CONTROL: NO bloquea. La celda sigue escribible y el monto SE GUARDA
 *      igual (el POST sale con los $200): lo escrito a mano manda.
 *   C. «Antes de cerrar» lo nombra en la parte de ARREGLAR: cuántos, quiénes,
 *      cuánto, y el enlace a su fila del cuadro.
 *   D. 🔴 Los dos avisos salen de la MISMA función (`faltanteDeNeto`), y la
 *      simulación de la celda da EXACTAMENTE el neto que la ruta produciría:
 *      mira el neto que de verdad se paga, después de la cuota automática, del
 *      ajuste y del recorte — no uno intermedio.
 *   E. 🔴 CONTROL: un neto negativo NO frena el cierre — Daniel lo dejó afuera.
 *      ⚠️ Hasta el 15-sep-2026 esto se probaba como «`frenosParaCerrar` tiene UN
 *      solo freno»; ese día nació el segundo (el día con marcas impares) y el
 *      candado pasó a afirmar la CONDUCTA, con su propio control de que la lista
 *      de frenos son exactamente dos y no cualquier cosa.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import { ToastProvider } from "@/components/ToastSystem";
import PlanillaTab from "@/app/asistencia/PlanillaTab";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  HORAS_CERO,
  MANUALES_CERO,
  TOTALES_CERO,
  quincena,
  periodoDeQuincena,
  type DineroLinea,
  type LineaPlanilla,
  type ManualesLinea,
} from "@/lib/asistencia/planilla";
import {
  TITULO_NETO_NEGATIVO,
  avisoCeldaNeto,
  faltanteDeNeto,
  hrefFilaPlanilla,
  netoSiEscribe,
  netosNegativos,
  recortarAlNeto,
  textoAvisoCeldaNeto,
  textoNetosNegativos,
} from "@/lib/asistencia/neto-no-negativo";
import { aplicarPrestamoEnLinea, type SugerenciaPrestamo } from "@/lib/asistencia/prestamos-planilla";
import { armarAntesDeCerrar, type EntradaAntesDeCerrar } from "@/lib/asistencia/antes-de-cerrar";
import { frenosParaCerrar } from "@/lib/asistencia/planilla-guardada";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const sinComentarios = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── Andamiaje ────────────────────────────────────────────────────────────────
/** El caso real: bruto $74,84, sin seguros ni cuotas, neto $74,84. */
const DINERO = (o: Partial<DineroLinea> = {}): DineroLinea => ({
  rataHora: 1.44, valorMinuto: 0.024, salarioQuincenal: 74.84,
  extraDiurno: 0, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0,
  ausencias: 0, ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0, vacacionesYaPagadas: 0,
  tardanzas: 0, salidaTemprana: 0, totalBruto: 74.84, baseSeguros: null,
  seguroSocial: 0, seguroEducativo: 0, isr: 0, prestamo: 0, terceros: 0, mercancia: 0,
  totalDeducciones: 0, otrosServicios: 0, netoPagar: 74.84, ...o,
});
const MANUAL = (o: Partial<ManualesLinea> = {}): ManualesLinea => ({ ...MANUALES_CERO, ...o });
const SUG = (o: Partial<SugerenciaPrestamo> = {}): SugerenciaPrestamo => ({
  codigo: "56", etiqueta: "56", empresa: "confecciones_boston", empresaEtiqueta: "Confecciones Boston",
  nombrePrestamos: "56", cuota: 0, saldo: 0, sugerido: 0, origen: "cuota", enCasilla: 0,
  cuotaTerceros: 0, saldoTerceros: 0, sugeridoTerceros: 0, enCasillaTerceros: 0,
  cuotaDano: 0, saldoDano: 0, sugeridoDano: 0, enCasillaDano: 0, ...o,
});
const linea = (over: Partial<LineaPlanilla> = {}): LineaPlanilla => ({
  codigo: "56", etiqueta: "56", nombre: null, empresa: "confecciones_boston",
  empresaEtiqueta: "Confecciones Boston", salarioMensual: 149.68, jornadaSemanal: 48,
  horas: { ...HORAS_CERO }, faltaConfigurar: [], fueraDePlanilla: false, pagaSeguros: false,
  decidirAMano: null, quincenalReferencia: null, dinero: DINERO(),
  manuales: MANUAL(), ...over,
});
/**
 * Lo que la RUTA produce con un monto a mano: el motor escribe el manual en
 * `dinero` (mercancía 200 → neto −125,16), después entra la cuota automática
 * (`aplicarPrestamoEnLinea`) y al final el recorte (`recortarAlNeto`).
 */
function comoLaRuta(manuales: ManualesLinea, cuotaPrestamo = 0): LineaPlanilla {
  const ded = (manuales.isr ?? 0) + (manuales.prestamo ?? 0) + (manuales.terceros ?? 0) + (manuales.mercancia ?? 0);
  const base = linea({
    manuales,
    dinero: DINERO({
      isr: manuales.isr, prestamo: manuales.prestamo ?? 0, terceros: manuales.terceros ?? 0,
      mercancia: manuales.mercancia ?? 0, otrosServicios: manuales.otrosServicios,
      totalDeducciones: Math.round(ded * 100) / 100,
      netoPagar: Math.round((74.84 - ded + manuales.otrosServicios) * 100) / 100,
    }),
  });
  const con = aplicarPrestamoEnLinea(base, SUG({ sugerido: cuotaPrestamo, cuota: cuotaPrestamo, saldo: 500 }), true);
  return recortarAlNeto(con) as LineaPlanilla;
}

const ENTRADA: EntradaAntesDeCerrar = {
  periodoAbierto: null, esQuincena: true, rango: { desde: "2026-09-01", hasta: "2026-09-15" },
  extraSinAprobar: [], sinFicha: [], sinHorario: 0, corte: null, hasta: "2026-09-15",
  fueraPorBaja: 0, marcoDespuesDeIrse: 0, avisoRepartoRechazado: null, prestamoSinAtar: [],
  avisoPrestamo: null, avisoVacacionesNoPagadas: null, conSabado: 0, rangoLibre: false,
  factorBase: 1, diasCalendario: 15, migraciones: [], pestanaFichas: "Colaboradores",
};

// ═════════════════════════════════════════════════════════════════════════════
describe("D. 🔴 una sola decisión: `faltanteDeNeto`", () => {
  it("cero o más → nada; por debajo de cero → cuánto falta, en positivo", () => {
    expect(faltanteDeNeto(74.84)).toBeNull();
    expect(faltanteDeNeto(0)).toBeNull();
    expect(faltanteDeNeto(-0.004)).toBeNull(); // no es ni un centavo
    expect(faltanteDeNeto(-125.16)).toBe(125.16);
    expect(faltanteDeNeto(-0.01)).toBe(0.01);
  });

  it("la celda y «Antes de cerrar» pasan las dos por ella (barrido del módulo)", () => {
    const src = sinComentarios("src/lib/asistencia/neto-no-negativo.ts");
    const celda = src.slice(src.indexOf("export function avisoCeldaNeto("), src.indexOf("export function textoAvisoCeldaNeto("));
    const antes = src.slice(src.indexOf("export function netosNegativos("), src.indexOf("export function textoNetosNegativos("));
    expect(celda).toContain("faltanteDeNeto(");
    expect(antes).toContain("faltanteDeNeto(");
    // Y ninguna de las dos compara el neto con cero por su cuenta.
    expect(celda).not.toMatch(/netoPagar\s*<\s*0|neto\s*<\s*0/);
    expect(antes).not.toMatch(/netoPagar\s*<\s*0|neto\s*<\s*0/);
  });

  it("🔴 la simulación de la celda da EXACTAMENTE el neto que la ruta produce (caso 56)", () => {
    // Sin escribir nada, la línea como la trae la ruta.
    const antes = comoLaRuta(MANUAL());
    expect(antes.dinero!.netoPagar).toBe(74.84);
    // Lo que la celda predice al teclear 200 en mercancía…
    const sim = netoSiEscribe(antes, "mercancia", "200")!;
    // …y lo que la ruta produce con ese 200 guardado.
    const despues = comoLaRuta(MANUAL({ mercancia: 200 }));
    expect(despues.dinero!.netoPagar).toBe(-125.16);
    expect(sim.neto).toBe(despues.dinero!.netoPagar);
    expect(avisoCeldaNeto(antes, "mercancia", "200")!.faltante).toBe(netosNegativos([despues])[0].faltante);
  });

  it("🔴 y con una cuota automática en el medio, mira el neto DESPUÉS del recorte, no el intermedio", () => {
    // Préstamo de $40 que entra solo: neto $34,84.
    const antes = comoLaRuta(MANUAL(), 40);
    expect(antes.dinero!.netoPagar).toBe(34.84);
    // Escribir $200 de mercancía: la ruta recorta el préstamo entero ($40 → $0)
    // antes de dejar el neto en rojo, y queda −125,16, no −165,16.
    const despues = comoLaRuta(MANUAL({ mercancia: 200 }), 40);
    expect(despues.dinero!.netoPagar).toBe(-125.16);
    expect(despues.prestamoAutomatico?.recortado?.prestamo).toBe(40);
    const sim = netoSiEscribe(antes, "mercancia", "200")!;
    expect(sim.neto).toBe(-125.16);
    // El máximo cuenta con que el préstamo automático se corre: 34,84 + 40.
    expect(sim.maximo).toBe(74.84);
    // Y de vuelta: sobre la línea YA recortada, borrar la mercancía devuelve el préstamo y el neto sube a 34,84.
    expect(netoSiEscribe(despues, "mercancia", "")!.neto).toBe(34.84);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("A. la celda: máximo y faltante, en cualquier casilla a mano", () => {
  const l = linea();

  it("mercancía 200 sobre $74,84: «El máximo es $74.84. Le quedaría −$125.16.»", () => {
    const a = avisoCeldaNeto(l, "mercancia", "200");
    expect(a).toEqual({ maximo: 74.84, faltante: 125.16 });
    expect(textoAvisoCeldaNeto(a!)).toBe("El máximo es $74.84. Le quedaría −$125.16.");
    expect(TITULO_NETO_NEGATIVO).toMatch(/Se puede guardar igual/);
  });

  it("ISR también (100 → falta 25,16); terceros y préstamo escritos a mano, igual", () => {
    expect(avisoCeldaNeto(l, "isr", "100")).toEqual({ maximo: 74.84, faltante: 25.16 });
    expect(avisoCeldaNeto(l, "terceros", "80")).toEqual({ maximo: 74.84, faltante: 5.16 });
    expect(avisoCeldaNeto(l, "prestamo", "74.85")).toEqual({ maximo: 74.84, faltante: 0.01 });
  });

  it("justo el máximo, o menos, o vacía: sin aviso", () => {
    expect(avisoCeldaNeto(l, "mercancia", "74.84")).toBeNull();
    expect(avisoCeldaNeto(l, "mercancia", "50")).toBeNull();
    expect(avisoCeldaNeto(l, "mercancia", "")).toBeNull();
    expect(avisoCeldaNeto(l, "mercancia", "0")).toBeNull();
    expect(avisoCeldaNeto(l, "isr", "abc")).toBeNull();
  });

  it("acepta coma decimal, como el guardado (`valorTecleado`)", () => {
    expect(avisoCeldaNeto(l, "mercancia", "200,00")).toEqual({ maximo: 74.84, faltante: 125.16 });
  });

  it("avisa la casilla que LLEVA la plata: con la mercancía en 200 el ISR vacío no avisa, la mercancía sí", () => {
    const rojo = comoLaRuta(MANUAL({ mercancia: 200 }));
    expect(avisoCeldaNeto(rojo, "isr", "")).toBeNull();
    expect(avisoCeldaNeto(rojo, "mercancia", "200")).toEqual({ maximo: 74.84, faltante: 125.16 });
    // Si otra casilla ya dejó el neto en rojo, acá cabe $0.00 — nunca un máximo negativo.
    expect(avisoCeldaNeto(rojo, "isr", "10")).toEqual({ maximo: 0, faltante: 135.16 });
  });

  it("«Otros servicios» SUMA: avisa solo si bajarlo es lo que deja el neto en rojo", () => {
    // Deducciones 104,84 cubiertas con 50 de otros servicios: neto 20.
    const conOtros = comoLaRuta(MANUAL({ isr: 104.84, otrosServicios: 50 }));
    expect(conOtros.dinero!.netoPagar).toBe(20);
    expect(avisoCeldaNeto(conOtros, "otrosServicios", "0")).toEqual({ maximo: null, faltante: 30 });
    expect(textoAvisoCeldaNeto({ maximo: null, faltante: 30 })).toBe("Le quedaría −$30.00.");
    expect(avisoCeldaNeto(conOtros, "otrosServicios", "60")).toBeNull();
  });

  it("una línea sin dinero no tiene neto que cuidar", () => {
    expect(avisoCeldaNeto(linea({ dinero: null }), "mercancia", "200")).toBeNull();
    expect(netoSiEscribe(linea({ dinero: null }), "isr", "1")).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("C. «Antes de cerrar» lo nombra, en la parte de arreglar", () => {
  it("cuántos, quiénes, cuánto y el enlace a su fila", () => {
    const rojo = comoLaRuta(MANUAL({ mercancia: 200 }));
    const items = netosNegativos([linea(), rojo, linea({ dinero: null })]);
    expect(items).toEqual([{ codigo: "56", etiqueta: "56", faltante: 125.16 }]);
    expect(textoNetosNegativos(items)).toBe(
      "colaborador queda con neto negativo (56 · −$125.16): baja lo que le escribiste a mano en su fila",
    );
    expect(textoNetosNegativos([])).toBeNull();
    const a = armarAntesDeCerrar({ ...ENTRADA, netosNegativos: items });
    const l = a.arreglar.find((x) => x.clave === "neto-negativo");
    expect(l).toMatchObject({ numero: 1, tono: "arreglar", enlace: { rotulo: "Ver su fila ›", href: hrefFilaPlanilla("56") } });
    expect(l!.texto).toMatch(/^colaborador queda con neto negativo/);
    expect(a.todoListo).toBe(false);
    // Sin ninguno, la línea no existe.
    expect(armarAntesDeCerrar({ ...ENTRADA, netosNegativos: [] }).arreglar.some((x) => x.clave === "neto-negativo")).toBe(false);
    expect(armarAntesDeCerrar(ENTRADA).arreglar.some((x) => x.clave === "neto-negativo")).toBe(false);
  });

  it("con dos, en plural y con los dos nombres", () => {
    const dos = netosNegativos([
      comoLaRuta(MANUAL({ mercancia: 200 })),
      linea({ codigo: "10", etiqueta: "LUIS PARAJON", dinero: DINERO({ netoPagar: -1 }) }),
    ]);
    expect(textoNetosNegativos(dos)).toBe(
      "colaboradores quedan con neto negativo (56 · −$125.16 — LUIS PARAJON · −$1.00): baja lo que le escribiste a mano en sus filas",
    );
    expect(armarAntesDeCerrar({ ...ENTRADA, netosNegativos: dos }).arreglar.find((x) => x.clave === "neto-negativo"))
      .toMatchObject({ numero: 2, enlace: { rotulo: "Ver sus filas ›" } });
  });

  it("la pantalla lo pasa de las MISMAS líneas que dibuja la tabla, y la fila lleva su ancla", () => {
    const tab = sinComentarios("src/app/asistencia/PlanillaTab.tsx");
    expect(tab).toMatch(/netosNegativos: netosNegativos\(data\.lineas\)/);
    // La fila (escritorio) y la tarjeta (celular), las dos con el ancla.
    expect((tab.match(/data-fila-planilla=\{l\.codigo\}/g) ?? []).length).toBe(2);
    // Las cinco casillas a mano preguntan, en las dos formas.
    expect((tab.match(/avisoNeto=\{\(t\) => avisoCeldaNeto\(l, campo, t\)\}/g) ?? []).length).toBe(2);
    expect(tab).toContain('avisoNeto={(t) => avisoCeldaNeto(l, "otrosServicios", t)}');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("E. 🔴 CONTROL: el cierre NO se frena por un neto negativo", () => {
  /* 🩸 CAMBIÓ DE DIRECCIÓN EL 15-sep-2026, con motivo. Este caso exigía que
   * `frenosParaCerrar` tuviera UN SOLO freno (`tipo: "` una sola vez). Era un
   * proxy: lo que Daniel dejó afuera es el freno POR NETO NEGATIVO, no el
   * segundo freno en general. Ese día se sumó el del día hábil con un número
   * IMPAR de marcaciones (Daniel: *«frenan»*, ver `marcas-impares.ts`), así que
   * ahora son DOS tipos. Lo que este candado protege —el neto negativo avisa y
   * NO frena— se sigue probando igual, y con más fuerza: se afirma sobre la
   * conducta, no sobre cuántas veces aparece una cadena. */
  it("un neto negativo AVISA y NO frena — Daniel lo dejó afuera a propósito", () => {
    const rojo = comoLaRuta(MANUAL({ mercancia: 200 }));
    expect(rojo.dinero!.netoPagar).toBeLessThan(0);
    // 🔴 LA CONDUCTA: con el neto en rojo y sin nada más, el cierre no se frena.
    expect(frenosParaCerrar([rojo])).toEqual([]);
    const src = sinComentarios("src/lib/asistencia/planilla-guardada.ts");
    const cuerpo = src.slice(src.indexOf("export function frenosParaCerrar("), src.indexOf("export function textoFrenos("));
    // Y el que decide los frenos no mira el neto por ningún lado.
    expect(cuerpo).not.toMatch(/neto/i);
  });

  /* CONTROL de lo anterior: la lista de frenos NO se abrió a cualquier cosa.
   * Son exactamente dos, nombrados, y los dos existen en el tipo. Un tercero
   * que aparezca sin pasar por acá pone el build rojo. */
  it("los frenos son exactamente DOS: horas extra y marcas impares", () => {
    const src = sinComentarios("src/lib/asistencia/planilla-guardada.ts");
    const cuerpo = src.slice(src.indexOf("export function frenosParaCerrar("), src.indexOf("export function textoFrenos("));
    expect(cuerpo.match(/tipo: "/g)).toEqual(['tipo: "', 'tipo: "']);
    expect(cuerpo).toContain('tipo: "horas-extra"');
    expect(cuerpo).toContain('tipo: "marcas-impares"');
    expect(src).toMatch(/tipo: "horas-extra" \| "marcas-impares";/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LA PANTALLA DE VERDAD
// ═════════════════════════════════════════════════════════════════════════════
vi.mock("@/components/ui/RangoFechas", () => ({
  __esModule: true,
  default: ({ desde, hasta, vacio, onChange, accion }: {
    desde: string; hasta: string; vacio?: boolean;
    onChange: (d: string, h: string) => void;
    accion?: React.ReactNode;
  }) => (
    <div>
      <button type="button" onClick={() => onChange(desde, hasta)}>
        {vacio ? "Elige el período" : `${desde} – ${hasta}`}
      </button>
      {accion}
    </div>
  ),
}));

const Q = quincena(2026, 9, 1);

function respuesta(lineas: LineaPlanilla[]) {
  const neto = lineas.reduce((a, l) => a + (l.dinero?.netoPagar ?? 0), 0);
  return {
    quincena: Q, periodo: periodoDeQuincena(Q),
    empresa: "confecciones_boston", empresaEtiqueta: "Confecciones Boston",
    lineas,
    totales: { ...TOTALES_CERO, ...DINERO({ netoPagar: neto }), personas: lineas.length, decidirAMano: 0, sinConfigurar: 0 },
    reglas: REGLAS_DEFAULT,
    avisos: {
      faltaMigracionConfiguracion: null, faltaMigracionManual: null,
      faltaMigracionBajas: null, faltaMigracionServicioProfesional: null,
      fueraPorBaja: 0, marcoDespuesDeIrse: 0, sinHorario: 0, salidaAsumida: "17:00",
      horasAusenciaDefault: 8, conSabado: 0, periodoAbierto: null,
      sinFicha: [], avisoSinFicha: null, rangoLibre: false, factorBase: 1, diasCalendario: 15, correcciones: 0,
    },
    marcaciones: 100,
  };
}

/** La respuesta para todo lo que la pantalla pida; anota cada llamada. */
function servir(json: unknown) {
  const llamadas: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => json } as Response;
  }));
  return llamadas;
}
const montar = () => render(<ToastProvider><PlanillaTab /></ToastProvider>);
function elegirPeriodo() {
  fireEvent.click(screen.getAllByRole("button", { name: /Elige el período/ })[0]);
  fireEvent.click(screen.getAllByRole("button", { name: /^Generar$/ })[0]);
}
/** Las casillas a mano de la fila 56 del ESCRITORIO: isr · préstamo · terceros · mercancía · otros servicios. */
async function casillasDe56() {
  const fila = await waitFor(() => {
    const tr = document.querySelector('tr[data-fila-planilla="56"]');
    if (!tr) throw new Error("todavía no está la fila 56");
    return tr as HTMLElement;
  });
  const inputs = Array.from(fila.querySelectorAll('input[inputmode="decimal"]')) as HTMLInputElement[];
  expect(inputs.length).toBe(5);
  return { fila, isr: inputs[0], mercancia: inputs[3], otros: inputs[4] };
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("A + B. en la pantalla: avisa mientras se escribe, y NO bloquea", () => {
  it("tecla por tecla: con «20» nada; con «200» la celda se marca y dice el máximo y lo que quedaría", async () => {
    servir(respuesta([linea()]));
    montar();
    elegirPeriodo();
    const c = await casillasDe56();
    expect(c.fila.querySelector('[data-testid="neto-negativo"]')).toBeNull();

    fireEvent.change(c.mercancia, { target: { value: "20" } });
    expect(c.fila.querySelector('[data-testid="neto-negativo"]')).toBeNull();
    expect(c.mercancia.getAttribute("aria-invalid")).toBeNull();

    fireEvent.change(c.mercancia, { target: { value: "200" } });
    // Antes de salir del campo: no hubo blur ni guardado todavía.
    const aviso = c.fila.querySelector('[data-testid="neto-negativo"]');
    expect(aviso?.textContent).toBe("El máximo es $74.84. Le quedaría −$125.16.");
    expect(c.mercancia.getAttribute("aria-invalid")).toBe("true");
    expect(c.mercancia.title).toBe(TITULO_NETO_NEGATIVO);
    expect(c.mercancia.className).toMatch(/border-red-400/);
    // La otra casilla de la misma fila NO avisa: el aviso va donde está la plata.
    expect(c.fila.querySelectorAll('[data-testid="neto-negativo"]').length).toBe(1);

    // Y se va solo al corregirlo.
    fireEvent.change(c.mercancia, { target: { value: "70" } });
    expect(c.fila.querySelector('[data-testid="neto-negativo"]')).toBeNull();
  });

  it("el ISR también avisa al escribir", async () => {
    servir(respuesta([linea()]));
    montar();
    elegirPeriodo();
    const c = await casillasDe56();
    fireEvent.change(c.isr, { target: { value: "100" } });
    expect(c.fila.querySelector('[data-testid="neto-negativo"]')?.textContent).toBe("El máximo es $74.84. Le quedaría −$25.16.");
  });

  it("🔴 CONTROL: no bloquea — la celda sigue escribible y el monto se guarda igual (el POST lleva los $200)", async () => {
    const llamadas = servir(respuesta([linea()]));
    montar();
    elegirPeriodo();
    const c = await casillasDe56();
    fireEvent.change(c.mercancia, { target: { value: "200" } });
    expect(c.mercancia.disabled).toBe(false);
    expect(c.mercancia.value).toBe("200");
    fireEvent.blur(c.mercancia);
    await waitFor(() => {
      const post = llamadas.find((x) => x.url === "/api/asistencia/planilla" && x.init?.method === "POST");
      expect(post).toBeTruthy();
      const body = JSON.parse(String(post!.init!.body));
      expect(body).toMatchObject({ codigo: "56", mercancia: 200 });
    });
    // Y después de guardar el aviso sigue a la vista: lo escrito no se tocó.
    expect(c.fila.querySelector('[data-testid="neto-negativo"]')?.textContent).toBe("El máximo es $74.84. Le quedaría −$125.16.");
  });

  it("C. con el cuadro ya en rojo (la ruta lo trae así), «Antes de cerrar» lo nombra con su enlace y la celda lo sigue diciendo", async () => {
    servir(respuesta([comoLaRuta(MANUAL({ mercancia: 200 }))]));
    montar();
    elegirPeriodo();
    const c = await casillasDe56();
    expect(c.mercancia.value).toBe("200");
    expect(c.fila.querySelector('[data-testid="neto-negativo"]')?.textContent).toBe("El máximo es $74.84. Le quedaría −$125.16.");
    const lista = await screen.findByTestId("antes-de-cerrar");
    expect(lista.textContent).toMatch(/1 colaborador queda con neto negativo \(56 · −\$125\.16\)/);
    const enlace = Array.from(lista.querySelectorAll("a")).find((a) => a.textContent === "Ver su fila ›");
    expect(enlace?.getAttribute("href")).toBe(hrefFilaPlanilla("56"));
    // «Todo listo para cerrar» no se dice — pero el botón de cerrar NO se apaga por esto (el freno quedó afuera).
    expect(lista.textContent).not.toMatch(/Todo listo para cerrar/);
  });
});
