// Candado de los siete mockups del 27-nov-2026 (`MANTENER_PRESIONADO_2026_11`).
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MANTENER_PRESIONADO_2026_11 } from "@/lib/ui/mantener-presionado-2026-11";
import { mesesContraAnioPasado, notaDelCorte } from "@/lib/mes-contra-anio-pasado";
import { esCelularPanama } from "@/lib/contact-links";
import { cambioConRaya, cambioEnGris } from "@/lib/ventas/mes-a-mes";
import { antiguedadCompleta, porVendedor } from "@/lib/guias/pedidos-bodega";
import { ponerGlobito } from "@/lib/globito";
import { MenuDelCliente, notaDePagos, urlPagosMesAMes } from "@/app/cxc/components/TarjetaPagosCliente";
import { notaDeCompras } from "@/app/proveedores/TarjetaComprasEmpresa";

describe("interruptor", () => {
  it("prendido", () => expect(MANTENER_PRESIONADO_2026_11).toBe(true));
});

describe("mes a mes contra el año pasado", () => {
  const hoy = "2026-11-27";
  it("el mes en curso va contra los MISMOS días del año pasado", () => {
    const r = mesesContraAnioPasado(
      [
        { fecha: "2026-11-27", monto: 10 },
        { fecha: "2025-11-27", monto: 5 },
        { fecha: "2025-11-28", monto: 1000 }, // después del corte: no cuenta
        { fecha: "2025-12-01", monto: 7 }, // mes que todavía no llega
      ],
      hoy,
    );
    expect(r.meses).toHaveLength(11);
    expect(r.meses[10]).toEqual({ mes: 11, actual: 10, previo: 5 });
    expect(r.total).toEqual({ actual: 10, previo: 5 });
  });
  it("un monto desconocido deja el mes y el total sin número, nunca en cero", () => {
    const r = mesesContraAnioPasado([{ fecha: "2026-01-05", monto: null }, { fecha: "2026-02-05", monto: 3 }], hoy);
    expect(r.meses[0].actual).toBeNull();
    expect(r.meses[1].actual).toBe(3);
    expect(r.total.actual).toBeNull();
  });
  it("suma al centavo como la base (sin el error del flotante)", () => {
    const r = mesesContraAnioPasado([{ fecha: "2026-03-01", monto: 0.1 }, { fecha: "2026-03-02", monto: 0.2 }, { fecha: "2026-03-03", monto: 0.005 }], hoy);
    expect(r.meses[2].actual).toBe(0.31);
  });
  it("la nota del corte", () => {
    expect(notaDelCorte("2026-11-27")).toBe("Nov al 27, contra 1–27 nov 2025.");
    expect(notaDelCorte("2026-11-30")).toBeNull();
  });
});

describe("las flechas", () => {
  it("pagos: sin base dice «—», no «Nuevo»; bajo 1 % con un decimal", () => {
    expect(cambioConRaya(21279, 0).texto).toBe("—");
    expect(cambioConRaya(0, 0).texto).toBe("—");
    expect(cambioConRaya(100.4, 100).texto).toBe("+0.4%");
    expect(cambioConRaya(90, 100)).toMatchObject({ texto: "▼ −10%", tono: "dn" });
  });
  it("proveedores: siempre en gris", () => {
    expect(cambioEnGris(354, 100).clase).toBe("text-gray-500");
    expect(cambioEnGris(50, 100).clase).toBe("text-gray-500");
  });
});

describe("CxC: la tarjeta y el menú", () => {
  it("Boston va por su propia ruta", () => {
    expect(urlPagosMesAMes("D-25", "grupo")).toBe("/api/cxc/pagos-mes-a-mes?codigo=D-25");
    expect(urlPagosMesAMes("9", "boston")).toBe("/api/cxc/boston/pagos-mes-a-mes?codigo=9");
  });
  it("la nota dice de dónde sale", () => {
    const d = { anio: 2026, corte: "2026-11-27", meses: [], total: { actual: 0, previo: 0 }, telefono: "", celular: "" };
    expect(notaDePagos({ ...d, empresas: ["a", "b", "c", "d", "e", "f"] }, "grupo")).toBe("Las 6 empresas, sin retenciones ni recibos en cero. Nov al 27, contra 1–27 nov 2025.");
    expect(notaDePagos(d, "boston")).toMatch(/^Confecciones Boston,/);
  });
  it("WhatsApp solo con celular de Panamá", () => {
    expect(esCelularPanama("6678-2633")).toBe(true);
    expect(esCelularPanama("+507 6678 2633")).toBe(true);
    expect(esCelularPanama("727-7247")).toBe(false);
    expect(esCelularPanama("")).toBe(false);
  });
  it("fijo: Llamar y Copiar código, sin WhatsApp", () => {
    render(<MenuDelCliente codigo="D-25" telefono="727-7247" celular="727-7247" />);
    expect(screen.getByText(/Llamar/).closest("a")?.getAttribute("href")).toBe("tel:+5077277247");
    expect(screen.queryByText("WhatsApp")).toBeNull();
    expect(screen.getByText(/Copiar código/)).toBeTruthy();
  });
  it("sin teléfono: solo Copiar código", () => {
    render(<MenuDelCliente codigo="D-99" telefono="" celular="" />);
    expect(screen.queryByText(/Llamar/)).toBeNull();
    expect(screen.queryByText("WhatsApp")).toBeNull();
  });
  it("celular: WhatsApp a wa.me", () => {
    render(<MenuDelCliente codigo="D-35" telefono="" celular="6678-2633" />);
    expect(screen.getByText("WhatsApp").closest("a")?.getAttribute("href")).toBe("https://wa.me/50766782633");
  });
});

describe("Proveedores", () => {
  it("nunca «vencido» y dice cuando Switch no trae el CIF", () => {
    const n = notaDeCompras({ anio: 2026, corte: "2026-11-27", meses: [{ mes: 1, actual: null, previo: null }], total: { actual: null, previo: null } });
    expect(n).toContain("costo CIF");
    expect(n.toLowerCase()).not.toContain("vencid");
  });
});

describe("Despachos › Pedidos", () => {
  it("el vendedor una vez, en el orden de la lista", () => {
    const g = porVendedor([{ vendedor_nombre: "EDWIN" }, { vendedor_nombre: "RODRIGO" }, { vendedor_nombre: "EDWIN" }, { vendedor_nombre: null }]);
    expect(g.map((x) => x.pedidos.length)).toEqual([2, 1, 1]);
    expect(g[2].vendedor).toBeNull();
  });
  it("«Antigüedad» completa", () => {
    expect(antiguedadCompleta("2026-11-25T15:00:00Z", "2026-11-27")).toBe("Antigüedad: 2 días");
    expect(antiguedadCompleta("2026-11-26T15:00:00Z", "2026-11-27")).toBe("Antigüedad: 1 día");
  });
});

describe("el número rojo del ícono", () => {
  it("pone, borra con 0, no toca con null y no falla sin soporte", () => {
    const nav = { setAppBadge: vi.fn(() => Promise.resolve()), clearAppBadge: vi.fn(() => Promise.resolve()) };
    ponerGlobito(7, nav);
    expect(nav.setAppBadge).toHaveBeenCalledWith(7);
    ponerGlobito(0, nav);
    expect(nav.clearAppBadge).toHaveBeenCalled();
    ponerGlobito(null, nav);
    expect(nav.setAppBadge).toHaveBeenCalledTimes(1);
    expect(() => ponerGlobito(3, {})).not.toThrow();
  });
});
