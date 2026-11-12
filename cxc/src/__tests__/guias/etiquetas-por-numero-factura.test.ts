// 🔴 12-nov-2026 (Daniel): Etiquetas › Nuevo envío arranca también por el
// N.° de factura. El sistema encuentra al cliente y deja la factura marcada;
// si el número está en dos empresas, se elige.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { facturasPorNumero } from "@/lib/guias/etiquetas-por-envio";

const leer = (p: string) => readFileSync(join(__dirname, "../..", p), "utf8");

const f = (empresa_key: string, secuencial: string, fecha: string) => ({ empresa_key, secuencial, fecha });

describe("facturasPorNumero", () => {
  const filas = [
    f("vistana", "11-000002534", "2026-11-10"),
    f("fashion_shoes", "21-000002534", "2026-11-03"),
    f("vistana", "11-000012534", "2026-11-11"),
    f("vistana", "11-000002535", "2026-11-12"),
  ];

  it("4 dígitos: una por empresa, la más reciente; dos empresas = dos para elegir", () => {
    const r = facturasPorNumero(filas, "2534");
    expect(r).toEqual([f("vistana", "11-000012534", "2026-11-11"), f("fashion_shoes", "21-000002534", "2026-11-03")]);
  });

  it("el número largo de Switch es exacto", () => {
    expect(facturasPorNumero(filas, "11-000002534")).toEqual([f("vistana", "11-000002534", "2026-11-10")]);
  });

  it("una sola empresa: una sola coincidencia", () => {
    expect(facturasPorNumero(filas, "2535")).toEqual([f("vistana", "11-000002535", "2026-11-12")]);
  });

  it("sin dígitos, todo ceros o sin coincidencia: nada", () => {
    expect(facturasPorNumero(filas, "Traslado")).toEqual([]);
    expect(facturasPorNumero(filas, "0000")).toEqual([]);
    expect(facturasPorNumero(filas, "9999")).toEqual([]);
  });
});

describe("la ruta y la pantalla", () => {
  it("la ruta busca por número solo en las 6 del grupo, por código", () => {
    const r = leer("app/api/guias/facturas-cliente/route.ts");
    expect(r).toContain('searchParams.get("factura")');
    expect(r).toContain("facturasPorNumero(");
    expect(r).toMatch(/buscarPorNumero[\s\S]*\.in\("empresa_key", \[\.\.\.B2B_EMPRESA_KEYS\]\)/);
    expect(r).toMatch(/buscarPorNumero[\s\S]*esCodigoDeCliente\(codigo\)/);
  });

  it("Nuevo envío ofrece buscar la factura y elegir empresa si hay varias", () => {
    const v = leer("app/despachos/components/EtiquetasPorEnvio.tsx");
    expect(v).toContain("/api/guias/facturas-cliente?factura=");
    expect(v).toContain("Buscar factura");
    expect(v).toContain("coincidencias.length > 1");
    expect(v).toContain("setMarcadas([{ clave, bultos: \"\", nota: \"\" }])");
  });
});

describe("el orden de las pestañas de Despachos", () => {
  it("Pedidos · Etiquetas · Guías de despacho · Configuración", () => {
    const p = leer("app/despachos/page.tsx");
    const i = (t: string) => p.indexOf(t);
    expect(i('["pedidos", "Pedidos"]')).toBeLessThan(i('["etiquetas", PEDIDOS_FLUJO_SIMPLE_2026_10'));
    expect(i('["etiquetas", PEDIDOS_FLUJO_SIMPLE_2026_10')).toBeLessThan(i('["guias", "Guías de despacho"]'));
    expect(i('["guias", "Guías de despacho"]')).toBeLessThan(i('["config", "Configuración"]'));
  });
});
