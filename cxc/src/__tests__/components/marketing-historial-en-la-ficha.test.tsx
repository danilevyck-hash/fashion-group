/**
 * CANDADO — MARKETING › EL HISTORIAL DE CAMBIOS SE VE EN LA FICHA DEL GASTO
 * (9-oct-2026).
 *
 * El 7-oct-2026 Daniel pidió saber quién edita cada gasto: se guarda en
 * `activity_logs` y la ficha muestra una línea discreta («Modificado por
 * Ángela · 7 oct 10:29») que abre el historial completo.
 *
 * 🩸 La línea de la FACTURA vivía en una pantalla que se borró (#690): el
 * historial se seguía guardando y nadie lo veía. La ficha del gasto de hoy es
 * `FichaTiendaAcciones` (la abre Gastos y la ficha de la tienda), para la
 * factura y para la entrega de mobiliario. De ahí no se quita.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import FichaTiendaAcciones from "@/app/marketing/tienda/[codigo]/FichaTiendaAcciones";
import type { FilaDeTienda } from "@/lib/marketing/vista-tienda";

// El formulario de la factura no es lo que se prueba aquí.
vi.mock("@/components/marketing/FacturaForm", () => ({ FacturaForm: () => null }));
// El modal lee la barra lateral de `localStorage`, que jsdom aquí no trae.
vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({ useSidebarCollapsed: () => false }));

const CAMBIOS = [
  { id: "c2", action: "update", userRole: "secretaria", userName: "Ángela", createdAt: "2026-10-07T15:29:00Z" },
  { id: "c1", action: "create", userRole: "admin", userName: "Daniel", createdAt: "2026-10-01T14:00:00Z" },
];

function instalarFetch() {
  const pedidos: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      pedidos.push(url);
      const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
      if (url.includes("/api/marketing/historial")) return json(CAMBIOS);
      if (url.includes("/marcas")) return json([]);
      if (url.includes("/inventario/productos")) return json([]);
      if (url.includes("/inventario/entregas/")) {
        return json({ id: "e1", proyecto_id: null, total: 0, total_por_marca: {}, notas: null, items: [] });
      }
      if (url.includes("/api/marketing/facturas/")) {
        return json({ id: "f1", proyecto_id: null, numero_factura: "0000000142", adjuntos: [] });
      }
      return json({});
    }),
  );
  return pedidos;
}

function abrir(tipo: "factura" | "mueble", id: string) {
  const fila = { id, tipo, numero: "0000000142" } as unknown as FilaDeTienda;
  render(
    <ToastProvider>
      <FichaTiendaAcciones
        accion={{ tipo: "editar", fila }}
        marcas={[]}
        tiendaNombre="Nova Lux, S.A."
        onCerrar={vi.fn()}
        onCambio={vi.fn()}
      />
    </ToastProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Marketing · la ficha del gasto muestra quién lo modificó", () => {
  it("FACTURA: una línea con el último cambio, que abre el historial completo", async () => {
    const pedidos = instalarFetch();
    abrir("factura", "f1");
    const linea = await screen.findByRole("button", { name: /^Modificado por Ángela · / });
    expect(pedidos.some((u) => u.includes("entityType=mk_facturas") && u.includes("entityId=f1"))).toBe(true);
    fireEvent.click(linea);
    expect(await screen.findByText("Historial de cambios")).toBeTruthy();
    expect(screen.getByText(/por Daniel/)).toBeTruthy();
  });

  it("ENTREGA DE MOBILIARIO: la misma línea, con su propio historial", async () => {
    const pedidos = instalarFetch();
    abrir("mueble", "e1");
    expect(await screen.findByRole("button", { name: /^Modificado por Ángela · / })).toBeTruthy();
    expect(pedidos.some((u) => u.includes("entityType=mk_entregas_muebles") && u.includes("entityId=e1"))).toBe(true);
  });
});
