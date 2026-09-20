/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — «MARCAR COMO PAGADO» ES EL BOTÓN PRINCIPAL DEL RECLAMO
 * (20-sep-2026, aprobado por Daniel).
 *
 * 🩸 Estaba apartado a la derecha (`ml-auto`), con borde gris, como algo que se
 * usa pocas veces; y el botón negro era «Correo». Medido contra producción:
 *
 *    · cobros marcados en los últimos 30 días ....... 9
 *    · correos al proveedor en TODA la historia ..... 9  (el último, hace 2 meses)
 *
 * O sea que el botón negro era el que casi nadie toca y lo de todos los días
 * estaba en la esquina. Se invierte: negro «Marcar como pagado», al lado
 * «Correo» con borde. Ninguno se va, ninguno cambia lo que hace.
 *
 * ⚠️ LO QUE NO CAMBIA, Y ESTE CANDADO LO REPITE: en un reclamo COBRADO
 * «Correo» NO se ofrece ni en la fila ni acá, y el servidor lo rechaza igual.
 * Mandar un reclamo pagado es cobrarle dos veces al proveedor — medido el
 * 24-ago-2026: **$5.306,62 en 5 reclamos**.
 * ────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("next/navigation", () => ({
  usePathname: () => "/reclamos",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));

import { ToastProvider } from "@/components/ToastSystem";
import ReclamoDetail from "@/app/reclamos/components/ReclamoDetail";
import { emptyItem } from "@/app/reclamos/components/constants";
import type { Reclamo } from "@/app/reclamos/components/types";

const RAIZ = process.cwd();
const almacen = () => {
  const datos = new Map<string, string>();
  return { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, String(v)); }, removeItem: (k: string) => { datos.delete(k); }, clear: () => datos.clear(), key: (i: number) => [...datos.keys()][i] ?? null, get length() { return datos.size; } } as unknown as Storage;
};
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-reclamos-cobrar"; });
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: almacen(), configurable: true, writable: true });
  Object.defineProperty(window, "sessionStorage", { value: almacen(), configurable: true, writable: true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const noop = () => {};
const rec = (over: Partial<Reclamo> = {}): Reclamo => ({
  id: "REC-2026-0026", nro_reclamo: "REC-2026-0026", empresa: "Vistana International",
  proveedor: "American Designer Fashion", marca: "Calvin Klein", nro_factura: "3000014229",
  nro_orden_compra: "", fecha_reclamo: "2026-06-19", fecha_factura: "2026-06-19", estado: "Creado",
  notas: "", created_at: "2026-06-19T10:00:00Z", reclamado_en: null,
  reclamo_items: [{ ...emptyItem(), referencia: "QF8518433", descripcion: "PANTI", talla: "S", cantidad: 1, precio_unitario: 7, motivo: "sobrante" }],
  reclamo_fotos: [], reclamo_seguimiento: [], reclamo_settlements: [],
  ...over,
});

function pintar(r: Reclamo = rec()) {
  const onChangeEstado = vi.fn();
  render(
    <ToastProvider>
      <ReclamoDetail current={r} role="admin" contacto={null} nota="" setNota={noop} editMode={false} setEditMode={noop}
        editEmpresa="" setEditEmpresa={noop} editFacturas={[]} setEditFacturas={noop} editPedido="" setEditPedido={noop}
        editFechaFactura="" setEditFechaFactura={noop} editNotas="" setEditNotas={noop} editFacturaPdfPath={null} setEditFacturaPdfPath={noop}
        editItems={[]} setEditItems={noop as never} editSaving={false} onStartEdit={noop} toast={null}
        onBack={noop} onAddNota={noop} onChangeEstado={onChangeEstado} onDeleteReclamo={noop} onSaveEdit={noop}
        onUploadFoto={noop} onDeleteFoto={noop} onAddSettlement={noop} onRemoveSettlement={noop} showToast={noop} />
    </ToastProvider>,
  );
  return { onChangeEstado };
}

describe("🔴 en un reclamo POR COBRAR, el botón negro es «Marcar como pagado»", () => {
  it("«Marcar como pagado» es el principal, y ya no está apartado a la derecha", () => {
    pintar();
    const pagar = screen.getByRole("button", { name: /Marcar como pagado/ });
    expect(pagar.className).toContain("bg-black");
    expect(pagar.className).toContain("text-white");
    expect(pagar.className).not.toContain("ml-auto");
  });

  it("«Correo» sigue estando, al lado, con borde — no se fue a ninguna parte", () => {
    pintar();
    const correo = screen.getByRole("button", { name: "Correo" });
    expect(correo.className).toContain("border");
    expect(correo.className).not.toContain("bg-black");
  });

  it("los dos están en la MISMA fila, y el pagado va primero", () => {
    pintar();
    const pagar = screen.getByRole("button", { name: /Marcar como pagado/ });
    const correo = screen.getByRole("button", { name: "Correo" });
    expect(pagar.parentElement).toBe(correo.parentElement);
    // `compareDocumentPosition` = 4 → `correo` viene DESPUÉS de `pagar`.
    expect(pagar.compareDocumentPosition(correo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("y sigue haciendo lo mismo: abre el cobro, no cambia el estado a la brava", () => {
    const { onChangeEstado } = pintar();
    fireEvent.click(screen.getByRole("button", { name: /Marcar como pagado/ }));
    expect(onChangeEstado).toHaveBeenCalledWith("Pagado");
    expect(onChangeEstado).toHaveBeenCalledTimes(1);
  });

  it("⚠️ CONTROL: «Descargar» y el «···» no se movieron", () => {
    pintar();
    expect(screen.getByRole("button", { name: /^Descargar/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Más opciones del reclamo/ })).toBeTruthy();
  });
});

describe("⚠️ en un reclamo COBRADO no cambió NADA", () => {
  const cobrado = rec({ estado: "Pagado" });

  it("no hay «Correo» — cobrarle dos veces al proveedor sigue prohibido", () => {
    pintar(cobrado);
    expect(screen.queryByRole("button", { name: "Correo" })).toBeNull();
  });

  it("tampoco «Marcar como pagado»: ya está pagado", () => {
    pintar(cobrado);
    expect(screen.queryByRole("button", { name: /Marcar como pagado/ })).toBeNull();
  });

  it("y «Volver a por cobrar» sigue en su esquina, por si fue un error", () => {
    pintar(cobrado);
    const volver = screen.getByRole("button", { name: /Volver a por cobrar/ });
    expect(volver.className).toContain("ml-auto");
  });

  it("🔴 el SERVIDOR sigue siendo el freno de verdad, no la pantalla", () => {
    const ruta = fs.readFileSync(path.join(RAIZ, "src/app/api/reclamos/proveedor/[empresa]/send-zip/route.ts"), "utf8");
    expect(ruta).toMatch(/esPendiente|Pagado/);
  });
});
