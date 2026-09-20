/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 EL TABLERO DE CIERRE CON LAS CUATRO EMPRESAS (19-sep-2026).
 *
 * 🩸 Con «Todas» elegido, la Planilla decía *«con «Todas» no se paga nada»* y
 * **no mostraba nada más**: para saber cómo venía la quincena había que entrar
 * empresa por empresa, generar y mirar — cuatro veces, seis veces al mes.
 *
 * Lo que este candado exige:
 *   A. La regla pura: los estados, qué falta, quién puede cerrar.
 *   B. 🔴 NUNCA UN TOTAL DEL GRUPO — barrido incluido.
 *   C. 🔴 Cada cierre es el de SU empresa, por su propia puerta.
 *   D. Una lectura caída se DICE, nunca se disfraza de «no hay nadie».
 *   E. Control: con una empresa elegida, la Planilla es la de siempre.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { render, screen, fireEvent, cleanup, waitFor, within, act } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { EMPRESAS_ASISTENCIA } from "@/lib/asistencia/config";
import {
  POR_QUE_NO_HAY_TOTAL, SIN_NADIE, TODO_LISTO_TABLERO, YA_CERRADA,
  encabezadoDelTablero, etiquetaCerrar, filaVacia, sePuedeCerrar, textoQueFalta,
  type FilaTablero,
} from "@/lib/asistencia/tablero-cierre";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(""),
}));

import TableroCierre from "@/app/asistencia/TableroCierre";

const RAIZ = process.cwd();
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const fila = (o: Partial<FilaTablero> = {}): FilaTablero => ({
  ...filaVacia("vistana", "Vistana"), ...o,
});

/** Una línea de planilla con la forma real: «Antes de cerrar» la recorre. */
const linea = (codigo: string) => ({
  codigo, etiqueta: `Alguien (${codigo})`,
  manuales: { isr: 0, prestamo: null, terceros: null, mercancia: 0, otrosServicios: 0 },
  prestamoAutomatico: { sinDescontar: {} },
  dias: [], dinero: { netoPagar: 617.28 },
});

// ─────────────────────────────────────────────────────────────────────────────
// A. LA REGLA PURA
// ─────────────────────────────────────────────────────────────────────────────

describe("A · la regla pura", () => {
  it("cada estado dice lo suyo, y «qué falta» no es un número pelado", () => {
    expect(textoQueFalta(fila({ estado: "vacia" }))).toBe(SIN_NADIE);
    expect(textoQueFalta(fila({ estado: "cerrada" }))).toBe(YA_CERRADA);
    expect(textoQueFalta(fila({ estado: "lista" }))).toBe(TODO_LISTO_TABLERO);
    expect(textoQueFalta(fila({ estado: "error", error: "Se cayó Switch" }))).toBe("Se cayó Switch");
    expect(textoQueFalta(fila({
      estado: "con-pendientes", arreglar: 3,
      primeroQueFalta: "2 con horas extra sin decidir",
    }))).toBe("3 cosas · 2 con horas extra sin decidir");
    expect(textoQueFalta(fila({ estado: "con-pendientes", arreglar: 1, primeroQueFalta: null })))
      .toBe("1 cosa");
  });

  it("🔴 el botón solo se ofrece donde hay algo que cerrar, y solo a quien cierra", () => {
    for (const estado of ["con-pendientes", "lista"] as const) {
      expect(sePuedeCerrar(fila({ estado }), true)).toBe(true);
      expect(sePuedeCerrar(fila({ estado }), false)).toBe(false);
    }
    for (const estado of ["cargando", "error", "vacia", "cerrada"] as const) {
      expect(sePuedeCerrar(fila({ estado }), true)).toBe(false);
    }
  });

  it("el encabezado cuenta EMPRESAS, nunca plata", () => {
    expect(encabezadoDelTablero([fila()])).toBe("1 empresa");
    expect(encabezadoDelTablero([fila(), fila(), fila(), fila()])).toBe("4 empresas");
  });

  it("🔴 el botón dice QUÉ empresa cierra", () => {
    expect(etiquetaCerrar(fila({ etiqueta: "Boston" }))).toBe("Cerrar la quincena de Boston");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. 🔴 NUNCA UN TOTAL DEL GRUPO
// ─────────────────────────────────────────────────────────────────────────────

describe("B · nunca un total del grupo", () => {
  const puro = (f: string) =>
    fs.readFileSync(path.join(RAIZ, "src", f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

  it("🔴 el módulo puro no suma entre filas: ni reduce, ni += sobre un acumulador", () => {
    const modulo = puro("lib/asistencia/tablero-cierre.ts");
    // ⚠️ Se busca la OPERACIÓN, no la palabra: el módulo dice «no se suman» a
    // propósito, en el texto que explica por qué no hay un total.
    for (const prohibido of [".reduce(", "+=", "totalDelGrupo", "totalGrupo"]) {
      expect(modulo.includes(prohibido), `tablero-cierre.ts nombra «${prohibido}»`).toBe(false);
    }
    // Y ni una suma entre dos netos.
    expect(modulo).not.toMatch(/neto\s*\+/);
  });

  it("🔴 la pantalla del tablero tampoco suma los netos", () => {
    const pantalla = puro("app/asistencia/TableroCierre.tsx");
    expect(pantalla).not.toMatch(/\.reduce\(/);
    expect(pantalla).not.toMatch(/<tfoot/);
  });

  it("🔴 y se DICE por qué no hay un total", () => {
    expect(POR_QUE_NO_HAY_TOTAL).toContain("no se suman");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C y D. LA PANTALLA
// ─────────────────────────────────────────────────────────────────────────────

type Llamada = { url: string; init?: RequestInit };
function servir(
  llamadas: Llamada[] = [],
  opts: { vacia?: string; falla?: string; cerrada?: string; pendiente?: string } = {},
) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    llamadas.push({ url: u, init });
    const empresa = new URL(u, "http://x").searchParams.get("empresa") ?? "";
    if (u.includes("/api/asistencia/alcance")) {
      return { ok: true, status: 200, json: async () => ({ empresas: null }) } as Response;
    }
    if (u.includes("/planilla-guardada") && init?.method !== "POST") {
      return {
        ok: true, status: 200,
        json: async () => ({ estado: empresa === opts.cerrada ? "cerrada" : null }),
      } as Response;
    }
    if (u.includes("/planilla-guardada") && init?.method === "POST") {
      return { ok: true, status: 200, json: async () => ({ ok: true, id: "x" }) } as Response;
    }
    if (u.includes("/api/asistencia/planilla?")) {
      if (empresa === opts.falla) {
        return { ok: false, status: 500, json: async () => ({ error: "Se cayó la lectura" }) } as Response;
      }
      const vacia = empresa === opts.vacia;
      return {
        ok: true, status: 200,
        json: async () => ({
          // Dos líneas con la forma de siempre: «Antes de cerrar» las recorre
          // de verdad (préstamos sin descontar, cuotas recortadas, marcas
          // impares), así que un fixture a medias no probaría nada.
          lineas: vacia ? [] : [linea("1"), linea("2")],
          totales: { netoPagar: 1234.56 },
          periodo: { desde: "2026-09-01", hasta: "2026-09-15" },
          reglas: REGLAS_DEFAULT,
          avisos: {
            periodoAbierto: null, rangoLibre: false,
            // 🔴 Un aviso REAL, para que el texto de «qué falta» salga del
            // mismo `armarAntesDeCerrar` que dibuja la Planilla de una empresa.
            extraSinAprobar: empresa === opts.pendiente
              ? [{ codigo: "17", etiqueta: "Kener (17)", minutos: 386, monto: 0 }]
              : [],
          },
        }),
      } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }));
  return llamadas;
}

const montar = (props: Partial<React.ComponentProps<typeof TableroCierre>> = {}) =>
  render(
    <ToastProvider>
      <TableroCierre
        rol="admin" desde="2026-09-01" hasta="2026-09-15" corte=""
        elegido puedeCerrar onCerrada={() => {}} {...props}
      />
    </ToastProvider>,
  );

describe("C · una línea por empresa, cada una por su puerta", () => {
  it("🔴 dibuja UNA línea por empresa, con personas y su neto", async () => {
    servir();
    montar();
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^Cerrar la quincena de / }))
        .toHaveLength(EMPRESAS_ASISTENCIA.length);
    });
    // Cuatro netos iguales, y NINGUNO sumado.
    expect(screen.getAllByText("$1,234.56")).toHaveLength(EMPRESAS_ASISTENCIA.length);
    expect(screen.queryByText("$4,938.24")).toBeNull();
  });

  it("🔴 pide el cuadro de CADA empresa por separado, a la ruta de siempre", async () => {
    const llamadas = servir();
    montar();
    await waitFor(() => {
      const cuadros = llamadas.filter((l) => l.url.includes("/api/asistencia/planilla?"));
      expect(cuadros).toHaveLength(EMPRESAS_ASISTENCIA.length);
    });
    const empresas = llamadas
      .filter((l) => l.url.includes("/api/asistencia/planilla?"))
      .map((l) => new URL(l.url, "http://x").searchParams.get("empresa"));
    expect(new Set(empresas)).toEqual(new Set(EMPRESAS_ASISTENCIA));
    // 🔴 No existe una ruta «de todas».
    expect(llamadas.every((l) => !l.url.includes("/planilla/todas"))).toBe(true);
  });

  it("🔴 cerrar una empresa manda el MISMO POST, con SU empresa y nada más", async () => {
    const llamadas = servir();
    montar();
    const boton = await screen.findByRole("button", { name: "Cerrar la quincena de Boston" });
    fireEvent.click(boton);
    // La ventana de confirmación es la MISMA de la Planilla: su título lo dice
    // y su botón es el que de verdad cierra.
    const ventana = (await screen.findByRole("dialog")) as HTMLElement;
    expect(within(ventana).getByText("Cerrar la quincena")).toBeTruthy();
    fireEvent.click(within(ventana).getByRole("button", { name: "Cerrar quincena" }));
    await waitFor(() => {
      expect(llamadas.some((l) => l.init?.method === "POST")).toBe(true);
    });
    const posts = llamadas.filter((l) => l.init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("/api/asistencia/planilla-guardada");
    expect(JSON.parse(String(posts[0].init?.body))).toEqual({
      empresa: "confecciones_boston", desde: "2026-09-01", hasta: "2026-09-15",
    });
  });

  it("🔴 «qué falta» sale del MISMO «Antes de cerrar» de la Planilla, con su texto", async () => {
    servir([], { pendiente: "vistana" });
    montar();
    // Es exactamente la línea que `armarAntesDeCerrar` arma para ese aviso.
    expect(await screen.findByText("1 cosa · 1 con horas extra sin decidir · 6:26 h")).toBeTruthy();
    // Y la que no tiene nada pendiente dice que está lista.
    expect(screen.getAllByText(TODO_LISTO_TABLERO).length).toBe(EMPRESAS_ASISTENCIA.length - 1);
  });

  it("quien no cierra no ve ni un botón", async () => {
    servir();
    montar({ puedeCerrar: false });
    await screen.findByText(POR_QUE_NO_HAY_TOTAL);
    expect(screen.queryByRole("button", { name: /^Cerrar la quincena de / })).toBeNull();
  });

  it("una empresa ya cerrada no ofrece cerrar otra vez", async () => {
    servir([], { cerrada: "vistana" });
    montar();
    await waitFor(() => expect(screen.getAllByText(YA_CERRADA).length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: "Cerrar la quincena de Vistana" })).toBeNull();
  });

  it("sin quincena elegida no se pide nada", async () => {
    const llamadas = servir();
    montar({ elegido: false });
    // 🔴 SE ESPERA A QUE LA PANTALLA ARRANQUE, NO A 30 MS: se espera a la
    // primera lectura (el alcance, que sale siempre) y se vacía la cola de
    // microtareas —por ahí saldría el pedido del cuadro—. Sin esto, «no se
    // pidió nada» podía ser verde por no haber empezado todavía.
    await waitFor(() => expect(llamadas.some((l) => l.url.includes("/api/asistencia/alcance"))).toBe(true));
    await act(async () => { await Promise.resolve(); });
    expect(llamadas.filter((l) => l.url.includes("/api/asistencia/planilla?"))).toHaveLength(0);
  });
});

describe("D · lo que no se pudo leer se dice", () => {
  it("🩸 una lectura caída se DICE, nunca se disfraza de «no hay nadie»", async () => {
    servir([], { falla: "vistana" });
    montar();
    expect(await screen.findByText("Se cayó la lectura")).toBeTruthy();
    // Y no ofrece cerrar lo que no se pudo leer.
    expect(screen.queryByRole("button", { name: "Cerrar la quincena de Vistana" })).toBeNull();
  });

  it("una empresa sin nadie lo dice con palabras", async () => {
    servir([], { vacia: "vistana" });
    montar();
    expect(await screen.findByText(SIN_NADIE)).toBeTruthy();
  });

  it("una empresa que falla NO tumba a las demás", async () => {
    servir([], { falla: "vistana" });
    montar();
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^Cerrar la quincena de / }).length)
        .toBe(EMPRESAS_ASISTENCIA.length - 1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. CONTROL — la Planilla de una empresa no cambió
// ─────────────────────────────────────────────────────────────────────────────

describe("E · control", () => {
  const puro = (f: string) =>
    fs.readFileSync(path.join(RAIZ, "src", f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

  it("🔴 el tablero SOLO sale con «Todas»", () => {
    const tab = puro("app/asistencia/PlanillaTab.tsx");
    expect(tab).toMatch(/\{sinEmpresa && \(\s*<TableroCierre/);
  });

  it("🔴 «qué falta» sale del MISMO módulo que la Planilla de una empresa", () => {
    const tablero = puro("app/asistencia/TableroCierre.tsx");
    const tab = puro("app/asistencia/PlanillaTab.tsx");
    expect(tablero).toContain("antesDeCerrarDelCuadro");
    expect(tab).toContain("antesDeCerrarDelCuadro");
  });

  it("🔴 la ventana de confirmación es la MISMA de la Planilla", () => {
    const tablero = puro("app/asistencia/TableroCierre.tsx");
    expect(tablero).toContain('import { ModalCierre } from "./PlanillaTab"');
    expect(tablero).not.toMatch(/createPortal/);
  });

  it("🔴 sigue valiendo que solo se cierran quincenas: el freno es del servidor", () => {
    const ruta = puro("app/api/asistencia/planilla-guardada/route.ts");
    expect(ruta).toContain("frenoSoloQuincenas");
    // Y el tablero no tiene un freno propio que pudiera separarse de aquél.
    expect(puro("lib/asistencia/tablero-cierre.ts")).not.toContain("esQuincena");
  });
});
