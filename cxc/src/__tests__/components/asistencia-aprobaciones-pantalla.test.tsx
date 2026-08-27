/* ─────────────────────────────────────────────────────────────────────────────
 * APROBACIONES POR DÍA — CONDUCTA: se monta la pantalla y se tocan las casillas.
 *
 * Daniel, 27-ago-2026: *«que el usuario entre y vea por dias quienes y cuantas
 * horas, y pueda aprobar seleccionando todos o individualmente, por dia, por
 * semana»*, y de antes: *«con un clic se aprueba y ya»*.
 *
 * 🔴 POR QUÉ SE MONTA LA PANTALLA Y NO SE MIRA EL MÓDULO. Que
 * `armarDiasAprobacion` agrupe bien no prueba NADA sobre lo que Julio ve ni
 * sobre lo que sale por `fetch`. El riesgo de esta pantalla es que un toque
 * mande la lista equivocada — aprobar a alguien que no era, o un día que no
 * era. Eso solo se ve tocando.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { act } from "react";

import { ToastProvider } from "@/components/ToastSystem";
import AprobacionesTab from "@/app/asistencia/AprobacionesTab";
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
    salida: "18:11", minutos, diurnoMin: minutos, nocturnoMin: 0,
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

async function montar(dias: DiaAprobacion[] = DIAS) {
  render(<ToastProvider><AprobacionesTab /></ToastProvider>);
  await waitFor(() => expect(screen.getByText(/lun 24/)).toBeTruthy());
}

/** Un toque de verdad sobre el DOM. */
async function toca(el: Element | null | undefined) {
  if (!el) throw new Error("no existe el elemento que se quiso tocar");
  await act(async () => { (el as HTMLElement).click(); });
}

const casilla = (etiqueta: RegExp) =>
  screen.getAllByRole("checkbox").find((c) => etiqueta.test(c.getAttribute("aria-label") ?? ""));

beforeEach(() => { enviados = []; vi.stubGlobal("fetch", servidor()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("🔴 se ve POR DÍAS, que es lo que pidió Daniel", () => {
  it("cada día es un renglón, con cuánta gente y cuántas horas", async () => {
    await montar();
    for (const t of ["lun 24", "mar 25", "mié 26"]) expect(screen.getByText(new RegExp(t))).toBeTruthy();
    // 178 min = 2:58
    expect(screen.getByText("2:58 h")).toBeTruthy();
  });

  it("los días arrancan CERRADOS — 28 personas abiertas serían siete pantallas", async () => {
    await montar();
    expect(screen.queryByText("JULIO GARAY")).toBeNull();
    await toca(screen.getByText(/lun 24/).closest("button"));
    expect(screen.getByText("JULIO GARAY")).toBeTruthy();
  });

  it("la semana agrupa los tres días", async () => {
    await montar();
    expect(screen.getByText(/Semana del 24 – 26 ago/)).toBeTruthy();
  });

  it("el contador dice cuántas faltan", async () => {
    await montar();
    // 2 + 1 + 1 persona-día. El número grande, no los conteos de cada fila.
    const linea = screen.getByText(/sin aprobar/).parentElement!;
    expect(linea.textContent).toMatch(/^4sin aprobar/);
  });
});

describe("🔴 las CUATRO formas de aprobar mandan la lista correcta", () => {
  it("UNA PERSONA: solo esa persona y solo ese día", async () => {
    await montar();
    await toca(screen.getByText(/lun 24/).closest("button"));
    await toca(casilla(/Aprobar KEVIN LUBO/));
    expect(enviados).toHaveLength(1);
    expect(enviados[0].aprobado).toBe(true);
    expect(enviados[0].dias).toEqual([{ codigo: "6", fecha: "2026-08-24", minutos: 71 }]);
  });

  it("UN DÍA: toda su gente, de ese día y de ningún otro", async () => {
    await montar();
    await toca(casilla(/Aprobar lun 24 ago/));
    expect(enviados).toHaveLength(1);
    const ds = enviados[0].dias as Array<Record<string, unknown>>;
    expect(ds).toHaveLength(2);
    expect(new Set(ds.map((d) => d.codigo))).toEqual(new Set(["11", "6"]));
    expect(ds.every((d) => d.fecha === "2026-08-24")).toBe(true);
  });

  it("UNA SEMANA: los tres días completos", async () => {
    await montar();
    await toca(casilla(/Aprobar la semana/));
    const ds = enviados[0].dias as Array<Record<string, unknown>>;
    expect(ds).toHaveLength(4);
    expect(new Set(ds.map((d) => d.fecha)))
      .toEqual(new Set(["2026-08-24", "2026-08-25", "2026-08-26"]));
  });

  it("TODO: las cuatro de una", async () => {
    await montar();
    await toca(screen.getByRole("button", { name: "Aprobar todo" }));
    expect((enviados[0].dias as unknown[]).length).toBe(4);
    expect(enviados[0].aprobado).toBe(true);
  });
});

describe("🔴 se puede DESAPROBAR — un toque de más no es irreversible", () => {
  const CON_UNO_APROBADO: DiaAprobacion[] = [
    { ...DIAS[0], gente: gente([["11", "JULIO GARAY", 107, true], ["6", "KEVIN LUBO", 71, false]]) },
  ];

  it("volver a tocar una casilla aprobada manda `aprobado: false`", async () => {
    vi.stubGlobal("fetch", servidor(CON_UNO_APROBADO));
    await montar(CON_UNO_APROBADO);
    await toca(screen.getByText(/lun 24/).closest("button"));
    await toca(casilla(/Aprobar JULIO GARAY/));
    expect(enviados[0].aprobado).toBe(false);
    expect(enviados[0].dias).toEqual([{ codigo: "11", fecha: "2026-08-24", minutos: 107 }]);
  });

  it("el día a medias se ve a medias, no aprobado", async () => {
    vi.stubGlobal("fetch", servidor(CON_UNO_APROBADO));
    await montar(CON_UNO_APROBADO);
    const cb = casilla(/Aprobar lun 24 ago/) as HTMLInputElement;
    expect(cb.checked).toBe(false);
    expect(cb.indeterminate).toBe(true);
  });
});

describe("🔴 lo que viaja es un PERMISO, nunca una plata", () => {
  it("el cuerpo lleva código, fecha y minutos — y ni un monto", async () => {
    await montar();
    await toca(screen.getByRole("button", { name: "Aprobar todo" }));
    const cuerpo = JSON.stringify(enviados[0]);
    for (const prohibido of ["monto", "rata", "neto", "salario", "$"]) {
      expect(cuerpo, `«${prohibido}» viajó`).not.toContain(prohibido);
    }
    for (const d of enviados[0].dias as Array<Record<string, unknown>>) {
      expect(Object.keys(d).sort()).toEqual(["codigo", "fecha", "minutos"]);
    }
  });

  it("🔑 la llave que se manda es la del DÍA, no la del período", async () => {
    await montar();
    await toca(casilla(/Aprobar lun 24 ago/));
    const ds = enviados[0].dias as Array<Record<string, unknown>>;
    // Ni «desde» ni «hasta» en ningún lado: el corte de la quincena no entra.
    expect(JSON.stringify(enviados[0])).not.toContain("desde");
    expect(claveDia(String(ds[0].codigo), String(ds[0].fecha))).toMatch(/^\d+\|2026-08-24$/);
  });
});

describe("sin nada que aprobar", () => {
  it("lo dice y no ofrece el botón", async () => {
    vi.stubGlobal("fetch", servidor([]));
    render(<ToastProvider><AprobacionesTab /></ToastProvider>);
    await waitFor(() => expect(screen.getByText(/Nadie hizo horas extra/)).toBeTruthy());
    expect((screen.getByRole("button", { name: "Aprobar todo" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
