/* ─────────────────────────────────────────────────────────────────────────────
 * APROBACIONES — CONDUCTA: se monta la pantalla y se tocan los botones.
 *
 * 🔴 CAMBIÓ DE DIRECCIÓN EL 10-sep-2026 (noche), NO SE BORRÓ. Daniel: *«Aprobaciones
 * es una sola lista de decisiones. Cada renglón es una persona en la quincena,
 * con sus horas extra sumadas. Dos botones: Sí y No. Se decide, y el renglón se
 * va»* · *«con un tab arriba que diga colaborador / día»*. Hasta ese día la
 * pantalla era días con casillas (27-ago-2026: *«que el usuario entre y vea por
 * dias quienes y cuantas horas»*). Lo que se conserva como CONTROL: la vista
 * «Día» sigue existiendo, a un toque, con un renglón por día que dice cuánta
 * gente y cuántas horas; y lo que viaja sigue siendo un PERMISO por DÍA, nunca
 * una plata ni un período. Lo que se fue: la casilla, la fila por semana.
 *
 * 🔴 POR QUÉ SE MONTA LA PANTALLA Y NO SE MIRA EL MÓDULO. El riesgo de esta
 * pantalla es que un toque mande la lista equivocada — decidir sobre alguien
 * que no era, o un día que no era. Eso solo se ve tocando.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import { act } from "react";

import { ToastProvider } from "@/components/ToastSystem";
import AprobacionesTab, { ROTULO_SI_A_TODO } from "@/app/asistencia/AprobacionesTab";
import { claveDia, type DiaAprobacion } from "@/lib/asistencia/aprobaciones";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(),
}));

// ── Los días REALES del 24 al 26 de agosto, medidos en producción ────────────
const gente = (xs: Array<[string, string, number, boolean]>) =>
  xs.map(([codigo, etiqueta, minutos, aprobado]) => ({
    codigo, etiqueta, empresa: "vistana", empresaEtiqueta: "Vistana",
    salida: "18:11", minutos, diurnoMin: minutos, nocturnoMin: 0, domFerMin: 0, tipo: "extra" as const,
    aprobado, por: aprobado ? "Julio" : null, cuando: null,
    minutosVistos: aprobado ? minutos : null, cambio: false,
  }));

const DIAS: DiaAprobacion[] = [
  { fecha: "2026-08-24", etiqueta: "lun 24 ago", semana: "2026-08-24", minutos: 178,
    gente: gente([["11", "JULIO GARAY", 107, false], ["6", "KEVIN LUBO", 71, false]]) },
  { fecha: "2026-08-25", etiqueta: "mar 25 ago", semana: "2026-08-24", minutos: 55,
    gente: gente([["9", "LUIS ARROYO", 55, false]]) },
  { fecha: "2026-08-26", etiqueta: "mié 26 ago", semana: "2026-08-24", minutos: 104,
    gente: gente([["7", "ANGELA GARCIA", 104, false]]) },
];

let enviados: Array<Record<string, unknown>> = [];

function servidor(dias: DiaAprobacion[] = DIAS) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith("/api/asistencia/aprobaciones")) {
      enviados.push(JSON.parse(String(init?.body ?? "{}")));
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    }
    return {
      ok: true,
      json: async () => ({ aprobaciones: dias, puedeAprobar: true, avisos: {} }),
    } as Response;
  });
}

async function montar() {
  render(<ToastProvider><AprobacionesTab /></ToastProvider>);
  await waitFor(() => expect(screen.getByText("KEVIN LUBO")).toBeTruthy());
}

/** Un toque de verdad sobre el DOM. */
async function toca(el: Element | null | undefined) {
  if (!el) throw new Error("no existe el elemento que se quiso tocar");
  await act(async () => { (el as HTMLElement).click(); });
}

const boton = (nombre: RegExp) => screen.getAllByRole("button").find((b) => nombre.test(b.getAttribute("aria-label") ?? ""));
const aDia = async () => toca(screen.getByRole("radio", { name: "Día" }));

beforeEach(() => { enviados = []; globalThis.localStorage?.clear(); vi.stubGlobal("fetch", servidor()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("🔴 abre POR COLABORADOR: un renglón por persona con sus extras sumadas", () => {
  it("cuatro renglones, cada uno con «N días · H:MM h» y sus dos botones", async () => {
    await montar();
    expect(screen.getByTestId("vista-colaborador")).toBeTruthy();
    for (const n of ["JULIO GARAY", "KEVIN LUBO", "LUIS ARROYO", "ANGELA GARCIA"]) {
      expect(screen.getByText(n)).toBeTruthy();
      expect(boton(new RegExp(`^Sí a ${n}$`))).toBeTruthy();
      expect(boton(new RegExp(`^No a ${n}$`))).toBeTruthy();
    }
    expect(screen.getByText("1 día · 1:47 h")).toBeTruthy(); // Julio, 107 min
  });

  it("los renglones arrancan CERRADOS; el ⌄ abre los días con su Sí/No", async () => {
    await montar();
    expect(screen.queryByTestId("dias-de-6")).toBeNull();
    await toca(screen.getByRole("button", { name: /^KEVIN LUBO$/ }));
    expect(screen.getByTestId("dias-de-6")).toBeTruthy();
    expect(boton(/^Sí a KEVIN LUBO el lun 24 ago$/)).toBeTruthy();
  });

  it("el contador cuenta RENGLONES por decidir y suma sus horas", async () => {
    await montar();
    // 4 personas · 337 min = 5:37 h
    expect(screen.getByTestId("por-decidir").textContent).toBe("4por decidir · 5:37 h");
  });
});

describe("🔴 lo que mandan los botones", () => {
  it("SÍ en el renglón: todos los días pendientes de ESA persona, con decision 'si'", async () => {
    await montar();
    await toca(boton(/^Sí a KEVIN LUBO$/));
    expect(enviados).toHaveLength(1);
    expect(enviados[0].decision).toBe("si");
    expect(enviados[0].dias).toEqual([{ codigo: "6", fecha: "2026-08-24", minutos: 71 }]);
  });

  it("NO en el renglón manda decision 'no' — y el renglón SE VA a «Ya decididas»", async () => {
    await montar();
    await toca(boton(/^No a KEVIN LUBO$/));
    expect(enviados[0].decision).toBe("no");
    expect(within(screen.getByTestId("vista-colaborador")).queryByText("KEVIN LUBO")).toBeNull();
    expect(screen.getByRole("button", { name: /Ya decididas \(1\)/ })).toBeTruthy();
    expect(screen.getByTestId("por-decidir").textContent).toBe("3por decidir · 4:26 h");
  });

  it("UN DÍA de una persona (abriendo el ⌄): solo ese día", async () => {
    await montar();
    await toca(screen.getByRole("button", { name: /^JULIO GARAY$/ }));
    await toca(boton(/^No a JULIO GARAY el lun 24 ago$/));
    expect(enviados[0].decision).toBe("no");
    expect(enviados[0].dias).toEqual([{ codigo: "11", fecha: "2026-08-24", minutos: 107 }]);
  });

  it("«Sí a todo lo pendiente»: las cuatro de una, con decision 'si'", async () => {
    await montar();
    await toca(screen.getByRole("button", { name: ROTULO_SI_A_TODO }));
    expect((enviados[0].dias as unknown[]).length).toBe(4);
    expect(enviados[0].decision).toBe("si");
  });

  it("⛔ no existe «No a todo»", async () => {
    await montar();
    expect(screen.queryByRole("button", { name: /No a todo/i })).toBeNull();
  });
});

describe("🔴 la vista «Día» — CONTROL de lo que pidió el 27-ago: por días, cuánta gente y cuántas horas", () => {
  it("cada día es un renglón, con cuánta gente y cuántas horas, y arranca cerrado", async () => {
    await montar();
    await aDia();
    expect(screen.getByTestId("vista-dia")).toBeTruthy();
    expect(screen.getByText(/lun 24/)).toBeTruthy();
    expect(screen.getByText("2 · 2:58 h")).toBeTruthy();
    expect(screen.getByText("1 · 0:55 h")).toBeTruthy();
    expect(screen.getByText(/lun 24/).closest("button")!.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("KEVIN LUBO")).toBeNull();
  });

  it("UN DÍA: toda su gente, de ese día y de ningún otro", async () => {
    await montar();
    await aDia();
    await toca(boton(/^Sí a lun 24 ago$/));
    const ds = enviados[0].dias as Array<Record<string, unknown>>;
    expect(ds).toHaveLength(2);
    expect(new Set(ds.map((d) => d.codigo))).toEqual(new Set(["11", "6"]));
    expect(ds.every((d) => d.fecha === "2026-08-24")).toBe(true);
  });

  it("UNA PERSONA en un día: solo esa persona y solo ese día", async () => {
    await montar();
    await aDia();
    await toca(screen.getByText(/lun 24/).closest("button"));
    await toca(boton(/^Sí a KEVIN LUBO el lun 24 ago$/));
    expect(enviados[0].dias).toEqual([{ codigo: "6", fecha: "2026-08-24", minutos: 71 }]);
  });

  it("🔴 el día decidido SE VA de la lista (era la fila por semana, retirada)", async () => {
    await montar();
    await aDia();
    await toca(boton(/^Sí a mar 25 ago$/));
    expect(screen.queryByText(/mar 25/)).toBeNull();
    expect(screen.queryByLabelText(/semana/)).toBeNull();
  });
});

describe("🔴 un toque de más no es irreversible: «cambiar» en Ya decididas", () => {
  const CON_UNO_APROBADO: DiaAprobacion[] = [
    { ...DIAS[0], gente: gente([["11", "JULIO GARAY", 107, true], ["6", "KEVIN LUBO", 71, false]]) },
  ];

  it("volver a tocar el Sí prendido manda decision null (pendiente) y el renglón vuelve arriba", async () => {
    vi.stubGlobal("fetch", servidor(CON_UNO_APROBADO));
    await montar();
    expect(within(screen.getByTestId("vista-colaborador")).queryByText("JULIO GARAY")).toBeNull();
    await toca(screen.getByRole("button", { name: /Ya decididas \(1\)/ }));
    expect(screen.getByText("JULIO GARAY")).toBeTruthy();
    await toca(screen.getByRole("button", { name: "cambiar" }));
    const si = boton(/^Sí a JULIO GARAY el lun 24 ago$/)!;
    expect(si.getAttribute("aria-pressed")).toBe("true");
    await toca(si);
    expect(enviados[0].decision).toBeNull();
    expect(enviados[0].dias).toEqual([{ codigo: "11", fecha: "2026-08-24", minutos: 107 }]);
    expect(within(screen.getByTestId("vista-colaborador")).getByText("JULIO GARAY")).toBeTruthy();
  });

  it("tocar el otro botón cambia la decisión: Sí → No", async () => {
    vi.stubGlobal("fetch", servidor(CON_UNO_APROBADO));
    await montar();
    await toca(screen.getByRole("button", { name: /Ya decididas \(1\)/ }));
    await toca(screen.getByRole("button", { name: "cambiar" }));
    await toca(boton(/^No a JULIO GARAY el lun 24 ago$/));
    expect(enviados[0].decision).toBe("no");
  });
});

describe("🔴 lo que viaja es un PERMISO, nunca una plata", () => {
  it("el cuerpo lleva decisión y (código, fecha, minutos) — y ni un monto", async () => {
    await montar();
    await toca(screen.getByRole("button", { name: ROTULO_SI_A_TODO }));
    const cuerpo = JSON.stringify(enviados[0]);
    for (const prohibido of ["monto", "rata", "neto", "salario", "$"]) {
      expect(cuerpo, `«${prohibido}» viajó`).not.toContain(prohibido);
    }
    expect(Object.keys(enviados[0]).sort()).toEqual(["decision", "dias"]);
    for (const d of enviados[0].dias as Array<Record<string, unknown>>) {
      expect(Object.keys(d).sort()).toEqual(["codigo", "fecha", "minutos"]);
    }
  });

  it("🔑 la llave que se manda es la del DÍA, no la del período", async () => {
    await montar();
    await toca(boton(/^Sí a LUIS ARROYO$/));
    const ds = enviados[0].dias as Array<Record<string, unknown>>;
    expect(JSON.stringify(enviados[0])).not.toContain("desde");
    expect(claveDia(String(ds[0].codigo), String(ds[0].fecha))).toMatch(/^\d+\|2026-08-25$/);
  });
});

describe("sin nada que decidir", () => {
  it("lo dice y apaga el botón", async () => {
    vi.stubGlobal("fetch", servidor([]));
    render(<ToastProvider><AprobacionesTab /></ToastProvider>);
    await waitFor(() => expect(screen.getByText(/Nadie hizo horas extra/)).toBeTruthy());
    expect((screen.getByRole("button", { name: ROTULO_SI_A_TODO }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("ya-decididas")).toBeNull();
  });

  it("⛔ la casilla no vuelve: ni un checkbox en la pantalla", async () => {
    await montar();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});
