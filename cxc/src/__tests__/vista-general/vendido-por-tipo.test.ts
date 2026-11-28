import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  DICCIONARIOS,
  MAX_TIPOS,
  OTROS,
  agruparPorTipo,
  articulosDeFila,
  normalizar,
  opcionesPeriodoTipo,
  parteTexto,
  periodoTipoValido,
  piezasTexto,
  rangoPeriodoTipo,
  tieneTipo,
  tipoDe,
  type ArticuloVendido,
} from "@/lib/vista-general/vendido-por-tipo";
import { resumir, utilidadDeMeses, type EmpresaHoy, type SeriesVentas } from "@/lib/vista-general/hoy";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

const art = (empresa: string, tipo: string, piezas: number, codigo = `${tipo}-${piezas}`): ArticuloVendido => ({
  empresa,
  codigo,
  descripcion: codigo,
  tipo,
  piezas,
});

describe("Vendido por tipo — la clasificación", () => {
  it("Active Shoes: el tipo está en el rubro y el género en el subrubro", () => {
    expect(tipoDe("active_shoes", ["MALE", "SHOES"])).toBe("Calzado");
    expect(tipoDe("active_shoes", ["UNISEX", "APPAREL"])).toBe("Ropa");
    expect(tipoDe("active_shoes", ["UNISEX", "HEADWEAR"])).toBe("Gorras");
    expect(tipoDe("active_shoes", ["UNISEX", "BAGS"])).toBe(OTROS);
  });

  it("Fashion Shoes: subrubro primero; si es un género, manda el rubro", () => {
    expect(tipoDe("fashion_shoes", ["FLIP FLOPS", "WOMEN"])).toBe("Chancletas");
    expect(tipoDe("fashion_shoes", ["WOMEN", "SNEAKERS"])).toBe("Tenis");
    expect(tipoDe("fashion_shoes", [null, "OTROS"])).toBe(OTROS);
  });

  it("normaliza espacios, mayúsculas y el prefijo de género, nunca por parecido", () => {
    expect(normalizar("  shirts  l-s ")).toBe("SHIRTS L-S");
    expect(normalizar("MEN-POLOS S-S")).toBe("POLOS S-S");
    expect(tipoDe("vistana", [null, "MEN-POLOS S-S"])).toBe("Camisetas y polos");
    expect(tipoDe("fashion_wear", ["TH OTHER", "UNISEX-HOME"])).toBe("Toallas y hogar");
    expect(tipoDe("fashion_wear", ["T-SHIRTS S-S EXTRA", null])).toBe(OTROS);
  });

  it("Multifashion clasifica por la marca de Switch (marca + departamento)", () => {
    expect(tipoDe("american_classic", ["TH FOOTWEAR"])).toBe("Calzado");
    expect(tipoDe("american_classic", ["CK KIDS"])).toBe("Ropa de niños");
    expect(tipoDe("american_classic", ["TH OTHER"])).toBe(OTROS);
  });

  it("Boston no tiene de dónde sacar el tipo; las seis y Multifashion sí", () => {
    expect(tieneTipo("confecciones_boston")).toBe(false);
    for (const k of [...B2B_EMPRESA_KEYS, "american_classic"]) expect(tieneTipo(k)).toBe(true);
  });

  it("ningún valor de Switch está en dos tipos de la misma empresa", () => {
    for (const [empresa, dic] of Object.entries(DICCIONARIOS)) {
      const vistos = new Map<string, string>();
      for (const [tipo, valores] of Object.entries(dic)) {
        for (const v of valores) {
          const n = normalizar(v);
          const antes = vistos.get(n);
          expect(antes === undefined || antes === tipo, `${empresa}: ${v} en ${antes} y ${tipo}`).toBe(true);
          vistos.set(n, tipo);
        }
      }
    }
  });
});

describe("Vendido por tipo — las sumas", () => {
  it("Active Shoes, noviembre medido: el total cuadra con la fuente y «Otros» va al final", () => {
    const r = agruparPorTipo([
      art("active_shoes", "Calzado", 3027),
      art("active_shoes", "Camisetas", 1572),
      art("active_shoes", "Ropa", 1027),
      art("active_shoes", "Medias", 171),
      art("active_shoes", "Gorras", 144),
      art("active_shoes", OTROS, 18),
      art("active_shoes", OTROS, -1),
    ]);
    expect(r.total).toBe(5958);
    // «Camisetas» se suma a «Ropa» (1,572 + 1,027).
    expect(r.filas.map((f) => f.tipo)).toEqual(["Calzado", "Ropa", "Medias", "Gorras", OTROS]);
    expect(r.filas[1].piezas).toBe(2599);
    expect(r.filas.at(-1)?.piezas).toBe(17);
    expect(parteTexto(r.filas[0].parte)).toBe("51%");
    expect(parteTexto(r.filas.at(-1)!.parte)).toBe("<1%");
  });

  it("«Otros» con 0 o menos no se dibuja, pero el total lo cuenta", () => {
    const r = agruparPorTipo([art("fashion_shoes", "Chancletas", 100), art("fashion_shoes", OTROS, -175)]);
    expect(r.filas.map((f) => f.tipo)).toEqual(["Chancletas"]);
    expect(r.total).toBe(-75);
  });

  it(`quedan ${MAX_TIPOS} tipos con nombre; el resto se pliega en «Otros» (también al tocarlo)`, () => {
    const arts = ["A", "B", "C", "D", "E", "F", "G", "H"].map((t, i) => art("fashion_wear", t, 100 - i));
    const r = agruparPorTipo(arts);
    expect(r.filas).toHaveLength(MAX_TIPOS + 1);
    expect(r.filas.at(-1)).toMatchObject({ tipo: OTROS, piezas: 94 + 93 });
    expect(articulosDeFila(arts, r, OTROS).map((a) => a.tipo)).toEqual(["G", "H"]);
  });

  it("Fashion Group suma los tipos del MISMO nombre entre empresas", () => {
    const r = agruparPorTipo([art("active_shoes", "Medias", 10), art("fashion_wear", "Medias", 5), art("vistana", "Calzado", 3)]);
    expect(r.filas[0]).toMatchObject({ tipo: "Medias", piezas: 15 });
  });

  it("«Camisetas» se suma a «Ropa» solo donde están las dos (también al tocar la barra)", () => {
    const fw = [art("fashion_wear", "Camisetas", 10), art("fashion_wear", "Medias", 5)];
    expect(agruparPorTipo(fw).filas[0]).toMatchObject({ tipo: "Camisetas", piezas: 10 });
    const grupo = [...fw, art("active_shoes", "Ropa", 4), art("active_shoes", "Camisetas", 3)];
    const r = agruparPorTipo(grupo);
    expect(r.filas.map((f) => f.tipo)).toEqual(["Ropa", "Medias"]);
    expect(r.filas[0].piezas).toBe(17);
    expect(articulosDeFila(grupo, r, "Ropa")).toHaveLength(3);
  });

  it("los artículos de una barra van de más a menos piezas", () => {
    const arts = [art("x", "Calzado", 2, "a"), art("x", "Calzado", 9, "b"), art("x", "Ropa", 5, "c")];
    expect(articulosDeFila(arts, agruparPorTipo(arts), "Calzado").map((a) => a.codigo)).toEqual(["b", "a"]);
  });

  it("piezas con signo de verdad y separador de miles", () => {
    expect(piezasTexto(-175)).toBe("−175");
    expect(piezasTexto(26680)).toBe("26,680");
  });
});

describe("Vendido por tipo — el período", () => {
  it("abre en el año en curso y ofrece el mes y los últimos 12 meses", () => {
    expect(opcionesPeriodoTipo("2026-11-28").map((o) => o.etiqueta)).toEqual(["Año 2026", "Noviembre 2026", "Últimos 12 meses"]);
    expect(periodoTipoValido("raro", "2026-11-28")).toBe("anio");
    expect(rangoPeriodoTipo("anio", "2026-11-28")).toEqual({ desde: "2026-01-01", hasta: "2026-11-28" });
    expect(rangoPeriodoTipo("mes", "2026-11-28")).toEqual({ desde: "2026-11-01", hasta: "2026-11-28" });
    expect(rangoPeriodoTipo("12m", "2026-11-28")).toEqual({ desde: "2025-12-01", hasta: "2026-11-28" });
    expect(rangoPeriodoTipo("12m", "2026-01-05")).toEqual({ desde: "2025-02-01", hasta: "2026-01-05" });
  });
});

describe("Utilidad: $ y % de los MISMOS empresa-mes", () => {
  const s = (u: number[], v: number[], c: number[]): SeriesVentas => ({
    serie: v, seriePrev: v, utilidad: u, ventasMargen: v, costo: c,
  });

  it("Active Shoes noviembre: $34,183 y 28%", () => {
    const z = Array(10).fill(0);
    const r = utilidadDeMeses([s([...z, 34182.87], [...z, 122091], [...z, 87908.13])], [10]);
    expect(Math.round(r.utilidad)).toBe(34183);
    expect(Math.round((r.margen ?? 0) * 100)).toBe(28);
  });

  it("un mes sin costo no entra ni al $ ni al %", () => {
    const r = utilidadDeMeses([s([10, 50], [100, 200], [90, 0])], [0, 1]);
    expect(r).toEqual({ utilidad: 10, margen: 0.1 });
  });

  it("resumir trae la utilidad del mes, la del año y los cobros del año", () => {
    const e: EmpresaHoy = { ventas: s([10, 20], [100, 100], [90, 80]), cobros: 5, cobrosAnio: 50 };
    const empresas = Object.fromEntries(B2B_EMPRESA_KEYS.map((k) => [k, e]));
    const r = resumir(B2B_EMPRESA_KEYS, { mes: 2, empresas });
    expect(r.utilidadMes).toEqual({ utilidad: 120, margen: 0.2 });
    expect(r.utilidadAnio).toEqual({ utilidad: 180, margen: 0.15 });
    expect(r.cobrosAnio).toEqual({ estado: "ok", valor: 300 });
  });
});

describe("La pantalla", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/app/vista-general/VistaGeneralHoy.tsx"), "utf8");
  it("«Cobros del mes» solo queda en la rama apagada; el mes a mes de cobros vive en Por cobrar", () => {
    expect(src).toMatch(/!nuevo && r\.cobros\.estado/);
    expect(src).toMatch(/extra=\{nuevo \? mantenerCobros : undefined\}/);
    expect(src).toMatch(/Utilidad/);
  });
});

describe("El orden de las tarjetas", () => {
  it("Ventas → Utilidad → Por cobrar → Por pagar → Inventario → Vendido por tipo → Pedidos; sin las que no van", async () => {
    const { ordenTarjetas } = await import("@/lib/ui/vista-general-orden-2026-11");
    expect(ordenTarjetas({ ventas: "V", utilidad: "U", cxc: "C", cxp: "P", inventario: "I", tipo: "T", pedidos: "D" }).join("")).toBe("VUCPITD");
    expect(ordenTarjetas({ ventas: "V", utilidad: "U", cxc: null, cxp: null, inventario: "I", tipo: null, pedidos: null }).join("")).toBe("VUI");
  });

  it("con el punto ámbar, Pedidos sube arriba de Ventas; Disponibilidad ya no se dibuja", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/app/vista-general/VistaGeneralHoy.tsx"), "utf8");
    expect(src).toMatch(/\[\.\.\.\(urgente \? \[pedidos\] : \[\]\), \.\.\.ordenTarjetas\(\{[^}]*pedidos: urgente \? null : pedidos \}\)\]/);
    expect(src).toMatch(/const disponibilidad = orden \? null/);
  });
});

describe("Años anteriores en el filtro", () => {
  const hoy = "2026-11-28";
  it("2025 y 2024 para las que tienen ventas; Joystep solo 2025; Boston ninguno; 2023 nunca", () => {
    expect(opcionesPeriodoTipo(hoy, ["active_shoes"]).map((o) => o.etiqueta)).toEqual(["Año 2026", "Año 2025", "Año 2024", "Noviembre 2026", "Últimos 12 meses"]);
    expect(opcionesPeriodoTipo(hoy, ["joystep"]).map((o) => o.valor)).toEqual(["anio", "a2025", "mes", "12m"]);
    expect(opcionesPeriodoTipo(hoy, ["confecciones_boston"]).map((o) => o.valor)).toEqual(["anio", "mes", "12m"]);
    expect(opcionesPeriodoTipo(hoy, ["joystep", "vistana"]).map((o) => o.valor)).toContain("a2024");
  });
  it("un año anterior va entero y solo dentro de la ventana", () => {
    expect(rangoPeriodoTipo(periodoTipoValido("a2025", hoy), hoy)).toEqual({ desde: "2025-01-01", hasta: "2025-12-31" });
    expect(periodoTipoValido("a2024", hoy)).toBe("a2024");
    expect(periodoTipoValido("a2023", hoy)).toBe("anio");
    expect(periodoTipoValido("a2026", hoy)).toBe("anio");
  });
  it("la tarjeta Ventas lleva la utilidad debajo y la de Utilidad se retira", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/app/vista-general/VistaGeneralHoy.tsx"), "utf8");
    expect(src).toMatch(/const utilidad = juntas \? null/);
    expect(src).toMatch(/<LineaUtilidad u=\{r\.utilidadMes\} mantener=\{mantenerMargen\} \/>/);
    expect(src).toMatch(/<LineaUtilidad u=\{r\.utilidadAnio\} mantener=\{mantenerMargen\} \/>/);
  });
});
