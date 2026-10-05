/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — RECLAMOS Y CLIENTES «COMO LO HARÍA APPLE» (5-oct-2026).
 *
 * Los dos interruptores nacen APAGADOS; aquí cada pantalla se pinta con
 * `apple` forzado para comprobar que la propuesta se dibuja y que los NÚMEROS
 * son los de siempre (salen de los mismos módulos puros). Apagado, las pruebas
 * de siempre de cada pantalla siguen cuidando lo de hoy.
 * ────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import { SWRConfig } from "swr";

vi.mock("next/navigation", () => ({
  usePathname: () => "/reclamos",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ authChecked: true, role: "admin", isOwner: false }) }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/shared/SyncNowButton", () => ({ default: () => null }));

import { ToastProvider } from "@/components/ToastSystem";
import EmpresaSelector from "@/app/reclamos/components/EmpresaSelector";
import EmpresaList from "@/app/reclamos/components/EmpresaList";
import ReclamoForm from "@/app/reclamos/components/ReclamoForm";
import ReclamoDetail from "@/app/reclamos/components/ReclamoDetail";
import PortadaCelular from "@/app/reclamos/components/celular/PortadaCelular";
import ListaEmpresaCelular from "@/app/reclamos/components/celular/ListaEmpresaCelular";
import DetalleCelular from "@/app/reclamos/components/celular/DetalleCelular";
import ClientesListClient, { type Cliente } from "@/app/clientes/ClientesListClient";
import ClienteDetail, { type ClienteDetailData } from "@/app/clientes/[codigo]/ClienteDetail";
import { emptyItem } from "@/app/reclamos/components/constants";
import type { Reclamo } from "@/app/reclamos/components/types";
import { hoyPanama } from "@/lib/fecha-panama";
import { fmt } from "@/lib/format";
import { resumenPortada } from "@/lib/reclamos/portada";
import { DIAS_RECLAMO_VIEJO } from "@/lib/reclamos/viejos";
import { RECLAMOS_APPLE_2026_10, lineaPendientes, diasEnRojo, cobradoEntero } from "@/lib/reclamos/apple-2026-10";
import { CLIENTES_APPLE_2026_10 } from "@/lib/clientes/apple-2026-10";

const almacen = () => {
  const datos = new Map<string, string>();
  return { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, String(v)); }, removeItem: (k: string) => { datos.delete(k); }, clear: () => datos.clear(), key: () => null, get length() { return datos.size; } } as unknown as Storage;
};
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-reclamos"; });
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: almacen(), configurable: true, writable: true });
  Object.defineProperty(window, "sessionStorage", { value: almacen(), configurable: true, writable: true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const HOY = hoyPanama();
function haceDias(n: number): string {
  const [a, m, d] = HOY.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10);
}
const noop = () => {};
const mk = (o: Partial<Reclamo> & { precio?: number; id: string }): Reclamo => ({
  nro_reclamo: o.id, empresa: "Fashion Wear", proveedor: "American Fashion Wear", marca: "Tommy Hilfiger",
  nro_factura: "2000013690", nro_orden_compra: "", fecha_reclamo: "2026-06-11", estado: "Creado", notas: "",
  created_at: "2026-06-11T10:00:00Z", reclamado_en: "2026-07-01T00:00:00Z",
  reclamo_items: [{ ...emptyItem(), referencia: "R", descripcion: "D", cantidad: 1, precio_unitario: o.precio ?? 100 }],
  reclamo_fotos: [], reclamo_seguimiento: [], reclamo_settlements: [],
  ...o,
});
const leer = (p: string) => readFileSync(join(__dirname, "../..", p), "utf8");

describe("los interruptores", () => {
  it("nacen apagados: se prenden solo con el «sí» de Daniel", () => {
    expect(RECLAMOS_APPLE_2026_10).toBe(false);
    expect(CLIENTES_APPLE_2026_10).toBe(false);
  });
});

describe("las reglas puras", () => {
  it("la línea dice solo lo que no es cero, con el MISMO corte de 120 días", () => {
    expect(lineaPendientes(19, 6, 2)).toEqual({ texto: "19 pendientes", alertas: [`6 de más de ${DIAS_RECLAMO_VIEJO} días`, "2 sin reclamar"] });
    expect(lineaPendientes(1, 0, 0)).toEqual({ texto: "1 pendiente", alertas: [] });
    expect(diasEnRojo(DIAS_RECLAMO_VIEJO)).toBe(true);
    expect(diasEnRojo(DIAS_RECLAMO_VIEJO - 1)).toBe(false);
    expect(diasEnRojo(null)).toBe(false);
  });
  it("cobrado entero al centavo; parcial o sin monto, no", () => {
    expect(cobradoEntero(929.83, 929.83)).toBe(true);
    expect(cobradoEntero(929.83, 900)).toBe(false);
    expect(cobradoEntero(0, 0)).toBe(false);
  });
});

describe("Reclamos › portada (computadora)", () => {
  const RECLAMOS = [
    mk({ id: "FW-1", precio: 3000, fecha_factura: haceDias(200) }),
    mk({ id: "FW-2", precio: 100, fecha_factura: haceDias(10), reclamado_en: null }),
  ];
  const pintar = (role = "admin", apple = true) => render(
    <EmpresaSelector role={role} loading={false} sinEncabezado apple={apple} reclamos={RECLAMOS}
      contactos={[{ id: "c", empresa: "Fashion Wear", nombre: "", nombre_contacto: "Isaac Amar", correo: "iamar@aswgr.com" }]}
      globalSearch="" setGlobalSearch={noop} onNewReclamo={noop} onSelectEmpresa={noop} onLoadDetail={noop} />,
  );

  it("un número grande (el MISMO de `resumenPortada`) y una línea; las cajas se van", () => {
    pintar();
    const cab = document.querySelector("[data-cabecera-apple]")!;
    expect(cab.textContent).toContain(`$${fmt(resumenPortada(RECLAMOS, HOY).porCobrar.monto)}`);
    expect(cab.textContent).toContain(`2 pendientes · 1 de más de ${DIAS_RECLAMO_VIEJO} días · 1 sin reclamar`);
    expect(document.querySelector('[data-medir="reclamos-portada"]')).toBeNull();
  });
  it("«Nuevo reclamo» en la fila del buscador; empresas en filas con ›; lo cobrado al pie", () => {
    pintar();
    const boton = screen.getByRole("button", { name: "Nuevo reclamo" });
    expect(boton.parentElement!.querySelector("input")).not.toBeNull();
    const fw = [...document.querySelectorAll('[data-lista="reclamos-empresas-apple"] li')].find((li) => li.textContent!.includes("Fashion Wear"))!;
    expect(fw.textContent).toContain("2 reclamos · Isaac Amar");
    expect(fw.textContent).toContain("1 sin reclamar");
    expect(fw.textContent).toContain("›");
    expect(document.querySelector('[data-pie="reclamos-cobrado"]')!.textContent).toContain("cobrado en");
  });
  it("⚠️ quien no ve totales tampoco los ve prendido", () => {
    pintar("bodega");
    expect(document.querySelector("[data-cabecera-apple]")).toBeNull();
    expect(document.querySelector('[data-pie="reclamos-cobrado"]')).toBeNull();
  });
  it("apagado = la portada de siempre", () => {
    pintar("admin", false);
    expect(document.querySelector('[data-medir="reclamos-portada"]')).not.toBeNull();
    expect(document.querySelector("[data-reclamos-apple]")).toBeNull();
  });
});

describe("Reclamos › empresa (computadora)", () => {
  const RECLAMOS = [mk({ id: "FW-1", precio: 3000, fecha_factura: haceDias(200) }), mk({ id: "FW-2", precio: 100, fecha_factura: haceDias(10) })];
  const pintar = () => render(
    <EmpresaList role="admin" activeEmpresa="Fashion Wear" reclamos={RECLAMOS} contactos={[]} apple
      selectionMode={false} setSelectionMode={noop} selectedIds={[]} setSelectedIds={noop as never}
      onBack={noop} onNewReclamo={noop} onLoadDetail={noop} onEditReclamo={noop} onDeleteReclamo={noop} onDeleteSelected={noop} onReload={noop} />,
  );
  it("el monto pendiente grande; un solo «Descargar ⌄»; la fila sin botones; 120+ días en rojo", () => {
    pintar();
    expect(document.querySelector("[data-cabecera-apple]")!.textContent).toContain("$3,");
    expect(screen.queryByRole("button", { name: "Descargar Excel" })).toBeNull();
    expect(screen.getByRole("button", { name: /^Descargar/ })).toBeTruthy();
    const fila = [...document.querySelectorAll('[data-vista="tabla"] tbody tr')].find((tr) => tr.textContent!.includes("FW-1"))!;
    expect(fila.querySelector('button[aria-label^="Enviar por correo"]')).toBeNull();
    expect(fila.querySelector(".text-red-600")!.textContent).toBe("200");
  });
});

describe("Reclamos › reclamo (computadora)", () => {
  const pintar = (rec: Reclamo) => render(
    <ToastProvider>
      <ReclamoDetail current={rec} role="admin" contacto={null} nota="" setNota={noop} editMode={false} setEditMode={noop} apple
        editEmpresa="" setEditEmpresa={noop} editFacturas={[]} setEditFacturas={noop} editPedido="" setEditPedido={noop}
        editFechaFactura="" setEditFechaFactura={noop} editNotas="" setEditNotas={noop} editFacturaPdfPath={null} setEditFacturaPdfPath={noop}
        editItems={[]} setEditItems={noop as never} editSaving={false} onStartEdit={noop} toast={null}
        onBack={noop} onAddNota={noop} onChangeEstado={noop} onDeleteReclamo={noop} onSaveEdit={noop}
        onUploadFoto={noop} onDeleteFoto={noop} onAddSettlement={noop} onRemoveSettlement={noop} showToast={noop} />
    </ToastProvider>,
  );
  it("el total grande, «Observaciones» arriba (sin «Notas:») y sin fotos un enlace", () => {
    pintar(mk({ id: "FW-9", fecha_factura: haceDias(5), notas: "Caja mojada" }));
    expect(document.querySelector("[data-total-apple]")!.textContent).toMatch(/^\$/);
    expect(document.querySelector("[data-observaciones]")!.textContent).toBe("Observaciones · Caja mojada");
    expect(document.body.textContent).not.toContain("Notas:");
    expect(screen.getByRole("button", { name: "+ Agregar fotos" })).toBeTruthy();
  });
  it("el comprobante NO usa el ámbar de aviso y vive dentro de «Recuperación»", () => {
    pintar(mk({ id: "P-1", estado: "Pagado", comprobante_url: "https://x/c.jpg", comprobante_path: "c.jpg",
      reclamo_settlements: [{ id: "s", reclamo_id: "P-1", monto: 1, nota_credito: null, nota_credito_ccte_id: null, fecha: "2026-07-08" }] }));
    const caja = screen.getByText(/Comprobante de pago/).closest("div.rounded-lg")!;
    expect(caja.className).not.toMatch(/amber/);
    expect(caja.parentElement!.textContent).toContain("Recuperación");
  });
});

describe("Reclamos › nuevo reclamo", () => {
  const pintar = (pdf: string | null) => render(
    <ToastProvider>
      <ReclamoForm fEmpresa="Fashion Wear" setFEmpresa={noop} fFacturas={["2000013700"]} setFFacturas={noop} fFechaFactura="2026-06-19" setFFechaFactura={noop}
        fPedido="80174924" setFPedido={noop} fNotas="" setFNotas={noop} fItems={[{ ...emptyItem(), referencia: "R", cantidad: 2, precio_unitario: 10 }]} setFItems={noop as never}
        fLineas={[]} setFLineas={noop} fSeleccion={{}} setFSeleccion={noop as never} apple
        facturaPdfPath={pdf} setFacturaPdfPath={noop} savedReclamoId={null} savedNroReclamo="" pendingFotos={[]}
        onAddFoto={noop} onRemoveFoto={noop} onRetryFotos={noop} saving={false} error={null}
        onSave={noop} onCancel={noop} onViewSaved={noop} onResetAndCreateAnother={noop} />
    </ToastProvider>,
  );
  it("sin factura: la barra apagada dice qué hacer y no hay aviso rojo antes de actuar", () => {
    pintar(null);
    const barra = document.querySelector("[data-barra-guardar-reclamo]")!;
    expect(barra.textContent).toContain("Sube la factura para empezar");
    expect((screen.getByRole("button", { name: "Guardar reclamo" }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('[data-medir="reclamo-falta-pdf"]')).toBeNull();
  });
  it("con factura: el resultado en vivo y sin asteriscos", () => {
    pintar("x/f.pdf");
    expect(document.querySelector("[data-total-en-vivo]")!.textContent).toMatch(/^1 línea · \$/);
    expect(document.body.textContent).not.toMatch(/\*/);
  });
});

describe("Reclamos › celular", () => {
  const RECLAMOS = [
    mk({ id: "FW-1", precio: 3000, fecha_factura: haceDias(200), notas: "Caja mojada" }),
    mk({ id: "FW-2", precio: 100, fecha_factura: haceDias(10), reclamado_en: null }),
  ];
  const CONTACTOS = [{ id: "c", empresa: "Fashion Wear", nombre: "", nombre_contacto: "Isaac Amar", correo: "iamar@aswgr.com" }];
  it("portada: la línea dice los sin reclamar; lo cobrado es una línea gris, no una fila muerta", () => {
    render(<PortadaCelular role="admin" reclamos={RECLAMOS} loading={false} contactos={CONTACTOS} apple
      globalSearch="" setGlobalSearch={noop} onNewReclamo={noop} onSelectEmpresa={noop} onLoadDetail={noop} />);
    expect(document.querySelector("[data-linea-apple]")!.textContent).toContain("1 sin reclamar");
    expect(document.querySelector('[data-pie="reclamos-cobrado"]')).not.toBeNull();
  });
  it("empresa: el monto grande con su línea y «sin reclamar» en la fila", () => {
    render(<ListaEmpresaCelular role="admin" activeEmpresa="Fashion Wear" reclamos={RECLAMOS} contactos={CONTACTOS} apple
      selectionMode={false} setSelectionMode={noop} selectedIds={[]} setSelectedIds={noop as never}
      onNewReclamo={noop} onLoadDetail={noop} onDeleteSelected={noop} onReload={noop} />);
    expect(document.querySelector("[data-cabecera-apple]")!.textContent).toContain("· Isaac Amar");
    expect(document.querySelector('[data-lista="reclamos-empresa"]')!.textContent).toContain("sin reclamar");
  });
  it("reclamo: el total grande, días viejos en rojo y «Observaciones» arriba", () => {
    render(<DetalleCelular current={RECLAMOS[0]} role="admin" contacto={null} nota="" setNota={noop} apple
      onStartEdit={noop} onDeleteReclamo={noop} onAddNota={noop} onVolverAPorCobrar={noop} onCobrar={noop} cobrando={false}
      onUploadFoto={noop} onDeleteFoto={noop} toast={null} showToast={noop} />);
    expect(document.querySelector("[data-cabecera-apple]")!.textContent).toMatch(/^\$3,/);
    expect(screen.getByText("200 días").className).toContain("text-red-600");
    expect(document.querySelector("[data-observaciones]")!.textContent).toBe("Observaciones · Caja mojada");
    expect(document.body.textContent).not.toContain("Notas:");
  });
});

const CLIENTES: Cliente[] = [
  { id: "1", codigo: "D-25", nombre: "City Mall Paso Canoa", razon_social: null, telefono: "727-7247", celular: null, email: "c@x.com", debe: 300_000 },
  { id: "2", codigo: "D-9", nombre: "Zapatería Última", razon_social: null, telefono: null, celular: null, email: null, debe: 0 },
];

describe("Clientes › lista", () => {
  it("sin «N clientes» arriba; filas que abren la ficha con ›; dos renglones en el celular", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ anio: 2026, ytd: {} }) })));
    render(<SWRConfig value={{ provider: () => new Map() }}><ClientesListClient initialClientes={CLIENTES} apple /></SWRConfig>);
    expect(screen.queryByText("2 clientes")).toBeNull();
    expect(document.querySelector('[data-vista="tabla"] tbody tr')!.textContent).toContain("›");
    const tarjeta = document.querySelector("[data-dos-renglones] li")!;
    expect(tarjeta.children[0].children.length).toBe(2);
    expect(tarjeta.textContent).toContain("727-7247");
  });
});

describe("Clientes › ficha", () => {
  const D25: ClienteDetailData = {
    cliente: {
      id: "u-25", codigo: "D-25", nombre: "City Mall Paso Canoa", razon_social: "City Mall S A",
      identificacion: "1513069-1-650069", dv: "77", provincia: "Chiriquí", contacto: null,
      telefono: "727-7247", celular: "727-7247", email: "c@x.com", notas: null,
      last_synced_at: "2026-09-05T06:00:00Z", updated_at: null, created_at: null,
      ausente_desde: "2026-08-13T05:41:34Z",
    },
    anio: 2026,
    empresas: [{ empresa: "vistana", compras: 500_000, comprasAnterior: 400_000, debe: 300_000 }],
    compras_brutas: 500_000,
    ultima_compra: "2026-08-27",
    ultimo_pago: { fecha: "2026-08-20", monto: 1 },
    pagos_por_fecha: [],
    documentos_con_saldo: 3,
    aging: [{ company_key: "vistana", nombre: "City Mall", total: 300_000, d0_30: 250_000, d91_120: 30_000, mas_365: 20_000 }],
  };
  it("+90 días en rojo (91-120 + 121 y más, como CxC); «Ya no está en Switch» con el Aviso; empresas en filas", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    render(<ClienteDetail initialData={D25} apple />);
    expect(document.querySelector("[data-mas-90]")!.textContent).toBe("+90 días $50,000.00");
    expect(document.querySelector('[data-aviso="aviso"]')!.textContent).toContain("Switch");
    expect(document.querySelector("[data-empresas-filas]")!.textContent).toContain("Vistana");
  });
});

describe("prendido no cambia números ni guardados", () => {
  it("las pantallas siguen sacando los totales de los módulos puros de siempre", () => {
    expect(leer("app/reclamos/components/EmpresaSelector.tsx")).toContain("resumenPortada(reclamos, hoy)");
    expect(leer("app/clientes/[codigo]/ClienteDetail.tsx")).toContain("saldoMas90(clienteParaCobrar(");
  });
  it("los módulos de los interruptores no llaman a ninguna ruta", () => {
    for (const f of ["lib/reclamos/apple-2026-10.ts", "lib/clientes/apple-2026-10.ts"]) expect(leer(f)).not.toMatch(/fetch\(/);
  });
});
