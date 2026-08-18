/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ANOTAR EL N° DEL TRANSPORTISTA EN UNA GUÍA QUE YA SALIÓ — desde la pantalla.
 *
 * El número dejó de bloquear el despacho, así que hay guías que salen sin él y
 * quedan con el chip ámbar. Daniel: ***"hazle la excepción para ese número"***.
 *
 * 🔴 SE RENDERIZA LA PÁGINA REAL, CON EL HOOK REAL, Y SE TOCAN LOS BOTONES. Lo
 * que hay que ver es de CONDUCTA y un barrido de texto no lo ve: que se pueda
 * anotar el número **y nada más**, y que el aviso ámbar se apague al anotarlo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ authChecked: true, role: "bodega" }),
}));
vi.mock("@/components/AppHeader", () => ({
  default: () => <div data-testid="app-header" />,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: "11111111-1111-4111-8111-111111111111" }),
}));

import GuiaPage from "@/app/guias/[id]/page";

const GUIA_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-000000000000";

/** GT-204 tal como quedó: despachada, firmada, y SIN el N° del transportista. */
function guia(over: Record<string, unknown> = {}) {
  return {
    id: GUIA_ID,
    numero: 204,
    fecha: "2026-08-16",
    transportista: "Transporte Sol",
    modo_entrega: "transportista",
    transportista_id: "t1",
    placa: "EK0700",
    observaciones: "",
    monto_total: 0,
    estado: "Completada",
    tipo_despacho: "externo",
    receptor_nombre: "Nicolás guillen",
    cedula: "1-727-44",
    firma_base64: "data:image/png;base64,x",
    firma_entregador_base64: "data:image/png;base64,y",
    numero_guia_transp: "",
    guia_items: [
      { id: ITEM_ID, orden: 1, cliente: "CITY MALL PASO CANOA", cliente_codigo: "D-25", direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "F-1001", bultos: 6, numero_guia_transp: "" },
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", orden: 2, cliente: "GRUPO HANNA", cliente_codigo: "", direccion: "Changuinola", empresa: "Active Wear", facturas: "F-1002", bultos: 2, numero_guia_transp: "" },
    ],
    ...over,
  };
}

let llamadas: Array<{ url: string; method: string; body: Record<string, unknown> | null }>;
let guardado = "";

function stubFetch(over: Record<string, unknown> = {}) {
  llamadas = [];
  guardado = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      let body: Record<string, unknown> | null = null;
      try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { body = null; }
      llamadas.push({ url: String(url), method, body });

      if (String(url).includes("/numero-transp")) {
        const n = String(body?.numero_guia_transp ?? "").trim();
        if (n === "0") {
          return { ok: false, json: async () => ({ error: "Un 0 no es un N° de guía. Déjalo vacío si el transportista no dio ninguno." }) };
        }
        guardado = n;
        return { ok: true, json: async () => ({ ok: true, numero_guia_transp: n }) };
      }
      if (String(url).startsWith(`/api/guias/${GUIA_ID}`)) {
        return { ok: true, json: async () => guia(over) };
      }
      return { ok: true, json: async () => ({ clientes: [], completo: true, juegos: [] }) };
    }),
  );
}

async function montar(over: Record<string, unknown> = {}) {
  stubFetch(over);
  const r = render(<GuiaPage />);
  await screen.findByText("CITY MALL PASO CANOA");
  return r;
}

beforeEach(() => { try { localStorage.clear(); } catch { /* */ } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("🔴 la guía salió sin el N°: se avisa y se puede anotar", () => {
  it("el aviso ámbar está, y dice qué hacer", async () => {
    await montar();
    expect(screen.getByText(/salió sin el N° del transportista/i)).toBeTruthy();
    expect(screen.getByText(/anótalo en el envío que corresponda/i)).toBeTruthy();
  });

  it("cada renglón ofrece anotarlo, de un toque", async () => {
    await montar();
    expect(screen.getAllByRole("button", { name: "Anotar el N°" })).toHaveLength(2);
  });

  it("se guarda por el endpoint de UNA columna, con su itemId", async () => {
    await montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Anotar el N°" })[0]);
    fireEvent.change(document.getElementById(`tarde-${ITEM_ID}`) as HTMLElement, {
      target: { value: "TR-4471" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar el N°" }));
    await waitFor(() => expect(llamadas.some((l) => l.method === "PATCH")).toBe(true));
    const patch = llamadas.find((l) => l.method === "PATCH")!;
    expect(patch.url).toBe(`/api/guias/${GUIA_ID}/numero-transp`);
    expect(patch.body).toEqual({ itemId: ITEM_ID, numero_guia_transp: "TR-4471" });
    expect(guardado).toBe("TR-4471");
  });

  it("🔴 el aviso ámbar DESAPARECE al anotarlo", async () => {
    await montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Anotar el N°" })[0]);
    fireEvent.change(document.getElementById(`tarde-${ITEM_ID}`) as HTMLElement, {
      target: { value: "TR-4471" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar el N°" }));
    await waitFor(() =>
      expect(screen.queryByText(/salió sin el N° del transportista/i)).toBeNull(),
    );
    // Y el renglón ya lo muestra.
    expect(screen.getByText("TR-4471")).toBeTruthy();
  });

  it("nunca manda `items` ni pasa por el PUT", async () => {
    await montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Anotar el N°" })[0]);
    fireEvent.change(document.getElementById(`tarde-${ITEM_ID}`) as HTMLElement, { target: { value: "TR-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar el N°" }));
    await waitFor(() => expect(llamadas.some((l) => l.method === "PATCH")).toBe(true));
    for (const l of llamadas) {
      expect(l.method, l.url).not.toBe("PUT");
      expect(Object.keys(l.body ?? {}), l.url).not.toContain("items");
    }
  });

  it("el error del servidor se ve en la pantalla, no en un toast que se va", async () => {
    await montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Anotar el N°" })[0]);
    fireEvent.change(document.getElementById(`tarde-${ITEM_ID}`) as HTMLElement, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar el N°" }));
    await screen.findByText(/Un 0 no es un N° de guía/);
    // Y el renglón sigue abierto para corregirlo.
    expect(document.getElementById(`tarde-${ITEM_ID}`)).not.toBeNull();
  });
});

describe("🔴 y NADA MÁS se puede tocar en una guía despachada", () => {
  it("no hay 'Corregir' ni campos del despacho", async () => {
    await montar();
    expect(screen.queryByRole("button", { name: "Corregir" })).toBeNull();
    expect(document.getElementById("transp-0")).toBeNull();
    expect(document.getElementById("despacho-placa")).toBeNull();
    expect(document.getElementById("despacho-receptor")).toBeNull();
    expect(screen.queryByRole("button", { name: "Despachar" })).toBeNull();
  });

  it("el renglón abierto ofrece UN campo, y lo dice", async () => {
    await montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Anotar el N°" })[0]);
    const caja = (document.getElementById(`tarde-${ITEM_ID}`) as HTMLElement).closest("div.rounded-lg")!;
    expect(caja.querySelectorAll("input, select, textarea")).toHaveLength(1);
    expect(screen.getByText(/lo único que se puede cambiar de una guía ya despachada/i)).toBeTruthy();
  });

  it("en ENTREGA DIRECTA no se ofrece: no hay transportista a quien pedírselo", async () => {
    await montar({ tipo_despacho: "directo", modo_entrega: "entrega_directa", placa: "", nombre_chofer: "Julio" });
    expect(screen.queryByRole("button", { name: "Anotar el N°" })).toBeNull();
    expect(screen.queryByText(/salió sin el N° del transportista/i)).toBeNull();
  });

  it("una guía que YA tiene su número ofrece cambiarlo, no anotarlo", async () => {
    await montar({ numero_guia_transp: "TR-900" });
    expect(screen.queryByText(/salió sin el N° del transportista/i)).toBeNull();
    expect(screen.getAllByRole("button", { name: "Cambiar el N°" }).length).toBeGreaterThan(0);
  });
});
