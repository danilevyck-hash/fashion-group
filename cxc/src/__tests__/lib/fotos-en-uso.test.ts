// Candado del criterio "¿qué foto está EN USO?" (30-jul-2026).
//
// Este criterio decide qué se le propone borrar a Daniel de las fotos de Tommy.
// Una foto borrada no vuelve —subió 389 a mano—, así que lo que se prueba acá es
// sobre todo lo que NO se toca: el banco de variantes, la única foto que le queda
// a un producto, y las huérfanas.
//
// Los casos usan las 3 formas de nombre que existen de verdad en producción,
// medidas el 30-jul-2026 con scripts/_diag-fotos-tommy.mjs.

import { describe, it, expect } from "vitest";
import {
  planLimpiezaFotos,
  resumenPorClase,
  pathDeImageUrl,
  candidatosSkuStorageDeRaiz,
} from "@/lib/catalogos/fotos-en-uso";

const P = "tommy";
const obj = (path: string, bytes = 1024) => ({ path, bytes });
const clase = (plan: ReturnType<typeof planLimpiezaFotos>, path: string) =>
  plan.fotos.find((f) => f.path === path)?.clase;

describe("pathDeImageUrl", () => {
  it("saca la ruta del bucket de una URL pública con ?v=", () => {
    expect(
      pathDeImageUrl("https://x.supabase.co/storage/v1/object/public/product-images/tommy/_v/abc/1.jpg?v=99"),
    ).toBe("tommy/_v/abc/1.jpg");
  });
  it("acepta una ruta ya relativa", () => {
    expect(pathDeImageUrl("tommy/abc.jpg")).toBe("tommy/abc.jpg");
  });
  it("decodifica el porcentaje", () => {
    expect(pathDeImageUrl("product-images/tommy/a%20b.jpg")).toBe("tommy/a b.jpg");
  });
  it("null/vacío/espacios → null (un producto sin foto no referencia nada)", () => {
    expect(pathDeImageUrl(null)).toBeNull();
    expect(pathDeImageUrl("")).toBeNull();
    expect(pathDeImageUrl("   ")).toBeNull();
  });
});

describe("candidatosSkuStorageDeRaiz — las 3 formas reales", () => {
  it("{skuStorage}.jpg (foto elegida por el selector)", () => {
    expect(candidatosSkuStorageDeRaiz("fw0fw05034dw5.jpg")).toContain("fw0fw05034dw5");
  });
  it("sin extensión (endpoint legacy /upload con SKU)", () => {
    expect(candidatosSkuStorageDeRaiz("t3a732776806")).toContain("t3a732776806");
  });
  it("{epoch}-{archivo} (subida masiva legacy SIN sku): saca el SKU de adentro", () => {
    expect(candidatosSkuStorageDeRaiz("1785356807309-T0A3339561999.jpg")).toContain("t0a3339561999");
  });
});

describe("clasificación", () => {
  it("EN USO: la ruta exacta está en image_url", () => {
    const plan = planLimpiezaFotos(
      [obj("tommy/_v/abc/1.jpg")],
      [{ sku: "ABC", image_url: "product-images/tommy/_v/abc/1.jpg?v=1" }],
      P,
    );
    expect(clase(plan, "tommy/_v/abc/1.jpg")).toBe("en-uso");
    expect(plan.aBorrar).toEqual([]);
  });

  it("BANCO VIVO: las otras vistas del banco B2B NO se borran (el selector las necesita)", () => {
    const plan = planLimpiezaFotos(
      [obj("tommy/_v/abc/1.jpg"), obj("tommy/_v/abc/6.jpg"), obj("tommy/_v/abc/13.jpg")],
      [{ sku: "ABC", image_url: "product-images/tommy/_v/abc/1.jpg" }],
      P,
    );
    expect(clase(plan, "tommy/_v/abc/6.jpg")).toBe("banco-vivo");
    expect(clase(plan, "tommy/_v/abc/13.jpg")).toBe("banco-vivo");
    expect(plan.aBorrar).toEqual([]);
  });

  it("REEMPLAZADA: es lo ÚNICO que se propone borrar (foto anterior de un producto que ya tiene otra)", () => {
    const plan = planLimpiezaFotos(
      [obj("tommy/1785356807309-T0A3339561999.jpg", 186368), obj("tommy/1785357259071-T0A3339561999.jpg", 180000)],
      [{ sku: "T0A3339561999", image_url: "product-images/tommy/1785357259071-T0A3339561999.jpg" }],
      P,
    );
    expect(clase(plan, "tommy/1785356807309-T0A3339561999.jpg")).toBe("reemplazada");
    expect(clase(plan, "tommy/1785357259071-T0A3339561999.jpg")).toBe("en-uso");
    expect(plan.aBorrar.map((f) => f.path)).toEqual(["tommy/1785356807309-T0A3339561999.jpg"]);
    expect(plan.bytesLiberados).toBe(186368);
  });

  it("un producto SIN foto NO pierde la única que le queda por atar", () => {
    // El SKU existe pero image_url está vacío: si borráramos este archivo, ese
    // producto se quedaría sin foto para siempre.
    const plan = planLimpiezaFotos([obj("tommy/abc.jpg")], [{ sku: "ABC", image_url: null }], P);
    expect(clase(plan, "tommy/abc.jpg")).toBe("huerfana");
    expect(plan.aBorrar).toEqual([]);
  });

  it("HUÉRFANA: el SKU no existe en la tabla, y NO se borra (Switch puede volver a traerlo)", () => {
    const plan = planLimpiezaFotos([obj("tommy/zzz999.jpg")], [{ sku: "ABC", image_url: "tommy/abc.jpg" }], P);
    expect(clase(plan, "tommy/zzz999.jpg")).toBe("huerfana");
    expect(plan.aBorrar).toEqual([]);
  });

  it("precedente de los SKU con guión: la foto del SKU viejo queda huérfana, NO se borra", () => {
    // Daniel corrige `T3X932613336` → `T3X9-32613336` en Switch: la fila cambia
    // de SKU y hay que volver a atar esa misma foto.
    const plan = planLimpiezaFotos(
      [obj("tommy/t3x932613336.jpg")],
      [{ sku: "T3X9-32613336", image_url: null }],
      P,
    );
    // normalizarSkuStorage borra el guión → ata al mismo producto, que no tiene
    // otra foto ⇒ huérfana ⇒ intocable.
    expect(plan.aBorrar).toEqual([]);
  });

  it("una variante de un SKU que ya no existe queda huérfana acá (la borra el housekeeping semanal, no esto)", () => {
    const plan = planLimpiezaFotos([obj("tommy/_v/muerto/1.jpg")], [{ sku: "ABC", image_url: "tommy/abc.jpg" }], P);
    expect(clase(plan, "tommy/_v/muerto/1.jpg")).toBe("huerfana");
    expect(plan.aBorrar).toEqual([]);
  });

  it("un producto OCULTO o AGOTADO conserva sus fotos (se pasan TODAS las filas, activas o no)", () => {
    const plan = planLimpiezaFotos(
      [obj("tommy/_v/abc/1.jpg"), obj("tommy/_v/abc/2.jpg")],
      [{ sku: "ABC", image_url: "tommy/_v/abc/1.jpg" }],
      P,
    );
    expect(plan.aBorrar).toEqual([]);
  });

  it("algo en una subcarpeta desconocida no se borra", () => {
    const plan = planLimpiezaFotos([obj("tommy/raro/x.jpg")], [{ sku: "ABC", image_url: "tommy/abc.jpg" }], P);
    expect(clase(plan, "tommy/raro/x.jpg")).toBe("huerfana");
    expect(plan.aBorrar).toEqual([]);
  });
});

describe("guard anti-catástrofe", () => {
  it("sin productos (query que falló o marca sin activar) NO se propone borrar NADA", () => {
    const plan = planLimpiezaFotos([obj("tommy/a.jpg"), obj("tommy/b.jpg")], [], P);
    expect(plan.abortado).toBe("sin productos que comparar");
    expect(plan.aBorrar).toEqual([]);
    expect(plan.bytesLiberados).toBe(0);
  });

  it("sin objetos en Storage es un no-op limpio", () => {
    const plan = planLimpiezaFotos([], [{ sku: "ABC", image_url: null }], P);
    expect(plan.abortado).toBeNull();
    expect(plan.aBorrar).toEqual([]);
  });

  it("nunca propone borrar algo que esté referenciado ni una variante de un SKU vivo", () => {
    const productos = [
      { sku: "ABC", image_url: "product-images/tommy/_v/abc/1.jpg" },
      { sku: "DEF", image_url: "product-images/tommy/1785357259071-DEF.jpg" },
      { sku: "GHI", image_url: null },
    ];
    const objetos = [
      obj("tommy/_v/abc/1.jpg"), obj("tommy/_v/abc/6.jpg"), obj("tommy/_v/def/1.jpg"),
      obj("tommy/1785357259071-DEF.jpg"), obj("tommy/1785356800000-DEF.jpg"),
      obj("tommy/ghi.jpg"), obj("tommy/_v/huerfano/1.jpg"),
    ];
    const plan = planLimpiezaFotos(objetos, productos, P);
    const referenciadas = new Set(productos.map((p) => pathDeImageUrl(p.image_url)).filter(Boolean));
    for (const f of plan.aBorrar) {
      expect(referenciadas.has(f.path)).toBe(false);
      expect(f.path.startsWith("tommy/_v/")).toBe(false);
    }
    expect(plan.aBorrar.map((f) => f.path)).toEqual(["tommy/1785356800000-DEF.jpg"]);
  });
});

describe("resumenPorClase", () => {
  it("cuenta y suma bytes por clase", () => {
    const plan = planLimpiezaFotos(
      [obj("tommy/_v/abc/1.jpg", 100), obj("tommy/_v/abc/6.jpg", 200), obj("tommy/1785356800000-ABC.jpg", 300)],
      [{ sku: "ABC", image_url: "tommy/_v/abc/1.jpg" }],
      P,
    );
    const r = resumenPorClase(plan.fotos);
    expect(r["en-uso"]).toEqual({ n: 1, bytes: 100 });
    expect(r["banco-vivo"]).toEqual({ n: 1, bytes: 200 });
    expect(r.reemplazada).toEqual({ n: 1, bytes: 300 });
    expect(r.huerfana).toEqual({ n: 0, bytes: 0 });
  });
});
