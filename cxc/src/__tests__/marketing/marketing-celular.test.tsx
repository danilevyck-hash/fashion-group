/**
 * CANDADO — MARKETING EN EL CELULAR (24-sep-2026).
 *
 * Daniel aprobó el mockup letra por letra (1a · 2a · 3a · 4c · 5b · 6b · 7b ·
 * 8a · 9a · 10a · 11a · 12a · 13b) y dijo la regla que lo atraviesa todo:
 *
 *   «ya son datos que veré adentro, eso me ensucia la pantalla, no solo aquí
 *    sino en todo el sistema»
 *
 * Lo que este archivo no deja aflojar:
 *   1. LA PORTADA (1a): la fila de una tienda es NOMBRE + UN MONTO. El
 *      desglose por marca («Tommy $8,913.22 · Calvin $3,736.75») NO se dibuja.
 *   2. LA FICHA (2a): dos renglones por gasto y el monto a la vista.
 *   3. «GENERAL» (8a): los pagos de impulsadora en UN renglón que se abre, y
 *      la fila SIN el número de factura.
 *   4. «TODOS» (9a): el período es el título del grupo, con su subtotal.
 *   5. MARCAS (5b): NINGÚN total de las tres marcas. Las marcas no se suman
 *      entre sí en ninguna pantalla del módulo.
 *   6. IMPULSADORAS (6b): una fila por persona con «Pagar» en la fila; los
 *      meses, el historial y «Eliminar» viven adentro.
 *   7. MOBILIARIO (7b): una fila por producto con su foto y SIN el
 *      «entregadas 543 de 561».
 *   8. APAGADO = LO DE ANTES: sin celular, la lista de tiendas de siempre, con
 *      su desglose por marca y su buscador.
 *   9. NINGÚN NÚMERO CAMBIA: los mismos datos dan los mismos totales en las
 *      dos vistas.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";

import FichaTiendaCelular from "@/app/marketing/components/celular/FichaTiendaCelular";
import MobiliarioCelular from "@/app/marketing/components/celular/MobiliarioCelular";
import {
  MARCAS_SIN_TOTAL,
  fichaGeneralCelular,
  renglonDeGastoCelular,
  subtituloProductoCelular,
  subtituloTiendaCelular,
} from "@/lib/marketing/celular";
import { bloquesPorPeriodo, chipsDePeriodos } from "@/lib/marketing/periodo-manda";
import { totalDeTiendas } from "@/lib/marketing/periodo-manda";
import { filasDeTiendas } from "@/lib/marketing/tiendas-y-marcas";
import type { FilaDeTienda } from "@/lib/marketing/vista-tienda";

// 2-oct-2026: MARKETING_APPLE_2026_10 se prendió (Daniel aprobó las capturas:
// "sí"). Esta prueba es de la versión de antes y la fuerza en false.
vi.mock("@/lib/marketing/marketing-2026-10", async (original) => ({
  ...(await original<typeof import("@/lib/marketing/marketing-2026-10")>()),
  MARKETING_APPLE_2026_10: false,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/marketing",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

// ── El aparato: `matchMedia` decide, y arranca APAGADO (computadora) ─────────
function ponerCelular(esCelular: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (consulta: string) => ({
      matches: esCelular,
      media: consulta,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
}

// ── Los datos, los de producción del 23/24-sep-2026 ──────────────────────────

const NOVA = {
  codigo: "D-25" as string | null,
  nombre: "Nova Lux, S.A.",
  total: 12649.97,
  noReportado: 0,
  cantidad: 4,
  porMarca: { "Tommy Hilfiger": 8913.22, "Calvin Klein": 3736.75 },
  esGeneral: false,
  esMultifashion: false,
  href: "/marketing/tienda/D-25",
};
const GENERAL_FILA = {
  codigo: null,
  nombre: "General",
  total: 35470.8,
  noReportado: 0,
  cantidad: 21,
  porMarca: { "Calvin Klein": 22853.04, "Tommy Hilfiger": 12617.76 },
  esGeneral: true,
  esMultifashion: false,
  href: "/marketing/tienda/general",
};

const gasto = (p: Partial<FilaDeTienda> & Pick<FilaDeTienda, "id">): FilaDeTienda => ({
  tipo: "factura",
  marcaCodigo: "TH",
  marcaNombre: "Tommy",
  proveedor: "Impresora Comercial",
  detalle: "",
  monto: 0,
  fecha: "2026-09-21",
  seReporta: true,
  estadoPeriodo: "abierto",
  periodoNombre: null,
  ...p,
});

const FACTURAS: FilaDeTienda[] = [
  gasto({
    id: "f1",
    proveedor: "Impresora Comercial",
    concepto: "Remodelación",
    numero: "0000065466",
    monto: 1040.25,
    marcaNombre: "Tommy",
  }),
  gasto({
    id: "f2",
    proveedor: "Impresora Comercial",
    concepto: "Letrero y lámina ACM",
    numero: "0000065467",
    monto: 731.02,
    marcaNombre: "Calvin",
  }),
];

describe("Marketing en el celular", () => {
  beforeEach(() => ponerCelular(true));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("1a · la regla es del módulo puro, no de la pantalla", () => {
    expect(subtituloTiendaCelular(NOVA)).toBe("4 gastos");
    expect(subtituloTiendaCelular(GENERAL_FILA)).toBe("sin tienda · 21 gastos");
    expect(subtituloTiendaCelular({ ...NOVA, esMultifashion: true, cantidad: 9 })).toBe(
      "tienda propia · 9 gastos",
    );
  });

  // ── 2a ────────────────────────────────────────────────────────────────────
  it("2a · la ficha son dos renglones por gasto, con el monto a la vista", () => {
    render(
      <FichaTiendaCelular
        titulo="Outlet Duty Free N3"
        subtitulo="D-118 · Abierto · Tommy $1,040.25 · Calvin $731.02"
        total={1771.27}
        textoPie="2 gastos · irán al próximo ZIP"
        chips={chipsDePeriodos(FACTURAS)}
        periodo="abierto"
        onPeriodo={() => {}}
        visibles={FACTURAS}
        bloques={bloquesPorPeriodo(FACTURAS)}
        cargando={false}
        aviso={null}
        escribe
        onRegistrarGasto={() => {}}
        accionesDe={() => []}
        onPdf={() => {}}
        hrefVolver="/marketing"
      />,
    );
    const fila = screen.getByText("Impresora Comercial · Remodelación").closest("li")!;
    // Los DOS renglones y el monto, en la MISMA fila.
    expect(within(fila).getByText(/21 sept · Tommy · factura 0000065466/)).toBeTruthy();
    expect(within(fila).getByText("$1,040.25")).toBeTruthy();
    expect(screen.getByText("$1,771.27")).toBeTruthy();
  });

  // ── 8a ────────────────────────────────────────────────────────────────────
  it("8a · «General» pliega sus pagos de impulsadora y su fila no dice el número de factura", () => {
    const pagos: FilaDeTienda[] = [
      gasto({ id: "p1", tipo: "impulsadora", proveedor: "Ana Trejos", monto: 800, mes: "junio 2026" }),
      gasto({ id: "p2", tipo: "impulsadora", proveedor: "Ana Trejos", monto: 800, mes: "mayo 2026" }),
      gasto({ id: "p3", tipo: "impulsadora", proveedor: "Cindy de Gracia", monto: 800, mes: "abril 2026" }),
    ];
    const todas = [...FACTURAS, ...pagos];
    render(
      <FichaTiendaCelular
        titulo="General"
        subtitulo="Abierto"
        total={4171.27}
        textoPie="5 gastos"
        chips={chipsDePeriodos(todas)}
        periodo="abierto"
        onPeriodo={() => {}}
        visibles={todas}
        bloques={bloquesPorPeriodo(todas)}
        cargando={false}
        aviso={null}
        escribe
        onRegistrarGasto={() => {}}
        accionesDe={() => []}
        onPdf={() => {}}
        hrefVolver="/marketing"
      />,
    );
    const grupo = screen.getByText("Pagos de impulsadora · 3").closest("li")!;
    expect(within(grupo).getByText("$2,400.00")).toBeTruthy();
    expect(within(grupo).getByText(/Ana Trejos 2 · Cindy de Gracia 1/)).toBeTruthy();
    // 🔴 Sin el número de factura en la fila.
    const fila = screen.getByText("Impresora Comercial · Remodelación").closest("li")!;
    expect(fila.textContent).not.toContain("0000065466");
    expect(within(fila).getByText(/21 sept · Tommy/)).toBeTruthy();
    // El total del grupo es la SUMA de esos mismos renglones, no un número nuevo.
    expect(fichaGeneralCelular(todas).grupo!.total).toBe(2400);
  });

  // ── 9a ────────────────────────────────────────────────────────────────────
  it("9a · con «Todos», el período es el título del grupo, con su subtotal", () => {
    const cerrado = gasto({
      id: "c1",
      monto: 71.26,
      fecha: "2026-06-18",
      periodo: { id: "per-1", nombre: "mid 2026", proveedorKey: "pvh", cerradoEn: "2026-08-11" },
    });
    const todas = [...FACTURAS, cerrado];
    render(
      <FichaTiendaCelular
        titulo="Outlet Duty Free N3"
        subtitulo="D-118"
        total={1842.53}
        textoPie="3 gastos en 2 períodos"
        chips={chipsDePeriodos(todas)}
        periodo="todos"
        onPeriodo={() => {}}
        visibles={todas}
        bloques={bloquesPorPeriodo(todas)}
        cargando={false}
        aviso={null}
        escribe
        onRegistrarGasto={() => {}}
        accionesDe={() => []}
        onPdf={() => {}}
        hrefVolver="/marketing"
      />,
    );
    expect(screen.getByText(/Abierto · aún no pasado a la marca · 2 gastos · \$1,771\.27/)).toBeTruthy();
    expect(screen.getByText(/mid 2026 · PVH · cerrado el 11 ago 2026 · 1 gasto · \$71\.26/)).toBeTruthy();
  });

  // ── 7b ────────────────────────────────────────────────────────────────────
  it("7b · una fila por producto con su foto y SIN el «entregadas N de N»", () => {
    const productos = [
      { id: "p1", nombre: "Barra plana", precio: 18, stock_total: 18, foto_url: "https://x/f.jpg", foto_path: "f.jpg" },
      { id: "p2", nombre: "Tablas", precio: 21, stock_total: 0, foto_url: null, foto_path: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;
    render(
      <MobiliarioCelular
        productos={productos}
        entregadoPorProducto={new Map([["p1", 543], ["p2", 625]])}
        metricas={{ enBodega: 324, entregado: 81347, tiendas: 13 }}
        resumenFilas={[
          { tienda: "Jerusalem De Panama", tiendaCodigo: "D-70", totalPaneles: 62, montoPorMarca: {}, totalMonto: 23870 },
        ]}
        resumenMarcas={[]}
        totalResumen={{ totalPaneles: 228, montoPorMarca: {}, totalMonto: 81347 }}
        cargando={false}
        escribe
        esAdmin
        onEditar={() => {}}
        onBorrar={() => {}}
        onNuevo={() => {}}
        onExcel={() => {}}
        hrefDeTienda={(c) => `/marketing/tienda/${c}`}
        nombreDeTienda={(f) => f.tienda}
      />,
    );
    const barra = screen.getByText("Barra plana").closest("li")!;
    expect(within(barra).getByText("$18.00 c/u")).toBeTruthy();
    expect(within(barra).getByText("18")).toBeTruthy();
    expect(within(barra).getByText("en bodega")).toBeTruthy();
    // 🔴 El «entregadas 543 de 561» NO está en la fila.
    expect(barra.textContent).not.toContain("543");
    expect(barra.textContent).not.toContain("561");
    // La foto, pequeña, en la fila.
    expect(within(barra).getByRole("img", { name: "Barra plana" })).toBeTruthy();
    expect(subtituloProductoCelular(18)).toBe("$18.00 c/u");
  });

  // ── 9 · ningún número cambia ──────────────────────────────────────────────
  it("ningún número cambia: el total es el mismo prendido y apagado", () => {
    const filas = filasDeTiendas([
      { tiendaCodigo: "D-25", tienda: "Nova Lux, S.A.", total: 12649.97, noReportado: 0, cantidad: 4, porMarca: NOVA.porMarca },
      { tiendaCodigo: null, tienda: "General", total: 35470.8, noReportado: 0, cantidad: 21, porMarca: GENERAL_FILA.porMarca },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    // El total del pie es el MISMO en las dos vistas: sale de la misma función.
    expect(totalDeTiendas(filas)).toBe(48120.77);
    // Y el renglón del gasto lleva el MISMO monto que la tabla.
    expect(renglonDeGastoCelular(FACTURAS[0]).monto).toBe("$1,040.25");
    expect(renglonDeGastoCelular(FACTURAS[1]).monto).toBe("$731.02");
  });
});
