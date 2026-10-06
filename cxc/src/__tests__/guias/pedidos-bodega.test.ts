// Candado de Guías › «Pedidos» (5-oct-2026, `PEDIDOS_BODEGA_2026_10`).
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  CODIGOS_EXCLUIDOS,
  ESTADOS_PEDIDO,
  PEDIDOS_BODEGA_2026_10,
  PEDIDOS_TABLA_2026_10,
  PEDIDOS_POR_EMPRESA_2026_10,
  abreviarEmpresa,
  agruparPorEmpresa,
  haceDias,
  haceDiasCorto,
  tituloPedidosImpresos,
  vendedorEnPantalla,
  diasDesde,
  fechaSwitchAIso,
  lineaDePendientes,
  ordenarPedidos,
  pedidoEntra,
  puedeMarcarPedidos,
  puedeVerPedidosBodega,
} from "@/lib/guias/pedidos-bodega";

const leer = (p: string) => fs.readFileSync(path.resolve(__dirname, "../../..", p), "utf8");

describe("pedidos de bodega — reglas de Daniel", () => {
  it("la ven todos los que tienen Guías, contabilidad no; marcan solo admin y bodega", () => {
    expect(PEDIDOS_BODEGA_2026_10).toBe(true);
    for (const r of ["admin", "bodega", "secretaria", "vendedor"]) expect(puedeVerPedidosBodega(r)).toBe(true);
    expect(puedeVerPedidosBodega("contabilidad")).toBe(false);
    expect(puedeMarcarPedidos("bodega")).toBe(true);
    // 6-oct-2026: iguales a Guías (AJUSTES_APPLE_6_2026_10).
    expect(puedeMarcarPedidos("secretaria")).toBe(true);
    expect(puedeMarcarPedidos("vendedor")).toBe(true);
    expect(puedeMarcarPedidos("contabilidad")).toBe(false);
  });

  it("v2 PRENDIDA con el «sí» de Daniel al mockup (5-oct-2026)", () => {
    expect(PEDIDOS_TABLA_2026_10).toBe(true);
  });

  it("el vendedor se escribe como en Comisiones: alias en la ruta y capitalizado en pantalla", () => {
    expect(vendedorEnPantalla("REYNALDO ESPINOSA")).toBe("Reynaldo Espinosa");
    const ruta = leer("src/app/api/guias/pedidos/route.ts");
    expect(ruta).toContain("leerAliasOVacio()");
    expect(ruta).toMatch(/aplicarAlias\(p\.vendedor_nombre/);
    expect(leer("src/app/guias/components/PedidosView.tsx")).not.toMatch(/\{p\.vendedor_nombre/);
  });

  it("sin montos: ni la ruta ni la pantalla mandan o dibujan el total", () => {
    expect(leer("src/app/api/guias/pedidos/route.ts")).not.toMatch(/select\([^)]*total/);
    expect(leer("src/app/guias/components/PedidosView.tsx")).not.toMatch(/\.total\b|fmt\(/);
  });

  it("DEFAULT se muestra «Oficina»", () => {
    expect(vendedorEnPantalla("DEFAULT")).toBe("Oficina");
    expect(vendedorEnPantalla("EDWIN")).toBe("Edwin");
    expect(vendedorEnPantalla(null)).toBe("—");
    expect(abreviarEmpresa("Fashion Shoes")).toBe("F. Shoes");
    expect(abreviarEmpresa("Vistana")).toBe("Vistana");
  });

  it("v3 por empresa PRENDIDA con el «sí» de Daniel al mockup (6-oct-2026); apagada, la tabla v2 y sin Imprimir", () => {
    expect(PEDIDOS_POR_EMPRESA_2026_10).toBe(true);
    const src = leer("src/app/guias/components/PedidosView.tsx");
    expect(src).toContain("POR_EMPRESA ? tabla : tablaV2");
    expect(src).toContain("POR_EMPRESA && !barra && (");
    expect(src).toContain("menu={POR_EMPRESA ? (");
  });

  // Daniel, 6-oct-2026: «Vendedor y empresa se confunden» y «Compañía debe tener más protagonismo».
  it("agrupada por empresa: grupos por su pedido más viejo, y dentro del más viejo al más nuevo", () => {
    const g = agruparPorEmpresa([
      { fecha: "2026-10-02T11:00:00-05:00", secuencial: "J2", empresa_key: "joystep" },
      { fecha: "2026-09-01T11:00:00-05:00", secuencial: "A1", empresa_key: "active" },
      { fecha: "2026-08-20T11:00:00-05:00", secuencial: "J1", empresa_key: "joystep" },
    ]);
    expect(g.map((x) => x.empresa_key)).toEqual(["joystep", "active"]);
    expect(g[0].pedidos.map((x) => x.secuencial)).toEqual(["J1", "J2"]);
    expect(agruparPorEmpresa([])).toEqual([]);
  });

  it("la pantalla: encabezado «Empresa · N» por grupo; ni columna ni renglón repiten la empresa; Vendedor solo el nombre", () => {
    const src = leer("src/app/guias/components/PedidosView.tsx");
    expect(src).toContain("agruparPorEmpresa(visibles)");
    expect(src).toMatch(/\{nombreCortoEmpresa\(g\.empresa_key\)\} · \{g\.pedidos\.length\}/);
    const tabla = src.slice(src.indexOf("const tabla = ("), src.indexOf("const tablaV2 = ("));
    expect(tabla).not.toMatch(/>Empresa</);
    expect(tabla.match(/nombreCortoEmpresa\(/g)).toHaveLength(1);
    expect(tabla).toMatch(/<td[^>]*>\{vendedorEnPantalla\(p\.vendedor_nombre\)\}<\/td>/);
  });

  it("la antigüedad no se parte en el celular: «43 d», con hoy y ayer igual", () => {
    expect(haceDiasCorto("2026-10-05T08:00:00-05:00", "2026-10-05")).toBe("hoy");
    expect(haceDiasCorto("2026-10-04T23:00:00-05:00", "2026-10-05")).toBe("ayer");
    expect(haceDiasCorto("2026-08-23T11:00:00-05:00", "2026-10-05")).toBe("43 d");
    const src = leer("src/app/guias/components/PedidosView.tsx");
    expect(src).toMatch(/<td className=\{?`?"?whitespace-nowrap py-2 pr-1/); // AJUSTES_APPLE_6: el padding izquierdo depende del círculo
  });

  it("Imprimir: lo filtrado, carta en blanco y negro, un bloque por empresa con firmas por pedido, sin montos", () => {
    const t = tituloPedidosImpresos("pendiente", "Joystep", new Date("2026-10-06T20:15:00Z"));
    expect(t).toMatch(/^Pedidos pendientes · Joystep · impreso 6 oct 2026, 3:15/);
    expect(tituloPedidosImpresos("preparado", null, new Date())).toMatch(/^Pedidos preparados · Todas las empresas · impreso /);
    const pdf = leer("src/lib/guias/pdf-pedidos.ts");
    expect(pdf).toContain('format: "letter"');
    expect(pdf).toContain("agruparPorEmpresa(pedidos)");
    expect(pdf).toMatch(/"Antigüedad", "N° de pedido", "Cliente", "Vendedor", "Entregado por", "Recibido por"/);
    // Las firmas van solo por pedido: sin línea de firmas al pie del bloque.
    expect(pdf).not.toMatch(/Fecha _|PIE_DE_BLOQUE/);
    expect(pdf).not.toMatch(/NAVY|CEBRA|estilosDeTabla|\.total\b|fmt\(/);
    const src = leer("src/app/guias/components/PedidosView.tsx");
    expect(src).toContain("construirPdfPedidos(titulo, visibles, hoy)");
    expect(src.match(/onClick=\{\(\) => void imprimir\(\)\}/g)).toHaveLength(2); // compu + «···»
  });

  it("la primera columna dice la antigüedad: hoy · ayer · hace N días", () => {
    expect(haceDias("2026-10-05T08:00:00-05:00", "2026-10-05")).toBe("hoy");
    expect(haceDias("2026-10-04T23:00:00-05:00", "2026-10-05")).toBe("ayer");
    expect(haceDias("2026-10-02T11:00:00-05:00", "2026-10-05")).toBe("hace 3 días");
  });

  it("SOLO dos estados", () => {
    expect([...ESTADOS_PEDIDO]).toEqual(["pendiente", "preparado"]);
  });

  it("fuera TCKCTA, 12188 y quien no tiene ficha; por CÓDIGO", () => {
    const fichas = new Set(["D-25", "TCKCTA", "12188"]);
    expect([...CODIGOS_EXCLUIDOS]).toEqual(["TCKCTA", "12188"]);
    expect(pedidoEntra("D-25", fichas)).toBe(true);
    expect(pedidoEntra(" d-25 ", fichas)).toBe(true);
    expect(pedidoEntra("TCKCTA", fichas)).toBe(false);
    expect(pedidoEntra("12188", fichas)).toBe(false);
    expect(pedidoEntra("D-80", fichas)).toBe(false);
    expect(pedidoEntra(undefined, fichas)).toBe(false);
  });

  it("del más viejo al más nuevo", () => {
    const r = ordenarPedidos([
      { fecha: "2026-10-02T11:00:00-05:00", secuencial: "B" },
      { fecha: "2026-08-24T16:00:00-05:00", secuencial: "A" },
    ]);
    expect(r.map((x) => x.secuencial)).toEqual(["A", "B"]);
  });

  it("la línea de arriba cuenta solo los pendientes y dice el más viejo", () => {
    const rows = [
      { fecha: "2026-09-10T10:00:00-05:00", estado: "pendiente" as const },
      { fecha: "2026-08-24T16:00:00-05:00", estado: "preparado" as const },
      { fecha: "2026-10-02T11:00:00-05:00", estado: "pendiente" as const },
    ];
    expect(lineaDePendientes(rows, "2026-10-05")).toBe("2 pedidos pendientes · el más viejo, hace 25 días");
    expect(lineaDePendientes([], "2026-10-05")).toBe("Sin pedidos pendientes");
    expect(diasDesde("2026-10-05T23:30:00-05:00", "2026-10-05")).toBe(0);
  });

  it("la fecha de Switch es hora de Panamá", () => {
    expect(fechaSwitchAIso("2026-10-05 12:03:11")).toBe("2026-10-05T12:03:11-05:00");
  });

  it("sin enlace a Etiquetas ni a Guías en la pantalla", () => {
    const src = leer("src/app/guias/components/PedidosView.tsx");
    expect(src).not.toMatch(/href=|router\.push|<Link|"\/guias/);
  });

  it("el sync nunca escribe lo que marcó bodega; la ruta no abre Switch", () => {
    expect(leer("src/lib/switch-api/sync-pedidos.ts")).not.toContain('from("pedidos_bodega_estado")');
    expect(leer("src/app/api/guias/pedidos/route.ts")).not.toMatch(/createSwitchClient|switch-api\/client/);
  });
});
