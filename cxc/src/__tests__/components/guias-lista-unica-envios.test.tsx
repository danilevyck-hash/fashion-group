/**
 * ─────────────────────────────────────────────────────────────────────────────
 * UNA SOLA LISTA DE ENVÍOS, Y CORREGIR UN RENGLÓN NO REEMPLAZA LOS OTROS.
 *
 * 🩸 Los 7 envíos de una guía aparecían DOS VECES en la misma pantalla: una en
 * el bloque `ENVÍOS` de solo lectura y otra, completos, dentro del formulario de
 * despacho (`N° DE GUÍA DEL TRANSPORTISTA · UNO POR LÍNEA`). Había que bajar por
 * la misma lista dos veces y la pantalla pasaba los 2.000 px en un celular.
 *
 * 🔴 ESTO RENDERIZA LA PÁGINA REAL, CON EL HOOK REAL, Y TOCA LOS BOTONES. Un
 * barrido de texto sobre el .tsx no puede ver que la lista quedó una sola —y en
 * este repo esos barridos ya pasaron **estando mutados** cuatro veces, porque el
 * comentario que explica el cambio contiene el texto que el barrido busca.
 *
 * Lo que se prueba, y por qué cada cosa:
 *   1. cada envío se dibuja UNA vez, con su caja de N° al lado;
 *   2. corregir un campo va por `PATCH /api/guias/[id]/item` — NUNCA mandando
 *      `items`, que en el PUT borra los renglones e inserta otros nuevos,
 *      cambiándoles el id y tirando el trabajo de atar clientes;
 *   3. lo que se manda son los campos de ESA fila, con su `itemId`;
 *   4. una guía ya despachada no ofrece corregir.
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

/** Los 7 envíos, con la forma de una guía real de varios destinos (tipo GT-204). */
const CLIENTES = [
  "CITY MALL PASO CANOA",
  "CITY MALL DAVID",
  "JERUSALEM PANAMA",
  "SPORTING SHOES N 4",
  "GRUPO HANNA",
  "WOLF MALL CENTER INT",
  "DOLLAR MALL",
];

const ITEMS = CLIENTES.map((cliente, i) => ({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${i}`,
  orden: i + 1,
  cliente,
  cliente_codigo: "",
  direccion: "Paso Canoas",
  empresa: "Fashion Wear",
  facturas: `F-100${i}`,
  bultos: i + 1,
  numero_guia_transp: "",
}));

function guia(over: Record<string, unknown> = {}) {
  return {
    id: GUIA_ID,
    numero: 204,
    fecha: "2026-08-16",
    transportista: "Transporte Sol",
    modo_entrega: "transportista",
    transportista_id: "t1",
    placa: "",
    observaciones: "",
    total_bultos: 28,
    item_count: ITEMS.length,
    monto_total: 0,
    estado: "Pendiente Bodega",
    numero_guia_transp: "",
    guia_items: ITEMS,
    ...over,
  };
}

let llamadas: Array<{ url: string; method: string; body: unknown }>;

function stubFetch(over: Record<string, unknown> = {}) {
  llamadas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      let body: unknown = null;
      try {
        body = init?.body ? JSON.parse(String(init.body)) : null;
      } catch {
        body = String(init?.body);
      }
      llamadas.push({ url: String(url), method, body });

      if (String(url).includes("/item")) {
        const b = body as Record<string, unknown>;
        return { ok: true, json: async () => ({ ok: true, item: { ...ITEMS[0], ...b } }) };
      }
      if (String(url).startsWith(`/api/guias/${GUIA_ID}`)) {
        return { ok: true, json: async () => guia(over) };
      }
      if (String(url).includes("despachos-frecuentes")) {
        return { ok: true, json: async () => ({ juegos: [] }) };
      }
      return { ok: true, json: async () => ({ clientes: [], completo: true }) };
    }),
  );
}

async function montar(over: Record<string, unknown> = {}) {
  stubFetch(over);
  const r = render(<GuiaPage />);
  await screen.findByText(CLIENTES[0]);
  return r;
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* jsdom sin localStorage */
  }
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("🔴 los envíos no pueden aparecer DOS VECES", () => {
  it("cada cliente se dibuja UNA sola vez en toda la pantalla", async () => {
    await montar();
    for (const c of CLIENTES) {
      expect(screen.getAllByText(c), c).toHaveLength(1);
    }
  });

  it("no hay dos rótulos de lista: el bloque duplicado del formulario se fue", async () => {
    await montar();
    // El título que encabezaba la segunda copia.
    expect(screen.queryByText(/uno por línea/i)).toBeNull();
    // Y los 7 clientes viven todos en la MISMA lista: dos `<ul>` con clientes
    // adentro serían las dos listas de vuelta.
    const listas = new Set(
      CLIENTES.map((c) => screen.getByText(c).closest("ul")).filter(Boolean),
    );
    expect(listas.size).toBe(1);
  });

  it("cada renglón trae SU caja del N° del transportista, ahí mismo", async () => {
    await montar();
    for (let i = 0; i < CLIENTES.length; i++) {
      const caja = document.getElementById(`transp-${i}`);
      expect(caja, `transp-${i}`).not.toBeNull();
    }
    // Y no hay una octava de más (la segunda lista habría duplicado los ids).
    expect(document.querySelectorAll('input[id^="transp-"]')).toHaveLength(CLIENTES.length);
  });
});

describe("🔴 corregir un campo NO puede reemplazar la lista de renglones", () => {
  async function corregirPrimero() {
    await montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Corregir" })[0]);
    const bultos = document.getElementById(`corr-bultos-${ITEMS[0].id}`) as HTMLInputElement;
    fireEvent.change(bultos, { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => {
      expect(llamadas.some((l) => l.method === "PATCH")).toBe(true);
    });
    return llamadas.find((l) => l.method === "PATCH")!;
  }

  it("va por el endpoint que toca UNA fila, y con su itemId", async () => {
    const patch = await corregirPrimero();
    expect(patch.url).toBe(`/api/guias/${GUIA_ID}/item`);
    expect((patch.body as Record<string, unknown>).itemId).toBe(ITEMS[0].id);
    expect((patch.body as Record<string, unknown>).bultos).toBe(9);
  });

  it("🔴 NUNCA manda `items` — eso borra los renglones y les cambia el id", async () => {
    await corregirPrimero();
    for (const l of llamadas) {
      const b = (l.body ?? {}) as Record<string, unknown>;
      expect(Object.keys(b), l.url).not.toContain("items");
      expect(l.method, l.url).not.toBe("PUT");
    }
  });

  it("los OTROS renglones siguen en pantalla, con sus mismos datos", async () => {
    await corregirPrimero();
    for (const c of CLIENTES) {
      expect(screen.getAllByText(c), c).toHaveLength(1);
    }
    expect(screen.getByText("7 bultos")).toBeTruthy(); // el último, intacto
  });

  it("el cliente se elige con el selector de siempre, no con un campo libre", async () => {
    await montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Corregir" })[0]);
    // El selector compartido se anuncia como combobox; un `<input>` suelto no.
    expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
  });
});

describe("🔴 el candado de la guía YA DESPACHADA no se toca", () => {
  it("una guía Completada no ofrece corregir ni cajas para escribir", async () => {
    await montar({ estado: "Completada", tipo_despacho: "externo", numero_guia_transp: "TR-1" });
    expect(screen.queryByRole("button", { name: "Corregir" })).toBeNull();
    expect(document.getElementById("transp-0")).toBeNull();
    // Y los envíos se siguen viendo, una sola vez.
    for (const c of CLIENTES) expect(screen.getAllByText(c), c).toHaveLength(1);
  });
});
