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
import type { ComprasApiResp, CompraMedida } from "@/lib/ventas/compras";
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
// 🩸 EL TAB SE REESCRIBIÓ (ago-2026): es UNA TABLA, UNA FILA POR COMPRA REAL
// (`switch_ingresos_mercancia`). Lo que este bloque prueba cambió con él, y el
// cambio es el que importa: los textos VIEJOS eran los que había que podar de
// verdad, no mudarlos a un ⓘ. Se fueron del código y no pueden volver.
//   · "Se te acaba en ~46 meses" — medía cuánto duró LO DE ANTES.
//   · "compra ~138 unidades" y los veredictos SE AGOTÓ / DESCONTINUADO.
//   · Los promedios de 3/6/12 meses, que metían el MES EN CURSO adentro.
//   · La pestaña "Varias · pegar lista" — ahora es un solo buscador.
//
// El fixture es el caso REAL que Daniel reconstruyó a mano con el Kardex:
// `40HM265032`, 280 unidades el 28-nov-2023, 279 vendidas, 0 en bodega, 1
// perdida en ajuste. (Los números salen medidos en `ventas-compras.test.ts`;
// acá lo que se mira es la PANTALLA.)

const COMPRA_40HM265032: CompraMedida = {
  empresa: "vistana",
  codigo: "40HM265032",
  fecha: "2023-11-28",
  documento: "19-000000100",
  proveedor: "American Designer Fashion",
  articulo: "40HM265032",
  unidades: 280,
  // FOB igual al CIF: el error de carga conocido, que se muestra tal cual.
  costos: { cif: 11.55, fob: 11.55, fobOrigen: "igual-al-cif", lista: 16 },
  vendidas: 279,
  quedan: 0,
  noVendidoNiEnBodega: 1,
  estado: "medida",
  meses: 16.39,
  fechaUmbral: "2025-04-10",
  mesesConVenta: ["2024-01", "2024-02", "2024-03", "2024-04", "2025-04"],
  precioVendido: 16,
  descuento: 0,
};

const REFERENCIA_RESP: ComprasApiResp = {
  hoyMes: "2026-08",
  hoy: "2026-08-11",
  articulos: [
    {
      empresa: "vistana",
      codigo: "40HM265032",
      descripcion: "KAHLO PASSCASE",
      compras: [COMPRA_40HM265032],
      comprasFueraDeVentana: 0,
      cuadre: { comprado: 280, vendido: 279, existencia: 0, residuo: 1, ajusteConfiable: true },
      stockSinRespaldo: 0,
      vendidoAntes: 0,
      vendidoDeMas: 0,
      sinCompraRegistrada: false,
      existencia: 0,
      precioEtiqueta: 16,
      catalogoSyncedAt: "2026-08-09T12:00:00.000Z",
    },
  ],
  noEncontrados: [],
  comprasDisponibles: true,
  infoDisponible: true,
};

/** Textos del diseño VIEJO. Ninguno puede volver a la pantalla. */
const PROHIBIDOS = [
  "Se te acaba",
  "compra ~",
  "Varias · pegar lista",
  "Se agotó",
  "SE AGOTÓ",
  "Descontinuado",
  "DESCONTINUADO",
  "u/mes",
];

async function buscarUnaReferencia() {
  rutas.push((u) => (u.includes("/api/ventas/referencia?q=") ? REFERENCIA_RESP : undefined));
  render(<ReferenciaView />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "40HM265032" } });
  fireEvent.click(screen.getAllByRole("button", { name: /Buscar/ })[0]);
  await screen.findAllByText("40HM265032");
}

describe("Referencia · una fila por COMPRA, sin veredictos ni promedios", () => {
  it("la compra real se ve: cuándo llegó, cuánto llegó y en cuánto se vendió", async () => {
    await buscarUnaReferencia();
    expect(screen.getAllByText("28 nov 2023").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/280 u/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("16 meses").length).toBeGreaterThan(0);
  });

  it("🩸 los textos del diseño viejo NO están en pantalla — no se mudaron a un ⓘ, se fueron", async () => {
    await buscarUnaReferencia();
    const pantalla = document.body.textContent ?? "";
    for (const t of PROHIBIDOS) expect(pantalla).not.toContain(t);
  });

  it("🩸 tampoco están en el CÓDIGO de la vista — un texto borrado de una rama vuelve por otra", async () => {
    const fuente = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/components/ventas/ReferenciaView.tsx", "utf8"),
    );
    // El encabezado del archivo los cita para explicar por qué no vuelven: se
    // mira solo el código, no los comentarios.
    const codigo = fuente
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .join("\n");
    for (const t of ["Se te acaba", "Varias · pegar lista", "sugerencia", "u/mes"]) {
      expect(codigo).not.toContain(t);
    }
  });

  it("UN SOLO buscador: no hay pestaña de 'pegar lista', y el mismo campo acepta varios códigos", () => {
    render(<ReferenciaView />);
    expect(screen.queryByRole("button", { name: /Varias · pegar lista/ })).toBeNull();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByText(/Podés pegar hasta \d+ códigos juntos/)).toBeTruthy();
  });

  it("el aviso del ajuste QUEDA en pantalla — es plata que se fue, no metodología", async () => {
    await buscarUnaReferencia();
    expect(screen.getAllByText(/1 se perdió en ajuste/).length).toBeGreaterThan(0);
  });
});

describe("Referencia · el ⓘ del FOB que no es confiable", () => {
  it("cerrado NO deja el motivo en pantalla — si lo dejara, no se podó nada", async () => {
    await buscarUnaReferencia();
    expect(screen.queryByText(/error de carga conocido/)).toBeNull();
  });

  it("al tocarlo dice por qué ese FOB no se puede creer, y que NO se corrige", async () => {
    await buscarUnaReferencia();
    tocarAyuda("Este FOB no es confiable");
    expect(screen.getByText(/Switch lo mandó IGUAL al costo CIF/)).toBeTruthy();
    expect(screen.getByText(/sin corregirlo ni estimarlo/)).toBeTruthy();
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
