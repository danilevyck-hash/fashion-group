// ─────────────────────────────────────────────────────────────────────────────
// LA FICHA DEL CLIENTE — TESTS DE CONDUCTA (5-sep-2026).
//
// Se monta la pantalla REAL con datos reales de producción y se mira lo que
// sale. Un barrido de texto vería el `tarjetaDebe(` y se daría por satisfecho
// aunque la tarjeta nunca llegara a dibujarse.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ClienteDetail, { type ClienteDetailData } from "@/app/clientes/[codigo]/ClienteDetail";

const REFRESH = vi.fn();
const PUSH = vi.fn();

let ROL = "admin";
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ authChecked: true, role: ROL, isOwner: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: REFRESH, push: PUSH, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/clientes/D-25",
}));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/shared/SyncNowButton", () => ({ default: () => null }));

/** D-25 · City Mall Paso Canoa, con sus números reales del 5-sep-2026. */
const D25: ClienteDetailData = {
  cliente: {
    id: "u-25",
    codigo: "D-25",
    nombre: "City Mall Paso Canoa",
    razon_social: "City Mall S A",
    identificacion: "1513069-1-650069",
    dv: "77",
    provincia: "Chiriquí",
    contacto: null,
    telefono: "727-7247",
    celular: "727-7247",
    email: "contabilidad@citymall.com.pa",
    notas: null,
    last_synced_at: "2026-09-05T06:00:00Z",
    updated_at: null,
    created_at: null,
    direccion_switch: "Paso Canoas",
  },
  anio: 2026,
  empresas: [
    { empresa: "vistana", compras: 500_000, comprasAnterior: 400_000, debe: 300_000 },
    { empresa: "fashion_wear", compras: 200_000, comprasAnterior: 250_000, debe: 80_000 },
    { empresa: "joystep", compras: 0, comprasAnterior: null, debe: 0 },
  ],
  compras_brutas: 700_000,
  ultima_compra: "2026-08-27",
  ultimo_pago: { fecha: "2026-08-20", monto: 234_189.21 },
  pagos_por_fecha: [
    { fecha: "2026-08-20", monto: 234_189.21, empresas: ["vistana", "fashion_wear"] },
    { fecha: "2026-07-29", monto: 70_129.85, empresas: ["vistana"] },
  ],
  documentos_con_saldo: 353,
  ultimas_guias: [{ id: "g1", numero: 238, fecha: "2026-08-28" }],
  aging: [{ company_key: "vistana", nombre: "City Mall Paso Canoa", total: 300_000, d0_30: 300_000 }],
};

beforeEach(() => {
  ROL = "admin";
  REFRESH.mockClear();
  PUSH.mockClear();
  // La ficha no pide nada al montar; el fetch está por si un campo se guarda.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, cliente: D25.cliente }) })));
  window.sessionStorage.setItem("fg_modules", JSON.stringify([]));
  // `ModalOverlay` (la hoja «Cobrar») lee el estado de la barra lateral de
  // `localStorage`, que este entorno no trae puesto.
  if (!window.localStorage || typeof window.localStorage.getItem !== "function") {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
    });
  }
});
afterEach(() => { vi.unstubAllGlobals(); window.sessionStorage.clear(); });

const pintar = (d: ClienteDetailData = D25) => render(<ClienteDetail initialData={d} />);
const texto = () => document.body.textContent ?? "";

// ─────────────────────────────────────────────────────────────────────────────
describe("1 · el encabezado: el nombre y UNA sola línea con lo fiscal", () => {
  it("la línea fiscal sale entera y en un solo renglón", () => {
    pintar();
    expect(screen.getByText("D-25 · City Mall S A · RUC 1513069-1-650069 · Paso Canoas, Chiriquí")).toBeTruthy();
  });

  it("la dirección de Switch se muestra rotulada como lo que es", () => {
    pintar();
    expect(texto()).toContain("Dirección en Switch: Paso Canoas");
  });

  it("a la derecha hay UN botón: «Cobrar»", () => {
    pintar();
    expect(screen.getByRole("button", { name: "Cobrar" })).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2 · las cuatro tarjetas, lo primero que se ve", () => {
  it("las cuatro, en orden", () => {
    pintar();
    const titulos = [...document.querySelectorAll('[data-bloque="tarjetas"] > div > p:first-child')].map((p) => p.textContent);
    expect(titulos).toEqual(["Compró 2026", "Debe", "Último pago", "Última compra"]);
  });

  it("«Compró 2026» con su delta debajo", () => {
    pintar();
    expect(texto()).toContain("$700,000.00");
    expect(texto()).toContain("+$50,000.00 vs 2025");
  });

  it("«Debe» dice qué porcentaje es de lo que te compró", () => {
    pintar();
    expect(texto()).toContain("$380,000.00");
    expect(texto()).toContain("el 54% de lo que te compró");
  });

  it("«Último pago» y «Última compra» dicen cuánto hace, con su detalle", () => {
    // 5-sep-2026 es el día de referencia real; se usa el reloj para no clavar
    // una fecha que envejezca, pero se comprueba la FORMA.
    pintar();
    expect(texto()).toMatch(/hace \d+ días|hoy|ayer/);
    expect(texto()).toContain("$234,189.21");
  });

  it("🔴 sin comprar y sin deber, PALABRAS y no $0.00 en letra grande", () => {
    pintar({
      ...D25,
      empresas: [{ empresa: "vistana", compras: 0, comprasAnterior: null, debe: 0 }],
      compras_brutas: 0,
      ultima_compra: null,
      ultimo_pago: null,
      pagos_por_fecha: [],
    });
    expect(texto()).toContain("Sin comprar en 2026");
    expect(texto()).toContain("No debe nada");
    expect(texto()).toContain("Nunca ha pagado");
    expect(texto()).toContain("Sin compras registradas");
  });

  it("🩸 el que compró y se le acreditó todo NO dice «Sin comprar» (D-119)", () => {
    pintar({
      ...D25,
      empresas: [{ empresa: "vistana", compras: 0, comprasAnterior: null, debe: 0 }],
      compras_brutas: 21_826,
      ultima_compra: "2026-08-27",
      ultimo_pago: null,
      pagos_por_fecha: [],
    });
    expect(texto()).toContain("Compró $21,826.00 y se le acreditó todo");
    expect(texto()).not.toContain("Sin comprar en 2026");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3 · «Empresa por empresa»", () => {
  it("las columnas son Empresa · año · año-1 · vs · Debe, y hay Total", () => {
    pintar();
    const enc = [...document.querySelectorAll("thead th")].map((t) => t.textContent);
    expect(enc).toEqual(["Empresa", "2026", "2025", "vs 2025", "Debe"]);
    expect(screen.getByText("Total")).toBeTruthy();
  });

  it("🩸 la columna «Cobrado» no está", () => {
    pintar();
    expect(texto()).not.toContain("Cobrado");
  });

  it("una empresa sin nada no se dibuja", () => {
    pintar();
    // joystep viene en cero y no aparece; las otras dos sí.
    expect(texto()).toContain("Vistana");
    expect(texto()).toContain("Fashion Wear");
    expect(texto()).not.toContain("Joystep");
  });

  it("#4 · los nombres de empresa son los CORTOS", () => {
    pintar();
    expect(texto()).not.toContain("Vistana International");
  });

  it("la variación se pinta con signo y sin decimal", () => {
    pintar();
    expect(texto()).toContain("+25%");   // vistana 500k vs 400k
    expect(texto()).toContain("−20%");   // fashion_wear 200k vs 250k
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("4 · «Últimos pagos», por FECHA y no por empresa", () => {
  it("una línea por fecha, con el total del día y las empresas", () => {
    pintar();
    expect(texto()).toContain("20 ago · $234,189.21 · Vistana · Fashion Wear");
    expect(texto()).toContain("29 jul · $70,129.85 · Vistana");
  });

  it("sin pagos, se dice", () => {
    pintar({ ...D25, pagos_por_fecha: [] });
    expect(texto()).toContain("Todavía no hay pagos registrados");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("5 · el contacto se edita TOCANDO el dato", () => {
  it("🩸 no hay botón «Editar contacto» ni «Guardar»", () => {
    pintar();
    expect(screen.queryByRole("button", { name: /Editar contacto/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Guardar$/i })).toBeNull();
  });

  it("tocar el dato abre el campo, y al salir se guarda", async () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /Cambiar contacto/i }));
    const campo = document.getElementById("campo-contacto") as HTMLInputElement;
    expect(campo).toBeTruthy();
    fireEvent.change(campo, { target: { value: "Narimy" } });
    fireEvent.blur(campo);
    await waitFor(() => {
      const llamadas = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      expect(llamadas.some((c) => String(c[0]).includes("/api/clientes/D-25"))).toBe(true);
    });
  });

  it("⚠️ abrir un campo y salir sin tocar nada NO escribe", async () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /Cambiar contacto/i }));
    fireEvent.blur(document.getElementById("campo-contacto") as HTMLInputElement);
    await waitFor(() => {
      const llamadas = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      expect(llamadas.length).toBe(0);
    });
  });

  it("Escape deja las cosas como estaban", () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /Cambiar contacto/i }));
    const campo = document.getElementById("campo-contacto") as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "Narimy" } });
    fireEvent.keyDown(campo, { key: "Escape" });
    expect(document.getElementById("campo-contacto")).toBeNull();
    expect((globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.length).toBe(0);
  });

  it("«Correo», no «Email» (diccionario § 0, #8)", () => {
    pintar();
    expect(texto()).toContain("Correo");
    expect(texto()).not.toContain("Email");
  });

  it("lo que FALTA se dice en rojo", () => {
    pintar({ ...D25, cliente: { ...D25.cliente, email: null } });
    expect(screen.getByText("Falta el correo")).toBeTruthy();
  });

  it("quien no puede escribir no ve campos editables", () => {
    ROL = "vendedor";
    pintar();
    expect(screen.queryByRole("button", { name: /Cambiar contacto/i })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("6 · el pie: enlaces, no botones", () => {
  it("«Ver los N documentos» con el número real", () => {
    pintar();
    expect(screen.getByRole("button", { name: /Ver los 353 documentos/ })).toBeTruthy();
  });

  it("«Últimas guías» viene PLEGADO", () => {
    pintar();
    const boton = screen.getByRole("button", { name: /Últimas guías/ });
    expect(boton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(boton);
    expect(boton.getAttribute("aria-expanded")).toBe("true");
  });

  it("«Ver en Cuentas por Cobrar» lleva al módulo con el cliente buscado", () => {
    pintar();
    const a = screen.getByText(/Ver en Cuentas por Cobrar/).closest("a")!;
    expect(a.getAttribute("href")).toBe("/cxc?search=City%20Mall%20Paso%20Canoa");
  });

  it("«Ver en Ventas» lleva a la pestaña con el CÓDIGO", () => {
    pintar();
    const a = screen.getByText(/Ver en Ventas/).closest("a")!;
    expect(a.getAttribute("href")).toBe("/ventas?tab=clientes&cliente=D-25");
  });

  it("🔴 bodega NO ve Cobrar, ni los documentos, ni los dos enlaces", () => {
    ROL = "bodega";
    pintar();
    expect(screen.queryByRole("button", { name: "Cobrar" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Ver los 353 documentos/ })).toBeNull();
    expect(screen.queryByText(/Ver en Cuentas por Cobrar/)).toBeNull();
    expect(screen.queryByText(/Ver en Ventas/)).toBeNull();
    // Pero la ficha se ve entera: es su gracia.
    expect(screen.getByText("City Mall Paso Canoa")).toBeTruthy();
    expect(texto()).toContain("$700,000.00");
  });

  it("🔴 el vendedor ve Cobrar pero NO «Ver en Ventas»", () => {
    ROL = "vendedor";
    pintar();
    expect(screen.getByRole("button", { name: "Cobrar" })).toBeTruthy();
    expect(screen.queryByText(/Ver en Ventas/)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("7 · «Cobrar» abre la MISMA hoja del CXC, sin salir de la ficha", () => {
  it("al tocarlo aparece la hoja «Cobrar» con sus cuatro salidas", async () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: "Cobrar" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Cobrar" })).toBeTruthy();
    });
    // ⚠️ Se busca DENTRO de la hoja: «Correo» también es el rótulo del bloque
    // de contacto de la ficha, que sigue debajo.
    const hoja = screen.getByRole("heading", { name: "Cobrar" }).closest("div")!.parentElement!;
    for (const salida of ["Correo", "WhatsApp", "Copiar el mensaje", "Ver o bajar el PDF"]) {
      expect(hoja.textContent, salida).toContain(salida);
    }
    // Y NO se navegó a otra pantalla.
    expect(PUSH).not.toHaveBeenCalled();
  });
});
