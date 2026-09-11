// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — EL REDISEÑO, MONTADO (10/11-sep-2026). Lo que solo se ve pintando:
// la portada con sus tres números y las tarjetas por plata; la página de la
// empresa abriendo en «Por cobrar» con «Sin reclamar» en rojo; el formulario
// nuevo que no guarda sin PDF y busca en la factura; y la pantalla del reclamo
// con un chip, una fila de botones y los totales abajo.
// La parte pura está en `lib/reclamos-rediseno.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/reclamos",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));

import { ToastProvider } from "@/components/ToastSystem";
import EmpresaSelector from "@/app/reclamos/components/EmpresaSelector";
import EmpresaList from "@/app/reclamos/components/EmpresaList";
import ReclamoForm from "@/app/reclamos/components/ReclamoForm";
import ReclamoDetail from "@/app/reclamos/components/ReclamoDetail";
import { emptyItem } from "@/app/reclamos/components/constants";
import { hoyPanama } from "@/lib/fecha-panama";
import { diasDesde } from "@/lib/reclamos/dias";
import type { Reclamo } from "@/app/reclamos/components/types";

// jsdom en este Node no trae localStorage: el AppHeader lo lee en un efecto
// (barra lateral plegada). Un almacén de mentira, como en comisiones-flecha.
const almacen = () => {
  const datos = new Map<string, string>();
  return { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, String(v)); }, removeItem: (k: string) => { datos.delete(k); }, clear: () => datos.clear(), key: (i: number) => [...datos.keys()][i] ?? null, get length() { return datos.size; } } as unknown as Storage;
};
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-reclamos"; });
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: almacen(), configurable: true, writable: true });
  Object.defineProperty(window, "sessionStorage", { value: almacen(), configurable: true, writable: true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const noop = () => {};
const mk = (o: Partial<Reclamo> & { precio?: number; id: string }): Reclamo => ({
  nro_reclamo: o.id, empresa: "Fashion Wear", proveedor: "American Fashion Wear", marca: "Tommy Hilfiger",
  nro_factura: "2000013690", nro_orden_compra: "", fecha_reclamo: "2026-06-11", estado: "Creado", notas: "",
  created_at: "2026-06-11T10:00:00Z", reclamo_items: [{ ...emptyItem(), referencia: "R", descripcion: "D", cantidad: 1, precio_unitario: o.precio ?? 100 }],
  reclamo_fotos: [], reclamo_seguimiento: [], reclamo_settlements: [],
  ...o,
});

/* ═══ La portada ════════════════════════════════════════════════════════════ */
describe("la portada", () => {
  const reclamos = [
    mk({ id: "FW-1", empresa: "Fashion Wear", precio: 3000, fecha_factura: "2025-02-01", reclamado_en: null }),
    mk({ id: "FW-2", empresa: "Fashion Wear", precio: 100, fecha_factura: "2026-06-01", reclamado_en: "2026-07-01T00:00:00Z" }),
    mk({ id: "VI-1", empresa: "Vistana International", precio: 50, fecha_factura: "2026-02-06", reclamado_en: "2026-07-01T00:00:00Z" }),
    mk({ id: "P-1", empresa: "Fashion Wear", precio: 300, estado: "Pagado", reclamo_settlements: [{ id: "s", reclamo_id: "P-1", monto: 353.1, nota_credito: null, nota_credito_ccte_id: null, fecha: "2026-07-08" }] }),
  ];
  const contactos = [{ id: "c", empresa: "Fashion Wear", nombre: "", nombre_contacto: "Isaac Amar", correo: "iamar@aswgr.com" }];
  function pintar() {
    return render(<EmpresaSelector role="admin" reclamos={reclamos} loading={false} contactos={contactos} globalSearch="" setGlobalSearch={noop} onNewReclamo={noop} onSelectEmpresa={noop} onLoadDetail={noop} />);
  }
  it("tres números: por cobrar, sin reclamar (rojo) y cobrado del año", () => {
    pintar();
    const portada = document.querySelector('[data-medir="reclamos-portada"]')!;
    expect(portada.textContent).toContain("Por cobrar");
    expect(portada.textContent).toContain("3 reclamos");
    const sin = within(portada as HTMLElement).getByText("Sin reclamar").parentElement!;
    expect(sin.className).toContain("border-red-200");
    expect(sin.textContent).toContain("1 reclamo");
    expect(portada.textContent).toContain(`Cobrado ${hoyPanama().slice(0, 4)}`);
  });
  it("tarjetas por plata, con el contacto real, los días de la factura más vieja y el chip rojo", () => {
    pintar();
    const grid = document.querySelector('[data-medir="reclamos-tarjetas"]')!;
    const nombres = Array.from(grid.querySelectorAll("p.text-sm.font-semibold")).map((p) => p.textContent);
    expect(nombres).toEqual(["Fashion Wear", "Vistana", "Fashion Shoes", "Active Shoes", "Active Wear"]);
    expect(grid.textContent).toContain("Isaac Amar");
    expect(grid.textContent).toContain(`el más viejo lleva ${diasDesde("2025-02-01", hoyPanama())} días`);
    expect(grid.textContent).toContain("sin reclamar 1");
    expect(grid.textContent).toContain("Todavía sin reclamos");
    expect(grid.textContent).not.toContain("Joystep");
    expect(grid.textContent).not.toContain("Alerta");
    expect(grid.textContent).not.toContain("Sin contacto");
  });
});

/* ═══ La página de una empresa ══════════════════════════════════════════════ */
describe("la página de una empresa", () => {
  const reclamos = [
    mk({ id: "FW-0007", precio: 2000, fecha_factura: "2026-08-26", reclamado_en: null, nro_factura: "200004329" }),
    mk({ id: "FW-0001", precio: 3000, fecha_factura: "2026-06-11", reclamado_en: null }),
    mk({ id: "REC-0020", precio: 150, fecha_factura: "2026-03-16", reclamado_en: "2026-07-17T16:28:00Z", nro_factura: "3000013662 - 3000013657 - 3000013660 - 3000013658" }),
    mk({ id: "SINFECHA", precio: 10, fecha_factura: null, reclamado_en: "2026-07-17T16:28:00Z" }),
    mk({ id: "PAGADO", precio: 500, estado: "Pagado", fecha_factura: "2026-05-12" }),
  ];
  function pintar(over: Partial<React.ComponentProps<typeof EmpresaList>> = {}) {
    const onLoadDetail = vi.fn();
    render(
      <EmpresaList role="admin" activeEmpresa="Fashion Wear" reclamos={reclamos} contactos={[]}
        selectionMode={false} setSelectionMode={noop} selectedIds={[]} setSelectedIds={noop as never}
        onBack={noop} onNewReclamo={noop} onLoadDetail={onLoadDetail} onEditReclamo={noop} onDeleteReclamo={noop} onDeleteSelected={noop} onReload={noop} {...over} />,
    );
    return { onLoadDetail };
  }
  const filasTabla = () => Array.from(document.querySelectorAll('[data-vista="tabla"] tbody tr'));

  it("abre en «Por cobrar N · $» y muestra solo los por cobrar, la factura más vieja primero y los sin fecha al final", () => {
    pintar();
    expect(screen.getByRole("button", { name: /Por cobrar/ }).textContent).toContain("4 · $");
    expect(screen.getByRole("button", { name: /Cobrados/ }).textContent).toContain("1");
    const nros = filasTabla().map((tr) => tr.querySelector("td")!.textContent);
    expect(nros).toEqual(["REC-0020", "FW-0001", "FW-0007", "SINFECHA"]);
    expect(document.body.textContent).not.toContain("PAGADO");
  });
  it("«Sin reclamar» en rojo, «Reclamado 17 jul», las facturas con «·», y «Falta la fecha de la factura»", () => {
    pintar();
    const rojo = screen.getAllByText("Sin reclamar");
    expect(rojo.length).toBeGreaterThan(0);
    expect(rojo[0].className).toContain("text-red-600");
    expect(screen.getAllByText(/Reclamado 17 jul/).length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("3000013662 · 3000013657 · 3000013660 · 3000013658");
    expect(screen.getAllByText("Falta la fecha de la factura").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("En proceso");
  });
  it("tocar la fila abre el reclamo; en la fila viven «Correo», «Descargar» y el «···»", () => {
    const { onLoadDetail } = pintar();
    const fila = filasTabla()[1];
    fireEvent.click(fila.querySelector("td")!);
    expect(onLoadDetail).toHaveBeenCalledWith("FW-0001");
    expect(within(fila as HTMLElement).getByRole("button", { name: /Mandar por correo el reclamo FW-0001/ })).toBeTruthy();
    expect(within(fila as HTMLElement).getByRole("button", { name: /Descargar el Excel del reclamo FW-0001/ })).toBeTruthy();
    expect(within(fila as HTMLElement).getByRole("button", { name: /Más opciones del reclamo FW-0001/ })).toBeTruthy();
    // Sin íconos mudos: los cinco de antes se fueron.
    expect(within(fila as HTMLElement).queryByLabelText("Enviar al proveedor")).toBeNull();
  });
  it("la tarjeta del celular lleva los 44 px y el mismo dato", () => {
    pintar();
    const tarjetas = document.querySelector('[data-vista="tarjetas"]')!;
    expect(tarjetas.textContent).toContain("Sin reclamar");
    expect(tarjetas.innerHTML).toContain("min-h-[44px]");
  });
});

/* ═══ Nuevo reclamo ═════════════════════════════════════════════════════════ */
describe("nuevo reclamo", () => {
  const LINEAS = [
    { referencia: "78JB258YCI", descripcion: "Playera niño manga corta", talla: "", cantidad: 24, precio: 14.4 },
    { referencia: "DM0DM04410002", descripcion: "CAMISETA PARA CABALLERO", talla: "", cantidad: 180, precio: 12 },
  ];
  function pintar(over: Partial<React.ComponentProps<typeof ReclamoForm>> = {}) {
    const setFSeleccion = vi.fn();
    render(
      <ToastProvider>
        <ReclamoForm fEmpresa="Fashion Wear" setFEmpresa={noop} fFacturas={["2000013700"]} setFFacturas={noop} fFechaFactura="2026-06-19" setFFechaFactura={noop}
          fPedido="80174924" setFPedido={noop} fNotas="" setFNotas={noop} fItems={[emptyItem()]} setFItems={noop as never}
          fLineas={[]} setFLineas={noop} fSeleccion={{}} setFSeleccion={setFSeleccion as never}
          facturaPdfPath="x/f.pdf" setFacturaPdfPath={noop} savedReclamoId={null} savedNroReclamo="" pendingFotos={[]}
          onAddFoto={noop} onRemoveFoto={noop} onRetryFotos={noop} saving={false} error={null}
          onSave={noop} onCancel={noop} onViewSaved={noop} onResetAndCreateAnother={noop} {...over} />
      </ToastProvider>,
    );
    return { setFSeleccion };
  }
  it("🔴 sin PDF no se guarda, y se dice qué falta; sin «Paso 1 de 4»", () => {
    pintar({ facturaPdfPath: null });
    expect((screen.getByRole("button", { name: "Guardar reclamo" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Falta el PDF de la factura.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Paso 1 de 4");
    expect(document.body.textContent).not.toContain("Mostrar todos los campos");
  });
  it("con PDF el botón se prende, y sin líneas está la tabla de siempre con «Repetir el anterior»", () => {
    pintar();
    expect((screen.getByRole("button", { name: "Guardar reclamo" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Repetir el anterior" })).toBeTruthy();
    expect(screen.getAllByRole("option", { name: "Hombre" }).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("+ Agregar motivo");
  });
  it("con líneas: los rótulos exactos, el buscador filtra por estilo y marcar una línea la agrega", () => {
    const { setFSeleccion } = pintar({ fLineas: LINEAS });
    const tabla = document.querySelector(".hidden.lg\\:block table")!;
    const ths = Array.from(tabla.querySelectorAll("th")).map((t) => t.textContent);
    expect(ths).toEqual(["", "Estilo", "Descripción", "Cantidad", "Precio", "Talla", "Cant. reclamada", "Motivo", "Género"]);
    expect(document.body.textContent).toContain("2 renglones");
    fireEvent.change(screen.getByLabelText("Buscar en la factura"), { target: { value: "78JB" } });
    expect(document.body.textContent).toContain("1 de 2");
    expect(document.body.textContent).not.toContain("CAMISETA PARA CABALLERO");
    fireEvent.click(screen.getAllByLabelText("Reclamar 78JB258YCI")[0]);
    expect(setFSeleccion).toHaveBeenCalled();
    expect(document.body.textContent).toContain("Agregar un renglón a mano");
  });
  it("con una línea marcada, el pie dice N renglones · N piezas · $ y los campos son los de siempre", () => {
    pintar({ fLineas: LINEAS, fSeleccion: { 0: { ...emptyItem(), referencia: "78JB258YCI", descripcion: "Playera niño manga corta", cantidad: 23, precio_unitario: 14.4, subtotal: 331.2, motivo: "Mercancía manchada" } } });
    expect(document.body.textContent).toContain("1 renglón · 23 piezas");
    expect(document.body.textContent).toContain("$331.20");
    expect(screen.getAllByLabelText("Cantidad reclamada")[0]).toBeTruthy();
    expect(screen.getAllByLabelText("Talla")[0]).toBeTruthy();
    expect(screen.getAllByLabelText("Motivo")[0]).toBeTruthy();
  });
});

/* ═══ La pantalla del reclamo ═══════════════════════════════════════════════ */
describe("la pantalla del reclamo (REC-2026-0026)", () => {
  const rec = mk({
    id: "REC-2026-0026", empresa: "Vistana International", proveedor: "American Designer Fashion", marca: "Calvin Klein",
    nro_factura: "3000014229", fecha_factura: "2026-06-19", created_at: "2026-06-19T10:00:00Z", reclamado_en: null,
    reclamo_items: [
      { ...emptyItem(), referencia: "QF8518433", descripcion: "PANTI PARA DAMA", talla: "S", cantidad: 1, precio_unitario: 7, motivo: "sobrante" },
      { ...emptyItem(), referencia: "4RF216G410", descripcion: "POLO PARA HOMBRE M/C", talla: "M", cantidad: 8, precio_unitario: 19.2, motivo: "sobrante" },
    ],
    reclamo_seguimiento: [{ id: "n1", nota: "Correo con ZIP adjunto enviado a iamar@aswgr.com, daniel@fashiongr.com (6 reclamos)", autor: "Sistema", created_at: "2026-06-23T21:28:00Z" }],
    reclamo_settlements: [{ id: "s1", reclamo_id: "REC-2026-0026", monto: 100, nota_credito: "402", nota_credito_ccte_id: null, fecha: "2026-07-08" }],
  });
  function pintar(over: Partial<React.ComponentProps<typeof ReclamoDetail>> = {}) {
    const onChangeEstado = vi.fn();
    const onRemoveSettlement = vi.fn();
    render(
      <ToastProvider>
        <ReclamoDetail current={rec} role="admin" contacto={null} nota="" setNota={noop} editMode={false} setEditMode={noop}
          editEmpresa="" setEditEmpresa={noop} editFacturas={[]} setEditFacturas={noop} editPedido="" setEditPedido={noop}
          editFechaFactura="" setEditFechaFactura={noop} editNotas="" setEditNotas={noop} editFacturaPdfPath={null} setEditFacturaPdfPath={noop}
          editItems={[]} setEditItems={noop as never} editSaving={false} onStartEdit={noop} toast={null}
          onBack={noop} onAddNota={noop} onChangeEstado={onChangeEstado} onDeleteReclamo={noop} onSaveEdit={noop}
          onUploadFoto={noop} onDeleteFoto={noop} onAddSettlement={noop} onRemoveSettlement={onRemoveSettlement} showToast={noop} {...over} />
      </ToastProvider>,
    );
    return { onChangeEstado, onRemoveSettlement };
  }
  it("UN chip: «Sin reclamar» en rojo; la cabecera en una línea; sin «Creado»", () => {
    pintar();
    const chip = screen.getByText("Sin reclamar");
    expect(chip.className).toContain("text-red-600");
    const cab = document.querySelector('[data-medir="reclamo-cabecera"]')!.textContent!;
    expect(cab).toContain("3000014229");
    expect(cab).toContain("19 jun 2026");
    expect(cab).toContain("American Designer Fashion · Calvin Klein");
    expect(cab).toContain(`${diasDesde("2026-06-19", hoyPanama())} días`);
    expect(document.body.textContent).not.toMatch(/Antigüedad|Pásalo a En proceso|Cuándo hace falta el comprobante/);
    expect(screen.queryByText("Creado")).toBeNull();
  });
  it("UNA fila: Correo (principal) · Descargar · ··· · «Marcar como pagado» a la derecha", () => {
    const { onChangeEstado } = pintar();
    expect(screen.getByRole("button", { name: "Correo" }).className).toContain("bg-black");
    expect(screen.getByRole("button", { name: /^Descargar/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Más opciones del reclamo/ })).toBeTruthy();
    const pagar = screen.getByRole("button", { name: /Marcar como pagado/ });
    expect(pagar.className).toContain("ml-auto");
    fireEvent.click(pagar);
    expect(onChangeEstado).toHaveBeenCalledWith("Pagado");
    expect(screen.queryByText("Pasar a En proceso")).toBeNull();
  });
  it("los totales van ABAJO de los renglones, como el pie de la factura; sin las cuatro cajas", () => {
    pintar();
    const tot = document.querySelector('[data-medir="reclamo-totales"]')!;
    expect(tot.textContent).toContain("Subtotal");
    expect(tot.textContent).toContain("Importación 10%");
    expect(tot.textContent).toContain("ITBMS (7%)");
    expect(tot.textContent).toContain("$");
    const tabla = document.querySelector('[data-vista="tabla"]')!;
    expect(tabla.compareDocumentPosition(tot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.body.textContent).not.toContain("Imp. importación");
  });
  it("columnas vacías no se dibujan (Género, Factura, PO) y el motivo sale capitalizado", () => {
    pintar();
    const ths = Array.from(document.querySelectorAll('[data-vista="tabla"] th')).map((t) => t.textContent);
    expect(ths).toEqual(["Estilo", "Descripción", "Talla", "Cant.", "Precio", "Subtotal", "Motivo"]);
    // La tabla (lg) y las tarjetas (celular) están las dos en el DOM.
    expect(screen.getAllByText("Sobrante").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("sobrante")).toBeNull();
  });
  it("«Fotos» / «Agregar fotos (0 de 5)» y la nota del correo acortada", () => {
    pintar();
    expect(document.body.textContent).toContain("Agregar fotos");
    expect(document.body.textContent).toContain("(0 de 5)");
    expect(document.body.textContent).not.toContain("Evidencia fotográfica");
    expect(document.body.textContent).toContain("Correo enviado a iamar@aswgr.com, daniel@fashiongr.com");
    expect(document.body.textContent).not.toContain("ZIP adjunto");
    expect(document.body.textContent).not.toContain("— Sistema");
  });
  it("quitar una nota de crédito PREGUNTA antes", () => {
    const { onRemoveSettlement } = pintar();
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(onRemoveSettlement).not.toHaveBeenCalled();
    expect(screen.getByText("¿Quitar esta nota de crédito?")).toBeTruthy();
  });
  it("cuando está pagado, el chip dice «Pagado» y queda «Volver a por cobrar»", () => {
    pintar({ current: { ...rec, estado: "Pagado" } });
    expect(screen.getByText("Pagado")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Volver a por cobrar/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Marcar como pagado/ })).toBeNull();
  });
});
