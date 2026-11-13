// 🔴 13-nov-2026 (Daniel): «quiero que pueda buscar por cliente y por número de
// pedido o factura». Un solo buscador en Etiquetas › Nuevo envío; la factura
// ya etiquetada o ya en guía se VE atenuada. Caso real: la 3191 de Vistana
// (A-Amani) estaba en la guía GT-305 del 13-nov y desaparecía sin decir dónde.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { facturasAtenuadas, facturasPorPedido } from "@/lib/guias/etiquetas-por-envio";
import { consultaDeNumero } from "@/app/despachos/components/ResultadosDocumento";

const leer = (p: string) => readFileSync(join(__dirname, "../..", p), "utf8");

describe("facturasPorPedido", () => {
  const filas = [
    { pedido_referencia: "16-000002448", fecha: "2026-11-13", id: 9179 },
    { pedido_referencia: "16-000002472", fecha: "2026-11-13", id: 9181 },
    { pedido_referencia: null, fecha: "2026-09-07", id: 8820 },
  ];
  it("los últimos dígitos o el número largo encuentran el pedido", () => {
    expect(facturasPorPedido(filas, "2448").map((f) => f.id)).toEqual([9179]);
    expect(facturasPorPedido(filas, "16-000002472").map((f) => f.id)).toEqual([9181]);
  });
  it("sin pedido leído o sin dígitos: nada", () => {
    expect(facturasPorPedido(filas, "8820")).toEqual([]);
    expect(facturasPorPedido(filas, "abc")).toEqual([]);
    expect(facturasPorPedido(filas, "0000")).toEqual([]);
  });
});

describe("facturasAtenuadas", () => {
  const f = (secuencial: string, fecha: string) => ({ empresa_key: "vistana", secuencial, fecha });
  const g3191 = f("11-000003191", "2026-11-13T14:05:49+00:00");
  const g3192 = f("11-000003192", "2026-11-13T15:21:25+00:00");
  const g2700 = f("11-000002700", "2026-01-10T15:00:00+00:00");
  const vieja = f("11-000002600", "2025-12-01T15:00:00+00:00");
  it("lo no marcable de los últimos 7 días se ve; lo libre no se repite", () => {
    expect(facturasAtenuadas([g3191, g3192, g2700], [g3192], "2026-11-13", null)).toEqual([g3191]);
  });
  it("la factura buscada se ve aunque sea vieja", () => {
    expect(facturasAtenuadas([vieja, g2700], [], "2026-11-13", "vistana-11-000002600")).toEqual([vieja]);
  });
});

describe("consultaDeNumero", () => {
  it("solo números de 3 dígitos o más buscan factura o pedido", () => {
    expect(consultaDeNumero("3191")).toBe("3191");
    expect(consultaDeNumero("16-000002448")).toBe("16-000002448");
    expect(consultaDeNumero("31")).toBeNull();
    expect(consultaDeNumero("Amani")).toBeNull();
  });
});

describe("la ruta y la pantalla", () => {
  it("?buscar= busca factura Y pedido, solo en las 6 del grupo", () => {
    const r = leer("app/api/guias/facturas-cliente/route.ts");
    expect(r).toContain('searchParams.get("buscar")');
    expect(r).toContain("facturasPorPedido(");
    expect(r).toContain('consulta("pedido_referencia")');
    // ?factura= sigue igual para el panel de antes.
    expect(r).toContain('searchParams.get("factura")');
  });
  it("el panel: un solo campo, se actualiza al abrir y muestra lo atenuado", () => {
    const v = leer("app/despachos/components/EtiquetasPorEnvio.tsx");
    expect(v).toContain('placeholder: "Cliente, N.° de factura o de pedido"');
    expect(v).toContain("<ResultadosDocumento");
    expect(v).toMatch(/if \(ETIQUETAS_BUSCADOR_UNICO_2026_11\) void refrescar\(true\)/);
    expect(v).toContain("Ya está en la guía");
    expect(v).toContain("Ya etiquetada el");
    // Lo atenuado NUNCA se marca.
    expect(v).toMatch(/data-atenuada[\s\S]{0,200}type="checkbox" disabled/);
  });
});
