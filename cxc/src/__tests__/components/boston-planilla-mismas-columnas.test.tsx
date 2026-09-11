// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA PLANILLA DE DAVID ES LA MISMA QUE LA DE YULISSA (11-sep-2026) — PLATA.
//
// Tres cosas, y las tres pesan igual:
//
//   1. LAS COLUMNAS DE DINERO SALEN DE UN SOLO LUGAR. 🩸 El 10-sep la del grupo
//      pasó a 19 columnas con «Salida temprana» —una deducción real— y la de
//      Boston se quedó en 18: con alguien que saliera temprano, las columnas
//      visibles de David no daban el Total bruto ni el Neto. Ahora
//      `PlanillaTab` y `PlanillaBoston` leen `columnas-dinero-planilla.ts`.
//   2. EL CORTE ES EL MISMO. 🩸 Boston pedía la planilla SIN `corte` mientras el
//      grupo propone 13/28 y lo guarda al cerrar: para la MISMA quincena David
//      leía el reloj hasta el 15 y Yulissa hasta el 13. Ahora Boston manda el
//      guardado de la quincena cerrada, o el sugerido — y lo DICE en pantalla.
//   3. EL AJUSTE SE VE. Llega adentro de las columnas y el pie lo explica, con
//      el MISMO texto del grupo (`notaAjuste`).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import PlanillaBoston from "@/app/boston/tabs/PlanillaBoston";
import {
  CAMPOS_DINERO_PLANILLA, COLUMNAS_DINERO_PLANILLA, ROTULOS_DINERO_PLANILLA, montosDePlanilla,
} from "@/lib/asistencia/columnas-dinero-planilla";
import { corteParaBoston } from "@/lib/boston/planilla-corte";
import { corteInicial } from "@/lib/asistencia/elegir-quincena";
import { quincena } from "@/lib/asistencia/planilla";

vi.mock("@/components/ui/RangoFechas", () => ({
  __esModule: true,
  default: ({ desde, hasta, vacio, onChange }: { desde: string; hasta: string; vacio?: boolean; onChange: (d: string, h: string) => void }) => (
    <button type="button" onClick={() => onChange(desde, hasta)}>{vacio ? "Elige el período" : `${desde} – ${hasta}`}</button>
  ),
}));

// 🔑 `PLANILLA_UNIDA` se resuelve al IMPORTAR (`planilla-unida.ts`): el
// interruptor se prende ANTES de cualquier import (hoisted), no en un `beforeEach`.
vi.hoisted(() => { process.env.NEXT_PUBLIC_PLANILLA_UNIDA = "1"; });

const puro = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const DINERO = {
  rataHora: 0, valorMinuto: 0, salarioQuincenal: 261.74, extraDiurno: 2.83, ausencias: 2.31, tardanzas: 1.94,
  salidaTemprana: 11.83, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0, totalBruto: 248.49,
  ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0, vacacionesYaPagadas: 0, baseSeguros: null,
  seguroSocial: 24.23, seguroEducativo: 3.11, isr: 0, prestamo: 10, terceros: 0, mercancia: 0,
  totalDeducciones: 37.34, otrosServicios: 0, netoPagar: 211.15,
};
const horas = { extraDiurnoMin: 60, extraNocturnoMin: 0, tardanzaMin: 0, ausenciaMin: 0 };
const fila = (extra: Record<string, unknown> = {}) => ({
  codigo: "29", etiqueta: "ELOYN", nombre: "ELOYN", empresa: "confecciones_boston", empresaEtiqueta: "Confecciones Boston",
  jornadaSemanal: 48, horas, faltaConfigurar: [], fueraDePlanilla: false, noMarcaReloj: false, decidirAMano: null,
  extraMedido: null, extraNoAprobada: null, extraAprobada: true, dinero: DINERO, manuales: {}, salarioMensual: 550, ...extra,
});
const TOTALES = { personas: 1, fueraDePlanilla: 0, sinConfigurar: 0, decidirAMano: 0, ...DINERO };

/** La quincena en curso con `hoyPanama` congelado el 10-sep-2026 = 1–15 sep. */
const Q = quincena(2026, 9, 1);

function responder(planilla: Record<string, unknown>, guardada: Record<string, unknown> = { ok: true, cerrada: null }) {
  const llamadas: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    llamadas.push(String(url));
    const u = String(url);
    if (u.startsWith("/api/asistencia/planilla-guardada")) return { ok: true, status: 200, json: async () => guardada };
    return { ok: true, status: 200, json: async () => planilla };
  }) as unknown as typeof fetch);
  return llamadas;
}
const elegir = () => fireEvent.click(screen.getAllByRole("button", { name: /Elige el período/ })[0]);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-10T15:00:00Z"));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

// ═════════════════════════════════════════════════════════════════════════════
describe("1. 🔴 UNA lista de columnas de dinero para las dos planillas", () => {
  it("son 19, con «Salida temprana» entre Tardanzas y Extra 1.50", () => {
    expect(COLUMNAS_DINERO_PLANILLA).toHaveLength(19);
    expect(CAMPOS_DINERO_PLANILLA.indexOf("salidaTemprana")).toBe(CAMPOS_DINERO_PLANILLA.indexOf("tardanzas") + 1);
    expect(CAMPOS_DINERO_PLANILLA.indexOf("extraNocturno")).toBe(CAMPOS_DINERO_PLANILLA.indexOf("salidaTemprana") + 1);
    expect(ROTULOS_DINERO_PLANILLA).toContain("Salida\ntemprana");
    expect(ROTULOS_DINERO_PLANILLA.at(-1)).toBe("Neto a\npagar");
  });
  it("`montosDePlanilla` devuelve los 19 en ese orden, y una respuesta vieja sin salidaTemprana vale 0 ahí", () => {
    const m = montosDePlanilla(DINERO);
    expect(m).toHaveLength(19);
    expect(m[4]).toBe(11.83);
    expect(m.at(-1)).toBe(211.15);
    const { salidaTemprana: _s, ...vieja } = DINERO;
    expect(montosDePlanilla(vieja)[4]).toBe(0);
  });
  it("🔴 la planilla del GRUPO lee la lista: encabezados y pie, sin una copia escrita a mano", () => {
    const grupo = puro("src/app/asistencia/PlanillaTab.tsx");
    expect(grupo).toContain("ROTULOS_DINERO_PLANILLA.map((h) =>");
    expect(grupo).toContain("montosDePlanilla(data.totales).map(");
    expect(grupo).not.toContain('"Salida\\ntemprana"');
    expect(grupo).not.toContain("data.totales.salidaTemprana ?? 0, data.totales.extraNocturno");
  });
  it("🔴 y la de BOSTON dibuja EXACTAMENTE esa lista", async () => {
    responder({ empresaEtiqueta: "Confecciones Boston", lineas: [fila()], totales: TOTALES, avisos: {} });
    render(<PlanillaBoston />);
    elegir();
    await waitFor(() => expect(screen.getAllByRole("columnheader").length).toBeGreaterThan(5));
    const th = screen.getAllByRole("columnheader").map((e) => e.textContent);
    expect(th.slice(1)).toEqual([...ROTULOS_DINERO_PLANILLA]);
    const boston = puro("src/app/boston/tabs/PlanillaBoston.tsx");
    expect(boston).toContain("COLUMNAS_DINERO = COLUMNAS_DINERO_PLANILLA");
    expect(boston).toContain("montosDe = montosDePlanilla");
    // la salida temprana de Eloyn se ve, y el neto es el que da la planilla
    expect(screen.getAllByText("$11.83").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$211.15").length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("2. 🔴 el corte de Boston es el de la contadora", () => {
  it("sin cierre: el SUGERIDO — el mismo que `PlanillaTab` pone al elegir la quincena", () => {
    expect(corteParaBoston(Q.desde, Q.hasta, null, true)).toBe(corteInicial(Q));
    expect(corteParaBoston("2026-09-01", "2026-09-15", null, true)).toBe("2026-09-13");
    expect(corteParaBoston("2026-09-16", "2026-09-30", null, true)).toBe("2026-09-28");
  });
  it("con la quincena CERRADA con corte: ese corte, aunque no sea el sugerido", () => {
    expect(corteParaBoston("2026-09-01", "2026-09-15", "2026-09-12", true)).toBe("2026-09-12");
    // un corte guardado inválido (fuera de la quincena) no se cree
    expect(corteParaBoston("2026-09-01", "2026-09-15", "2026-09-20", true)).toBe("2026-09-13");
  });
  it("un rango que no es quincena no lleva corte; con el interruptor apagado, tampoco", () => {
    expect(corteParaBoston("2026-09-01", "2026-09-10", null, true)).toBeNull();
    expect(corteParaBoston("2026-09-01", "2026-09-15", null, false)).toBeNull();
  });
  it("🔴 la pantalla PIDE con ese corte, lo DICE arriba del cuadro, y pregunta primero qué hay cerrado", async () => {
    const llamadas = responder({ empresaEtiqueta: "Confecciones Boston", lineas: [fila()], totales: TOTALES, avisos: {}, corte: "2026-09-13" });
    render(<PlanillaBoston />);
    elegir();
    await waitFor(() => expect(screen.getAllByText("$211.15").length).toBeGreaterThan(0));
    const pedido = llamadas.find((u) => u.startsWith("/api/asistencia/planilla?"))!;
    expect(pedido).toContain("corte=2026-09-13");
    expect(pedido).not.toContain("empresa=");
    expect(llamadas.some((u) => u.startsWith("/api/asistencia/planilla-guardada?"))).toBe(true);
    expect(screen.getByTestId("corte-boston").textContent).toContain("Corte 13 sep");
  });
  it("🔴 si la quincena ya se cerró con OTRO corte, pide con ése (los números que se pagaron)", async () => {
    const llamadas = responder(
      { empresaEtiqueta: "Confecciones Boston", lineas: [fila()], totales: TOTALES, avisos: {}, corte: "2026-09-12" },
      { ok: true, cerrada: { id: "p1", estado: "cerrada", desde: "2026-09-01", hasta: "2026-09-15", corte: "2026-09-12" } },
    );
    render(<PlanillaBoston />);
    elegir();
    await waitFor(() => expect(llamadas.some((u) => u.startsWith("/api/asistencia/planilla?"))).toBe(true));
    expect(llamadas.find((u) => u.startsWith("/api/asistencia/planilla?"))).toContain("corte=2026-09-12");
  });
  it("y el servidor deja que David pregunte qué hay cerrado — forzándole Boston", () => {
    const ruta = puro("src/app/api/asistencia/planilla-guardada/route.ts");
    expect(ruta).toContain("requireAsistencia(req, [...asistenciaRoles(), ROL_BOSTON], MODULOS_PLANILLA)");
    expect(ruta).toContain('const empresa = deBoston ? EMPRESA_BOSTON : (sp.get("empresa") ?? "").trim();');
    expect(ruta).toContain("deBoston && cabecera.empresa !== EMPRESA_BOSTON");
    // cerrar y reabrir siguen siendo de quien cierra
    expect(ruta.match(/requireAsistencia\(req, cerrarPlanillaRoles\(\)\)/g)?.length).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("3. 🔴 el ajuste de la quincena anterior se ve, con el texto del grupo", () => {
  it("el pie lo dice y la celda lo repite en su title", async () => {
    responder({
      empresaEtiqueta: "Confecciones Boston", corte: "2026-09-13",
      lineas: [fila({ ajusteDetalle: { desde: "2026-08-29", hasta: "2026-08-31", reparto: { tardanzas: 1.94 } } })],
      totales: TOTALES, avisos: {},
    });
    render(<PlanillaBoston />);
    elegir();
    await waitFor(() => expect(screen.getAllByText("$211.15").length).toBeGreaterThan(0));
    expect(screen.getByTestId("ajuste-boston").textContent).toMatch(/Tardanzas incluye los días .*que la quincena anterior pagó sin medir/);
    const celda = screen.getAllByTitle(/Incluye \$1\.94 de los días/);
    expect(celda.length).toBeGreaterThan(0);
  });
});
