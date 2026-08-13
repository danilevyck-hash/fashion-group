/**
 * 🔴 DOS REGLAS DE DANIEL, PROBADAS PINTANDO LA PANTALLA (13-ago-2026):
 *
 *   1. El inventario valorizado va en Vista General, POR EMPRESA, y **el número
 *      que manda es el COSTO**. El valor a precio de etiqueta es potencial: si
 *      se muestra, tiene que quedar clarísimo cuál es cuál.
 *   2. *"La tarjeta de Gastos de Vista General también por empresa"* — y, del
 *      módulo Gastos: *"cada compañia por separado, sin juntar los gastos entre
 *      todos"*.
 *
 * ── POR QUÉ ESTE TEST PINTA EN VEZ DE LEER EL ARCHIVO ───────────────────────
 *
 * 🩸 En este mismo módulo ya se comprobó por mutación que un candado de texto no
 * sirve: el guard del cero silencioso de egresos se pudo desarmar con
 * `if (false)` sin que nada se pusiera rojo, porque el barrido encontraba el
 * mensaje del `throw` ya inalcanzable. Un `expect(FUENTE).not.toContain("total")`
 * tendría el mismo defecto.
 *
 * Así que los montos están elegidos para que **cualquier forma de juntarlos dé
 * un número inconfundible**, y se exige que ese número no aparezca en ningún
 * lado de lo que se pinta.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import InventarioPorEmpresa, {
  textoFrescura,
  type InventarioData,
} from "@/app/vista-general/InventarioPorEmpresa";
import GastosPorEmpresa, { type GastosData } from "@/app/vista-general/GastosPorEmpresa";

afterEach(cleanup);

/** Todo el texto que la pantalla realmente pintó, sin separadores. */
function textoPintado(): string {
  return document.body.textContent ?? "";
}

// ═══════════════════════════════════════════════════════════════════════════
// INVENTARIO
// ═══════════════════════════════════════════════════════════════════════════

const INV: InventarioData = {
  disponible: true,
  // Los REALES, medidos contra producción el 13-ago-2026.
  totalUnidades: 197_173,
  totalCosto: 2_795_592.25,
  totalPrecio: 4_061_849,
  porEmpresa: [
    { key: "fashion_wear", name: "Fashion Wear", articulos: 4926, conStock: 2679, unidades: 82_997, costo: 1_282_640.12, precio: 1_947_137.7, sinCostoArticulos: 0, sinCostoUnidades: 0, unidadesNegativas: -279, medidoEn: "2026-08-13T04:41:13.471+00:00" },
    { key: "fashion_shoes", name: "Fashion Shoes", articulos: 666, conStock: 457, unidades: 47_492, costo: 676_763.62, precio: 952_553, sinCostoArticulos: 1, sinCostoUnidades: 671, unidadesNegativas: -307, medidoEn: "2026-08-13T04:40:40.578+00:00" },
    { key: "vistana", name: "Vistana International", articulos: 8173, conStock: 1513, unidades: 50_591, costo: 653_880.34, precio: 932_299.5, sinCostoArticulos: 2, sinCostoUnidades: 60, unidadesNegativas: -210, medidoEn: "2026-08-13T04:31:04.299+00:00" },
    { key: "active_shoes", name: "Active Shoes", articulos: 1664, conStock: 131, unidades: 6616, costo: 96_193.61, precio: 127_784.8, sinCostoArticulos: 3, sinCostoUnidades: 117, unidadesNegativas: -20, medidoEn: "2026-08-13T04:50:38.481+00:00" },
    { key: "joystep", name: "Joystep", articulos: 207, conStock: 85, unidades: 9418, costo: 84_890.87, precio: 100_819, sinCostoArticulos: 0, sinCostoUnidades: 0, unidadesNegativas: -28, medidoEn: "2026-08-13T04:51:36.207+00:00" },
    { key: "active_wear", name: "Active Wear", articulos: 544, conStock: 18, unidades: 59, costo: 1223.69, precio: 1255, sinCostoArticulos: 1, sinCostoUnidades: 25, unidadesNegativas: -18, medidoEn: "2026-08-13T04:33:19.320+00:00" },
  ],
  sinInventario: [
    { key: "confecciones_boston", name: "Confecciones Boston", motivo: "No sincroniza inventario con Switch, así que de esta empresa no hay dato — no es que no tenga mercancía." },
    { key: "american_classic", name: "Multifashion", motivo: "No sincroniza inventario con Switch, así que de esta empresa no hay dato — no es que no tenga mercancía." },
  ],
  sinCosto: { articulos: 7, unidades: 873 },
  medidoEn: "2026-08-13T04:31:04.299+00:00",
  viejo: false,
  horas: 13.5,
};

describe("🔴 el inventario se abre POR EMPRESA", () => {
  it("las 6 que sincronizan salen con su nombre y su costo", () => {
    render(<InventarioPorEmpresa inv={INV} />);
    for (const e of INV.porEmpresa) {
      const fila = document.querySelector(`[data-fila-inventario="${e.key}"]`);
      expect(fila, `falta la fila de ${e.key}`).not.toBeNull();
      expect(fila!.textContent).toContain(e.name);
    }
    expect(screen.getByText("$1,282,640")).toBeTruthy();
    expect(screen.getByText("$676,764")).toBeTruthy();
  });

  it("🔴 Boston y Multifashion se NOMBRAN con su motivo, y NUNCA en $0", () => {
    render(<InventarioPorEmpresa inv={INV} />);
    for (const s of INV.sinInventario) {
      const fila = document.querySelector(`[data-fila-sin-inventario="${s.key}"]`);
      expect(fila, `falta el aviso de ${s.key}`).not.toBeNull();
      expect(fila!.textContent).toContain(s.name);
      expect(fila!.textContent).toContain("No sincroniza inventario");
      // Un $0 al lado de su nombre se lee como "no tiene mercancía".
      expect(fila!.textContent).not.toContain("$0");
    }
    // Y no aparecen como filas de inventario.
    expect(document.querySelector('[data-fila-inventario="confecciones_boston"]')).toBeNull();
    expect(document.querySelector('[data-fila-inventario="american_classic"]')).toBeNull();
  });
});

describe("🔴 el COSTO es el número que manda; el precio de etiqueta va rotulado", () => {
  it("el total grande es el costo, no los $4M", () => {
    render(<InventarioPorEmpresa inv={INV} />);
    const total = document.querySelector('[data-col="total-costo"]')!;
    expect(total.textContent).toBe("$2,795,592");
    // El grande es el CHICO de los dos: si alguien cruzara los campos, esto se
    // pondría rojo.
    expect(total.textContent).not.toContain("4,061,849");
  });

  it("los $4,06M nunca se presentan como plata que se tenga", () => {
    render(<InventarioPorEmpresa inv={INV} />);
    const precio = document.querySelector('[data-col="total-precio"]')!;
    expect(precio.textContent).toBe("$4,061,849");
    // La etiqueta viaja en el MISMO renglón, no en otro lado de la pantalla.
    const renglon = precio.parentElement!;
    expect(renglon.textContent).toContain("potencial");
    expect(renglon.textContent).toContain("no plata que tengas");
  });

  it("y el renglón del total dice 'al costo' pegado al número", () => {
    render(<InventarioPorEmpresa inv={INV} />);
    const total = document.querySelector('[data-col="total-costo"]')!;
    expect(total.parentElement!.textContent).toContain("Total al costo");
  });
});

describe("🔴 la pantalla dice CUÁNDO se midió, siempre", () => {
  it("el dato de la madrugada se muestra con su fecha, no como 'ahora'", () => {
    render(<InventarioPorEmpresa inv={INV} />);
    const f = document.querySelector('[data-col="frescura"]')!;
    // 04:31 UTC = 11:31 pm del día ANTERIOR en Panamá (UTC-5 fijo).
    expect(f.textContent).toBe("al 12-ago, 11:31 pm");
  });

  it("pasado el umbral lo DICE, y en ámbar", () => {
    render(<InventarioPorEmpresa inv={{ ...INV, viejo: true }} />);
    const f = document.querySelector('[data-col="frescura"]')!;
    expect(f.textContent).toContain("sin actualizar desde");
    expect(f.className).toContain("amber");
  });

  it("sin sello lo dice en vez de inventar una hora", () => {
    expect(textoFrescura(null, false)).toBe("sin fecha de medición");
  });
});

describe("🔴 lo que quedó sin valorizar se dice, no se suma como cero", () => {
  it("las 873 piezas sin costo salen en pantalla", () => {
    render(<InventarioPorEmpresa inv={INV} />);
    const t = document.querySelector('[data-col="sin-costo"]')!.textContent!;
    expect(t).toContain("873 piezas");
    expect(t).toContain("7 artículos");
    expect(t).toContain("no tienen costo cargado");
  });

  it("sin artículos huérfanos no se dibuja el aviso (no es ruido fijo)", () => {
    render(<InventarioPorEmpresa inv={{ ...INV, sinCosto: { articulos: 0, unidades: 0 } }} />);
    expect(document.querySelector('[data-col="sin-costo"]')).toBeNull();
  });
});

describe("🔴 sin dato NO va un cero", () => {
  it("la lectura caída lo dice", () => {
    render(<InventarioPorEmpresa inv={null} />);
    expect(textoPintado()).toContain("No se pudo leer el inventario");
    expect(textoPintado()).not.toContain("$0");
  });

  it("la tabla sin migrar lo dice", () => {
    render(<InventarioPorEmpresa inv={{ ...INV, disponible: false }} />);
    expect(textoPintado()).toContain("todavía no está conectado");
    expect(textoPintado()).not.toContain("$2,795,592");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GASTOS
// ═══════════════════════════════════════════════════════════════════════════

// 🩸 Montos elegidos para que CUALQUIER suma sea inconfundible:
//   100.000 + 200.000 = 300.000 · con la tercera (0) sigue dando 300.000.
const GASTOS: GastosData = {
  disponible: true,
  empresasConGasto: 2,
  empresasTotal: 4,
  porEmpresa: [
    { key: "vistana", name: "Vistana International", gasto: 100_000, motivo: null, texto: null, ultimoMesCerrado: "2026-08" },
    { key: "fashion_wear", name: "Fashion Wear", gasto: 200_000, motivo: null, texto: null, ultimoMesCerrado: "2026-08" },
    { key: "fashion_shoes", name: "Fashion Shoes", gasto: null, motivo: "sin_cerrar", texto: "La contabilidad de esta empresa llega hasta enero 2026.", ultimoMesCerrado: "2026-01" },
    { key: "joystep", name: "Joystep", gasto: null, motivo: "sin_planilla", texto: "A este mes le falta el gasto de planilla, así que el total quedaría corto.", ultimoMesCerrado: "2026-08" },
  ],
};

describe("🔴 el gasto es POR EMPRESA y no existe ningún número que las junte", () => {
  it("cada empresa muestra SU gasto", () => {
    render(<GastosPorEmpresa gastos={GASTOS} mes="2026-08" />);
    expect(document.querySelector('[data-fila-gasto="vistana"] [data-col="gasto"]')!.textContent).toBe("$100,000");
    expect(document.querySelector('[data-fila-gasto="fashion_wear"] [data-col="gasto"]')!.textContent).toBe("$200,000");
  });

  it("🩸 el total $300,000 NO aparece por ningún lado", () => {
    render(<GastosPorEmpresa gastos={GASTOS} mes="2026-08" />);
    const t = textoPintado();
    for (const forma of ["300,000", "300000", "$300k", "300.000"]) {
      expect(t, `apareció la suma como "${forma}"`).not.toContain(forma);
    }
  });

  it("y la pantalla DICE que no hay total, para que nadie lo sume de cabeza", () => {
    render(<GastosPorEmpresa gastos={GASTOS} mes="2026-08" />);
    expect(textoPintado()).toContain("No hay un total");
  });
});

describe("🩸 a la empresa sin gasto NO se le pinta $0: se le pinta el MOTIVO", () => {
  it("y el motivo es el exacto — 'Sin cerrar' ≠ 'Falta planilla'", () => {
    render(<GastosPorEmpresa gastos={GASTOS} mes="2026-08" />);
    const shoes = document.querySelector('[data-fila-gasto="fashion_shoes"]')!;
    expect(shoes.querySelector('[data-col="gasto"]')).toBeNull();
    expect(shoes.querySelector('[data-col="sin-gasto"]')!.textContent).toBe("Sin cerrar");
    expect(shoes.textContent).toContain("llega hasta enero 2026");
    expect(shoes.textContent).not.toContain("$0");

    const joy = document.querySelector('[data-fila-gasto="joystep"]')!;
    expect(joy.querySelector('[data-col="sin-gasto"]')!.textContent).toBe("Falta planilla");
    expect(joy.textContent).not.toContain("$0");
  });

  it("la cobertura se dice con todas las letras: 2 de 4", () => {
    render(<GastosPorEmpresa gastos={GASTOS} mes="2026-08" />);
    expect(document.querySelector('[data-col="cobertura"]')!.textContent).toBe("2 de 4 con el mes cerrado");
  });

  it("sin contabilidad conectada lo dice, y no pinta ningún monto", () => {
    render(<GastosPorEmpresa gastos={{ ...GASTOS, disponible: false }} mes="2026-08" />);
    expect(textoPintado()).toContain("todavía no está conectada");
    expect(document.querySelector('[data-col="gasto"]')).toBeNull();
  });
});
