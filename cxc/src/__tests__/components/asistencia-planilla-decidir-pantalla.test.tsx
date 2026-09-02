/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LOS TRES ARREGLOS, EN LA PANTALLA DE VERDAD.
 *
 * 🔴 POR QUÉ ESTE ARCHIVO EXISTE. Que `grupoDeLinea()` devuelva "decidir" no
 * prueba NADA sobre lo que la contadora ve: la pantalla podía seguir pintando
 * todo en la misma bolsa ámbar —«falta configurarles algo… se arreglan en
 * Configuración»— y todos los tests de función pura seguirían en verde. Acá se
 * RENDERIZA `PlanillaTab` con una respuesta de la API y se leen los renglones.
 *
 * Lo que se sostiene:
 *   1. el aviso del período sin terminar se ve ARRIBA, sin abrir nada;
 *   2. RODRIGO y ELOYN salen en «Tú decides», con el motivo y el quincenal
 *      que les correspondería, y NO se les manda a Configuración;
 *   3. quien de verdad tiene un dato faltante SIGUE en ámbar y SIGUE mandando
 *      a Configuración — partir la bolsa no puede tapar los pendientes reales;
 *   4. el código sin ficha se dice UNA vez arriba y no aparece en el cuadro.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  HORAS_CERO,
  TOTALES_CERO,
  MANUALES_CERO,
  quincena,
  periodoDeQuincena,
  type LineaPlanilla,
} from "@/lib/asistencia/planilla";
import PlanillaTab from "@/app/asistencia/PlanillaTab";


// ─────────────────────────────────────────────────────────────────────────────
// DOBLE DEL SELECTOR DE RANGO.
//
// 🔴 Desde el 1-sep-2026 la planilla abre VACÍA: no pide nada hasta que alguien
// elige el período (*«la quincena se paga según el rango de fecha
// seleccionado»*). Estos casos necesitan datos, así que primero eligen.
//
// 🩸 Va un doble y no el control real porque el control carga el calendario con
// `dynamic()`, y bajo vitest eso NO resuelve: el diálogo abre y no hay un solo
// `data-day` que tocar. Su conducta —ancla, cierre, orden invertido— se prueba
// sobre el componente real en `rango-fechas-calendario.test.tsx`.
vi.mock("@/components/ui/RangoFechas", () => ({
  __esModule: true,
  // 🔴 `accion` se DIBUJA: el control real, en modo `inline`, pone en su pie el
  // botón que le pasan —el «Generar» de la planilla—. Un doble que lo tirara
  // dejaría la pantalla sin forma de pedir el cuadro.
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

const Q = quincena(2026, 8, 1);

const linea = (over: Partial<LineaPlanilla>): LineaPlanilla => ({
  codigo: "0", etiqueta: "—", nombre: null, empresa: "confecciones_boston",
  empresaEtiqueta: "Confecciones Boston", salarioMensual: 600, jornadaSemanal: 48,
  horas: { ...HORAS_CERO }, faltaConfigurar: [], fueraDePlanilla: false, pagaSeguros: true,
  decidirAMano: null, quincenalReferencia: null, dinero: null,
  manuales: { ...MANUALES_CERO }, ...over,
});

const dinero = {
  rataHora: 2.88, valorMinuto: 0.048, salarioQuincenal: 300,
  extraDiurno: 0, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0,
  ausencias: 0, ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0,
  tardanzas: 0, totalBruto: 300, seguroSocial: 29.25,
  seguroEducativo: 3.75, isr: 0, prestamo: 0, terceros: 0, mercancia: 0,
  totalDeducciones: 33, otrosServicios: 0, netoPagar: 267,
};

/** La respuesta REAL de la ruta, con los cuatro casos que Daniel pidió ver. */
function respuesta(over: Partial<Record<string, unknown>> = {}) {
  return {
    quincena: Q,
    periodo: periodoDeQuincena(Q),
    empresa: "confecciones_boston",
    empresaEtiqueta: "Confecciones Boston",
    lineas: [
      linea({ codigo: "22", etiqueta: "ALEJANDRA CAMAÑO", dinero }),
      linea({
        codigo: "54", etiqueta: "YEISHKA IRENE DIAZ MARKHAM",
        decidirAMano: "entró el 10 de agosto de 2026", quincenalReferencia: 300,
      }),
      linea({
        codigo: "13", etiqueta: "RODRIGO MIRANDA",
        decidirAMano: "Trabajo fuera de la oficina del 1 ago 2026 al 13 ago 2026",
        quincenalReferencia: 400,
      }),
      linea({
        codigo: "29", etiqueta: "ELOYN MENDOZA",
        decidirAMano: "Vacaciones del 16 jul 2026 al 13 ago 2026", quincenalReferencia: 283.26,
      }),
      linea({ codigo: "99", etiqueta: "SIN SALARIO", faltaConfigurar: ["falta el salario"] }),
    ],
    totales: { ...TOTALES_CERO, ...dinero, personas: 1, decidirAMano: 3, sinConfigurar: 1 },
    reglas: REGLAS_DEFAULT,
    avisos: {
      faltaMigracionConfiguracion: null, faltaMigracionManual: null,
      faltaMigracionBajas: null, faltaMigracionServicioProfesional: null,
      fueraPorBaja: 0, marcoDespuesDeIrse: 0, sinHorario: 0, salidaAsumida: "17:00",
      horasAusenciaDefault: 8, conSabado: 0,
      periodoAbierto: {
        diasHabiles: 1,
        texto: "Esta quincena todavía no termina — falta 1 día hábil. Los días que no pasaron no se cuentan.",
      },
      sinFicha: [{ codigo: "50", marcaciones: 53 }],
      avisoSinFicha:
        "1 código marcó 53 veces y no tiene ficha (código 50). "
        + "Hasta saber quién es, no se le puede calcular pago.",
      rangoLibre: false, factorBase: 1, diasCalendario: 15,
      correcciones: 0,
    },
    marcaciones: 1111,
    ...over,
  };
}

function servir(json: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => json }) as Response));
}
const montar = () => render(<ToastProvider><PlanillaTab /></ToastProvider>);

// 🔴 LA PLANILLA ABRE VACÍA (1-sep-2026), así que ningún caso de este archivo
// recibe datos por el solo hecho de montar: primero hay que hacer lo que hace
// la persona, que es ELEGIR el período. El doble contesta con el rango que ya
// tiene puesto, que es la quincena en curso.
//
// 🩸 `getAllByRole(...)[0]`, no `getByRole`: en jsdom no hay Tailwind, así que
// las vistas `lg:hidden` y `hidden lg:block` se montan LAS DOS y `getByRole`
// revienta con «Found multiple elements».
function elegirPeriodo() {
  fireEvent.click(screen.getAllByRole("button", { name: /Elige el período/ })[0]);
  // 🔴 Y GENERAR (4-sep-2026): elegir el período ya no pide el cuadro solo. El
  // flujo que aprobó Daniel es elegir → Generar → revisar → Cerrar.
  fireEvent.click(screen.getAllByRole("button", { name: /^Generar$/ })[0]);
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 arreglo 1 · el aviso del período sin terminar se ve arriba", () => {
  it("dice cuántos días hábiles faltan y que los que no pasaron no se cuentan", async () => {
    servir(respuesta());
    montar();
    elegirPeriodo();
    expect(
      await screen.findByText(/Esta quincena todavía no termina — falta 1 día hábil/),
    ).toBeTruthy();
    expect(screen.getByText(/Los días que no pasaron no se cuentan/)).toBeTruthy();
  });

  it("y no se muestra cuando el período ya cerró", async () => {
    const r = respuesta();
    (r.avisos as Record<string, unknown>).periodoAbierto = null;
    servir(r);
    montar();
    elegirPeriodo();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    expect(screen.queryByText(/todavía no termina/)).toBeNull();
  });
});

// El rótulo decía «Decidilo vos» hasta el 1-sep-2026; se renombró a «Tú decides» porque era voseo y el sistema habla tuteo neutro (candado `nada-de-voseo`).
describe("🔴 arreglo 2 y 3 · «Tú decides» es su propio grupo, en gris", () => {
  it("RODRIGO sale con su motivo escrito y con el quincenal que le tocaría", async () => {
    servir(respuesta());
    montar();
    elegirPeriodo();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    const fila = screen.getAllByText(
      /Trabajo fuera de la oficina del 1 ago 2026 al 13 ago 2026/,
    )[0];
    expect(fila).toBeTruthy();
    expect(fila.textContent).toContain("400.00");
  });

  it("YEISHKA sale con «entró el 10 de agosto» y SIN un neto calculado", async () => {
    servir(respuesta());
    montar();
    elegirPeriodo();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    const fila = screen.getAllByText(/entró el 10 de agosto de 2026/)[0];
    expect(fila.textContent).toContain("300.00");
    // 🔴 Ni $133,34 ni ningún otro número inventado en su renglón.
    expect(fila.textContent).not.toContain("133");
  });

  it("🔴 a los de «Tú decides» NO se les manda a Configuración", async () => {
    servir(respuesta());
    montar();
    elegirPeriodo();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    const resumen = screen.getByText(/Tú decides:/).parentElement!;
    expect(resumen.textContent).toContain("no hay nada que arreglar");
    expect(resumen.textContent).not.toContain("Configuración");
    // El camino para pagarles sí se dice: el rango de fechas, que ya existe.
    expect(resumen.textContent).toContain("Rango de fechas");
  });

  it("🔴 y NO se les llama «falta configurar» en ningún lado de su renglón", async () => {
    servir(respuesta());
    montar();
    elegirPeriodo();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    for (const t of ["RODRIGO MIRANDA", "ELOYN MENDOZA", "YEISHKA IRENE DIAZ MARKHAM"]) {
      const fila = screen.getAllByText(new RegExp(t))[0].closest("tr, div")!;
      expect(fila.textContent).not.toContain("falta configurar");
    }
  });

  it("🔑 pero el pendiente DE VERDAD sigue en ámbar y sigue mandando a Configuración", async () => {
    servir(respuesta());
    montar();
    elegirPeriodo();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    const resumen = screen.getByText(/Falta un dato:/).parentElement!;
    expect(resumen.textContent).toContain("Configuración");
    expect(screen.getAllByText(/falta configurar — falta el salario/).length).toBeGreaterThan(0);
  });

  it("los dos grupos existen a la vez y no se pisan", async () => {
    servir(respuesta());
    montar();
    elegirPeriodo();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    expect(screen.getByText(/Tú decides:/)).toBeTruthy();
    expect(screen.getByText(/Falta un dato:/)).toBeTruthy();
  });
});

describe("🔴 arreglo 3 · el código sin ficha, una sola vez y fuera del cuadro", () => {
  it("el aviso está arriba y dice que no se le puede calcular pago", async () => {
    servir(respuesta());
    montar();
    elegirPeriodo();
    const aviso = await screen.findByText(/1 código marcó 53 veces y no tiene ficha/);
    expect(aviso.textContent).toContain("no se le puede calcular pago");
    expect(aviso.textContent).toContain("Configuración");
  });

  it("🔴 y aparece UNA sola vez en toda la pantalla, no una por empresa", async () => {
    servir(respuesta());
    montar();
    elegirPeriodo();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    expect(screen.getAllByText(/no tiene ficha \(código 50\)/)).toHaveLength(1);
    // Y no quedó ninguna fila suya adentro del cuadro.
    expect(screen.queryByText(/sin ficha en Configuración/)).toBeNull();
  });
});
