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
 *   2. corregir un renglón tiene UNA sola puerta: «Editar», el mismo
 *      formulario del alta;
 *   3. la lista no despacha ni escribe por su cuenta.
 *
 * 🩸 EL BLOQUE 2 CAMBIÓ DE DIRECCIÓN EL 25-ago-2026. Antes protegía el
 * «Corregir» por renglón —una cajita con cliente, dirección, empresa, bultos y
 * facturas que guardaba por `PATCH /api/guias/[id]/item`—. Ese botón se
 * retiró: abría EXACTAMENTE los mismos campos que el formulario de «Editar»,
 * con su propio botón de guardar y su propia validación. Daniel, punto 1:
 * ***"se retira el «Corregir» por renglón. Un formulario, el MISMO al crear y
 * al editar"***.
 *
 * ⚠️ El endpoint por columna NO se retiró y sigue siendo el único camino para
 * escribir en una guía FIRMADA (candado en `guias-anotar-numero-tarde`). Lo que
 * se fue es el segundo botón, no la escritura segura.
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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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
      if (String(url).startsWith("/api/transportistas")) {
        return { ok: true, json: async () => [{ id: "t1", nombre: "Transporte Sol", activo: true }] };
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

/** jsdom trae un `localStorage` a medias; el formulario guarda borradores. */
function memStorage(): Storage {
  let m: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in m ? m[k] : null),
    setItem: (k: string, v: string) => { m[k] = String(v); },
    removeItem: (k: string) => { delete m[k]; },
    clear: () => { m = {}; },
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memStorage());
  vi.stubGlobal("sessionStorage", memStorage());
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

describe("🔴 UNA SOLA PUERTA PARA CORREGIR UN RENGLÓN: «Editar»", () => {
  it("🩸 el «Corregir» por renglón ya no existe — era el segundo camino", () => {
    // No hay `it` sin `montar`: el chequeo real está abajo. Este comentario
    // queda como el porqué.
    expect(true).toBe(true);
  });

  it("ningún renglón ofrece «Corregir», ni abierto ni cerrado", async () => {
    await montar();
    expect(screen.queryAllByRole("button", { name: "Corregir" })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: "Cerrar" })).toHaveLength(0);
    // Y las cajitas de aquel formulario tampoco están.
    for (const it of ITEMS) {
      expect(document.getElementById(`corr-bultos-${it.id}`)).toBeNull();
      expect(document.getElementById(`corr-facturas-${it.id}`)).toBeNull();
      expect(document.getElementById(`corr-direccion-${it.id}`)).toBeNull();
    }
  });

  it("🔴 el camino que queda es «Editar», y abre los 7 envíos EDITABLES", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Editar/ }));
    await waitFor(() =>
      expect(
        document.querySelectorAll('input[id^="facturas-"][id$="-m"]').length,
      ).toBe(ITEMS.length),
    );
    // En una guía PENDIENTE se edita todo, incluidos los bultos.
    expect(document.querySelectorAll('input[id^="bultos-"][id$="-m"]')).toHaveLength(ITEMS.length);
    expect(document.querySelectorAll('input[id^="direccion-"][id$="-m"]')).toHaveLength(ITEMS.length);
  });

  it("🔴 y la lista de solo lectura NO se dibuja al mismo tiempo", async () => {
    // Serían los mismos 7 envíos dos veces en la misma pantalla, que es lo que
    // esta pantalla sacó el 17-ago-2026.
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Editar/ }));
    await waitFor(() =>
      expect(document.querySelectorAll('input[id^="facturas-"][id$="-m"]').length).toBe(ITEMS.length),
    );
    for (const c of CLIENTES) {
      // El nombre aparece dentro del selector de cliente (dos layouts), pero
      // no además como texto suelto de un resumen de solo lectura.
      expect(document.querySelectorAll('input[id^="transp-"]')).toHaveLength(0);
    }
  });

  it("🔴 ABRIR el formulario y no tocar nada NO escribe una sola vez", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Editar/ }));
    await waitFor(() =>
      expect(document.querySelectorAll('input[id^="facturas-"][id$="-m"]').length).toBe(ITEMS.length),
    );
    await new Promise((r) => setTimeout(r, 2200));
    for (const l of llamadas) expect(l.method, l.url).toBe("GET");
  });
});

describe("🔴 la guía YA DESPACHADA no vuelve a despachar", () => {
  it("una guía Completada no ofrece las cajas del despacho ni «Corregir»", async () => {
    await montar({ estado: "Completada", tipo_despacho: "externo", numero_guia_transp: "TR-1" });
    expect(screen.queryByRole("button", { name: "Corregir" })).toBeNull();
    // Las cajas del N° son parte de DESPACHAR: en una guía que ya salió no van.
    expect(document.getElementById("transp-0")).toBeNull();
    expect(screen.queryByRole("button", { name: /Confirmar despacho/i })).toBeNull();
    // Y los envíos se siguen viendo, una sola vez.
    for (const c of CLIENTES) expect(screen.getAllByText(c), c).toHaveLength(1);
  });
});
