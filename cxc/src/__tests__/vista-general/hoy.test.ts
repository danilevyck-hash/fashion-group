import { describe, expect, it } from "vitest";
import {
  BOSTON,
  MULTIFASHION,
  VALOR_GRUPO,
  empresaValida,
  empresasDe,
  enlaceDe,
  opcionesEmpresaHoy,
  resumir,
  type EmpresaHoy,
} from "@/lib/vista-general/hoy";
import { descontarFantasmas, type InventarioEmpresa } from "@/lib/inventario/valorizado";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

const serie = (mes: number, v: number) => Array.from({ length: 12 }, (_, i) => (i < mes ? v : null));
const empresa = (o: Partial<EmpresaHoy> = {}): EmpresaHoy => ({
  ventas: { serie: serie(11, 100), seriePrev: serie(11, 80), utilidad: serie(11, 30), ventasMargen: serie(11, 90), costo: serie(11, 60) },
  cobros: 10,
  pedidos: { pendiente: 1, en_preparacion: 1, preparado: 0, atrasados: 1 },
  cxc: { total: 100, mas120: 40 },
  cxp: { total: 50, mas120: 5 },
  inventario: { costo: 1000, unidades: 10 },
  ...o,
});
const datos = () => {
  const empresas: Record<string, EmpresaHoy> = {};
  for (const k of B2B_EMPRESA_KEYS) empresas[k] = empresa();
  empresas[BOSTON] = { ventas: empresa().ventas, cobros: 5, cxc: { total: 9, mas120: 1 } };
  empresas[MULTIFASHION] = { ventas: empresa().ventas, cobros: 1, cxp: { total: 7, mas120: 0 }, inventario: { costo: 3, unidades: 2 } };
  return { mes: 11, empresas };
};

describe("Vista general HOY", () => {
  it("Fashion Group suma las 6 y NUNCA Boston ni Multifashion", () => {
    const r = resumir(empresasDe(VALOR_GRUPO), datos());
    expect(r.ventasMes?.actual).toBe(600);
    expect(r.ventasAnio?.actual).toBe(6600);
    expect(r.ventasAnio?.previo).toBe(6 * 880);
    expect(r.cxc).toEqual({ estado: "ok", valor: { total: 600, mas120: 240 } });
    expect(r.margenMes).toBeCloseTo(30 / 90);
  });

  it("lo que la empresa no maneja no se pinta; lo que no se pudo medir tampoco es $0", () => {
    const d = datos();
    const b = resumir([BOSTON], d);
    expect(b.pedidos.estado).toBe("no-maneja");
    expect(b.cxp.estado).toBe("no-maneja");
    expect(b.inventario.estado).toBe("no-maneja");
    expect(resumir([MULTIFASHION], d).cxc.estado).toBe("no-maneja");
    d.empresas.vistana = empresa({ cxc: null });
    expect(resumir(empresasDe(VALOR_GRUPO), d).cxc.estado).toBe("sin-medir");
  });

  it("selector: Fashion Group primero, Boston y Multifashion aparte; un valor raro cae al grupo", () => {
    const o = opcionesEmpresaHoy();
    expect(o[0]).toEqual({ valor: VALOR_GRUPO, etiqueta: "Fashion Group" });
    expect(o.filter((x) => x.grupo).map((x) => x.valor)).toEqual([BOSTON, MULTIFASHION]);
    expect(empresaValida("xyz")).toBe(VALOR_GRUPO);
  });

  it("cada tarjeta lleva a su módulo con la misma empresa", () => {
    expect(enlaceDe("cxc", "fashion_wear")).toBe("/cxc?empresa=fashion_wear");
    expect(enlaceDe("cxc", BOSTON)).toBe("/cxc?tab=boston");
    expect(enlaceDe("pedidos", "vistana")).toBe("/despachos?vista=pedidos&empresa=vistana");
    expect(enlaceDe("ventas", VALOR_GRUPO)).toBe("/ventas");
    expect(enlaceDe("ventas", MULTIFASHION)).toBe("/multifashion");
  });
});

describe("inventario: lo que Switch ya no manda no suma", () => {
  it("descuenta los artículos que no vinieron y la frescura es la de la corrida", () => {
    const base: InventarioEmpresa = {
      key: "fashion_wear", name: "Fashion Wear", articulos: 10, conStock: 5, unidades: 80881, costo: 1193781.53, precio: 0,
      sinCostoArticulos: 0, sinCostoUnidades: 0, unidadesNegativas: 0, medidoEn: "2026-10-09T00:00:00Z",
    };
    const fantasma: InventarioEmpresa = { ...base, articulos: 2, conStock: 2, unidades: 27, costo: 249.83, medidoEn: null };
    const r = descontarFantasmas(base, fantasma, "2026-11-27T04:43:14Z");
    expect(r.unidades).toBe(80854);
    expect(r.costo).toBe(1193531.7);
    expect(r.medidoEn).toBe("2026-11-27T04:43:14Z");
  });
});
