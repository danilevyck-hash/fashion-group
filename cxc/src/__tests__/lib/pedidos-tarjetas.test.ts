import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lineaMasViejo, tarjetasDePedidos, veTarjetasDePedidos } from "@/lib/ui/pedidos-tarjetas-2026-11";

describe("Despachos › Pedidos — las 4 tarjetas (24-nov-2026)", () => {
  const hoy = "2026-11-24";
  const ahora = "2026-11-24T17:00:00Z";
  const rows = [
    { estado: "pendiente", fecha: "2026-11-23T10:00:00-05:00" },
    { estado: "pendiente", fecha: "2026-11-24T09:00:00-05:00" },
    { estado: "en_preparacion", fecha: "2026-10-01T10:00:00-05:00", en_preparacion_en: "2026-11-10T12:00:00Z" },
    { estado: "en_preparacion", fecha: "2026-11-20T10:00:00-05:00", en_preparacion_en: "2026-11-22T12:00:00Z" },
    { estado: "preparado", fecha: "2026-11-01T10:00:00-05:00", preparado_en: "2026-11-23T20:00:00Z" },
    { estado: "recibido", fecha: "2026-09-01T10:00:00-05:00" },
  ];

  it("cuenta cada estado y mide el más viejo en SU estado; Recibidos sin antigüedad", () => {
    const t = tarjetasDePedidos(rows, hoy, ahora);
    expect(t.map((x) => [x.rotulo, x.cantidad, x.masViejoDias, x.enRojo])).toEqual([
      ["Pendientes", 2, 1, false],
      ["En preparación", 2, 14, true],
      ["Preparados", 1, 0, false],
      ["Recibidos", 1, null, false],
    ]);
  });

  it("rojo solo al pasar de 3 días; sin pedidos, sin línea", () => {
    const t = tarjetasDePedidos([{ estado: "pendiente", fecha: "2026-11-21T10:00:00-05:00" }], hoy, ahora);
    expect(t[0]).toMatchObject({ masViejoDias: 3, enRojo: false });
    expect(tarjetasDePedidos([{ estado: "pendiente", fecha: "2026-11-20T10:00:00-05:00" }], hoy, ahora)[0].enRojo).toBe(true);
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
});
