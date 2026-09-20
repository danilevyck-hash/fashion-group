/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — EL RECIBO VIEJO SE DICE, PERO NO PIDE UN CLIC (20-sep-2026).
 *
 * 🩸 Medido contra producción: el aviso «Este recibo es del 23 de junio, antes
 * de que abriera el período Nº3 — ¿Guardar igual?» saltaba en 25 de los 26
 * recibos del período abierto (36 de 77 en toda la historia) y SIEMPRE se
 * contestaba igual, porque los recibos se cargan de golpe al cerrar. Una
 * ventana que siempre se contesta que sí no es un aviso: es un trámite.
 *
 * Lo que este archivo vigila:
 *  - una fecha ANTERIOR a la apertura sale como línea gris bajo el campo de
 *    fecha, y el gasto se guarda de una, sin ventana ni clic;
 *  - 🔴 SE SIGUE DICIENDO: la línea nombra el día y el período;
 *  - la VENTANA se queda para la fecha POSTERIOR al cierre;
 *  - CONTROL: el aviso del recibo REPETIDO sigue abriendo su ventana;
 *  - CONTROL: el freno de fecha futura del SERVIDOR no se tocó.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import NuevoGastoDrawer from "@/app/caja/components/NuevoGastoDrawer";
import { avisoDeFechaPideVentana } from "@/lib/caja/fecha-en-periodo";

// El período Nº3 de verdad: abrió el 2-sep-2026 y su recibo más viejo es del
// 23 de junio.
const PERIODO = { id: "p-3", numero: 3, fondo_inicial: 200, fecha_apertura: "2026-09-02", fecha_cierre: null };
const FECHA_VIEJA = "2026-06-23";

let posts: Array<Record<string, unknown>>;

function memStorage(): Storage {
  const mem = new Map<string, string>();
  return {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => { mem.clear(); },
    key: (i: number) => Array.from(mem.keys())[i] ?? null,
    get length() { return mem.size; },
  } as Storage;
}

function stubApi() {
  posts = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    const j = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (url.includes("/api/caja/categorias")) return j(["Alimentación", "Transporte", "Otros"]);
    if (url.includes("/api/caja/gastos") && method === "POST") {
      posts.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return j({ id: "g-nuevo" });
    }
    return j({});
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
}

function montar(periodo: Record<string, unknown> = PERIODO) {
  render(
    <NuevoGastoDrawer
      open
      onClose={vi.fn()}
      periodo={periodo as never}
      totalGastado={0}
      isOwner={false}
      onSaved={vi.fn()}
    />,
  );
}

/** Llena lo obligatorio con la fecha que se le pase. */
async function llenar(fecha: string) {
  fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: fecha } });
  fireEvent.change(screen.getByLabelText("Nota"), { target: { value: "Comida" } });
  fireEvent.change(screen.getByLabelText("Proveedor"), { target: { value: "Super 99" } });
  fireEvent.change(screen.getByLabelText("Subtotal"), { target: { value: "10.59" } });
  await waitFor(() => {
    const btn = screen.getByRole("button", { name: "Guardar gasto" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  }, { timeout: 3000 });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", memStorage());
  stubApi();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("🔴 LA FECHA ANTERIOR A LA APERTURA: LÍNEA GRIS, NO VENTANA", () => {
  it("se dice debajo de la fecha, nombrando el día y el período", async () => {
    montar();
    await llenar(FECHA_VIEJA);
    const texto = document.body.textContent || "";
    expect(texto).toContain("23 de junio");
    expect(texto).toContain("período Nº 3");
  });

  it("🔴 guarda de una: ni ventana ni «Guardar igual»", async () => {
    montar();
    await llenar(FECHA_VIEJA);
    fireEvent.click(screen.getByRole("button", { name: "Guardar gasto" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].fecha).toBe(FECHA_VIEJA);
    expect(screen.queryByRole("button", { name: "Guardar igual" })).toBeNull();
  });

  it("CONTROL: una fecha de adentro del período no dice nada", async () => {
    montar();
    await llenar("2026-09-03");
    const texto = document.body.textContent || "";
    expect(texto).not.toContain("antes de que abriera");
  });
});

describe("🔴 LA VENTANA SE QUEDA PARA LA FECHA POSTERIOR AL CIERRE", () => {
  it("un recibo de después del cierre sí abre la ventana, con «Guardar igual»", async () => {
    montar({ ...PERIODO, numero: 2, fecha_apertura: "2026-07-08", fecha_cierre: "2026-09-02" });
    await llenar("2026-09-05");
    fireEvent.click(screen.getByRole("button", { name: "Guardar gasto" }));
    await screen.findByText(/después de que cerrara/);
    expect(posts).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Guardar igual" }));
    await waitFor(() => expect(posts).toHaveLength(1));
  });

  it("la regla, en el módulo puro: solo «despues» pide ventana", () => {
    expect(avisoDeFechaPideVentana(FECHA_VIEJA, PERIODO)).toBe(false);
    expect(avisoDeFechaPideVentana("2026-09-03", PERIODO)).toBe(false);
    expect(avisoDeFechaPideVentana("2026-09-05", { numero: 2, fecha_apertura: "2026-07-08", fecha_cierre: "2026-09-02" })).toBe(true);
  });
});

describe("CONTROL: lo que sigue frenando", () => {
  it("el recibo REPETIDO sigue abriendo su ventana", async () => {
    montar({
      ...PERIODO,
      gastos: [{ fecha: "2026-09-03", proveedor: "Super 99", nro_factura: "196854200", total: 10.59 }],
    });
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-09-03" } });
    fireEvent.change(screen.getByLabelText("Nota"), { target: { value: "Comida" } });
    fireEvent.change(screen.getByLabelText("Proveedor"), { target: { value: "Super 99" } });
    fireEvent.change(screen.getByLabelText("Nº de factura"), { target: { value: "196854200" } });
    fireEvent.change(screen.getByLabelText("Subtotal"), { target: { value: "10.59" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar gasto" }));
    await screen.findByText(/Ya hay un gasto igual/);
    expect(posts).toHaveLength(0);
  });

  it("🔴 el freno de FECHA FUTURA del servidor no se tocó", () => {
    const ruta = readFileSync(join(process.cwd(), "src/app/api/caja/gastos/route.ts"), "utf8");
    expect(ruta).toContain("La fecha no puede ser futura");
    expect(ruta).toContain("hoyPanama");
  });
});
