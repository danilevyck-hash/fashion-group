/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CANDADO DE CONDUCTA — EL DETALLE DEL PEDIDO (6-sep-2026)
 *
 * Tres arreglos, medidos contra producción el 7-sep-2026:
 *
 * 5.1 🩸 **El correo del cliente se tecleaba y se tiraba.** `client_email` está
 *     VACÍO en los 56 pedidos vivos (Reebok 15 · Tommy 32 · Calvin 5 · Joybees
 *     4) aunque la columna existe desde el día uno: la pantalla lo pedía, lo
 *     mandaba y hacía `setClientEmail("")`. Ahora viene YA ESCRITO del cliente
 *     elegido (del directorio, por CÓDIGO) y queda guardado en el pedido.
 *     🔴 Daniel: *«no quiero que sea obligatorio mandar el correo, pero sí que
 *     sea opcional, ya escrito automáticamente el mail del cliente»* — no se
 *     manda solo, ni se obliga.
 *
 * 5.2 🩸 **Al mandar una COTIZACIÓN el aviso decía «Pedido enviado a …»**,
 *     mientras el PDF, el nombre del archivo y la lista sí decían «Cotización»
 *     (3 reales en Tommy: TOM-027, TOM-030, TOM-031). Una cotización NO APARTA
 *     MERCANCÍA.
 *
 * 5.3 🩸 **Dos cosas que solo se descubrían con el mouse.** El nombre del
 *     cliente parecía texto fijo (su raya era `border-transparent` y solo salía
 *     al pasar el mouse — en el iPad no hay mouse), y el encabezado de la tabla
 *     estaba puesto para quedarse fijo y NO lo hacía.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act, waitFor } from "@testing-library/react";
import PedidoDetalleClient from "@/components/catalogo/PedidoDetalleClient";

const OID = "55555555-5555-4555-8555-555555555555";
const ROUTER = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
const PARAMS = { id: OID, marca: "tommy" };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  useParams: () => PARAMS,
  usePathname: () => `/catalogo/tommy/pedido/${OID}`,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({
  useSidebarCollapsed: () => false,
  readSidebarCollapsed: () => false,
}));
vi.mock("@/lib/catalogo/order-pdf-client", () => ({
  downloadCatalogoOrderPdf: vi.fn(async () => {}),
}));

const ITEM = {
  id: "i1", product_id: "p1", sku: "TH-1", name: "Sandalia", image_url: "",
  quantity: 2, unit_price: 20, category: "footwear", bulto_pzas: 12, precio_lista: 20,
};

interface Opciones {
  status?: string;
  /** El correo que YA tiene guardado el pedido. */
  clientEmail?: string | null;
  /** El correo del cliente en el directorio (`clientes_master.email`). */
  correoDirectorio?: string | null;
  /** Envío activo en Switch. */
  envio?: { estado: string; documento?: string; numero_interno?: string | null } | null;
  /** Del link: ahí el nombre lo escribió la persona y SÍ se teclea. */
  delLink?: boolean;
}

const llamadas: { url: string; method: string; body: string | null }[] = [];

function stub(o: Opciones = {}) {
  llamadas.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    llamadas.push({ url: String(url), method, body: (init?.body as string) ?? null });
    const j = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (url.includes("/enviar-switch")) return j(method === "GET" ? { envio: o.envio ?? null } : { ok: true });
    if (url.includes("/clientes-switch")) {
      if (url.includes("orderId=")) {
        return j({ clienteSwitchId: 42, nombre: "Sporting Shoes", codigo: "D-42", correo: o.correoDirectorio ?? null });
      }
      if (method === "PATCH") {
        return j({ ok: true, clienteSwitchId: 42, nombre: "Sporting Shoes", codigo: "D-42", correo: o.correoDirectorio ?? null });
      }
      return j({ clientes: [{ cliente_switch_id: 42, codigo: "D-42", nombre: "Sporting Shoes" }], contado: null });
    }
    if (url.includes("/vendedores-switch")) return j({ vendedorSwitchId: 7, nombre: "Rey", esFallback: false });
    if (url.includes("/permiso-precio")) return j({ permiso: true, verificado: true, mensaje: null });
    if (url.includes("/clientes-search")) return j([]);
    if (url.includes("/send-order")) return j({ ok: true });
    if (url.includes(`/orders/${OID}`) && method === "PUT") return j({ ok: true });
    if (url.includes(`/orders/${OID}`)) {
      return j({
        id: OID, order_number: "TOM-027", client_name: "Sporting Shoes",
        client_email: o.clientEmail ?? null,
        comment: "", status: o.status ?? "confirmado", total: 480,
        created_at: "2026-08-25T12:00:00Z",
        origen_short_id: o.delLink ? "ab12cd34" : null,
        tommy_order_items: [ITEM],
      });
    }
    return j({});
  }));
  sessionStorage.setItem("cxc_role", "vendedor");
}

async function pintar(o: Opciones = {}) {
  stub(o);
  const r = await act(async () => render(<PedidoDetalleClient marca="tommy" />));
  await screen.findByText("TOM-027");
  return r;
}

/** Abre la caja de «Enviar por email al cliente» y devuelve su input. */
async function abrirCajaCorreo(): Promise<HTMLInputElement> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Enviar por email al cliente/i }));
  });
  return (await screen.findByPlaceholderText("cliente@email.com")) as HTMLInputElement;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("5.1 🔴 el correo viene YA ESCRITO del cliente elegido", () => {
  it("sale del directorio cuando el pedido todavía no tiene ninguno", async () => {
    await pintar({ correoDirectorio: "compras@sportingshoes.com" });
    const campo = await abrirCajaCorreo();
    expect(campo.value).toBe("compras@sportingshoes.com");
  });

  it("🔴 el que el PEDIDO tiene guardado MANDA sobre el del directorio", async () => {
    await pintar({ clientEmail: "elquesemando@cliente.com", correoDirectorio: "otro@directorio.com" });
    const campo = await abrirCajaCorreo();
    expect(campo.value).toBe("elquesemando@cliente.com");
  });

  it("sin correo en ninguna parte, el campo queda vacío — como siempre", async () => {
    await pintar({ correoDirectorio: null });
    const campo = await abrirCajaCorreo();
    expect(campo.value).toBe("");
  });

  it("🔴 NO SE MANDA SOLO: abrir el pedido no llama a send-order", async () => {
    await pintar({ correoDirectorio: "compras@sportingshoes.com" });
    await abrirCajaCorreo();
    expect(llamadas.filter((l) => l.url.includes("/send-order"))).toHaveLength(0);
  });

  it("🔴 y NO ES OBLIGATORIO: el pedido se puede dejar sin mandar el correo", async () => {
    // La caja se abre a mano y nada del pedido depende de que se mande.
    await pintar({ correoDirectorio: "compras@sportingshoes.com" });
    const campo = await abrirCajaCorreo();
    expect(campo.value).toBe("compras@sportingshoes.com");
    // Ni al abrir el pedido ni al abrir la caja sale un solo correo.
    expect(llamadas.filter((l) => l.url.includes("/send-order"))).toHaveLength(0);
    // Y el botón de mandar a Switch NO pide el correo: no está en «lo que falta».
    expect(document.body.textContent || "").not.toMatch(/falta.*correo/i);
  });

  it("🩸 al mandarlo, el correo NO se borra de la pantalla", async () => {
    // Era el `setClientEmail("")` que obligaba a teclearlo de nuevo cada vez.
    await pintar({ correoDirectorio: "compras@sportingshoes.com" });
    const campo = await abrirCajaCorreo();
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /^Enviar$/i })[0]); });
    await waitFor(() => expect(llamadas.some((l) => l.url.includes("/send-order"))).toBe(true));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enviar por email al cliente/i }));
    });
    const otraVez = (await screen.findByPlaceholderText("cliente@email.com")) as HTMLInputElement;
    expect(otraVez.value).toBe("compras@sportingshoes.com");
    expect(campo).toBeTruthy();
  });

  it("🔴 guardar el correo en el pedido lo hace el SERVIDOR, no un PUT desde acá", async () => {
    // El PUT de `orders/[id]` cuenta `client_email` como CONTENIDO y el candado
    // post-envío a Switch lo rechaza con 409 — justo en el pedido que se le
    // manda al cliente. Se anota en `send-order`, después de que Resend confirma.
    await pintar({ correoDirectorio: "compras@sportingshoes.com" });
    await abrirCajaCorreo();
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /^Enviar$/i })[0]); });
    await waitFor(() => expect(llamadas.some((l) => l.url.includes("/send-order"))).toBe(true));
    const puts = llamadas.filter((l) => l.method === "PUT" && (l.body || "").includes("client_email"));
    expect(puts, "el correo NO se guarda con un PUT: lo rechazaría el candado de Switch").toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("5.2 🔴 el aviso dice la MISMA palabra que el papel", () => {
  // ⚠️ La caja «Enviar por email al cliente» vive dentro del bloque que el
  // candado post-envío a Switch esconde (`switchLock ? null : …`), así que
  // desde ESTA pantalla solo se manda mientras el pedido NO salió — y ahí la
  // palabra la decide el status, que es exactamente el caso que estaba mal.
  // La regla completa (manda Switch sobre el status) se mide en
  // `comprobantes-rediseno.test.ts` sobre `palabraDelPapelDeFila`, que es el
  // MISMO módulo que arma el nombre del PDF.
  it("🩸 un BORRADOR avisa «Cotización enviada a …», no «Pedido enviado»", async () => {
    await pintar({ status: "borrador", correoDirectorio: "c@c.com", envio: null });
    await abrirCajaCorreo();
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /^Enviar$/i })[0]); });
    const aviso = await screen.findByText(/enviada a c@c\.com/);
    expect(aviso.textContent).toContain("Cotización enviada");
    expect(aviso.textContent).not.toContain("Pedido enviado");
  });

  it("un pedido CONFIRMADO sigue avisando «Pedido enviado a …»", async () => {
    await pintar({ status: "confirmado", correoDirectorio: "c@c.com", envio: null });
    await abrirCajaCorreo();
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /^Enviar$/i })[0]); });
    const aviso = await screen.findByText(/a c@c\.com/);
    expect(aviso.textContent).toContain("Pedido enviado a");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("5.3 🔴 lo que solo se descubría con el mouse", () => {
  it("🩸 el nombre editable SE VE que se toca, sin pasar el mouse", async () => {
    // En los pedidos del LINK el nombre lo escribió la persona y sí se teclea.
    const { container } = await pintar({ delLink: true, status: "borrador" });
    const campo = container.querySelector("input.text-xl") as HTMLInputElement;
    expect(campo, "no encontré el campo del nombre").toBeTruthy();
    expect(campo.className, "la raya sigue siendo invisible").not.toContain("border-transparent");
    expect(campo.className).toContain("border-b");
    expect(campo.className).toContain("border-dashed");
    // La raya NO puede depender del hover: el iPad no tiene mouse.
    const clasesDeBorde = campo.className.split(/\s+/).filter((c) => c.includes("border-gray"));
    expect(clasesDeBorde.some((c) => !c.startsWith("hover:")), "la raya solo existe al hover").toBe(true);
  });

  it("🩸 el encabezado de la tabla se queda fijo DE VERDAD", async () => {
    // El `sticky top-0` estaba puesto y no funcionaba: `overflow-x-auto` hace
    // de la caja un contenedor de desplazamiento y el sticky se pega a ELLA,
    // que no tenía alto. Con alto, el encabezado sí se queda.
    const { container } = await pintar();
    const thead = container.querySelector("thead.sticky") as HTMLElement;
    expect(thead, "se perdió el encabezado fijo").toBeTruthy();
    const caja = thead.closest("div") as HTMLElement;
    expect(caja.className, "la caja no puede quedarse sin alto: el sticky no se pega a nada")
      .toMatch(/max-h-/);
    expect(caja.className).toContain("overflow-auto");
    expect(caja.className, "con overflow-x-auto el sticky no funciona").not.toContain("overflow-x-auto");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 la pantalla se llama COMPROBANTES en el camino de vuelta", () => {
  it("el enlace de arriba dice «Volver a Comprobantes», no «a Pedidos»", async () => {
    await pintar();
    const volver = screen.getAllByRole("button", { name: /← Volver a/ })[0];
    expect(volver.textContent).toContain("Comprobantes");
    expect(volver.textContent).not.toContain("Volver a Pedidos");
  });
});
