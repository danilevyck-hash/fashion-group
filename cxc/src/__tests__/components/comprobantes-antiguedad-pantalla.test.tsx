/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CANDADO DE CONDUCTA — EL BORRADOR QUE SE QUEDÓ SE VE DE LEJOS (22-sep-2026)
 *
 * Se MONTA la pantalla real de Comprobantes con los cinco comprobantes que hoy
 * están trabados en producción ($32.208) y se mira lo que dibuja. Nada de
 * barridos de texto sobre el .tsx: un barrido se cumple con su propio
 * comentario, y este repo ya pagó ese defecto.
 *
 * Lo que fija:
 *   1. El comprobante que no llegó a Switch dice HACE CUÁNTO.
 *   2. Pasada la semana se pinta en ROJO; antes de la semana, gris.
 *   3. La FICHA (teléfono/iPad) y la TABLA (escritorio) dicen lo MISMO.
 *   4. El que SÍ salió no lleva ninguna marca.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import ComprobantesPanel, { type UnifiedPedido } from "@/components/catalogo/ComprobantesPanel";
import { DIAS_SIN_MANDAR_VIEJO } from "@/lib/catalogo/sin-mandar";

const ROUTER = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  usePathname: () => "/catalogos/admin/tommy",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({
  useSidebarCollapsed: () => false,
  readSidebarCollapsed: () => false,
}));
vi.mock("@/lib/catalogo/order-pdf-client", () => ({
  downloadCatalogoOrderPdf: vi.fn(async () => {}),
}));

afterEach(cleanup);

const haceDias = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

const base = (over: Partial<UnifiedPedido>): UnifiedPedido => ({
  origen: "mio",
  id_natural: "11111111-1111-4111-8111-111111111111",
  cliente: "Contado",
  total: 16920,
  created_at: haceDias(41),
  vendor: "REINALDO ESPINOSA",
  item_count: 4,
  fuente: "orders",
  confirmado_cliente_at: null,
  switch_numero: null,
  en_switch: false,
  numero_pedido: null,
  switch_documento: null,
  status: "borrador",
  client_email: null,
  ...over,
});

// Los cinco de producción, medidos el 22-sep-2026.
const TOM_005 = base({ id_natural: "a1", numero_pedido: "TOM-005", total: 16920, created_at: haceDias(41) });
const PED_019 = base({ id_natural: "a2", numero_pedido: "PED-019", total: 2760, created_at: haceDias(62) });
// Un borrador armado HOY: el caso que NO es una alarma.
const RECIEN = base({ id_natural: "a3", numero_pedido: "TOM-099", total: 500, created_at: haceDias(0) });
// Uno del día siguiente al umbral y uno del día anterior: el filo exacto.
const JUSTO_ANTES = base({ id_natural: "a4", numero_pedido: "TOM-097", created_at: haceDias(DIAS_SIN_MANDAR_VIEJO - 1) });
const JUSTO_DESPUES = base({ id_natural: "a5", numero_pedido: "TOM-098", created_at: haceDias(DIAS_SIN_MANDAR_VIEJO) });
// 🔴 El pedido del LINK sin convertir: NO es un pedido de la casa todavía, y
// su abandono se mide con la ventana de 30 días, no con esta cuenta.
const DEL_LINK = base({
  id_natural: "ab12cd34",
  origen: "link",
  fuente: "publicos",
  numero_pedido: null,
  status: null,
  vendor: null,
  created_at: haceDias(20),
});
// Uno que SÍ salió.
const EN_SWITCH = base({
  id_natural: "a6",
  numero_pedido: "TOM-100",
  status: "confirmado",
  en_switch: true,
  switch_numero: "15-000000123",
  switch_documento: "pedido",
  created_at: haceDias(41),
});

function pintar(pedidos: UnifiedPedido[]) {
  return render(
    <ComprobantesPanel
      marca="tommy"
      pedidos={pedidos}
      onRefresh={async () => {}}
      showToast={vi.fn()}
      puedeAdministrar
      puedeEditar
    />,
  );
}

/** Abre los meses plegados y pone el chip de «Borradores» si hace falta. */
function ver(container: HTMLElement, chip?: string) {
  if (chip) {
    const grupo = container.querySelector('[data-medir="filtro-tipo-comprobante"]') as HTMLElement;
    const b = [...grupo.querySelectorAll("button")].find((x) => (x.textContent || "").startsWith(chip));
    expect(b, `no hay chip «${chip}»`).toBeTruthy();
    fireEvent.click(b!);
  }
  // 🩸 La lista agrupa por MES y solo abre el más nuevo: los demás no están
  // montados. Se despliegan antes de buscar una fila vieja.
  for (const btn of [...container.querySelectorAll("button")]) {
    if (/\(\d+ comprobantes?\)/.test(btn.textContent || "") && !btn.querySelector("svg.rotate-90")) {
      fireEvent.click(btn);
    }
  }
}

const filaDe = (c: HTMLElement, n: string) =>
  c.querySelector(`tbody tr[data-pedido="${n}"]`) as HTMLElement;
/** La marca de la TABLA (la de escritorio). La ficha se mide aparte. */
const marcaDe = (c: HTMLElement, n: string): HTMLElement | null =>
  filaDe(c, n)?.querySelector('[data-medir="sin-llegar"], [data-medir="sin-mandar"]') ?? null;

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el comprobante que no llegó a Switch dice DESDE CUÁNDO", () => {
  it("TOM-005 lleva 41 días ahí, y la fila lo dice", () => {
    const { container } = pintar([TOM_005]);
    ver(container, "Borradores");
    const m = marcaDe(container, "TOM-005");
    expect(m, "la fila no marca que no llegó a Switch").toBeTruthy();
    expect(m!.textContent).toContain("No se ha mandado a Switch");
    expect(m!.textContent).toContain("hace 41 días");
  });

  it("🔴 PED-019 lleva 62 y también lo dice — era el que nadie veía", () => {
    const { container } = pintar([PED_019]);
    ver(container, "Borradores");
    expect(marcaDe(container, "PED-019")!.textContent).toContain("hace 62 días");
  });

  it("⚠️ el armado HOY no dice días ni grita: no es una alarma", () => {
    const { container } = pintar([RECIEN]);
    ver(container, "Borradores");
    const m = marcaDe(container, "TOM-099")!;
    expect(m.textContent).toBe("No se ha mandado a Switch");
    expect(m.getAttribute("data-tono")).toBe("calma");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 pasada la semana se ve de lejos", () => {
  it(`a los ${DIAS_SIN_MANDAR_VIEJO - 1} días sigue en gris`, () => {
    const { container } = pintar([JUSTO_ANTES]);
    ver(container, "Borradores");
    const m = marcaDe(container, "TOM-097")!;
    expect(m.getAttribute("data-tono")).toBe("calma");
    expect(m.className).toContain("text-gray-400");
    expect(m.className).not.toContain("text-red-600");
  });

  it(`🔴 a los ${DIAS_SIN_MANDAR_VIEJO} pasa a ROJO`, () => {
    const { container } = pintar([JUSTO_DESPUES]);
    ver(container, "Borradores");
    const m = marcaDe(container, "TOM-098")!;
    expect(m.getAttribute("data-tono")).toBe("alerta");
    expect(m.className).toContain("text-red-600");
  });

  it("🔴 los dos de producción salen en rojo", () => {
    const { container } = pintar([TOM_005, PED_019]);
    ver(container, "Borradores");
    for (const n of ["TOM-005", "PED-019"]) {
      expect(marcaDe(container, n)!.getAttribute("data-tono"), n).toBe("alerta");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 la ficha y la tabla dicen lo MISMO", () => {
  it("el teléfono ve la misma frase y el mismo tono que el escritorio", () => {
    const { container } = pintar([TOM_005]);
    ver(container, "Borradores");
    const ficha = container.querySelector("div.lg\\:hidden") as HTMLElement;
    const tabla = container.querySelector("div.hidden.lg\\:block") as HTMLElement;
    const enFicha = ficha.querySelector('[data-medir="sin-llegar"]') as HTMLElement;
    const enTabla = tabla.querySelector('[data-medir="sin-llegar"]') as HTMLElement;
    expect(enFicha, "la ficha no marca nada").toBeTruthy();
    expect(enTabla, "la tabla no marca nada").toBeTruthy();
    expect(enFicha.textContent).toBe(enTabla.textContent);
    expect(enFicha.getAttribute("data-tono")).toBe(enTabla.getAttribute("data-tono"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el pedido del LINK sin convertir queda AFUERA de esta cuenta", () => {
  it("dice que no se ha mandado, pero sin días y sin marca propia", () => {
    const { container } = pintar([DEL_LINK]);
    ver(container);
    const fila = filaDe(container, "ab12cd34");
    expect(fila, "no se dibujó el pedido del link").toBeTruthy();
    expect(fila.querySelector('[data-medir="sin-llegar"]'), "se le puso la marca del borrador").toBeNull();
    expect(fila.querySelector('[data-medir="sin-mandar"]')).toBeNull();
    expect(fila.textContent).toContain("No se ha mandado a Switch");
    expect(fila.textContent).not.toContain("hace 20 días");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("y el que SÍ salió no lleva ninguna marca", () => {
  it("TOM-100 dice su número de Switch y nada más", () => {
    const { container } = pintar([EN_SWITCH]);
    ver(container);
    expect(marcaDe(container, "TOM-100")).toBeNull();
    expect(filaDe(container, "TOM-100").textContent).toContain("15-000000123");
  });
});
