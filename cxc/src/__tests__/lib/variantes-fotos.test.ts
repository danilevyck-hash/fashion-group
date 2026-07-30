// ─────────────────────────────────────────────────────────────────────────────
// Rutas de Storage de variantes, derivación del ✓ (qué variante está puesta) y
// criterio de housekeeping.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  STORAGE_PREFIX,
  variantesRoot,
  variantesPrefix,
  variantePath,
  fotoElegidaPath,
  vistaDesdeNombre,
  vistaActualDeImageUrl,
  pathDeVarianteValido,
  tieneAlternativas,
  contarAlternativas,
} from "@/lib/catalogos/variantes-paths";
import {
  planHousekeeping,
  fmtBytes,
  lineaHousekeeping,
} from "@/lib/catalogos/variantes-housekeeping";

const BASE = "https://rspocgqhtpveytgbtler.supabase.co/storage/v1/object/public/product-images";

describe("rutas de Storage", () => {
  it("respeta la convención ya viva en Tommy", () => {
    expect(fotoElegidaPath("tommy", "FW0FW05034DW5")).toBe("tommy/fw0fw05034dw5.jpg");
    expect(variantePath("tommy", "EM0EM01164YBR", 13)).toBe("tommy/_v/em0em01164ybr/13.jpg");
    expect(variantesPrefix("tommy", "EM0EM01164YBR")).toBe("tommy/_v/em0em01164ybr");
    expect(variantesRoot("tommy")).toBe("tommy/_v");
  });

  it("Reebok conserva su prefijo heredado 'products' (no renombrar)", () => {
    expect(STORAGE_PREFIX.reebok).toBe("products");
    expect(variantePath("reebok", "100000100", 1)).toBe("products/_v/100000100/1.jpg");
  });

  it("normaliza los SKU con separadores", () => {
    expect(variantePath("tommy", "FM0FM04474-BDS", 6)).toBe("tommy/_v/fm0fm04474bds/6.jpg");
    expect(variantePath("joybees", "PZ4PK.JOY.BCHD", 2)).toBe("joybees/_v/pz4pkjoybchd/2.jpg");
  });

  it("vistaDesdeNombre solo acepta nombres de vista", () => {
    expect(vistaDesdeNombre("13.jpg")).toBe(13);
    expect(vistaDesdeNombre("1.JPG")).toBe(1);
    expect(vistaDesdeNombre("portada.jpg")).toBeNull();
    expect(vistaDesdeNombre("13.png")).toBeNull();
  });
});

describe("qué variante está puesta (el ✓ del selector)", () => {
  it("la deriva del image_url, con y sin cache-buster", () => {
    const url = `${BASE}/tommy/_v/em0em01164ybr/6.jpg`;
    expect(vistaActualDeImageUrl(url, "tommy", "EM0EM01164YBR")).toBe(6);
    expect(vistaActualDeImageUrl(`${url}?v=1784958322875`, "tommy", "EM0EM01164YBR")).toBe(6);
  });

  it("null cuando la foto NO viene del banco (subida a mano o legacy)", () => {
    expect(vistaActualDeImageUrl(`${BASE}/tommy/em0em01164ybr.jpg`, "tommy", "EM0EM01164YBR")).toBeNull();
    expect(vistaActualDeImageUrl(`${BASE}/tommy/em0em01164ybr`, "tommy", "EM0EM01164YBR")).toBeNull();
    expect(vistaActualDeImageUrl(null, "tommy", "EM0EM01164YBR")).toBeNull();
    expect(vistaActualDeImageUrl("", "tommy", "EM0EM01164YBR")).toBeNull();
  });

  it("no confunde la variante de OTRO producto", () => {
    const url = `${BASE}/tommy/_v/em0em01257bds/1.jpg`;
    expect(vistaActualDeImageUrl(url, "tommy", "EM0EM01164YBR")).toBeNull();
  });
});

describe("firmas de subida: solo rutas de variantes de la marca", () => {
  const root = variantesRoot("tommy");

  it("acepta la ruta canónica de una variante", () => {
    expect(pathDeVarianteValido("tommy/_v/em0em01164ybr/1.jpg", root)).toBe(true);
    expect(pathDeVarianteValido("tommy/_v/fm0fm04474bds/13.jpg", root)).toBe(true);
  });

  it("RECHAZA todo lo demás (la foto elegida, otra marca, traversal, extensiones)", () => {
    expect(pathDeVarianteValido("tommy/em0em01164ybr.jpg", root)).toBe(false);
    expect(pathDeVarianteValido("joybees/_v/x/1.jpg", root)).toBe(false);
    expect(pathDeVarianteValido("tommy/_v/../../secreto.jpg", root)).toBe(false);
    expect(pathDeVarianteValido("tommy/_v/em0em01164ybr/1.php", root)).toBe(false);
    expect(pathDeVarianteValido("tommy/_v/EM0EM01164YBR/1.jpg", root)).toBe(false); // sin normalizar
    expect(pathDeVarianteValido("tommy/_v/x/y/1.jpg", root)).toBe(false);
  });
});

describe("housekeeping: qué carpetas se borran", () => {
  const c = (skuStorage: string, bytes = 25_000) => ({ skuStorage, bytes });

  it("borra SOLO los SKU que ya no existen como fila", () => {
    const plan = planHousekeeping(
      [c("vivo1"), c("retirado1", 30_000), c("vivo2"), c("retirado2", 20_000)],
      ["VIVO1", "VIVO2"],
    );
    expect(plan.aBorrar.map((x) => x.skuStorage)).toEqual(["retirado1", "retirado2"]);
    expect(plan.bytesLiberados).toBe(50_000);
    expect(plan.abortado).toBeNull();
  });

  it("un producto agotado/oculto SIGUE VIVO: no se le borran las fotos", () => {
    // La lista de SKUs vivos incluye inactivos a propósito (ver el criterio).
    const plan = planHousekeeping([c("agotado")], ["AGOTADO"]);
    expect(plan.aBorrar).toEqual([]);
  });

  it("empareja con la misma normalización de Storage (SKU con separadores)", () => {
    const plan = planHousekeeping([c("fm0fm04474bds")], ["FM0FM04474-BDS"]);
    expect(plan.aBorrar).toEqual([]);
  });

  it("GUARD: sin SKUs vivos NO borra nada (query fallida ≠ catálogo vacío)", () => {
    const plan = planHousekeeping([c("a"), c("b")], []);
    expect(plan.aBorrar).toEqual([]);
    expect(plan.bytesLiberados).toBe(0);
    expect(plan.abortado).toBe("sin SKUs vivos que comparar");
  });

  it("sin carpetas es un no-op", () => {
    expect(planHousekeeping([], ["A"]).aBorrar).toEqual([]);
  });
});

describe("mensaje de housekeeping", () => {
  it("formatea los bytes", () => {
    expect(fmtBytes(500)).toBe("500 B");
    expect(fmtBytes(2048)).toBe("2 KB");
    expect(fmtBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("no ensucia el resumen cuando no hubo nada que liberar", () => {
    expect(lineaHousekeeping({ productos: 0, bytes: 0, fallos: 0 })).toBe("");
  });

  it("reporta lo liberado", () => {
    expect(lineaHousekeeping({ productos: 3, bytes: 12 * 1024 * 1024, fallos: 0 })).toBe(
      "🧹 Liberados 12.0 MB de 3 productos retirados",
    );
    expect(lineaHousekeeping({ productos: 1, bytes: 1024, fallos: 0 })).toBe(
      "🧹 Liberados 1 KB de 1 producto retirado",
    );
  });

  it("menciona los fallos sin romper el resumen", () => {
    expect(lineaHousekeeping({ productos: 2, bytes: 2048, fallos: 1 })).toContain("(1 con error)");
    expect(lineaHousekeeping({ productos: 0, bytes: 0, fallos: 2 })).toContain("2 carpeta(s)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Candado del botón "Cambiar foto" (30-jul-2026).
//
// Daniel, con captura del producto THS10159C000: "no me deberia de salir el
// boton de Cambiar foto si no hay opciones". El botón se pintaba con solo
// EXISTIR la carpeta `_v/{sku}/`, y tras la limpieza del banco esa carpeta
// conserva UN archivo: justamente la foto elegida.
// ─────────────────────────────────────────────────────────────────────────────
describe("tieneAlternativas / contarAlternativas", () => {
  it("🩸 CASO REAL THS10159C000: 1 sola foto y ES la puesta → NO hay botón", () => {
    const url =
      "https://x.supabase.co/storage/v1/object/public/product-images/tommy/_v/ths10159c000/1.jpg?v=1784964356592";
    expect(tieneAlternativas([1], url, "tommy", "THS10159C000")).toBe(false);
    expect(contarAlternativas([1], url, "tommy", "THS10159C000")).toBe(0);
  });

  it("hay otras vistas además de la puesta → sí hay botón, y dice cuántas", () => {
    const url = "product-images/tommy/_v/abc/6.jpg";
    expect(tieneAlternativas([1, 6, 13], url, "tommy", "ABC")).toBe(true);
    expect(contarAlternativas([1, 6, 13], url, "tommy", "ABC")).toBe(2);
  });

  it("sin carpeta (undefined) → no hay botón", () => {
    expect(tieneAlternativas(undefined, "x.jpg", "tommy", "ABC")).toBe(false);
    expect(contarAlternativas(undefined, "x.jpg", "tommy", "ABC")).toBe(0);
  });

  it("carpeta vacía → no hay botón", () => {
    expect(tieneAlternativas([], null, "tommy", "ABC")).toBe(false);
  });

  it("la foto puesta NO sale del banco (subida a mano) → todas son alternativas", () => {
    expect(tieneAlternativas([1, 2], "product-images/tommy/abc.jpg", "tommy", "ABC")).toBe(true);
    expect(contarAlternativas([1, 2], "product-images/tommy/abc.jpg", "tommy", "ABC")).toBe(2);
    // Y sin foto puesta, igual.
    expect(contarAlternativas([1, 2], null, "tommy", "ABC")).toBe(2);
  });

  it("la puesta apunta a una vista que ya no está guardada → lo que queda ES alternativa", () => {
    expect(tieneAlternativas([1], "product-images/tommy/_v/abc/6.jpg", "tommy", "ABC")).toBe(true);
  });

  it("exacto=false (no se pudo leer la carpeta) → se muestra el botón, nunca se esconde de más", () => {
    expect(tieneAlternativas([], "x", "tommy", "ABC", false)).toBe(true);
    expect(contarAlternativas([], "x", "tommy", "ABC", false)).toBe(1);
    // Pero sin carpeta sigue sin haber nada que elegir.
    expect(tieneAlternativas(undefined, "x", "tommy", "ABC", false)).toBe(false);
  });

  it("Reebok y Joybees conservan el botón cuando SÍ tienen banco (no se esconde de más)", () => {
    expect(tieneAlternativas([1, 2], "product-images/products/_v/abc/1.jpg", "reebok", "ABC")).toBe(true);
    expect(contarAlternativas([1, 2], "product-images/products/_v/abc/1.jpg", "reebok", "ABC")).toBe(1);
    expect(tieneAlternativas([3, 7], "product-images/joybees/_v/xyz/3.jpg", "joybees", "XYZ")).toBe(true);
  });

  it("el SKU con guión se normaliza igual que en Storage", () => {
    const url = "product-images/tommy/_v/t1a832600313/1.jpg";
    expect(tieneAlternativas([1, 5], url, "tommy", "T1A8-32600-313")).toBe(true);
    expect(contarAlternativas([1, 5], url, "tommy", "T1A8-32600-313")).toBe(1);
  });
});
