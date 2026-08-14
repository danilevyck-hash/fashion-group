/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DOS PESTAÑAS EN LA LISTA DE PEDIDOS, Y LAS DECIDE EL NÚMERO DE SWITCH
 *
 * Daniel, 14-ago-2026, textual: *"Tienen q haber dos secciones. Borradores y
 * pedidos a switch. Y en pedidos a switch tiene que estar el número de switch
 * en el pedido para saber cuál es cuál."*
 *
 * Antes eran CUATRO (Todos · Borrador · Confirmado · Enviado). Medido contra
 * producción el 14-ago-2026, sobre los 100 pedidos de toda la historia de los
 * 4 catálogos:
 *   · "Enviado" estaba SIEMPRE en 0 — ese estado no lo escribe ni una línea
 *     del código (`enviado` es de otra tabla, `*_switch_envios`).
 *   · "Confirmado" NO quería decir "salió a Switch": 7 pedidos `confirmado`
 *     nunca llegaron (PED-001/002/003/004 y TOM-007/008/009, del 12-ago) y
 *     PED-018 decía `borrador` estando en Switch con el #16-000000506.
 *
 * Por eso la pestaña la decide `en_switch` (tener envío ACTIVO), no `status`.
 * Con el número a la vista la etiqueta no puede mentir: el número ES la prueba.
 *
 * 🔴 CANDADOS DE CONDUCTA: se RENDERIZA y se lee el DOM. Un barrido de texto
 * sobre el archivo pasaría estando mutado —y encima se cumpliría solo con el
 * comentario que explica el cambio—, que es el defecto que este repo ya pagó
 * cuatro veces.
 *
 * 🩸 Y de mi propio hallazgo en el PR anterior: los menús `OverflowMenu` no
 * pintan sus ítems con el menú cerrado. Acá las pestañas SÍ son botones
 * siempre visibles, pero por eso mismo se cuenta cuántas hay — no se busca
 * una por nombre y se da por satisfecho.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import PedidosListClient from "@/components/catalogo/PedidosListClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/ToastSystem", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

/** Los 8 pedidos que importan, calcados de producción. */
const PEDIDOS = [
  // Los 4 Reebok `confirmado` que NUNCA llegaron a Switch.
  { id: "1", order_number: "PED-001", client_name: "Cliente A", vendor_name: null, status: "confirmado", total: 100, item_count: 1, created_at: "2026-05-19T12:00:00Z", en_switch: false, switch_numero: null },
  { id: "2", order_number: "PED-002", client_name: "Cliente B", vendor_name: null, status: "confirmado", total: 100, item_count: 1, created_at: "2026-06-02T12:00:00Z", en_switch: false, switch_numero: null },
  { id: "3", order_number: "PED-003", client_name: "Cliente C", vendor_name: null, status: "confirmado", total: 100, item_count: 1, created_at: "2026-06-03T12:00:00Z", en_switch: false, switch_numero: null },
  { id: "4", order_number: "PED-004", client_name: "Cliente D", vendor_name: null, status: "confirmado", total: 100, item_count: 1, created_at: "2026-07-04T12:00:00Z", en_switch: false, switch_numero: null },
  // El que decía `borrador` y SÍ está en Switch.
  { id: "5", order_number: "PED-018", client_name: "Cliente E", vendor_name: null, status: "borrador", total: 100, item_count: 1, created_at: "2026-07-21T12:00:00Z", en_switch: true, switch_numero: "16-000000506" },
  // Un confirmado que sí salió, con su número.
  { id: "6", order_number: "PED-020", client_name: "Cliente F", vendor_name: null, status: "confirmado", total: 100, item_count: 1, created_at: "2026-07-25T12:00:00Z", en_switch: true, switch_numero: "16-000000510" },
  // Un borrador de verdad.
  { id: "7", order_number: "PED-021", client_name: "Cliente G", vendor_name: null, status: "borrador", total: 100, item_count: 1, created_at: "2026-08-01T12:00:00Z", en_switch: false, switch_numero: null },
  // ⚠️ El caso a medio camino: en Switch pero SIN número. Hoy 0 en producción.
  { id: "8", order_number: "PED-022", client_name: "Cliente H", vendor_name: null, status: "confirmado", total: 100, item_count: 1, created_at: "2026-08-05T12:00:00Z", en_switch: true, switch_numero: null },
];

beforeEach(() => {
  sessionStorage.setItem("cxc_role", "admin");
  global.fetch = vi.fn(async (url: string) => {
    if (String(url).includes("/orders")) {
      return { ok: true, json: async () => PEDIDOS } as Response;
    }
    return { ok: true, json: async () => [] } as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

async function pintar() {
  const r = render(<PedidosListClient marca="reebok" />);
  // PED-001 es borrador: aparece en la pestaña por defecto.
  await waitFor(() => expect(screen.getByText("PED-001")).toBeTruthy(), { timeout: 3000 });
  return r;
}

/**
 * La FILA de un pedido, por su hook estable `data-pedido`.
 * 🩸 Los dos intentos anteriores fallaron y por lados opuestos: "algún div que
 * contenga X e Y" agarra el contenedor de TODAS las filas (el candado deja de
 * distinguir una fila de otra), y "el div más chico que lo contiene" agarra el
 * sub-renglón del número, que NO tiene el chip del número de Switch. Los dos
 * los cazó correr el test, no leerlo.
 */
function filaDe(container: HTMLElement, numero: string): HTMLElement {
  const fila = container.querySelector<HTMLElement>(`[data-pedido="${numero}"]`);
  expect(fila, `no encontré ninguna fila con ${numero}`).toBeTruthy();
  return fila!;
}

/** Los botones de la fila de pestañas: los que llevan su conteo al lado. */
function pestanas(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("button[aria-pressed]")).map((b) =>
    (b.textContent || "").replace(/\s+/g, " ").trim(),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 son EXACTAMENTE dos pestañas: Borradores y Pedidos a Switch", () => {
  it("hay dos, ni una más", async () => {
    const { container } = await pintar();
    const p = pestanas(container);
    expect(p).toHaveLength(2);
    expect(p[0]).toMatch(/^Borradores\b/);
    expect(p[1]).toMatch(/^Pedidos a Switch\b/);
  });

  it("no vuelven «Todos», «Confirmado» ni «Enviado»", async () => {
    const { container } = await pintar();
    const p = pestanas(container).join(" | ");
    for (const muerta of ["Todos", "Confirmado", "Enviado"]) {
      expect(p, `volvió la pestaña "${muerta}"`).not.toMatch(new RegExp(`\\b${muerta}\\b`));
    }
  });

  it("los conteos son los reales y suman el total (no hay tercer balde)", async () => {
    const { container } = await pintar();
    const p = pestanas(container);
    // 5 sin número (4 confirmados-sin-Switch + 1 borrador real) · 3 con envío.
    expect(p[0]).toBe("Borradores 5");
    expect(p[1]).toBe("Pedidos a Switch 3");
    expect(5 + 3).toBe(PEDIDOS.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 un pedido SIN número de Switch no puede aparecer en «Pedidos a Switch»", () => {
  const filas = (c: HTMLElement) =>
    Array.from(c.querySelectorAll(".font-mono"))
      .map((e) => (e.textContent || "").trim())
      .filter((t) => /^[A-Z]+-\d+$/.test(t));

  it("la pestaña de Switch solo muestra pedidos con envío activo", async () => {
    const { container } = await pintar();
    fireEvent.click(screen.getByText(/Pedidos a Switch/));
    const vistos = filas(container);
    expect(vistos.sort()).toEqual(["PED-018", "PED-020", "PED-022"]);
    // Y NINGUNO de los 4 que nunca llegaron.
    for (const n of ["PED-001", "PED-002", "PED-003", "PED-004"]) {
      expect(vistos, `${n} nunca llegó a Switch y no puede estar acá`).not.toContain(n);
    }
  });

  it("los 7 que decían «confirmado» sin haber salido caen en Borradores", async () => {
    const { container } = await pintar();
    // La pestaña por defecto ya es Borradores.
    const vistos = filas(container);
    for (const n of ["PED-001", "PED-002", "PED-003", "PED-004"]) {
      expect(vistos, `${n} tiene que estar a la vista en Borradores`).toContain(n);
    }
    expect(vistos).not.toContain("PED-018");
  });

  it("PED-018, que decía «borrador», sube a Pedidos a Switch", async () => {
    const { container } = await pintar();
    expect(filas(container)).not.toContain("PED-018");
    fireEvent.click(screen.getByText(/Pedidos a Switch/));
    expect(filas(container)).toContain("PED-018");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el NÚMERO se ve en la fila — es lo que hace creíble la pestaña", () => {
  it("cada pedido en Switch muestra su número, en la fila y sin abrir nada", async () => {
    const { container } = await pintar();
    fireEvent.click(screen.getByText(/Pedidos a Switch/));
    const texto = container.textContent || "";
    expect(texto).toContain("16-000000506"); // PED-018
    expect(texto).toContain("16-000000510"); // PED-020
  });

  it("el número va pegado a SU pedido, no suelto en la pantalla", async () => {
    const { container } = await pintar();
    fireEvent.click(screen.getByText(/Pedidos a Switch/));
    // La fila de PED-018 lleva SU número y ningún otro.
    const fila = filaDe(container, "PED-018");
    expect(fila.textContent, "el 506 tiene que estar en la MISMA fila que PED-018")
      .toContain("16-000000506");
    expect(fila.textContent).not.toContain("16-000000510");
    // Y a la inversa, para que no pase por casualidad de orden.
    const otra = filaDe(container, "PED-020");
    expect(otra.textContent).toContain("16-000000510");
    expect(otra.textContent).not.toContain("16-000000506");
  });

  it("en Borradores no se pinta ningún número de Switch", async () => {
    const { container } = await pintar();
    expect(container.textContent || "").not.toContain("16-0000005");
  });

  it("la píldora de estado («Confirmado») no vuelve: mentía en 8 de 100", async () => {
    const { container } = await pintar();
    for (const p of ["borradores", "switch"]) {
      if (p === "switch") fireEvent.click(screen.getByText(/Pedidos a Switch/));
      const chips = Array.from(container.querySelectorAll(".rounded-full"))
        .map((e) => (e.textContent || "").trim());
      expect(chips).not.toContain("Confirmado");
      expect(chips).not.toContain("Enviado");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("⚠️ el caso a medio camino: en Switch pero sin número", () => {
  // Hoy son 0 de 100 en los 4 catálogos (los 31 envíos activos están
  // 'verificado' y los 31 tienen número). Pero el camino existe en el código,
  // así que se define su conducta en vez de dejarla al azar.
  it("NO se esconde en Borradores — está en Switch", async () => {
    const { container } = await pintar();
    const borradores = Array.from(container.querySelectorAll(".font-mono")).map((e) => (e.textContent || "").trim());
    expect(borradores).not.toContain("PED-022");
  });

  it("aparece en Pedidos a Switch y SE DICE que le falta el número", async () => {
    const { container } = await pintar();
    fireEvent.click(screen.getByText(/Pedidos a Switch/));
    const fila = filaDe(container, "PED-022");
    expect(fila.textContent).toContain("en Switch, sin número");
    // Y no se inventa un "?" como número.
    expect(fila.textContent).not.toContain("#?");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("lo que ya funcionaba sigue funcionando", () => {
  it("la búsqueda sigue filtrando dentro de la pestaña", async () => {
    const { container } = await pintar();
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "PED-001" } });
    const vistos = Array.from(container.querySelectorAll(".font-mono"))
      .map((e) => (e.textContent || "").trim())
      .filter((t) => /^[A-Z]+-\d+$/.test(t));
    expect(vistos).toEqual(["PED-001"]);
  });

  it("las pestañas miden 44 px de alto", async () => {
    const { container } = await pintar();
    for (const b of container.querySelectorAll("button[aria-pressed]")) {
      expect(b.className).toContain("min-h-[44px]");
    }
  });
});
