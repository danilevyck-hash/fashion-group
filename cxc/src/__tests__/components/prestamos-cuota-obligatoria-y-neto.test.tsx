/* ─────────────────────────────────────────────────────────────────────────────
 * LA CUOTA ES OBLIGATORIA, Y EL DESCUENTO NUNCA DEJA EL NETO EN NEGATIVO —
 * el candado (14-sep-2026).
 *
 * Daniel, textual, esa tarde:
 *   · *«a) La cuota es obligatoria: no te deja guardar sin ella»*
 *   · *«a) Que nunca pase del neto: descuenta lo que alcance y el resto queda
 *      debiendo»* — y aclaró que es una red de seguridad: *«si dañó 100, ella
 *      como persona normal pondrá 25 de cuota»*.
 *   · *«a) Déjalo a mano, como ahora»* (el ISR: no se toca).
 *
 * 🩸 QUÉ VINO A CERRAR. (1) El botón «Registrar» se encendía con monto y fecha;
 * sin cuota, el préstamo, el daño o el descuento a terceros no se descontaba
 * NUNCA solo — había que escribirlo a mano cada quincena, lo contrario de lo
 * que Daniel pidió. Y desde `/prestamos` (la puerta VIVA con la planilla unida
 * apagada) la cuota ni siquiera se preguntaba. (2) El motor calcula el neto sin
 * piso y `aplicarPrestamoEnLinea` restaba las cuotas sin mirar cuánto quedaba:
 * un neto negativo salía en la pantalla, el Excel y el comprobante, y el cierre
 * anotaba en Préstamos un pago de plata que nunca salió de ningún sueldo.
 * Medido el 14-sep-2026 contra producción: 31 fichas vivas, las 31 con cuota;
 * la más pesada es LUIS PARAJON, $70 sobre ~$262 de neto (27 %). Hoy nadie
 * está cerca — pero el daño de $1.261,50 que justificó la cuota existe.
 *
 * 🔴 LO QUE SE PROTEGE:
 *
 *   A. Sin cuota no se guarda, en los TRES conceptos que la llevan, y el botón
 *      apagado DICE qué falta («Falta: la cuota»).
 *   B. CONTROL: un Pago no pide cuota — exige «de dónde salió», nada más.
 *   C. El neto nunca queda en negativo: se descuenta lo que alcance, en el
 *      orden daño → terceros → préstamo (`ORDEN_DE_RECORTE`).
 *   D. CONTROL: lo escrito a mano NO se recorta — solo lo automático.
 *   E. El saldo no baja por lo que no se alcanzó a cobrar: el cierre anota
 *      solo lo que sí entró, y una cuota recortada a cero se dice como tal.
 *   F. Se DICE: en la celda, en «Antes de cerrar» y en la ruta, y la regla
 *      corre al FINAL (después de la cuota y del ajuste).
 *   G. Las tres puertas del formulario pasan la cuota actual (la lista vieja
 *      incluida) — sin eso el formulario no pregunta y no puede exigir.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import NuevoMovimientoModal from "@/app/prestamos/components/NuevoMovimientoModal";
import { queFaltaParaRegistrar, textoFaltaRegistrar } from "@/lib/prestamos-registrar";
import {
  ORDEN_DE_RECORTE,
  TITULO_RECORTE,
  cuotasRecortadas,
  recorteDeCasilla,
  recortarAlNeto,
  textoCuotasRecortadas,
  textoRecorteCelda,
} from "@/lib/asistencia/neto-no-negativo";
import {
  MANUALES_CERO,
  calcularDinero,
  type DineroLinea,
  type LineaPlanilla,
  type ManualesLinea,
} from "@/lib/asistencia/planilla";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { aplicarPrestamoEnLinea, type SugerenciaPrestamo } from "@/lib/asistencia/prestamos-planilla";
import { TEXTO_OMISION, planDeCierre, type DeudaDePersona } from "@/lib/asistencia/cierre-prestamo";
import { armarAntesDeCerrar, type EntradaAntesDeCerrar } from "@/lib/asistencia/antes-de-cerrar";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const sinComentarios = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

afterEach(() => cleanup());

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
  codigo: "10", etiqueta: "LUIS PARAJON", empresa: "vistana", empresaEtiqueta: "Vistana",
  nombrePrestamos: "LUIS PARAJON", cuota: 70, saldo: 770, sugerido: 70, origen: "cuota", enCasilla: 0,
  cuotaTerceros: 0, saldoTerceros: 0, sugeridoTerceros: 0, enCasillaTerceros: 0,
  cuotaDano: 0, saldoDano: 0, sugeridoDano: 0, enCasillaDano: 0, ...o,
});
const linea = (manuales: ManualesLinea, dinero: DineroLinea | null = DINERO(), codigo = "10", etiqueta = "LUIS PARAJON") =>
  ({ codigo, etiqueta, nombre: etiqueta, horas: {}, manuales, dinero }) as unknown as LineaPlanilla;

/** Una línea con las tres cuotas YA adentro (como sale de `aplicarPrestamoEnLinea`). */
function conCuotas(neto: number, auto: { prestamo?: number; terceros?: number; mercancia?: number }, manuales = MANUAL()) {
  const base = linea(manuales, DINERO({ netoPagar: neto }));
  const sug = SUG({ sugerido: auto.prestamo ?? 0, sugeridoTerceros: auto.terceros ?? 0, sugeridoDano: auto.mercancia ?? 0 });
  return aplicarPrestamoEnLinea(base, sug);
}

function montar(props: Partial<React.ComponentProps<typeof NuevoMovimientoModal>> = {}) {
  const utils = render(
    <NuevoMovimientoModal
      nombre="KEVIN LUBO" empleadoId="e1" saldoPrestamo={0} saldoDano={0} cuentaMasVieja={null}
      salarioMensual={600} hoy="2026-09-14"
      cuotaActual={{ prestamo: 0, terceros: 0, dano: 0 }}
      onCancelar={() => {}} onGuardar={async () => {}}
      {...props}
    />,
  );
  const numeros = () => Array.from(utils.container.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
  return {
    ...utils,
    monto: () => numeros()[0],
    cuota: () => numeros()[1] ?? null,
    boton: () => screen.getByRole("button", { name: "Registrar" }) as HTMLButtonElement,
    falta: () => screen.queryByTestId("falta-para-registrar"),
    concepto: (label: RegExp) => fireEvent.click(screen.getByRole("button", { name: label })),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
describe("A. 🔴 sin cuota no se guarda, y el botón dice qué falta", () => {
  it("préstamo con monto y fecha pero SIN cuota: el botón está apagado y dice «Falta: la cuota»", () => {
    const m = montar();
    fireEvent.change(m.monto(), { target: { value: "300" } });
    expect(m.boton().disabled).toBe(true);
    expect(m.falta()?.textContent).toBe("Falta: la cuota");
    expect(m.boton().title).toBe("Falta: la cuota");
  });

  it("con la cuota escrita, se enciende; con 0 sigue apagado (un 0 no es una cuota)", () => {
    const m = montar();
    fireEvent.change(m.monto(), { target: { value: "300" } });
    fireEvent.change(m.cuota()!, { target: { value: "0" } });
    expect(m.boton().disabled).toBe(true);
    fireEvent.change(m.cuota()!, { target: { value: "25" } });
    expect(m.boton().disabled).toBe(false);
    expect(m.falta()).toBeNull();
  });

  it("🔴 los TRES conceptos que llevan cuota la exigen: préstamo, daño de mercancía y terceros", () => {
    for (const c of [/Préstamo/, /Daño de mercancía/, /Descuento a terceros/]) {
      const m = montar();
      m.concepto(c);
      fireEvent.change(m.monto(), { target: { value: "100" } });
      expect(m.cuota(), String(c)).not.toBeNull();
      expect(m.boton().disabled, String(c)).toBe(true);
      expect(m.falta()?.textContent, String(c)).toBe("Falta: la cuota");
      cleanup();
    }
  });

  it("abre con la cuota que YA tiene la ficha: quien ya paga $50 no vuelve a teclearla", () => {
    const m = montar({ cuotaActual: { prestamo: 50, terceros: 0, dano: 0 } });
    fireEvent.change(m.monto(), { target: { value: "100" } });
    expect(m.cuota()!.value).toBe("50");
    expect(m.boton().disabled).toBe(false);
  });

  it("el rótulo lleva asterisco y la casilla no admite menos de un centavo", () => {
    const modal = sinComentarios("src/app/prestamos/components/NuevoMovimientoModal.tsx");
    expect(modal).toContain("Cuota por quincena ($) *");
    expect(modal).toMatch(/<input type="number" step="0\.01" min="0\.01" value=\{cuota\}/);
    // La decisión de «listo» sale del módulo puro, no de una condición a mano.
    expect(modal).toMatch(/const faltantes = queFaltaParaRegistrar\(\{ fecha, monto, cuota, pideCuota: preguntaCuota, esPago, origen \}\);/);
    expect(modal).toMatch(/const listo = faltantes\.length === 0 && !guardando;/);
    expect(modal).not.toMatch(/const listo = Number\(monto\) > 0/);
  });

  it("la regla pura: qué falta, en orden, y la frase con el patrón de Guías", () => {
    const base = { fecha: "2026-09-14", monto: "100", cuota: "", pideCuota: true, esPago: false, origen: "" };
    expect(queFaltaParaRegistrar(base)).toEqual(["cuota"]);
    expect(queFaltaParaRegistrar({ ...base, monto: "" })).toEqual(["monto", "cuota"]);
    expect(queFaltaParaRegistrar({ ...base, fecha: "", monto: "0" })).toEqual(["fecha", "monto", "cuota"]);
    expect(queFaltaParaRegistrar({ ...base, cuota: "25" })).toEqual([]);
    expect(queFaltaParaRegistrar({ ...base, cuota: "0" })).toEqual(["cuota"]);
    expect(queFaltaParaRegistrar({ ...base, cuota: "-5" })).toEqual(["cuota"]);
    expect(queFaltaParaRegistrar({ ...base, cuota: "abc" })).toEqual(["cuota"]);
    expect(textoFaltaRegistrar(["cuota"])).toBe("Falta: la cuota");
    expect(textoFaltaRegistrar(["monto", "cuota"])).toBe("Falta: el monto y la cuota");
    expect(textoFaltaRegistrar(["fecha", "monto", "cuota"])).toBe("Falta: la fecha, el monto y la cuota");
    expect(textoFaltaRegistrar([])).toBe("");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("B. CONTROL: un Pago no pide cuota", () => {
  it("en un pago no hay casilla de cuota, y lo que se exige es «de dónde salió»", () => {
    const m = montar({ saldoPrestamo: 100 });
    m.concepto(/Pago/);
    fireEvent.change(m.monto(), { target: { value: "50" } });
    expect(m.cuota()).toBeNull();
    expect(m.boton().disabled).toBe(true);
    expect(m.falta()?.textContent).toBe("Falta: de dónde salió el pago");
    fireEvent.click(screen.getByRole("button", { name: "Liquidación" }));
    expect(m.boton().disabled).toBe(false);
    expect(m.falta()).toBeNull();
  });

  it("la regla pura: con `esPago`, la cuota nunca cuenta como faltante, aunque `pideCuota` venga en true", () => {
    const pago = { fecha: "2026-09-14", monto: "50", cuota: "", pideCuota: true, esPago: true, origen: "" };
    expect(queFaltaParaRegistrar(pago)).toEqual(["origen"]);
    expect(queFaltaParaRegistrar({ ...pago, origen: "Efectivo" })).toEqual([]);
    expect(textoFaltaRegistrar(["origen"])).toBe("Falta: de dónde salió el pago");
  });

  it("y sin `cuotaActual` (nadie preguntó la cuota) no se exige: el formulario no puede pedir lo que no muestra", () => {
    const m = montar({ cuotaActual: null });
    fireEvent.change(m.monto(), { target: { value: "100" } });
    expect(m.cuota()).toBeNull();
    expect(m.boton().disabled).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("C. 🔴 el neto nunca queda en negativo: se descuenta lo que alcance", () => {
  it("🩸 hoy SÍ podía: el motor no tiene piso y la cuota se resta sin mirar el neto", () => {
    // Un ISR a mano mayor que el bruto: el motor devuelve negativo.
    const d = calcularDinero(523.47, 40, { extra125: 0 } as never, MANUAL({ isr: 600 }), REGLAS_DEFAULT)!;
    expect(d.netoPagar).toBeLessThan(0);
    // Y una cuota de daño de $150 sobre un neto de $120 lo deja en −$30.
    const sinRed = conCuotas(120, { mercancia: 150 });
    expect(sinRed.dinero!.netoPagar).toBe(-30);
    // Con la red: $120 de los $150, y el neto en 0.
    const conRed = recortarAlNeto(sinRed);
    expect(conRed.dinero!.netoPagar).toBe(0);
    expect(conRed.dinero!.mercancia).toBe(120);
    expect(conRed.prestamoAutomatico).toEqual({ prestamo: 0, terceros: 0, mercancia: 120, recortado: { prestamo: 0, terceros: 0, mercancia: 30 } });
  });

  it("🔴 el orden del recorte: primero el daño, después terceros, el préstamo al final", () => {
    expect(ORDEN_DE_RECORTE).toEqual(["mercancia", "terceros", "prestamo"]);
    // Neto $40, cuotas 70 + 20 + 50 = 140 → falta $100: daño 50, terceros 20, préstamo 30.
    const l = recortarAlNeto(conCuotas(40, { prestamo: 70, terceros: 20, mercancia: 50 }));
    expect(l.dinero!.netoPagar).toBe(0);
    expect(l.dinero).toMatchObject({ prestamo: 40, terceros: 0, mercancia: 0, totalDeducciones: 40 });
    expect(l.prestamoAutomatico).toEqual({ prestamo: 40, terceros: 0, mercancia: 0, recortado: { prestamo: 30, terceros: 20, mercancia: 50 } });
  });

  it("si el daño alcanza para cubrir el hueco, el préstamo no se toca", () => {
    // Neto $100, cuotas 70 + 50 = 120 → falta $20: sale SOLO del daño.
    const l = recortarAlNeto(conCuotas(100, { prestamo: 70, mercancia: 50 }));
    expect(l.dinero!.netoPagar).toBe(0);
    expect(l.dinero!.prestamo).toBe(70);
    expect(l.dinero!.mercancia).toBe(30);
    expect(l.prestamoAutomatico!.recortado).toEqual({ prestamo: 0, terceros: 0, mercancia: 20 });
  });

  it("con el neto en cero o más no se toca nada: misma referencia", () => {
    const justo = conCuotas(70, { prestamo: 70 });
    expect(justo.dinero!.netoPagar).toBe(0);
    expect(recortarAlNeto(justo)).toBe(justo);
    const sobra = conCuotas(260, { prestamo: 70 });
    expect(recortarAlNeto(sobra)).toBe(sobra);
    // Sin dinero (servicio profesional, «Tú decides») ni sugerencia: tal cual.
    const sinDinero = linea(MANUAL(), null);
    expect(recortarAlNeto(sinDinero)).toBe(sinDinero);
    const sinCuota = linea(MANUAL(), DINERO({ netoPagar: -10 }));
    expect(recortarAlNeto(sinCuota)).toBe(sinCuota);
  });

  it("todo a centavos: $33,33 de neto y cuota de $70 → se descuentan $33,33 y quedan $36,67", () => {
    const l = recortarAlNeto(conCuotas(33.33, { prestamo: 70 }));
    expect(l.dinero!.netoPagar).toBe(0);
    expect(l.dinero!.prestamo).toBe(33.33);
    expect(l.prestamoAutomatico!.recortado!.prestamo).toBe(36.67);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("D. CONTROL: lo escrito a mano NO se recorta", () => {
  it("un neto negativo hecho SOLO de montos a mano se queda como está (misma referencia)", () => {
    // La contadora escribió $300 de préstamo sobre $260 de neto: decisión humana.
    const aMano = linea(MANUAL({ prestamo: 300 }), DINERO({ prestamo: 300, totalDeducciones: 300, netoPagar: -40 }));
    const con = aplicarPrestamoEnLinea(aMano, SUG({ sugerido: 70 }));
    expect(con).toBe(aMano); // lo escrito manda: la cuota no entró
    expect(recortarAlNeto(con)).toBe(con);
    expect(con.dinero!.netoPagar).toBe(-40);
  });

  it("con un monto a mano Y una cuota automática, solo se achica la automática — y el neto puede seguir negativo", () => {
    // Préstamo $300 a mano (neto −40) + daño automático $20 → se recorta el
    // daño entero; el préstamo escrito no se toca y quedan −$20, que son de ella.
    const base = linea(MANUAL({ prestamo: 300 }), DINERO({ prestamo: 300, totalDeducciones: 300, netoPagar: -40 }));
    const con = aplicarPrestamoEnLinea(base, SUG({ sugerido: 70, sugeridoDano: 20 }));
    expect(con.dinero!.netoPagar).toBe(-60);
    const r = recortarAlNeto(con);
    expect(r.dinero!.prestamo).toBe(300);
    expect(r.dinero!.mercancia).toBe(0);
    expect(r.dinero!.netoPagar).toBe(-40);
    expect(r.prestamoAutomatico!.recortado).toEqual({ prestamo: 0, terceros: 0, mercancia: 20 });
    // Y `manuales` sigue siendo la foto de la tabla.
    expect(r.manuales).toEqual(MANUAL({ prestamo: 300 }));
  });

  it("el ISR sigue a mano y entra al neto como siempre: el recorte lo respeta, no lo toca", () => {
    const con = conCuotas(50, { prestamo: 70 }, MANUAL({ isr: 40 }));
    const r = recortarAlNeto(con);
    expect(r.manuales.isr).toBe(40);
    expect(r.dinero!.isr).toBe(con.dinero!.isr);
    expect(r.dinero!.prestamo).toBe(50);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("E. 🔴 el saldo no baja por lo que no se alcanzó a cobrar", () => {
  const deuda = (o: Partial<DeudaDePersona> & { codigo: string }): DeudaDePersona => ({
    fichaId: `f-${o.codigo}`, nombrePrestamos: "X",
    saldoPrestamo: 770, saldoDano: 0, saldoTerceros: 0, cuotaPrestamo: 70, cuotaTerceros: 0,
    yaDescontado: 0, yaDescontadoTerceros: 0, yaDescontadoDano: 0, ...o,
  });

  it("recorte PARCIAL: el cierre anota como pago lo que SÍ entró ($40), no la cuota ($70)", () => {
    const l = recortarAlNeto(conCuotas(40, { prestamo: 70 }));
    const plan = planDeCierre({ lineas: [l], deudas: new Map([["10", deuda({ codigo: "10" })]]), fecha: "2026-09-15" });
    expect(plan.pagos).toHaveLength(1);
    expect(plan.pagos[0]).toMatchObject({ cuenta: "prestamo", monto: 40 });
    expect(plan.total).toBe(40);
  });

  it("recorte a CERO: no se anota pago, y se dice que el neto no alcanzó (no «casilla en cero»)", () => {
    // Neto $0 con cuota de daño $25 → el daño se recorta entero.
    const l = recortarAlNeto(conCuotas(0, { mercancia: 25 }));
    expect(l.dinero!.mercancia).toBe(0);
    const plan = planDeCierre({
      lineas: [l], deudas: new Map([["10", deuda({ codigo: "10", saldoPrestamo: 0, saldoDano: 254.5 })]]), fecha: "2026-09-15",
    });
    expect(plan.pagos).toHaveLength(0);
    expect(plan.omisiones).toEqual([{ codigo: "10", etiqueta: "LUIS PARAJON", monto: 0, motivo: "neto-no-alcanzo" }]);
    expect(TEXTO_OMISION["neto-no-alcanzo"]).toMatch(/sigue debiendo/);
  });

  it("y el módulo del recorte no calcula ningún saldo: solo mueve la casilla", () => {
    const puro = sinComentarios("src/lib/asistencia/neto-no-negativo.ts");
    expect(puro).not.toMatch(/saldo[A-Z]|calcularSaldo|prestamos-saldo/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("F. 🔴 se dice en pantalla, y la regla corre al final de la ruta", () => {
  it("la celda: «Se descontó $40.00 de los $70.00 de cuota; el resto queda debiendo»", () => {
    const l = recortarAlNeto(conCuotas(40, { prestamo: 70 }));
    const r = recorteDeCasilla(l, "prestamo");
    expect(r).toEqual({ propuesto: 70, descontado: 40 });
    expect(textoRecorteCelda(r!)).toBe("Se descontó $40.00 de los $70.00 de cuota; el resto queda debiendo");
    expect(recorteDeCasilla(l, "mercancia")).toBeNull();
    expect(TITULO_RECORTE).toMatch(/próxima quincena/);
  });

  it("«Antes de cerrar» lo lista con nombre, cuenta y montos, en ámbar (es plata)", () => {
    const l = recortarAlNeto(conCuotas(40, { prestamo: 70, mercancia: 50 }));
    const items = cuotasRecortadas([l]);
    expect(items).toEqual([
      { codigo: "10", etiqueta: "LUIS PARAJON", cuenta: "mercancia", propuesto: 50, descontado: 0 },
      { codigo: "10", etiqueta: "LUIS PARAJON", cuenta: "prestamo", propuesto: 70, descontado: 40 },
    ]);
    expect(textoCuotasRecortadas(items)).toBe(
      "cuotas recortadas para que el neto no quede en negativo (LUIS PARAJON · daño de mercancía $0.00 de $50.00 — LUIS PARAJON · préstamo $40.00 de $70.00); el resto queda debiendo",
    );
    expect(textoCuotasRecortadas([])).toBeNull();
    const entrada: EntradaAntesDeCerrar = {
      periodoAbierto: null, esQuincena: true, rango: null, extraSinAprobar: [], sinFicha: [], sinHorario: 0,
      corte: null, hasta: "2026-09-15", fueraPorBaja: 0, marcoDespuesDeIrse: 0, avisoRepartoRechazado: null,
      prestamoSinAtar: [], avisoPrestamo: null, avisoVacacionesNoPagadas: null, conSabado: 0, rangoLibre: false,
      factorBase: 1, diasCalendario: 15, migraciones: [], pestanaFichas: "Colaboradores", recortadas: items,
    };
    const a = armarAntesDeCerrar(entrada);
    const l2 = a.info.find((x) => x.clave === "recortadas");
    expect(l2).toMatchObject({ numero: 2, tono: "plata" });
    expect(l2!.texto).toMatch(/^cuotas recortadas/);
    expect(a.todoListo).toBe(true); // no frena el cierre: es información
    expect(armarAntesDeCerrar({ ...entrada, recortadas: [] }).info.some((x) => x.clave === "recortadas")).toBe(false);
  });

  it("la pantalla pasa las recortadas de las MISMAS líneas y la celda lleva el texto visible", () => {
    const tab = sinComentarios("src/app/asistencia/PlanillaTab.tsx");
    expect(tab).toMatch(/recortadas: cuotasRecortadas\(data\.lineas\)/);
    expect(tab).toMatch(/data-testid="cuota-recortada"/);
    expect(tab).toContain("{textoRecorteCelda(recorte)}");
    // Las dos formas (fila y tarjeta) reciben el recorte.
    expect((tab.match(/recorte=\{recorteDe\(l, campo\)\}/g) ?? []).length).toBe(2);
  });

  it("🔴 la ruta recorta AL FINAL: después de la cuota y del ajuste, antes de responder", () => {
    const ruta = sinComentarios("src/app/api/asistencia/planilla/route.ts");
    const cuota = ruta.indexOf("aplicarPrestamoEnLinea(l, sugerenciaDe.get(l.codigo))");
    const ajuste = ruta.indexOf("aplicarAjusteEnLinea(");
    const recorte = ruta.indexOf("lineasFinal = lineasFinal.map((l) => recortarAlNeto(l));");
    const respuesta = ruta.indexOf("totales: totalizar(lineasFinal)");
    expect(cuota).toBeGreaterThan(0);
    expect(ajuste).toBeGreaterThan(cuota);
    expect(recorte).toBeGreaterThan(ajuste);
    expect(respuesta).toBeGreaterThan(recorte);
    expect((ruta.match(/recortarAlNeto\(/g) ?? []).length).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("G. las tres puertas del formulario pasan la cuota actual", () => {
  it("la lista vieja (`/prestamos`), la pestaña y la ficha: las tres con `cuotaActual`", () => {
    const lista = sinComentarios("src/app/prestamos/PrestamosClient.tsx");
    expect(lista).toMatch(/cuotaActual=\{\{\s*prestamo: filas\.find\(\(f\) => f\.id === personaElegida\.fichaId\)\?\.cuotaPrestamo \?\? 0,/);
    expect(lista).toMatch(/dano: filas\.find\(\(f\) => f\.id === personaElegida\.fichaId\)\?\.cuotaDano \?\? 0,/);
    expect(sinComentarios("src/app/asistencia/PrestamosTab.tsx")).toMatch(/dano: filaDelModulo\?\.cuotaDano \?\? 0/);
    expect(sinComentarios("src/app/prestamos/[id]/page.tsx")).toMatch(/dano: Number\(empleado\.deduccion_dano \?\? 0\)/);
  });

  it("ninguno de los dos módulos nuevos va con voseo", () => {
    for (const p of ["src/lib/prestamos-registrar.ts", "src/lib/asistencia/neto-no-negativo.ts"]) {
      expect(sinComentarios(p), p).not.toMatch(/\b(acá|tenés|podés|elegí|escribí|vos)\b/i);
    }
  });
});
