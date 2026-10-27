// Candado: Tommy y Calvin reconocen la marca por su NOMBRE exacto, no por un
// solo id, y fallan ABIERTO al id de siempre (27-oct-2026).
import { describe, it, expect, vi } from "vitest";
import { filtroDeMarca, CATALOGO_MARCA_POR_NOMBRE } from "@/lib/switch-api/catalogo-marca-por-nombre";
import type { SwitchArticulo } from "@/lib/switch-api/client";

const art = (id: number, marcaId: number | null): SwitchArticulo =>
  ({ id, codigo: `A${id}`, marcaId, codigoBarra: `CB${marcaId}` }) as SwitchArticulo;

const clienteCon = (nombres: Record<string, string>, falla = false) => ({
  getArticuloInfo: vi.fn(async (cb: string) => {
    if (falla) throw new Error("Switch caído");
    return { articulo: { marca: nombres[cb] ?? null } } as never;
  }),
});

describe("la marca por su nombre", () => {
  it("el interruptor está prendido", () => {
    expect(CATALOGO_MARCA_POR_NOMBRE).toBe(true);
  });

  it("Tommy: 3, 26 y 31 entran; 5 «TH KIDS» queda afuera", async () => {
    const arts = [art(1, 3), art(2, 26), art(3, 31), art(4, 5), art(5, 31)];
    const c = clienteCon({ CB26: "TH FOOTWEAR", CB31: " TH FOOTWEAR ", CB5: "TH KIDS" });
    const f = await filtroDeMarca(arts, c, "TH FOOTWEAR", 3);
    expect(arts.filter(f).map((a) => a.id)).toEqual([1, 2, 3, 5]);
    // Una ficha por marcaId nuevo; el 3 no se pregunta.
    expect(c.getArticuloInfo).toHaveBeenCalledTimes(3);
  });

  it("nunca por parecido ni por mayúsculas", async () => {
    const arts = [art(1, 40), art(2, 41), art(3, 42)];
    const c = clienteCon({ CB40: "TH FOOTWEAR KIDS", CB41: "th footwear", CB42: "TH DISPLAY & PROMO" });
    const f = await filtroDeMarca(arts, c, "TH FOOTWEAR", 3);
    expect(arts.filter(f)).toEqual([]);
  });

  it("si la ficha falla, solo entra el 3", async () => {
    const arts = [art(1, 3), art(2, 26), art(3, 31)];
    const f = await filtroDeMarca(arts, clienteCon({}, true), "TH FOOTWEAR", 3);
    expect(arts.filter(f).map((a) => a.id)).toEqual([1]);
  });

  it("Calvin: 8 y 69 entran", async () => {
    const arts = [art(1, 8), art(2, 69), art(3, 3)];
    const c = clienteCon({ CB69: "CK FOOTWEAR", CB3: "CK LEGWEAR" });
    const f = await filtroDeMarca(arts, c, "CK FOOTWEAR", 8);
    expect(arts.filter(f).map((a) => a.id)).toEqual([1, 2]);
  });

  it("apagado = el id de siempre, sin preguntarle nada a Switch", async () => {
    const arts = [art(1, 3), art(2, 26)];
    const c = clienteCon({ CB26: "TH FOOTWEAR" });
    const f = await filtroDeMarca(arts, c, "TH FOOTWEAR", 3, false);
    expect(arts.filter(f).map((a) => a.id)).toEqual([1]);
    expect(c.getArticuloInfo).not.toHaveBeenCalled();
  });
});
