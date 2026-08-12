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
import type { Compra, ComprasApiResp } from "@/lib/ventas/compras";
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

const COMPRA_40HM265032: Compra = {
  empresa: "vistana",
  codigo: "40HM265032",
  fecha: "2023-11-28",
  documento: "19-000000100",
  proveedor: "American Designer Fashion",
  articulo: "40HM265032",
  unidades: 280,
  // FOB igual al CIF: el error de carga conocido, que se muestra tal cual.
  costos: { cif: 11.55, fob: 11.55, fobOrigen: "igual-al-cif", lista: 16 },
};

/** Un artículo con SEIS compras dentro de la ventana: el caso que ejerce el
 *  tope de la caja (4 visibles + el resto detrás de un toque) y el aviso de las
 *  de más de 3 años. */
const COMPRAS_MUCHAS: Compra[] = [
  ["2026-02-19", 180],
  ["2026-02-11", 120],
  ["2025-10-21", 60],
  ["2025-04-09", 240],
  ["2025-04-01", 240],
  ["2024-08-29", 120],
].map(([fecha, unidades]) => ({
  empresa: "vistana",
  codigo: "NB2570001",
  fecha: fecha as string,
  documento: `DOC-${fecha}`,
  proveedor: "American Designer Fashion",
  articulo: "Men-Boxer Brief",
  unidades: unidades as number,
  costos: { cif: 16.555, fob: 16.555, fobOrigen: "igual-al-cif", lista: 27 },
}));

const REFERENCIA_RESP: ComprasApiResp = {
  hoyMes: "2026-08",
  hoy: "2026-08-11",
  articulos: [
    {
      empresa: "vistana",
      codigo: "40HM265032",
      descripcion: "KAHLO PASSCASE",
      compras: [COMPRA_40HM265032],
      // Su venta real mes a mes. TODA es anterior a la ventana de 12 meses
      // completos que mira la pantalla (ago-2025 → jul-2026), así que este
      // artículo ejerce el camino "no vendió nada en el período".
      serie: [
        { mes: "2024-01", unidades: 70, venta: 1120 },
        { mes: "2024-02", unidades: 70, venta: 1120 },
        { mes: "2024-03", unidades: 70, venta: 1120 },
        { mes: "2024-04", unidades: 66, venta: 1056 },
        { mes: "2025-04", unidades: 3, venta: 48 },
      ],
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
  // Podados el 11-ago-2026 (mañana): la línea de resumen del artículo y la
  // columna del descuento. Daniel: la última compra le basta, y el descuento
  // *"no sirve"*.
  "Ya se acabaron",
  "Ya se acabó",
  "Todavía no se ha acabado ninguna compra",
  // 🩸 Podados el 11-ago-2026 (tarde): TODA la atribución de ventas a una
  // compra concreta. Con stock encima, eso no se sabe — nadie marcó las cajas.
  "Mi última compra",
  "todavía no se acaba",
  "Esta:",
  "Anterior:",
  "van 0",
  // 🩸 Podados el 11-ago-2026 (noche): el mismo $16.56 salía TRES veces —
  // "me costó", "CIF de hoy" y "FOB"— y había DOS pies de página que no
  // cambiaban ninguna decisión.
  "CIF de hoy",
  "CIF de la compra anterior",
  "Vendí a",
  "me costó",
  "Lo que queda en bodega es de Switch",
  "compras más viejas de 3 años",
  "más de hace años",
];

async function buscar(resp: ComprasApiResp, codigo: string) {
  rutas.push((u) => (u.includes("/api/ventas/referencia?q=") ? resp : undefined));
  render(<ReferenciaView />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: codigo } });
  fireEvent.click(screen.getAllByRole("button", { name: /Buscar/ })[0]);
  await screen.findAllByText(codigo);
}

const buscarUnaReferencia = () => buscar(REFERENCIA_RESP, "40HM265032");

/** La venta REAL de `NB2570001` (vistana, medida el 11-ago-2026): 331 unidades
 *  por $8.910,60 en los 12 meses completos → precio prom $26.92 y margen 39%
 *  contra un CIF de $16,555. La primera línea es de 2022 para que la ventana se
 *  divida entre 12 (el artículo vende desde entonces). */
const SERIE_NB2570001 = [
  { mes: "2022-11", unidades: 14, venta: 336 },
  { mes: "2025-09", unidades: 36, venta: 972 },
  { mes: "2025-10", unidades: 36, venta: 972 },
  { mes: "2025-11", unidades: 73, venta: 1965.6 },
  { mes: "2025-12", unidades: 61, venta: 1647 },
  { mes: "2026-01", unidades: 24, venta: 648 },
  { mes: "2026-02", unidades: 12, venta: 324 },
  { mes: "2026-03", unidades: 21, venta: 558 },
  { mes: "2026-04", unidades: 26, venta: 708 },
  { mes: "2026-05", unidades: 6, venta: 144 },
  { mes: "2026-07", unidades: 36, venta: 972 },
];

/** El mismo artículo pero con 6 compras en la ventana y 3 de más de 3 años:
 *  ejerce el tope de la caja y la línea que cuenta el resto. */
const RESP_MUCHAS_COMPRAS: ComprasApiResp = {
  ...REFERENCIA_RESP,
  articulos: [
    {
      ...REFERENCIA_RESP.articulos[0],
      codigo: "NB2570001",
      descripcion: "Men-Boxer Brief",
      compras: COMPRAS_MUCHAS,
      serie: SERIE_NB2570001,
      comprasFueraDeVentana: 3,
      existencia: 345,
      precioEtiqueta: 27,
      cuadre: { comprado: 960, vendido: 615, existencia: 345, residuo: 0, ajusteConfiable: false },
    },
  ],
};

/** El MISMO artículo con el costo subido en la última compra: $16,555 hoy
 *  contra $14,20 en la anterior. Es la señal que Daniel quiere ver. */
const RESP_COSTO_SUBIO: ComprasApiResp = {
  ...RESP_MUCHAS_COMPRAS,
  articulos: [
    {
      ...RESP_MUCHAS_COMPRAS.articulos[0],
      compras: COMPRAS_MUCHAS.map((c, i) =>
        i === 0 ? c : { ...c, costos: { ...c.costos, cif: 14.2, fob: 14.2 } },
      ),
    },
  ],
};

describe("Referencia · la caja de COMPRAS, cruda", () => {
  it("🔴 dice FECHA y CANTIDAD, la más reciente arriba — y nada más", async () => {
    await buscar(RESP_MUCHAS_COMPRAS, "NB2570001");
    expect(screen.getAllByText("Compras").length).toBeGreaterThan(0);
    for (const linea of [
      "19 feb 2026 · 180 u",
      "11 feb 2026 · 120 u",
      "21 oct 2025 · 60 u",
      "9 abr 2025 · 240 u",
    ]) {
      expect(screen.getAllByText(linea).length, `falta la línea "${linea}"`).toBeGreaterThan(0);
    }
  });

  it("🔴 muestra 4 y las demás se cuentan en UNA línea gris, sin enlace", async () => {
    await buscar(RESP_MUCHAS_COMPRAS, "NB2570001");
    // La 5ª y la 6ª no se ven…
    expect(screen.queryByText("1 abr 2025 · 240 u")).toBeNull();
    // …y se anuncian junto con las 3 de más de 3 años: 2 + 3 = 5.
    expect(screen.getAllByText("y 5 compras más").length).toBeGreaterThan(0);
    // 🔴 NO es un botón: el enlace de desplegar se fue. Daniel eligió ver 4.
    expect(screen.queryByRole("button", { name: /compra/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ver menos" })).toBeNull();
  });

  it("🩸 los DOS pies de página se fueron — ninguno cambiaba una decisión", async () => {
    await buscar(RESP_MUCHAS_COMPRAS, "NB2570001");
    const pantalla = document.body.textContent ?? "";
    expect(pantalla).not.toContain("compras más viejas de 3 años");
    expect(pantalla).not.toContain("Lo que queda en bodega es de Switch");
    // 🔴 Y el total de bodega NO cambió: sale de `existencia` de Switch, no de
    // las compras que se ven. Era lo que el primer pie venía a explicar.
    expect(screen.getAllByText(/345 en bodega/).length).toBeGreaterThan(0);
  });

  it("una sola compra lo dice: 'única compra', sin línea de restantes", async () => {
    await buscarUnaReferencia();
    expect(screen.getAllByText("28 nov 2023 · 280 u").length).toBeGreaterThan(0);
    expect(screen.getAllByText("única compra").length).toBeGreaterThan(0);
    expect(screen.queryByText(/y \d+ compras? más/)).toBeNull();
    expect(screen.queryByRole("button", { name: /compra/i })).toBeNull();
  });

  it("🩸 NO dice cuánto tardó, ni cuántas van, ni si se acabó — eso no se sabe", async () => {
    await buscar(RESP_MUCHAS_COMPRAS, "NB2570001");
    const pantalla = document.body.textContent ?? "";
    for (const t of ["Mi última compra", "todavía no se acaba", "van 0", "Esta:", "u en 16 meses"]) {
      expect(pantalla, `"${t}" volvió a la pantalla`).not.toContain(t);
    }
  });
});

describe("Referencia · los otros dos números, sin veredictos ni promedios", () => {
  it("los otros dos números están, y el stock se sigue viendo", async () => {
    await buscarUnaReferencia();
    expect(screen.getAllByText("Vendo por mes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Me queda para").length).toBeGreaterThan(0);
    // Artículo agotado: el 0 de bodega se dice CLARO, no desaparece.
    expect(screen.getAllByText(/0 en bodega/).length).toBeGreaterThan(0);
  });

  it("🔴 el margen NO se inventa: si no vendió en el período, la pantalla LO DICE", async () => {
    await buscarUnaReferencia();
    expect(screen.getAllByText(/No se puede calcular el margen/).length).toBeGreaterThan(0);
    // Y no aparece ningún porcentaje de margen fabricado.
    expect(screen.queryByText(/^margen/)).toBeNull();
  });

  it("la tabla con UNA FILA POR COMPRA se fue — Daniel: 'la ultima me basta'", async () => {
    await buscarUnaReferencia();
    // Ni la tabla de escritorio ni las tarjetas por compra siguen montadas.
    expect(document.querySelector('[data-vista="tabla"]')).toBeNull();
    expect(document.querySelector('[data-vista="tarjetas"]')).toBeNull();
    // Y la columna DESC. (descuento) — textual: "no sirve".
    expect(document.body.textContent ?? "").not.toContain("Desc.");
  });

  it("🩸 la atribución tampoco está en el CÓDIGO: los símbolos del reparto ya no existen", async () => {
    const compras = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/ventas/compras.ts", "utf8"),
    );
    const codigo = compras
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .join("\n");
    for (const t of ["repartirFifo", "medirCompra", "repartirExistencia", "CompraMedida", "UMBRAL_VENDIDO"]) {
      expect(codigo, `"${t}" volvió a compras.ts`).not.toContain(t);
    }
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

// ── La fila de plata: UNA sola, cada número una sola vez ─────────────────────

/** El renglón entero, con los separadores colapsados a " · " para poder
 *  compararlo tal como se LEE. */
function filaDePlata(): string {
  const marca = screen.getAllByText("Precio prom")[0];
  const fila = marca.closest("div.flex") as HTMLElement;
  return (fila.textContent ?? "")
    .replace(/De dónde salen estos números.*$/s, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("Referencia · la fila de plata", () => {
  it("🔴 es UNA sola fila, y dice exactamente lo aprobado", async () => {
    await buscar(RESP_MUCHAS_COMPRAS, "NB2570001");
    expect(filaDePlata()).toBe(
      "Precio prom $26.92 · Costo CIF $16.56 · Costo FOB (calculado) $15.05 · margen 39% · lista $27.00",
    );
  });

  it("🩸 el $16.56 aparece UNA vez — antes salía tres (me costó, CIF de hoy, FOB)", async () => {
    await buscar(RESP_MUCHAS_COMPRAS, "NB2570001");
    const veces = (document.body.textContent ?? "").split("$16.56").length - 1;
    expect(veces).toBe(1);
  });

  it("🔴 el Costo FOB se ROTULA como calculado — no es el que manda Switch", async () => {
    await buscar(RESP_MUCHAS_COMPRAS, "NB2570001");
    expect(screen.getAllByText("Costo FOB (calculado)").length).toBeGreaterThan(0);
    // El FOB del payload llega igual al CIF (el error de carga del 93%). Si se
    // mostrara ése, la fila diría $16.56 dos veces.
    expect(RESP_MUCHAS_COMPRAS.articulos[0].compras[0].costos.fob).toBeCloseTo(16.555, 3);
    expect(filaDePlata()).toContain("Costo FOB (calculado) $15.05");
  });

  it("🔴 si el CIF NO cambió, no se muestra ningún '(antes …)'", async () => {
    await buscar(RESP_MUCHAS_COMPRAS, "NB2570001");
    expect(screen.queryByText(/\(antes/)).toBeNull();
  });

  it("🔴 si te SUBIERON el costo, la señal va pegada al Costo CIF", async () => {
    await buscar(RESP_COSTO_SUBIO, "NB2570001");
    expect(filaDePlata()).toContain("Costo CIF $16.56 (antes $14.20 ↑)");
  });

  it("todo monto va con DOS decimales", async () => {
    await buscar(RESP_MUCHAS_COMPRAS, "NB2570001");
    for (const m of (filaDePlata().match(/\$[\d,.]+/g) ?? [])) {
      expect(m, `${m} no tiene 2 decimales`).toMatch(/^\$[\d,]+\.\d{2}$/);
    }
  });

  it("el ⓘ cerrado no deja su texto en pantalla; al tocarlo dice de dónde sale cada número", async () => {
    await buscar(RESP_MUCHAS_COMPRAS, "NB2570001");
    expect(screen.queryByText(/error de carga conocido/)).toBeNull();
    tocarAyuda("De dónde salen estos números");
    expect(screen.getByText(/Costo CIF ÷ 1,10/)).toBeTruthy();
    expect(screen.getByText(/igual al CIF en 93 de cada 100 líneas/)).toBeTruthy();
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
