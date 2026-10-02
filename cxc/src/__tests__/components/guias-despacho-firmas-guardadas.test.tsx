/**
 * CANDADO · LAS FIRMAS DEL DESPACHO SOBREVIVEN A UNA RECARGA (1-oct-2026).
 * Daniel aprobó guardar SOLO las dos firmas del despacho de bodega: se
 * restauran solas y sin aviso, y se borran al completar o a las 24 h. Nada más
 * del formulario se guarda (Daniel: *«son par de clics»*).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDespachoGuia } from "@/app/guias/components/useDespachoGuia";
import { guardarFirma, leerFirma, barrerFirmasVencidas, VIDA_FIRMA_MS } from "@/lib/guias/firmas-despacho";

const GUIA = {
  id: "g1",
  numero: 7,
  estado: "Pendiente Bodega",
  guia_items: [{ id: "i1", bultos: 2, numero_guia_transp: "" }],
};

// Un localStorage propio: Node 26 trae el suyo, que tapa el de jsdom y no guarda.
function almacen(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}
const claves = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).sort();

beforeEach(() => {
  vi.stubGlobal("localStorage", almacen());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/guias/despachos-frecuentes")) return new Response(JSON.stringify({ juegos: [] }));
      if (init?.method === "PUT") return new Response("{}", { status: 200 });
      return new Response(JSON.stringify(GUIA));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("firmas del despacho guardadas por guía", () => {
  it("se guardan al firmar y vuelven solas tras recargar; nada más se guarda", async () => {
    const a = renderHook(() => useDespachoGuia("g1"));
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    act(() => {
      a.result.current.setPendingFirma1("data:image/png;base64,UNO");
      a.result.current.setPendingFirma2("data:image/png;base64,DOS");
      a.result.current.setBReceptor("Juan");
      a.result.current.setBPlaca("AB123");
    });
    a.unmount();

    expect(claves()).toEqual(["guia_firma_g1_entregador", "guia_firma_g1_transportista"]);

    const b = renderHook(() => useDespachoGuia("g1"));
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    expect(b.result.current.pendingFirma1).toBe("data:image/png;base64,UNO");
    expect(b.result.current.pendingFirma2).toBe("data:image/png;base64,DOS");
    expect(b.result.current.bReceptor).toBe("");
    expect(b.result.current.bPlaca).toBe("");
  });

  it("se borran al completar el despacho", async () => {
    guardarFirma("g1", "transportista", "data:x");
    guardarFirma("g1", "entregador", "data:y");
    const { result } = renderHook(() => useDespachoGuia("g1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.confirmarDespacho("data:x", "data:y"); });
    expect(localStorage.getItem("guia_firma_g1_transportista")).toBeNull();
    expect(localStorage.getItem("guia_firma_g1_entregador")).toBeNull();
  });

  it("vencen a las 24 h, y la firma vieja sin fecha se descarta", () => {
    const t0 = 1_000_000;
    guardarFirma("g1", "transportista", "data:x", t0);
    expect(leerFirma("g1", "transportista", t0 + VIDA_FIRMA_MS - 1)).toBe("data:x");
    expect(leerFirma("g1", "transportista", t0 + VIDA_FIRMA_MS)).toBeNull();
    expect(localStorage.getItem("guia_firma_g1_transportista")).toBeNull();

    guardarFirma("g2", "entregador", "data:y", t0);
    localStorage.setItem("guia_firma_g3_entregador", "data:sin-fecha");
    guardarFirma("g4", "entregador", "data:z", t0 + VIDA_FIRMA_MS);
    barrerFirmasVencidas(t0 + VIDA_FIRMA_MS);
    expect(claves()).toEqual(["guia_firma_g4_entregador"]);
  });
});
