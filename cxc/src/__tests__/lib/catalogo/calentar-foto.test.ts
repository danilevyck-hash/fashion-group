import { describe, it, expect, vi, afterEach } from "vitest";
import { calentarFoto } from "@/lib/catalogo/calentar-foto";

const URL_SB = "https://x.supabase.co/storage/v1/object/public/b/a.jpg";

afterEach(() => vi.unstubAllGlobals());

describe("calentarFoto", () => {
  it("pide la versión reducida de 600 px", async () => {
    const f = vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(0) });
    vi.stubGlobal("fetch", f);
    calentarFoto(URL_SB);
    await new Promise((r) => setTimeout(r, 0));
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toContain("/render/image/public/b/a.jpg?width=600");
  });
  it("no pide nada si no hay foto o no es de Supabase, y no falla si el pedido falla", async () => {
    const f = vi.fn().mockRejectedValue(new Error("red"));
    vi.stubGlobal("fetch", f);
    calentarFoto(null);
    calentarFoto("https://otro.com/a.jpg");
    calentarFoto(URL_SB);
    await new Promise((r) => setTimeout(r, 0));
    expect(f).toHaveBeenCalledTimes(1);
  });
});
