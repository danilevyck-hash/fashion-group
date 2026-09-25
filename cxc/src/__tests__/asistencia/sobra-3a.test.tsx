/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 «3a · LO QUE SOBRA» EN ASISTENCIA (25-sep-2026) — el candado
 *
 * Daniel aprobó quitar DOS cosas de la pantalla. Las dos ya se dicen en otro
 * lado; ninguna se borra de la base y ningún número se mueve.
 *
 *   1. **Préstamos › Movimientos** tenía su propia lista desplegable de **24
 *      quincenas** (`CUANTAS_QUINCENAS = 24`), la CUARTA forma de elegir
 *      período del módulo. Manda el selector único de arriba, y la lista ya no
 *      existe ni apagada.
 *   2. **Colaboradores** abría con la franja amarilla «1 colaborador de 44
 *      todavía no sale en la planilla». 🔑 **El dato no se pierde**: sale igual
 *      en «Antes de cerrar», en la Planilla, como «código del reloj sin ficha»
 *      —que es donde de verdad frena el cierre—. `avisoPendientes` sigue vivo y
 *      sigue probado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// El doble del router: Colaboradores lleva buscador y su texto vive en la URL.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, cleanup } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import ConfiguracionTab from "@/app/asistencia/ConfiguracionTab";
import { ASISTENCIA_SOBRA_3A, DONDE_VIVE_EL_AVISO } from "@/lib/asistencia/sobra-3a";
import { avisoPendientes } from "@/lib/asistencia/configuracion-avisos";

const RAIZ = process.cwd();
const crudo = (p: string) => readFileSync(resolve(RAIZ, p), "utf8");
/** El archivo SIN comentarios: se barre el CÓDIGO, no las notas que explican
 *  justamente qué se retiró y por qué. */
const leer = (p: string) =>
  crudo(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const MOVIMIENTOS = "src/app/asistencia/MovimientosQuincenaTab.tsx";
const COLABORADORES = "src/app/asistencia/ConfiguracionTab.tsx";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ═════════════════════════════════════════════════════════════════════════════
// 0 · EL INTERRUPTOR
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 0 · el interruptor existe y hoy está prendido", () => {
  it("prendido, y apagarlo devuelve la franja a Colaboradores", () => {
    expect(ASISTENCIA_SOBRA_3A).toBe(true);
    expect(crudo("src/lib/asistencia/sobra-3a.ts")).toMatch(
      /export const ASISTENCIA_SOBRA_3A = true;/,
    );
    expect(leer(COLABORADORES)).toContain("ASISTENCIA_SOBRA_3A");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 1 · PRÉSTAMOS › MOVIMIENTOS: SE FUE LA LISTA DE 24 QUINCENAS
// ═════════════════════════════════════════════════════════════════════════════

describe("🩸 1 · Movimientos ya no tiene su propia lista de quincenas", () => {
  it("ni la constante, ni el `<select>`, ni la función que armaba las 24", () => {
    const mov = leer(MOVIMIENTOS);
    expect(mov).not.toContain("CUANTAS_QUINCENAS");
    expect(mov).not.toContain("quincenasHasta");
    expect(mov).not.toContain("<select");
    expect(mov).not.toContain("rotuloQuincena");
  });

  it("🔴 el período sale del selector único del módulo, como en las otras pestañas", () => {
    const mov = leer(MOVIMIENTOS);
    expect(mov).toContain("usePeriodoAsistencia");
    expect(mov).toContain("<SelectorPeriodo");
    // Y sigue mirando la quincena que CONTIENE al período: Movimientos es por
    // quincena, y un rango libre no tiene movimientos propios.
    expect(mov).toContain("quincenaDelPeriodo(compartido.desde)");
  });

  it("⚠️ un enlace viejo con `?quincena=` sigue abriendo donde decía", () => {
    expect(leer(MOVIMIENTOS)).toMatch(/if \(q\) return q;/);
  });

  it("y nadie más en el módulo se quedó sin su lista: `quincenasHasta` sigue viva", () => {
    // 🔑 Se retiró UN uso, no la función: la Planilla y Aprobaciones la siguen
    // usando para la quincena en curso.
    expect(crudo("src/lib/asistencia/planilla.ts")).toContain("export function quincenasHasta");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · COLABORADORES: SE FUE LA FRANJA AMARILLA, NO EL DATO
// ═════════════════════════════════════════════════════════════════════════════

const base = {
  jornadaSemanal: 48, configurado: true, faltaSalario: false, servicioProfesional: false,
  pagaSeguros: true, baseSeguros: null, noMarcaReloj: false, marcaciones: 100,
  ultimaMarca: "2026-09-10", rataHora: 4.09, valorMinuto: 0.07, fechaSalida: null,
  motivoSalida: null, activo: true, baja: null, marcoDespuesDeLaBaja: false,
  tieneHorario: true,
};
const SIN_FICHA = {
  ...base, codigo: "303", nombre: null, salarioMensual: null, empresa: null, configurado: false,
  rataHora: null, valorMinuto: null, fechaIngreso: null, tieneHorario: false,
};
const ANDREA = {
  ...base, codigo: "16", nombre: "ANDREA PEREZ", salarioMensual: 700, empresa: "vistana",
  rataHora: 3.37, posicion: "Vendedora", cedula: "8-111-222", fechaIngreso: "2023-05-02",
};
const DATOS = {
  personas: [SIN_FICHA, ANDREA], ignorados: [], reglas: REGLAS_DEFAULT,
  // 🔑 El caso real: UNO de los colaboradores marca en el reloj y no tiene ficha.
  resumen: {
    total: 2, sinConfigurar: 1, sinSalario: 0, conMarcaciones: 2,
    bajas: 0, servicioProfesional: 0, noMarcaReloj: 0,
  },
  faltaMigracion: false, avisoMigracion: null, avisoMigracionBajas: null,
  puedeDarDeBaja: true, avisoBajas: null,
  avisoMigracionServicioProfesional: null, puedeMarcarServicioProfesional: true,
};

function servir() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    const body = u.includes("/api/asistencia/configuracion")
      ? DATOS
      : u.includes("/api/asistencia/vacaciones")
        ? { corresponden: [] }
        : {};
    return { ok: true, json: async () => body } as Response;
  }));
}

describe("🩸 2 · la franja amarilla de Colaboradores no se dibuja", () => {
  it("🔑 el dato NO se pierde: `avisoPendientes` sigue diciendo exactamente lo mismo", () => {
    const a = avisoPendientes(DATOS.resumen)!;
    expect(a.titulo).toBe("1 colaborador de 2 todavía no sale en la planilla.");
    expect(a.detalle[0]).toContain("1 marca en el reloj");
  });

  it("🔴 y aun así la pestaña NO lo dibuja", async () => {
    servir();
    render(<ToastProvider><ConfiguracionTab personaEnElCentro /></ToastProvider>);
    await screen.findAllByText(/Andrea Perez/);
    expect(screen.queryByText(/todavía no sale en la planilla/)).toBeNull();
    expect(screen.queryByText(/marca en el reloj/)).toBeNull();
  });

  it("🔴 el mismo aviso sigue vivo donde FRENA: «Antes de cerrar», en la Planilla", () => {
    expect(DONDE_VIVE_EL_AVISO).toContain("Antes de cerrar");
    const antes = crudo("src/lib/asistencia/antes-de-cerrar.ts");
    expect(antes).toContain("del reloj sin ficha");
  });

  it("⚠️ el aviso ROJO de «dada de baja y sigue marcando» NO se tocó", () => {
    // Ese pide que alguien haga algo hoy y se queda donde estaba.
    expect(leer(COLABORADORES)).toContain("datos.avisoBajas");
  });
});
