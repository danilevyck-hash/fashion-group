// ─────────────────────────────────────────────────────────────────────────────
// CANDADO DE LA PODA DE TEXTOS DE VENTAS / VISTA GENERAL.
//
// 🔴 EL RIESGO QUE ESTE ARCHIVO EXISTE PARA CAZAR: que "pasar un texto a un ⓘ"
// haya sido, en los hechos, borrarlo. Que compile no prueba nada — el ⓘ puede
// estar montado y no abrirse nunca, o abrirse vacío. Por eso acá se RENDERIZAN
// las pantallas de verdad, se TOCA el ⓘ y se lee lo que sale.
//
// Se verifican las DOS direcciones, y la segunda importa tanto como la primera:
//
//   (a) la metodología que se mudó al ⓘ sigue siendo ALCANZABLE de un toque, y
//   (b) los AVISOS que cambian una decisión siguen EN PANTALLA, sin tocar nada:
//       · "las devoluciones (notas de crédito) ya están restadas" 🩸 — sin eso,
//         cuadrar contra Switch da el DOBLE de las devoluciones;
//       · "se agotó, no dejó de gustar" — un 0 en 12 m no es un fracaso;
//       · "Se agotó" / "Descontinuado" — deciden si se compra o no;
//       · "N clientes con utilidad negativa";
//       · "El API de Switch no expone el número de recibo";
//       · "Toca para ver el detalle" — la única señal de que la celda se abre.
//
// Y el otro lado del ⓘ: cerrado NO puede dejar el texto en pantalla, o la poda
// no habría podado nada.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { ReferenciaView } from "@/components/ventas/ReferenciaView";
import { UtilidadView } from "@/components/ventas/UtilidadView";
import { ComisionesConfigModal } from "@/components/ventas/ComisionesConfigModal";
import { ComisionesConsolidadoView } from "@/components/ventas/ComisionesConsolidadoView";
import { ComisionesDetalleModal } from "@/components/ventas/ComisionesDetalleModal";
import type { ReferenciaApiResp } from "@/lib/ventas/referencia";
import type { UtilidadClienteResponse } from "@/lib/ventas/utilidad-cliente";
import type { ComisionDetalle } from "@/lib/ventas/comisionExcel";

// ModalOverlay (ComisionesDetalleModal) lee la ruta para saber si hay sidebar.
vi.mock("next/navigation", () => ({
  usePathname: () => "/ventas",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// El offset del sidebar sale de localStorage, que en este jsdom no está. No
// tiene nada que ver con los textos: se fija en "expandido" y listo.
vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({
  useSidebarCollapsed: () => false,
  readSidebarCollapsed: () => false,
}));

// ── Mock de red: enruta por URL, nada sale a la red ──────────────────────────

type Ruta = (url: string) => unknown | undefined;
let rutas: Ruta[] = [];

function responder(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  rutas = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const r of rutas) {
      const body = r(url);
      if (body !== undefined) return responder(body);
    }
    return responder({});
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** El ⓘ de la casa: se busca por su nombre accesible (el título del panel). */
function tocarAyuda(titulo: string) {
  const botones = screen.getAllByRole("button", { name: titulo });
  fireEvent.click(botones[0]);
}

// ── Fixture de Referencia ────────────────────────────────────────────────────
//
// Un modelo con dos colores, con datos de catálogo (para que aparezcan las
// columnas de costo) y con la última venta hace rato → estado "se agotó".
const REFERENCIA_RESP: ReferenciaApiResp = {
  modo: "referencias",
  hoyMes: "2026-08",
  infoDisponible: true,
  referencias: [
    {
      codigo: "31KAE22003001",
      empresa: "vistana",
      descripcion: "BOLSOS DAMA",
      serie: [
        { mes: "2026-01", unidades: 40, venta: 2000 },
        { mes: "2026-02", unidades: 35, venta: 1750 },
      ],
      info: {
        descripcion: "KAHLO PASSCASE",
        existencia: 0,
        precioEtiqueta: 79.9,
        costoCif: 3.19,
        syncedAt: "2026-08-09T12:00:00.000Z",
      },
    },
    {
      codigo: "31KAE22003002",
      empresa: "vistana",
      descripcion: "BOLSOS DAMA",
      serie: [{ mes: "2026-01", unidades: 10, venta: 500 }],
      info: {
        descripcion: "KAHLO PASSCASE",
        existencia: 0,
        precioEtiqueta: 79.9,
        costoCif: 3.19,
        syncedAt: "2026-08-09T12:00:00.000Z",
      },
    },
  ],
};

function buscarUnaReferencia() {
  rutas.push((u) => (u.includes("/api/ventas/referencia?q=") ? REFERENCIA_RESP : undefined));
  render(<ReferenciaView />);
  const campo = screen.getByPlaceholderText(/Código, modelo o descripción/);
  fireEvent.change(campo, { target: { value: "31KAE22003" } });
  fireEvent.click(screen.getAllByRole("button", { name: /Buscar/ })[0]);
}

describe("Referencia · el pie de tabla se partió en aviso (queda) + metodología (ⓘ)", () => {
  it("🩸 'las devoluciones ya están restadas' SIGUE EN PANTALLA, sin tocar nada", async () => {
    buscarUnaReferencia();
    await screen.findByText(/las devoluciones \(notas de crédito\) ya están restadas/);
  });

  it("cerrado, el ⓘ NO deja la metodología en pantalla — si la dejara, no se podó nada", async () => {
    buscarUnaReferencia();
    await screen.findByText(/ya están restadas/);
    expect(screen.queryByText(/cuenta solo los meses en que HABÍA mercancía/)).toBeNull();
    expect(screen.queryByText(/FOB y margen son estimados/)).toBeNull();
  });

  it("al tocarlo salen las DOS metodologías: u/mes real y el FOB estimado", async () => {
    buscarUnaReferencia();
    await screen.findByText(/ya están restadas/);
    tocarAyuda("Cómo se calcula");
    expect(screen.getByText(/cuenta solo los meses en que HABÍA mercancía/)).toBeTruthy();
    // El divisor sigue dicho con todas las letras: CIF ÷ 1.10.
    expect(screen.getByText(/CIF ÷ 1\.10/)).toBeTruthy();
    expect(screen.getByText(/FOB y margen son estimados/)).toBeTruthy();
  });

  it("🩸 el aviso de 'Se agotó' NO se movió a ningún ⓘ — decide una compra", async () => {
    buscarUnaReferencia();
    expect(await screen.findByText(/Se agotó/)).toBeTruthy();
  });

  it("el instructivo del buscador vive en el placeholder, no en una línea fija", () => {
    render(<ReferenciaView />);
    expect(screen.getByPlaceholderText(/Código, modelo o descripción — ej\. 31KAE22003/)).toBeTruthy();
    expect(screen.queryByText(/Escribe el modelo/)).toBeNull();
  });
});

describe("Referencia · pegar lista", () => {
  function montarVarias() {
    render(<ReferenciaView />);
    fireEvent.click(screen.getByRole("button", { name: /Varias · pegar lista/ }));
  }

  it("el instructivo de pegado vive en el placeholder (con el tope adentro)", () => {
    montarVarias();
    expect(screen.getByPlaceholderText(/Pega hasta \d+ códigos separados por espacios o saltos de línea/)).toBeTruthy();
    expect(screen.queryByText(/directo desde el Excel del proveedor/)).toBeNull();
  });

  it("🩸 el aviso 'se agotó, no dejó de gustar' QUEDA en pantalla, y con él las devoluciones", async () => {
    rutas.push((u) => (u.includes("/api/ventas/referencia?codigos=") ? REFERENCIA_RESP : undefined));
    montarVarias();
    fireEvent.change(screen.getByPlaceholderText(/Pega hasta/), {
      target: { value: "31KAE22003001 31KAE22003002" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /Buscar/ })[1]);
    await screen.findByText(/se agotó, no dejó de gustar/);
    expect(screen.getByText(/las devoluciones \(notas de crédito\) ya están restadas/)).toBeTruthy();
    // Y la metodología, acá también, detrás del MISMO ⓘ.
    expect(screen.queryByText(/cuenta solo los meses en que HABÍA mercancía/)).toBeNull();
    tocarAyuda("Cómo se calcula");
    expect(screen.getByText(/cuenta solo los meses en que HABÍA mercancía/)).toBeTruthy();
  });
});

describe("Referencia · el porqué de las 2 temporadas", () => {
  it("está en un ⓘ que se toca, no en un párrafo bajo los botones", () => {
    render(<ReferenciaView />);
    fireEvent.click(screen.getByRole("button", { name: /Temporada…/ }));
    expect(screen.queryByText(/temporadas ya terminadas más recientes/)).toBeNull();
    tocarAyuda("Qué temporadas se muestran");
    expect(screen.getByText(/temporadas ya terminadas más recientes/)).toBeTruthy();
    expect(screen.getByText(/mejor predice la que viene/)).toBeTruthy();
  });
});

// ── Utilidad ─────────────────────────────────────────────────────────────────

const UTILIDAD_RESP: UtilidadClienteResponse = {
  year: 2026,
  totales: { ventas: 1000, costo: 700, utilidad: 300, margen: 0.3 },
  rows: [
    {
      clienteSwitchId: 1, cliente: "CLIENTE BUENO", empresaKey: "vistana", empresa: "Vistana",
      nDocs: 3, ventas: 1200, costo: 800, utilidad: 400, margen: 0.3333,
    },
    {
      clienteSwitchId: 2, cliente: "CLIENTE DEVUELVE", empresaKey: "vistana", empresa: "Vistana",
      nDocs: 1, ventas: -200, costo: -100, utilidad: -100, margen: null,
    },
  ],
};

describe("Utilidad · alcance al ⓘ, aviso en pantalla", () => {
  async function montar() {
    rutas.push((u) => (u.includes("/api/ventas/utilidad-cliente") ? UTILIDAD_RESP : undefined));
    render(<UtilidadView selectedYear={2026} />);
    await screen.findAllByText("CLIENTE BUENO");
  }

  it("cerrado no muestra de dónde sale el costo", async () => {
    await montar();
    expect(screen.queryByText(/Costo real por documento/)).toBeNull();
  });

  it("al tocar el ⓘ aparece 'Costo real por documento (5 empresas B2B).'", async () => {
    await montar();
    tocarAyuda("Cómo se calcula");
    expect(screen.getByText("Costo real por documento (5 empresas B2B).")).toBeTruthy();
  });

  it("el aviso de utilidades negativas SIGUE en pantalla (es un aviso, no metodología)", async () => {
    await montar();
    expect(screen.getByText(/1 cliente con utilidad negativa \(devoluciones netas\)\./)).toBeTruthy();
  });
});

// ── Comisiones · matriz consolidada ──────────────────────────────────────────

describe("Comisiones consolidado · el ⓘ no se llevó la señal de que se puede tocar", () => {
  async function montar() {
    rutas.push((u) =>
      u.includes("/api/ventas/comisiones?")
        ? { empresa_key: "vistana", vendedores: [{ vendedor: "REINALDO", base: 1000, base_cobro: 500, comision_total: 10 }] }
        : undefined,
    );
    rutas.push((u) => (u.includes("/comisiones/descuentos") ? { porVendedor: {} } : undefined));
    render(<ComisionesConsolidadoView year={2026} mes={7} />);
    await screen.findByText("Toca para ver el detalle");
  }

  it("'Toca para ver el detalle' se queda visible — es la única pista de la celda clicable", async () => {
    await montar();
    expect(screen.getByText("Toca para ver el detalle")).toBeTruthy();
  });

  it("🩸 'Ya están descontados lo devuelto y los descuentos' NO desaparece: vive en el ⓘ", async () => {
    await montar();
    expect(screen.queryByText(/Ya están descontados lo devuelto y los descuentos/)).toBeNull();
    tocarAyuda("Cómo se calcula");
    expect(screen.getByText(/Ya están descontados lo devuelto y los descuentos/)).toBeTruthy();
  });
});

// ── Comisiones · configuración de tasas ──────────────────────────────────────

describe("Comisiones config · la tasa de entrada sigue alcanzable", () => {
  async function montar() {
    rutas.push((u) =>
      u.includes("/api/ventas/comisiones/config")
        ? { vendedores: [{ vendedor_nombre: "REINALDO", tasa_venta: 0.005, activo: true, origen: ["vistana"] }] }
        : undefined,
    );
    render(<ComisionesConfigModal open onClose={() => {}} onSaved={() => {}} />);
    await screen.findByText("Configurar comisiones");
  }

  it("cerrado no ocupa lugar en el pie del modal", async () => {
    await montar();
    expect(screen.queryByText(/Los vendedores nuevos entran con 0\.50%/)).toBeNull();
  });

  it("al tocar el ⓘ dice con qué tasa entra un vendedor nuevo", async () => {
    await montar();
    tocarAyuda("Cómo se calcula");
    expect(screen.getByText("Los vendedores nuevos entran con 0.50%.")).toBeTruthy();
  });
});

// ── Comisiones · detalle por vendedor ────────────────────────────────────────

const DETALLE: ComisionDetalle = {
  empresa_key: "vistana",
  year: 2026,
  mes: 7,
  vendedor: "REINALDO",
  tasa_venta: 0.005,
  tasa_cobro: 0.005,
  ventas: [{ fecha: "2026-07-03", cliente: "CLIENTE A", secuencial: "F-1", tipo: "Factura", subtotal: 1000, pct_utilidad: 30 }],
  cobros: [{ fecha: "2026-07-10", cliente: "CLIENTE A", monto: 500 }],
  ventas_base: 1000,
  cobros_base: 500,
  comision_venta: 5,
  comision_cobro: 2.5,
  comision_total: 7.5,
};

describe("Comisiones detalle · fórmula en el ⓘ, límite del dato en pantalla", () => {
  async function montar() {
    rutas.push((u) => (u.includes("/comisiones/detalle") ? DETALLE : undefined));
    rutas.push((u) => (u.includes("/comisiones/descuentos") ? { descuentos: [] } : undefined));
    render(
      <ComisionesDetalleModal
        empresa="vistana"
        empresaNombre="Vistana International"
        year={2026}
        mes={7}
        vendedor="REINALDO"
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getAllByText("TOTAL VENTAS").length).toBeGreaterThan(0));
  }

  it("cerrado, la fórmula de la línea no está en pantalla", async () => {
    await montar();
    expect(screen.queryByText(/Comisión de cada línea/)).toBeNull();
    expect(screen.queryByText(/La comisión de cada línea es referencial/)).toBeNull();
  });

  it("🩸 al tocar el ⓘ de Ventas salen la fórmula Y la nota de por qué no da exacto", async () => {
    await montar();
    const ayudas = screen.getAllByRole("button", { name: "Cómo se calcula" });
    fireEvent.click(ayudas[0]);
    expect(screen.getByText(/Comisión de cada línea = subtotal × 0\.50%/)).toBeTruthy();
    expect(screen.getByText(/La comisión de cada línea es referencial/)).toBeTruthy();
  });

  it("el ⓘ de Cobros usa la tasa de COBRO, no la de venta", async () => {
    await montar();
    const ayudas = screen.getAllByRole("button", { name: "Cómo se calcula" });
    fireEvent.click(ayudas[1]);
    expect(screen.getByText(/Comisión de cada línea = monto × 0\.50%/)).toBeTruthy();
  });

  it("'El API de Switch no expone el número de recibo' QUEDA en pantalla", async () => {
    await montar();
    expect(screen.getByText("El API de Switch no expone el número de recibo.")).toBeTruthy();
  });
});
