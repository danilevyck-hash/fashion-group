// 🔴 Despachos › Pedidos › «Muestras» (24-nov-2026, Daniel aprobó el mockup).
// Las reglas puras de `lib/guias/muestras.ts`.
import { describe, it, expect } from "vitest";
import {
  MUESTRAS_2026_11,
  cambioDeEspera,
  codigosAPedir,
  edadEnDias,
  empresasDeMuestrasDe,
  haceTiempo,
  lineaDeEsperaDelPedido,
  lineaParaBodega,
  limpiarGuia,
  columnasDeAccion,
  lineaReclamada,
  muestraSigueViva,
  muestraVieja,
  pedidoEnEspera,
  puedeAccionMuestra,
  puedePedirMuestra,
  rotuloPedirMuestras,
  vendedorDeMuestra,
  veSeccionMuestras,
  agruparPorPedido,
  type MuestraLeida,
} from "@/lib/guias/muestras";

const bodega = { role: "bodega", userName: "julio" };
const jorman = { role: "bodega", userName: "jorman" };
const rey = { role: "vendedor", userName: "rey" };
const edwin = { role: "vendedor", userName: "edwin" };
const daniel = { role: "admin", userName: "daniel" };
const angela = { role: "secretaria", userName: "angela" };
const otroVendedor = { role: "vendedor", userName: "reinaldo" };

const AHORA = "2026-11-24T20:00:00.000Z";
const m = (over: Partial<MuestraLeida> = {}): MuestraLeida => ({
  id: 1, empresa_key: "fashion_shoes", pedido_switch_id: 2228, codigo: "TWLENILA140", descripcion: "Women-Sneakers",
  estado: "falta", pedida_por: "julio", pedida_en: "2026-11-24T18:00:00.000Z",
  enviada_por: null, enviada_en: null, reclamada_por: null, reclamada_en: null, ...over,
});

describe("quién manda la muestra (escrito a mano)", () => {
  it("Vistana → edwin; las otras 5 → rey", () => {
    expect(vendedorDeMuestra("vistana")).toBe("edwin");
    for (const e of ["fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"]) expect(vendedorDeMuestra(e)).toBe("rey");
  });
  it("cada vendedor ve solo sus empresas; Daniel las 6; los demás ninguna", () => {
    expect(empresasDeMuestrasDe("edwin", "vendedor")).toEqual(["vistana"]);
    expect(empresasDeMuestrasDe("Rey", "vendedor")).toHaveLength(5);
    expect(empresasDeMuestrasDe("rey", "vendedor")).not.toContain("vistana");
    expect(empresasDeMuestrasDe("daniel", "admin")).toHaveLength(6);
    expect(empresasDeMuestrasDe("reinaldo", "vendedor")).toEqual([]);
    expect(empresasDeMuestrasDe("julio", "bodega")).toEqual([]);
    // control: el nombre rey con otro rol no ve nada
    expect(empresasDeMuestrasDe("rey", "secretaria")).toEqual([]);
  });
  it("la sección Muestras la ven el vendedor asignado y admin", () => {
    expect(MUESTRAS_2026_11).toBe(true);
    expect(veSeccionMuestras("rey", "vendedor")).toBe(true);
    expect(veSeccionMuestras("daniel", "admin")).toBe(true);
    expect(veSeccionMuestras("julio", "bodega")).toBe(false);
    expect(veSeccionMuestras("reinaldo", "vendedor")).toBe(false);
  });
});

describe("permisos (los usa el servidor)", () => {
  it("pedir: bodega y admin, de sus empresas, con el pedido sin recibir", () => {
    expect(puedePedirMuestra({ empresa_key: "fashion_shoes", estadoPedido: "en_preparacion" }, bodega).ok).toBe(true);
    expect(puedePedirMuestra({ empresa_key: "fashion_shoes", estadoPedido: "pendiente" }, daniel).ok).toBe(true);
    expect(puedePedirMuestra({ empresa_key: "fashion_shoes", estadoPedido: "en_preparacion" }, rey).ok).toBe(false);
    expect(puedePedirMuestra({ empresa_key: "fashion_shoes", estadoPedido: "en_preparacion" }, angela).ok).toBe(false);
    expect(puedePedirMuestra({ empresa_key: "fashion_shoes", estadoPedido: "en_preparacion" }, jorman).ok).toBe(false);
    expect(puedePedirMuestra({ empresa_key: "vistana", estadoPedido: "en_preparacion" }, jorman).ok).toBe(true);
    expect(puedePedirMuestra({ empresa_key: "vistana", estadoPedido: "recibido" }, bodega).ok).toBe(false);
  });
  it("«Enviada»: solo el vendedor asignado o admin, desde Falta o No llegó", () => {
    expect(puedeAccionMuestra("enviada", { empresa_key: "fashion_shoes", estado: "falta" }, rey).ok).toBe(true);
    expect(puedeAccionMuestra("enviada", { empresa_key: "fashion_shoes", estado: "no_llego" }, rey).ok).toBe(true);
    expect(puedeAccionMuestra("enviada", { empresa_key: "vistana", estado: "falta" }, rey).ok).toBe(false);
    expect(puedeAccionMuestra("enviada", { empresa_key: "vistana", estado: "falta" }, edwin).ok).toBe(true);
    expect(puedeAccionMuestra("enviada", { empresa_key: "fashion_shoes", estado: "falta" }, edwin).ok).toBe(false);
    expect(puedeAccionMuestra("enviada", { empresa_key: "fashion_shoes", estado: "falta" }, bodega).ok).toBe(false);
    expect(puedeAccionMuestra("enviada", { empresa_key: "fashion_shoes", estado: "falta" }, otroVendedor).ok).toBe(false);
    expect(puedeAccionMuestra("enviada", { empresa_key: "fashion_shoes", estado: "falta" }, daniel).ok).toBe(true);
    expect(puedeAccionMuestra("enviada", { empresa_key: "fashion_shoes", estado: "enviada" }, rey).ok).toBe(false);
  });
  it("«No llegó» y «Quitar»: bodega o admin de sus empresas", () => {
    expect(puedeAccionMuestra("no_llego", { empresa_key: "fashion_shoes", estado: "enviada" }, bodega).ok).toBe(true);
    expect(puedeAccionMuestra("no_llego", { empresa_key: "fashion_shoes", estado: "falta" }, bodega).ok).toBe(false);
    expect(puedeAccionMuestra("no_llego", { empresa_key: "fashion_shoes", estado: "enviada" }, rey).ok).toBe(false);
    expect(puedeAccionMuestra("no_llego", { empresa_key: "fashion_shoes", estado: "enviada" }, jorman).ok).toBe(false);
    expect(puedeAccionMuestra("quitar", { empresa_key: "fashion_shoes", estado: "falta" }, bodega).ok).toBe(true);
    expect(puedeAccionMuestra("quitar", { empresa_key: "fashion_shoes", estado: "enviada" }, bodega).ok).toBe(false);
    expect(puedeAccionMuestra("quitar", { empresa_key: "fashion_shoes", estado: "falta" }, rey).ok).toBe(false);
  });
});

describe("la espera automática del pedido", () => {
  it("prendida mientras haya Falta o No llegó", () => {
    expect(pedidoEnEspera(["enviada", "falta"])).toBe(true);
    expect(pedidoEnEspera(["enviada", "no_llego"])).toBe(true);
    expect(pedidoEnEspera(["enviada", "enviada"])).toBe(false);
    expect(pedidoEnEspera([])).toBe(false);
  });
  it("solo En preparación toca la columna (CHECK de la base)", () => {
    expect(cambioDeEspera("en_preparacion", false, 2)).toBe("poner");
    expect(cambioDeEspera("en_preparacion", true, 0)).toBe("quitar");
    expect(cambioDeEspera("en_preparacion", true, 1)).toBeNull();
    expect(cambioDeEspera("en_preparacion", false, 0)).toBeNull();
    expect(cambioDeEspera("preparado", false, 2)).toBeNull();
    expect(cambioDeEspera(null, false, 2)).toBeNull();
    expect(cambioDeEspera("recibido", true, 0)).toBeNull();
  });
  it("la línea del pedido cuenta referencias", () => {
    expect(lineaDeEsperaDelPedido(2, "en_preparacion")).toBe("En espera de muestra · 2 referencias");
    expect(lineaDeEsperaDelPedido(1, "pendiente")).toBe("Falta muestra · 1 referencia");
    expect(lineaDeEsperaDelPedido(0, "en_preparacion")).toBeNull();
  });
});

describe("al recibirse o facturarse, desaparece de la lista", () => {
  it("se ve solo con el pedido en Switch y sin recibir", () => {
    expect(muestraSigueViva(true, "en_preparacion")).toBe(true);
    expect(muestraSigueViva(true, undefined)).toBe(true);
    expect(muestraSigueViva(true, "recibido")).toBe(false);
    expect(muestraSigueViva(false, "preparado")).toBe(false);
  });
  it("agruparPorPedido descarta las de pedidos que ya no están vivos", () => {
    const vivos = new Map([["fashion_shoes:2228", { secuencial: "16-000002228", cliente_nombre: "City Mall Paso Canoa" }]]);
    const g = agruparPorPedido([m({ id: 2 }), m({ id: 3, pedido_switch_id: 9999 }), m({ id: 1, pedida_en: "2026-11-20T00:00:00Z" })], vivos);
    expect(g).toHaveLength(1);
    expect(g[0].muestras.map((x) => x.id)).toEqual([1, 2]);
  });
});

describe("textos", () => {
  it("lo que ve bodega", () => {
    expect(lineaParaBodega(m(), AHORA)).toBe("Falta muestra · esperando a Rey");
    expect(lineaParaBodega(m({ estado: "enviada", enviada_en: "2026-11-24T18:00:00Z" }), AHORA)).toBe("Enviada · 24-nov");
    expect(lineaParaBodega(m({ estado: "enviada", enviada_en: "2026-11-25T18:00:00Z", guia_envio: "123456" }), AHORA)).toBe("Enviada · Guía 123456 · 25-nov");
    // Día de PANAMÁ: las 2:00 UTC del 26 son todavía el 25 en Panamá.
    expect(lineaParaBodega(m({ estado: "enviada", enviada_en: "2026-11-26T02:00:00Z" }), AHORA)).toBe("Enviada · 25-nov");
    expect(lineaParaBodega(m({ estado: "no_llego", reclamada_en: "2026-11-24T19:00:00Z" }), AHORA)).toBe("No llegó · reclamada a Rey hace 1 h");
    expect(lineaParaBodega(m({ empresa_key: "vistana" }), AHORA)).toBe("Falta muestra · esperando a Edwin");
  });
  it("lo que ve el vendedor: edad, rojo pasados 2 días, y la reclamada", () => {
    expect(edadEnDias("2026-11-24T10:00:00Z", AHORA).texto).toBe("hoy");
    expect(edadEnDias("2026-11-21T10:00:00Z", AHORA)).toEqual({ dias: 3, texto: "hace 3 días" });
    expect(muestraVieja(2)).toBe(false);
    expect(muestraVieja(3)).toBe(true);
    expect(lineaReclamada(m({ estado: "no_llego", reclamada_en: "2026-11-24T19:00:00Z" }), AHORA)).toBe("No llegó · reclamada hace 1 h");
    expect(lineaReclamada(m(), AHORA)).toBeNull();
    expect(haceTiempo("2026-11-24T19:55:00Z", AHORA)).toBe("hace 5 min");
    expect(haceTiempo("2026-11-21T19:00:00Z", AHORA)).toBe("hace 3 días");
    expect(haceTiempo("2026-11-23T19:00:00Z", AHORA)).toBe("hace 1 día");
    expect(rotuloPedirMuestras(2)).toBe("Pedir 2 muestras");
    expect(rotuloPedirMuestras(1)).toBe("Pedir 1 muestra");
  });
  it("solo se piden referencias del pedido, sin repetir ni las que ya tienen muestra", () => {
    expect(codigosAPedir(["A", " B ", "A", "X", 7, "C"], ["A", "B", "C"], ["C"])).toEqual(["A", "B"]);
  });
});

describe("N.° de guía (opcional, una por caja)", () => {
  it("vacío = sin guía; se recorta; más de 40 no vale", () => {
    expect(limpiarGuia(undefined)).toBeNull();
    expect(limpiarGuia("   ")).toBeNull();
    expect(limpiarGuia(" 123  456 ")).toBe("123 456");
    expect(limpiarGuia("x".repeat(41))).toBeUndefined();
    expect(limpiarGuia(123)).toBeUndefined();
  });
  it("solo «Enviada» escribe la guía", () => {
    expect(columnasDeAccion("enviada", "rey", "t", "G1")).toMatchObject({ estado: "enviada", guia_envio: "G1" });
    expect(columnasDeAccion("enviada", "rey", "t")).toMatchObject({ guia_envio: null });
    expect(columnasDeAccion("no_llego", "julio", "t")).not.toHaveProperty("guia_envio");
  });
});
