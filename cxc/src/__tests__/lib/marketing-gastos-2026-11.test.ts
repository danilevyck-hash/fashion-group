// Candado de `lib/ui/marketing-gastos-2026-11.ts` (27-nov-2026).
import { describe, expect, it } from "vitest";
import { faltaEnElDestino, PCT_AL_REGISTRAR, tiendaQueSeGuarda } from "@/lib/marketing/solo-cobrable-2026-10";
import {
  MKT_ANULAR_EN_LA_LISTA_2026_11,
  MKT_EDITAR_DESDE_EL_COBRO_2026_11,
  MKT_SIN_TIENDA_AL_REGISTRAR_2026_11,
} from "@/lib/ui/marketing-gastos-2026-11";

const nadaPropio = () => false;

describe("Marketing › Gastos, 27-nov-2026", () => {
  it("los tres interruptores están prendidos", () => {
    expect([MKT_SIN_TIENDA_AL_REGISTRAR_2026_11, MKT_ANULAR_EN_LA_LISTA_2026_11, MKT_EDITAR_DESDE_EL_COBRO_2026_11]).toEqual([true, true, true]);
  });

  it("«Se cobra» nace en 50 %", () => {
    expect(PCT_AL_REGISTRAR).toBe(50);
  });

  it("sin tienda elegida falta la tienda; con «Sin tienda» no, y se guarda en «General» (null)", () => {
    const base = { marcaId: "m-th", tienda: null, pct: 50 as const };
    expect(faltaEnElDestino(base, nadaPropio)).toEqual(["la tienda"]);
    expect(faltaEnElDestino({ ...base, sinTienda: true }, nadaPropio)).toEqual([]);
    expect(tiendaQueSeGuarda(null)).toBeNull();
    // La marca sigue siendo obligatoria.
    expect(faltaEnElDestino({ ...base, marcaId: "", sinTienda: true }, nadaPropio)).toEqual(["la marca"]);
  });
});

describe("Anular desde la lista", () => {
  it("solo facturas e impulsadora, y solo quien escribe", async () => {
    const { seAnulaDesdeLaLista } = await import("@/app/marketing/components/nuevo/GastosNuevo");
    expect(seAnulaDesdeLaLista({ tipo: "factura" }, true)).toBe(true);
    expect(seAnulaDesdeLaLista({ tipo: "impulsadora" }, true)).toBe(true);
    expect(seAnulaDesdeLaLista({ tipo: "mobiliario" }, true)).toBe(false);
    expect(seAnulaDesdeLaLista({ tipo: "factura" }, false)).toBe(false);
  });

  it("usa la MISMA ruta que la ficha de la tienda", async () => {
    const { anularGasto } = await import("@/app/marketing/components/nuevo/GastosNuevo");
    const calls: Array<[string, RequestInit]> = [];
    const f = globalThis.fetch;
    globalThis.fetch = (async (u: string, i: RequestInit) => { calls.push([u, i]); return { ok: true } as Response; }) as typeof fetch;
    try {
      expect(await anularGasto("f-1")).toBe(true);
    } finally {
      globalThis.fetch = f;
    }
    expect(calls[0][0]).toBe("/api/marketing/facturas/f-1/anular");
    expect(calls[0][1].method).toBe("POST");
    expect(JSON.parse(String(calls[0][1].body)).motivo).toBeTruthy();
  });
});
