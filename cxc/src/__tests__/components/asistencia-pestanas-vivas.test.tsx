/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 LAS PESTAÑAS VISITADAS SE QUEDAN ARMADAS (24-sep-2026)
 *
 * 🩸 EL DEFECTO, medido: `AsistenciaClient.tsx` dibujaba la pestaña activa con
 * un `if`, así que la que se dejaba **se desarmaba entera**. Yendo de Planilla
 * a Asistencia y volviendo se perdían la quincena elegida, el cuadro generado,
 * «Antes de cerrar», el estado del cierre y —el que cuesta plata— **el corte
 * del reloj, que volvía al propuesto (13/28)**. En la otra dirección se perdían
 * el colaborador abierto, el buscador y las horas a medio corregir. Volver
 * costaba 2 toques (3 si tocó el corte) y **3 llamadas al servidor**
 * (≈3,1 s solo de lectura).
 *
 * Lo que este candado exige:
 *   A. La regla pura: la visitada queda montada, la que nadie tocó NO.
 *   B. La quincena y el corte viajan en la dirección, con claves propias.
 *   C. En la pantalla: ir y volver no desarma nada, y la no visitada no se
 *      monta (no se disparan las cinco lecturas al entrar).
 *   D. Falla ABIERTA: con el interruptor apagado, una pestaña y nada más.
 *
 * 🔴 NINGÚN NÚMERO DE PLATA CAMBIA. Acá no se toca un cálculo: lo único que se
 * mueve es qué está montado y qué se escribe en la dirección. **El cuadro
 * generado NO se guarda en ningún storage**, a propósito.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import { CLAVES_DE_PANTALLA } from "@/lib/hooks/useUrlState";
import {
  ASISTENCIA_PESTANAS_VIVAS, CORTE_ENTERA,
  PARAM_PLANILLA_CORTE, PARAM_PLANILLA_QUINCENA,
  corteALaUrl, corteDeLaUrl, pestanasMontadas, quincenaALaUrl, quincenaDeLaUrl,
  recordarVisitada, seEsconde,
} from "@/lib/asistencia/pestanas-vivas";

// Los dos interruptores están prendidos en producción desde el 11-sep-2026.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_PERSONA_EN_EL_CENTRO = "1";
  process.env.NEXT_PUBLIC_PLANILLA_UNIDA = "1";
});

const RAIZ = process.cwd();
const puro = (f: string) =>
  fs.readFileSync(path.join(RAIZ, "src", f), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

// ─────────────────────────────────────────────────────────────────────────────
// A. LA REGLA PURA
// ─────────────────────────────────────────────────────────────────────────────

describe("A · qué se monta y qué se esconde", () => {
  it("🔴 la pestaña que se mira y las ya visitadas se montan", () => {
    const m = pestanasMontadas(["asistencia", "planilla"], "asistencia", true);
    expect([...m].sort()).toEqual(["asistencia", "planilla"]);
  });

  it("🔴 la que nadie tocó NO se monta: entrar no dispara las cinco lecturas", () => {
    const m = pestanasMontadas(["asistencia"], "asistencia", true);
    expect(m.has("prestamos")).toBe(false);
    expect(m.has("planilla")).toBe(false);
    expect(m.has("aprobaciones")).toBe(false);
  });

  it("la que se mira se monta aunque todavía no esté en las visitadas", () => {
    expect(pestanasMontadas([], "planilla", true).has("planilla")).toBe(true);
  });

  it("🔴 con el interruptor APAGADO es una sola: la de antes", () => {
    const m = pestanasMontadas(["asistencia", "planilla", "prestamos"], "asistencia", false);
    expect([...m]).toEqual(["asistencia"]);
  });

  it("sin pestaña (todavía no se sabe quién mira) no se monta nada", () => {
    expect([...pestanasMontadas([], "", true)]).toEqual([]);
    expect([...pestanasMontadas([], "", false)]).toEqual([]);
  });

  it("esconder no es desarmar: solo la que se mira queda a la vista", () => {
    expect(seEsconde("planilla", "planilla")).toBe(false);
    expect(seEsconde("planilla", "asistencia")).toBe(true);
  });

  it("🔑 recordar una visitada devuelve el MISMO conjunto cuando no hay nada nuevo", () => {
    const uno: ReadonlySet<string> = new Set(["asistencia"]);
    expect(recordarVisitada(uno, "asistencia")).toBe(uno);
    expect(recordarVisitada(uno, "")).toBe(uno);
    expect([...recordarVisitada(uno, "planilla")].sort()).toEqual(["asistencia", "planilla"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. LA QUINCENA Y EL CORTE EN LA DIRECCIÓN
// ─────────────────────────────────────────────────────────────────────────────

const QUINCENAS = [
  { desde: "2026-09-01", hasta: "2026-09-15" },
  { desde: "2026-09-16", hasta: "2026-09-30" },
];

describe("B · la quincena y el corte viajan en la dirección", () => {
  it("🔴 claves PROPIAS: no se pisan con `quincena` ni con `desde`/`hasta`", () => {
    expect(PARAM_PLANILLA_QUINCENA).toBe("plQuincena");
    expect(PARAM_PLANILLA_CORTE).toBe("plCorte");
    // `quincena` es de Préstamos › Movimientos y `desde`/`hasta` de Asistencia.
    expect([PARAM_PLANILLA_QUINCENA, PARAM_PLANILLA_CORTE])
      .not.toContain("quincena");
    expect([PARAM_PLANILLA_QUINCENA, PARAM_PLANILLA_CORTE])
      .not.toContain("desde");
  });

  it("🔴 son FILTROS: en el celular no empujan historial (la que empuja es `tab`)", () => {
    expect(CLAVES_DE_PANTALLA).not.toContain(PARAM_PLANILLA_QUINCENA);
    expect(CLAVES_DE_PANTALLA).not.toContain(PARAM_PLANILLA_CORTE);
    expect(CLAVES_DE_PANTALLA).toContain("tab");
  });

  it("la quincena se guarda por su primer día y vuelve entera", () => {
    expect(quincenaALaUrl("2026-09-16")).toBe("2026-09-16");
    expect(quincenaDeLaUrl("2026-09-16", QUINCENAS)).toEqual(QUINCENAS[1]);
  });

  it("🔴 una quincena que ya no se puede elegir se ignora: la Planilla abre vacía", () => {
    expect(quincenaDeLaUrl("2026-01-01", QUINCENAS)).toBeNull();
    expect(quincenaDeLaUrl("", QUINCENAS)).toBeNull();
    expect(quincenaDeLaUrl("no-es-fecha", QUINCENAS)).toBeNull();
    expect(quincenaDeLaUrl(null, QUINCENAS)).toBeNull();
  });

  it("🔴 «la quincena entera» es un VALOR, no la falta del parámetro", () => {
    // 🩸 Si se escribiera vacío, la dirección lo borraría y al volver
    // reaparecería el corte PROPUESTO — el defecto que esto viene a cerrar.
    expect(corteALaUrl("")).toBe(CORTE_ENTERA);
    expect(corteDeLaUrl(CORTE_ENTERA)).toBe("");
  });

  it("el corte con fecha va y vuelve igual", () => {
    expect(corteALaUrl("2026-09-13")).toBe("2026-09-13");
    expect(corteDeLaUrl("2026-09-13")).toBe("2026-09-13");
  });

  it("🔴 falla ABIERTA: cualquier basura cae en «quincena entera», nunca en un corte inventado", () => {
    for (const malo of ["13", "abc", "2026-13-99-1", null, undefined, "   "]) {
      expect(corteDeLaUrl(malo as string), String(malo)).toBe("");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. EN LA PANTALLA
// ─────────────────────────────────────────────────────────────────────────────

let URL_ACTUAL = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn((u: string) => { URL_ACTUAL = String(u).split("?")[1] ?? ""; }),
    replace: vi.fn((u: string) => { URL_ACTUAL = String(u).split("?")[1] ?? ""; }),
    refresh: vi.fn(), prefetch: vi.fn(),
  }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(URL_ACTUAL),
}));

import AsistenciaClient from "@/app/asistencia/AsistenciaClient";

const PEDIDOS: string[] = [];
const cuantos = (trozo: string) => PEDIDOS.filter((u) => u.includes(trozo)).length;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  PEDIDOS.length = 0;
  URL_ACTUAL = "";
});

function montar(query = "tab=asistencia", rol = "admin") {
  URL_ACTUAL = query;
  sessionStorage.setItem("cxc_role", rol);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    PEDIDOS.push(String(url));
    return {
      ok: true, status: 200,
      json: async () => ({ empresas: null, personas: [], filas: [], periodos: [], cierres: [] }),
    } as Response;
  }));
  return render(<ToastProvider><AsistenciaClient /></ToastProvider>);
}

const tocar = async (rotulo: string) => {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: rotulo })); });
};

describe("C · ir y volver no desarma nada", () => {
  it("🔴 la Planilla visitada se queda MONTADA y escondida al volver a Asistencia", async () => {
    montar("tab=asistencia");
    await waitFor(() => expect(cuantos("/api/asistencia/reporte")).toBeGreaterThan(0));

    await tocar("Planilla");
    // La Planilla está a la vista: dice qué falta para ver la plata.
    // 🩸 CAMBIÓ DE DIRECCIÓN EL 24-sep-2026: decía «Elige el período que vas a
    // pagar» porque la quincena arrancaba SIN elegir. Con el selector único la
    // quincena viene puesta desde el período del módulo, así que lo único que
    // falta —y lo que el vacío dice— es generar. 🔴 Lo que NO cambió y este
    // archivo sigue sosteniendo: la plata no se dibuja sola.
    const dice = await screen.findByRole("button", { name: "Generar" });

    await tocar("Asistencia");
    // 🔴 Sigue en el DOM —no se desarmó—, dentro de un contenedor escondido.
    expect(document.body.contains(dice)).toBe(true);
    expect(dice.closest("[hidden]")).not.toBeNull();
  });

  it("🔴 volver a Asistencia NO la vuelve a pedir: sigue montada con sus datos", async () => {
    montar("tab=asistencia");
    await waitFor(() => expect(cuantos("/api/asistencia/reporte")).toBeGreaterThan(0));
    const antes = cuantos("/api/asistencia/reporte");

    await tocar("Planilla");
    await screen.findByRole("button", { name: "Generar" });
    await tocar("Asistencia");
    await act(async () => { await Promise.resolve(); });

    expect(cuantos("/api/asistencia/reporte")).toBe(antes);
  });

  it("🔴 la pestaña que nadie tocó no se monta: Préstamos no pide nada", async () => {
    montar("tab=asistencia");
    await waitFor(() => expect(cuantos("/api/asistencia/reporte")).toBeGreaterThan(0));
    await tocar("Planilla");
    await screen.findByRole("button", { name: "Generar" });
    await act(async () => { await Promise.resolve(); });

    expect(cuantos("/api/prestamos/empleados")).toBe(0);
    expect(cuantos("/api/asistencia/prestamos-deuda")).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. CONTROL
// ─────────────────────────────────────────────────────────────────────────────

describe("D · el interruptor y lo que NO se hizo", () => {
  it("hoy está prendido", () => {
    expect(ASISTENCIA_PESTANAS_VIVAS).toBe(true);
  });

  it("🔴 la regla vive en el módulo PURO, no escrita a mano en la pantalla", () => {
    const cliente = puro("app/asistencia/AsistenciaClient.tsx");
    expect(cliente).toContain("pestanasMontadas(");
    expect(cliente).toContain("seEsconde(");
    // 🩸 El `if` viejo desarmaba la pestaña que se dejaba.
    expect(cliente).not.toMatch(/\{tab === "planilla" && </);
    expect(cliente).not.toMatch(/\{tab === "prestamos" && </);
  });

  it("🔴 el envoltorio NO es un componente definido adentro del render", () => {
    // Un componente nuevo en cada render tiene un tipo nuevo: React lo desarma
    // y lo vuelve a armar, y se perdería justo lo que esto viene a conservar.
    const cliente = puro("app/asistencia/AsistenciaClient.tsx");
    expect(cliente).not.toMatch(/const Caja = \(/);
  });

  it("🔴 EL CUADRO GENERADO NO SE GUARDA EN NINGÚN STORAGE", () => {
    // Plata dibujada desde una copia es un número viejo con cara de nuevo.
    const planilla = puro("app/asistencia/PlanillaTab.tsx");
    expect(planilla).not.toContain("sessionStorage.setItem");
    expect(planilla).not.toMatch(/localStorage\.setItem\([^)]*data/);
  });

  it("🔴 la Planilla escribe la quincena y el corte por el módulo puro", () => {
    const planilla = puro("app/asistencia/PlanillaTab.tsx");
    expect(planilla).toContain("PARAM_PLANILLA_QUINCENA");
    expect(planilla).toContain("PARAM_PLANILLA_CORTE");
    expect(planilla).toContain("quincenaDeLaUrl(");
    expect(planilla).toContain("corteDeLaUrl(");
  });
});
