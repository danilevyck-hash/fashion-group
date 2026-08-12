/**
 * CANDADO — los chips de marca de una entrega FILTRAN las claves en $0
 * (12-ago-2026, aprobado por Daniel: "y si borra la basurita").
 *
 * `total_por_marca` puede traer una clave con monto 0 ("esta marca no llevó
 * nada"). Un chip "[K] Karl Lagerfeld → $0.00" se lee como si le tocara algo
 * — el mismo criterio del sellado (inventario.ts filtra monto > 0). Hoy no
 * hay ninguna clave en $0 en producción: esto es PREVENCIÓN, para que la
 * próxima no se dibuje.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import EntregasSection from "@/app/marketing/components/EntregasSection";
import type { MkMarca, ProyectoConMarcas } from "@/lib/marketing/types";

const CK: MkMarca = {
  id: "m-ck",
  nombre: "Calvin Klein",
  codigo: "CK",
  empresa_codigo: "fashion_wear",
  tipo: "externa",
  activo: true,
  created_at: "2026-01-01T00:00:00Z",
} as MkMarca;
const KL: MkMarca = { ...CK, id: "m-kl", nombre: "Karl Lagerfeld", codigo: "KL" };

const PROYECTO = {
  id: "proy-1",
  nombre: "Apertura",
  tienda: "Nova Lux, S.a.",
  marcas: [],
} as unknown as ProyectoConMarcas;

function instalarFetch(entregas: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      const json = (body: unknown) => ({
        ok: true,
        status: 200,
        json: async () => body,
      });
      if (url.includes("/api/marketing/inventario/entregas")) {
        return json(entregas);
      }
      if (url.includes("/api/marketing/inventario/productos")) return json([]);
      return json({});
    }),
  );
}

function montar() {
  return render(
    <ToastProvider>
      <EntregasSection
        proyecto={PROYECTO}
        marcasParaEntrega={[]}
        marcasCatalogo={[CK, KL]}
      />
    </ToastProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("chips de marca por entrega", () => {
  it("una clave en $0 NO dibuja chip; las que llevan plata sí", async () => {
    instalarFetch([
      {
        id: "e-1",
        total: 1040,
        total_por_marca: { "m-ck": 1040, "m-kl": 0 },
        items: [],
        notas: null,
      },
    ]);
    montar();
    await waitFor(() =>
      expect(screen.getByText("Calvin Klein")).toBeTruthy(),
    );
    expect(screen.queryByText("Karl Lagerfeld")).toBeNull();
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("con TODAS las claves en $0 dice 'Sin reparto', no una fila de ceros", async () => {
    instalarFetch([
      {
        id: "e-2",
        total: 0,
        total_por_marca: { "m-ck": 0, "m-kl": 0 },
        items: [],
        notas: null,
      },
    ]);
    montar();
    await waitFor(() => expect(screen.getByText("Sin reparto")).toBeTruthy());
    expect(screen.queryByText("Calvin Klein")).toBeNull();
  });
});
