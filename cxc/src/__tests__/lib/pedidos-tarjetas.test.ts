import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lineaMasViejo, tarjetasDePedidos, veTarjetasDePedidos } from "@/lib/ui/pedidos-tarjetas-2026-11";
import { fechaDeAntiguedad, haceDiasCorto, lineaDeLaPestana, ordenarPedidos } from "@/lib/guias/pedidos-bodega";

describe("Despachos › Pedidos — las 4 tarjetas (24-nov-2026)", () => {
  const hoy = "2026-11-24";
  const rows = [
    { estado: "pendiente", fecha: "2026-11-23T10:00:00-05:00" },
    { estado: "pendiente", fecha: "2026-11-24T09:00:00-05:00" },
    { estado: "en_preparacion", fecha: "2026-10-01T10:00:00-05:00", en_preparacion_en: "2026-11-10T12:00:00Z" },
    { estado: "en_preparacion", fecha: "2026-11-20T10:00:00-05:00", en_preparacion_en: "2026-11-22T12:00:00Z" },
    { estado: "preparado", fecha: "2026-11-01T10:00:00-05:00", preparado_en: "2026-11-23T20:00:00Z" },
    { estado: "recibido", fecha: "2026-09-01T10:00:00-05:00" },
  ];

  it("cuenta cada estado y mide el más viejo en SU estado; Recibidos sin antigüedad", () => {
    const t = tarjetasDePedidos(rows, hoy);
    expect(t.map((x) => [x.rotulo, x.cantidad, x.masViejoDias, x.enRojo])).toEqual([
      ["Pendientes", 2, 1, false],
      ["En preparación", 2, 14, true],
      ["Preparados", 1, 1, false],
      ["Recibidos", 1, null, false],
    ]);
  });

  it("rojo solo al pasar de 3 días; sin pedidos, sin línea", () => {
    const t = tarjetasDePedidos([{ estado: "pendiente", fecha: "2026-11-21T10:00:00-05:00" }], hoy);
    expect(t[0]).toMatchObject({ masViejoDias: 3, enRojo: false });
    expect(tarjetasDePedidos([{ estado: "pendiente", fecha: "2026-11-20T10:00:00-05:00" }], hoy)[0].enRojo).toBe(true);
    expect(t[1]).toMatchObject({ cantidad: 0, masViejoDias: null });
  });

  it("la línea", () => {
    expect(lineaMasViejo(14)).toBe("el más viejo 14 días");
    expect(lineaMasViejo(1)).toBe("el más viejo 1 día");
    expect(lineaMasViejo(0)).toBe("el más viejo, de hoy");
    expect(lineaMasViejo(null)).toBe("");
  });

  it("solo Daniel y Rey las ven; el resto, las pestañas", () => {
    expect(veTarjetasDePedidos("daniel")).toBe(true);
    expect(veTarjetasDePedidos("rey")).toBe(true);
    expect(veTarjetasDePedidos("Rey ")).toBe(true);
    for (const otro of ["julio", "rodrigo", "angela", "alberto", "", null, undefined]) expect(veTarjetasDePedidos(otro)).toBe(false);
  });

  it("la pantalla decide por la sesión firmada (semilla), no por el navegador", () => {
    const src = readFileSync(join(process.cwd(), "src/app/despachos/components/PedidosView.tsx"), "utf8");
    expect(src).toMatch(/veTarjetasDePedidos\(semilla\?\.userName\)/);
    expect(src).not.toMatch(/sessionStorage[^\n]*Tarjeta|localStorage[^\n]*Tarjeta/);
  });

  it("AS 557: marcado el 10-nov, Switch dice 22-nov → 14 d en la fila, la línea y la tarjeta (en rojo)", () => {
    const as557 = { estado: "en_preparacion", secuencial: "16-000000557", fecha: "2026-11-22 18:49:21+00", en_preparacion_en: "2026-11-10T17:17:54.111Z" };
    const fs2217 = { estado: "en_preparacion", secuencial: "16-000002217", fecha: "2026-11-22 17:16:23+00", en_preparacion_en: "2026-11-17T15:41:31.204Z" };
    expect(fechaDeAntiguedad(as557)).toBe(as557.en_preparacion_en);
    expect(haceDiasCorto(fechaDeAntiguedad(as557), hoy)).toBe("14 d");
    const nombre = { singular: "en preparación", plural: "en preparación" };
    expect(lineaDeLaPestana([fs2217, as557], "en_preparacion", nombre, hoy)).toBe("2 en preparación · el más viejo, 14 d");
    expect(tarjetasDePedidos([fs2217, as557], hoy)[1]).toMatchObject({ masViejoDias: 14, enRojo: true });
    expect(ordenarPedidos([fs2217, as557]).map((p) => p.secuencial)).toEqual(["16-000000557", "16-000002217"]);
  });

  it("Pendiente y Recibido siguen contando desde la fecha de Switch; sin firma, también", () => {
    const f = "2026-11-22 18:49:21+00";
    expect(fechaDeAntiguedad({ estado: "pendiente", fecha: f, en_preparacion_en: "2026-11-01T00:00:00Z" })).toBe(f);
    expect(fechaDeAntiguedad({ estado: "recibido", fecha: f, preparado_en: "2026-11-01T00:00:00Z" })).toBe(f);
    expect(fechaDeAntiguedad({ estado: "preparado", fecha: f, preparado_en: null })).toBe(f);
    expect(fechaDeAntiguedad({ estado: "preparado", fecha: f, preparado_en: "2026-11-20T12:00:00Z" })).toBe("2026-11-20T12:00:00Z");
  });
});
