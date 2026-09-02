/**
 * La RUTA `/api/gastos-contabilidad/egresos`, ejecutada de verdad, para UNA
 * cosa: que la línea de «esto no se pudo leer» LLEGUE al navegador.
 *
 * 🩸 POR QUÉ EXISTE, y por qué no alcanza con un barrido estático. Este repo ya
 * lo pagó en `/api/saldos-banco`: cambiar el `return` del GET de
 * `{ bancos, historial }` a `{ bancos }` no puso rojo NADA, porque el barrido
 * veía que el archivo llamaba a la función y se daba por satisfecho — con el
 * resultado calculado y tirado a la basura. La pantalla habría perdido el
 * historial EN SILENCIO.
 *
 * Acá el riesgo es el mismo y peor: lo que se perdería en silencio es
 * justamente el aviso de que un gasto no entró. Así que se llama al handler
 * real y se mira el JSON.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "contabilidad", userName: "Contabilidad" }),
}));

// La lectura del mes no es lo que se prueba: se da por buena y vacía.
vi.mock("@/lib/egresos/leer", () => ({
  leerEgresosMes: vi.fn(async (mes: string) => ({ instalado: true, mes, empresas: [] })),
}));

/** Lo que `switch_sync_log` tiene para contar. Se cambia por test. */
let logFilas: Array<{ empresa_key: string; started_at: string; skip_details: unknown }> = [];

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: () => {
      const api: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gt", "gte", "in", "order", "limit"]) api[m] = () => api;
      (api as { then: unknown }).then = (res: (v: unknown) => unknown) =>
        res({ data: logFilas, error: null });
      return api;
    },
  },
}));

import { CAMPO_ILEGIBLE } from "@/lib/switch-api/renglones-ilegibles";

async function pedir(): Promise<{ avisoNoLeidos?: string | null }> {
  const { GET } = await import("@/app/api/gastos-contabilidad/egresos/route");
  const req = { nextUrl: { searchParams: new URLSearchParams("mes=2026-08") } };
  const res = await GET(req as never);
  return (await res.json()) as { avisoNoLeidos?: string | null };
}

beforeEach(() => {
  logFilas = [];
  vi.clearAllMocks();
});

describe("GET /api/gastos-contabilidad/egresos", () => {
  it("🔴 manda la línea de lo que no se pudo leer", async () => {
    logFilas = [
      {
        empresa_key: "vistana",
        started_at: new Date().toISOString(),
        skip_details: [
          {
            campo: CAMPO_ILEGIBLE,
            secuencial: "120-000009999",
            valorCrudo: { motivo: "No reconozco el código de cuenta", linea: 11 },
          },
        ],
      },
    ];
    const body = await pedir();
    expect(body.avisoNoLeidos).toContain("120-000009999");
    expect(body.avisoNoLeidos).toContain("Vistana");
  });

  it("CONTROL: sin descartes, la línea viaja en null y la pantalla no dibuja nada", async () => {
    logFilas = [];
    const body = await pedir();
    expect(body).toHaveProperty("avisoNoLeidos");
    expect(body.avisoNoLeidos).toBeNull();
  });

  it("el resto de la respuesta sigue intacto", async () => {
    const body = (await pedir()) as Record<string, unknown>;
    expect(body.instalado).toBe(true);
    expect(body.mes).toBe("2026-08");
    expect(body.empresas).toEqual([]);
  });
});
