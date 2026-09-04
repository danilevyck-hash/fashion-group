/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 GUÍAS › CONFIGURACIÓN — la pantalla, MONTADA de verdad (4-sep-2026)
 *
 * Daniel, textual: *«city shoes → Calle 19 Central, al lado de la joyería
 * Super Oro. Y Nine Sport en Calle 19 Central.»* — cada corrección así
 * necesitaba un despliegue; ahora se hace desde esta pestaña. Y sobre quién
 * la usa: *«configuraciones también deja a secretaria»*.
 *
 * El candado es de CONDUCTA: se monta la página REAL de `/guias`, se toca la
 * pestaña y se cuenta lo que sale por `fetch` — un barrido de texto se cumple
 * con su propio comentario (ya pasó cuatro veces en este repo) y no puede ver
 * lo único que importa acá: que promover un histórico NECESITE un toque, y
 * que quitar pida confirmación antes de escribir.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, act, fireEvent } from "@testing-library/react";

const ROUTER = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  useParams: () => ({}),
  usePathname: () => "/guias",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));

// El interruptor, controlable: el CONTROL de abajo prueba que apagado no hay
// pestaña. El resto del módulo es el REAL.
let atajosEncendidos = true;
vi.mock("@/lib/guias/atajos-facturas", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/guias/atajos-facturas")>();
  return {
    ...real,
    get GUIAS_ATAJOS_NUEVOS() {
      return atajosEncendidos;
    },
  };
});

import GuiasPage from "@/app/guias/page";

/** Las filas definidas que sirve /api/guias/destinos-config. */
const FILAS = [
  { id: 1, cliente_codigo: "D-35", cliente_nombre: "City Shoes", destino: "Calle 19 Central, al lado de la joyería Super Oro", tiendas: [], orden: 1, creado_por: "daniel", creado_en: "2026-09-04" },
  { id: 2, cliente_codigo: "D-87", cliente_nombre: "La Frontera Duty Free", destino: "Guabito", tiendas: [], orden: 1, creado_por: "daniel", creado_en: "2026-09-04" },
  { id: 3, cliente_codigo: "D-142", cliente_nombre: "Sporting Shoes N 4", destino: "Westland", tiendas: ["5", "6", "14", "Mas Flow"], orden: 1, creado_por: "daniel", creado_en: "2026-09-04" },
  { id: 4, cliente_codigo: "D-142", cliente_nombre: "Sporting Shoes N 4", destino: "Albrook", tiendas: ["7", "8", "9"], orden: 2, creado_por: "daniel", creado_en: "2026-09-04" },
];

/** El histórico (frecuencias): D-87 usó «Changinola» y no está definido. */
const FRECUENCIAS = {
  clientes: [],
  empresas: [],
  direcciones: {},
  destinos: { "D-87": ["Changinola", "Guabito"] },
  definidos: {},
};

interface Pedido { metodo: string; url: string; body: unknown }
let pedidos: Pedido[] = [];

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

function sembrarRol(rol: string) {
  sessionStorage.setItem("cxc_role", rol);
  sessionStorage.setItem("fg_modules", JSON.stringify(["guias"]));
}

beforeEach(() => {
  pedidos = [];
  atajosEncendidos = true;
  ROUTER.push.mockClear();
  vi.stubGlobal("localStorage", memStorage());
  vi.stubGlobal("sessionStorage", memStorage());
  vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: { method?: string; body?: string }) => {
    const u = String(url);
    const metodo = (init?.method || "GET").toUpperCase();
    let body: unknown = null;
    try { body = init?.body ? JSON.parse(init.body) : null; } catch { body = init?.body ?? null; }
    pedidos.push({ metodo, url: u, body });
    if (u.startsWith("/api/guias/destinos-config")) {
      if (metodo === "GET") return { ok: true, json: async () => ({ destinos: FILAS }) };
      if (metodo === "POST") return { ok: true, status: 201, json: async () => ({ ok: true, id: 50 }) };
      return { ok: true, json: async () => ({ ok: true }) };
    }
    if (u.startsWith("/api/guias/frecuencias")) return { ok: true, json: async () => FRECUENCIAS };
    if (u === "/api/guias") return { ok: true, json: async () => [] };
    if (u.startsWith("/api/clientes")) return { ok: true, json: async () => ({ clientes: [], total: 0 }) };
    return { ok: true, json: async () => ({}) };
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function abrir(rol: string) {
  sembrarRol(rol);
  const vista = render(<GuiasPage />);
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
  return vista;
}

const botonPestania = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("button")).find((b) => (b.textContent || "").trim() === "Configuración");

async function abrirConfiguracion(rol: string) {
  const vista = await abrir(rol);
  const tab = botonPestania(vista.container);
  expect(tab, "no está la pestaña «Configuración»").toBeTruthy();
  fireEvent.click(tab!);
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
  return vista;
}

// ─── 1 · quién ve la pestaña ─────────────────────────────────────────────────

describe("🔴 la pestaña la ven admin Y secretaria; bodega y vendedor no", () => {
  it("admin la ve", async () => {
    const { container } = await abrir("admin");
    expect(botonPestania(container)).toBeTruthy();
  });

  it("🔴 secretaria la ve — Daniel: «configuraciones también deja a secretaria»", async () => {
    const { container } = await abrir("secretaria");
    expect(botonPestania(container)).toBeTruthy();
  });

  it.each(["bodega", "vendedor"])("%s NO la ve — su pantalla es la de siempre, sin fila de pestañas", async (rol) => {
    const { container } = await abrir(rol);
    expect(botonPestania(container)).toBeUndefined();
  });

  it("CONTROL: con GUIAS_ATAJOS_NUEVOS apagado no hay pestaña ni para admin", async () => {
    atajosEncendidos = false;
    const { container } = await abrir("admin");
    expect(botonPestania(container)).toBeUndefined();
  });
});

// ─── 2 · la lista, agrupada y hablando claro ─────────────────────────────────

describe("la lista va agrupada por cliente y DICE si autollena", () => {
  it("cada grupo lleva nombre + código + contador, y sus destinos", async () => {
    const { container } = await abrirConfiguracion("secretaria");
    const texto = container.textContent || "";
    expect(texto).toContain("City Shoes");
    expect(texto).toContain("D-35");
    expect(texto).toContain("Calle 19 Central, al lado de la joyería Super Oro");
    expect(texto).toContain("Sporting Shoes N 4");
    expect(texto).toContain("2 destinos");
    expect(texto).toContain("Tiendas: 5 · 6 · 14 · Mas Flow");
  });

  it("con UN destino dice que se llena solo; con varios, que salen botones", async () => {
    const { container } = await abrirConfiguracion("admin");
    const grupoUno = container.querySelector('[data-testid="grupo-D-35"]');
    const grupoVarios = container.querySelector('[data-testid="grupo-D-142"]');
    expect(grupoUno?.textContent).toContain("Se llena solo al elegir el cliente.");
    expect(grupoVarios?.textContent).toContain("Se ofrecen como botones y la persona elige.");
  });

  it("el buscador filtra por nombre o código", async () => {
    const { container } = await abrirConfiguracion("admin");
    const buscador = container.querySelector<HTMLInputElement>('input[type="search"]');
    expect(buscador).toBeTruthy();
    fireEvent.change(buscador!, { target: { value: "sporting" } });
    expect(container.querySelector('[data-testid="grupo-D-142"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="grupo-D-35"]')).toBeNull();
    fireEvent.change(buscador!, { target: { value: "D-35" } });
    expect(container.querySelector('[data-testid="grupo-D-35"]')).toBeTruthy();
  });

  it("agregar abre el formulario con el ÚNICO selector de cliente del sistema (ClientePicker)", async () => {
    const { container } = await abrirConfiguracion("admin");
    const agregar = Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent || "").includes("Agregar destino"),
    );
    fireEvent.click(agregar!);
    const alta = container.querySelector('[data-testid="alta-destino"]');
    expect(alta).toBeTruthy();
    // El campo del selector compartido: el placeholder de la casa.
    expect(alta!.querySelector('input[placeholder="Buscar cliente…"]')).toBeTruthy();
    // Y el campo del destino, texto libre.
    expect(alta!.querySelector('input[placeholder="Tal como debe salir en la guía"]')).toBeTruthy();
  });
});

// ─── 3 · promover NECESITA un toque; quitar pide confirmación ────────────────

describe("🔴 nada se escribe solo", () => {
  it("los históricos sin definir se MUESTRAN sin disparar ningún POST", async () => {
    const { container } = await abrirConfiguracion("admin");
    const historicos = container.querySelector('[data-testid="historicos-D-87"]');
    expect(historicos).toBeTruthy();
    expect(historicos!.textContent).toContain("Changinola");
    // «Guabito» ya está definido: no se ofrece de nuevo (pareo por clave exacta).
    expect(historicos!.textContent).not.toContain("Guabito");
    // 🔴 Renderizar NO promovió nada: cero escrituras a la configuración.
    // (El único no-GET tolerado en /guias es el refresco de facturas de hoy,
    // que no toca una sola guía — candado en guias-eliminar-en-la-fila.)
    expect(
      pedidos.filter((p) => p.metodo !== "GET" && p.url.startsWith("/api/guias/destinos-config")),
    ).toHaveLength(0);
  });

  it("tocar «Definir» promueve ESE histórico — un POST, con el cliente y el destino", async () => {
    const { container } = await abrirConfiguracion("secretaria");
    const definir = Array.from(container.querySelectorAll("button")).find((b) =>
      (b.getAttribute("aria-label") || "").includes("Definir «Changinola»"),
    );
    expect(definir).toBeTruthy();
    fireEvent.click(definir!);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    const posts = pedidos.filter((p) => p.metodo === "POST" && p.url.startsWith("/api/guias/destinos-config"));
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({ cliente_codigo: "D-87", destino: "Changinola" });
  });

  it("quitar pide confirmación EN PALABRAS y no manda nada hasta confirmar", async () => {
    const { container } = await abrirConfiguracion("admin");
    const quitar = Array.from(container.querySelectorAll("button")).find((b) =>
      (b.getAttribute("aria-label") || "") === "Quitar «Guabito» de La Frontera Duty Free",
    );
    fireEvent.click(quitar!);
    // La ventana dice qué cambia, con el nombre del cliente y el destino.
    expect(document.body.textContent).toContain("La Frontera Duty Free dejará de ofrecer «Guabito» en las guías.");
    expect(document.body.textContent).toContain("nada se borra");
    expect(pedidos.filter((p) => p.metodo === "DELETE")).toHaveLength(0);

    const confirmar = document.querySelector<HTMLButtonElement>('[data-testid="confirmar-quitar"]');
    fireEvent.click(confirmar!);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    const bajas = pedidos.filter((p) => p.metodo === "DELETE");
    expect(bajas).toHaveLength(1);
    expect(bajas[0].url).toContain("id=2");
  });

  it("editar abre los campos en la fila y guarda por PATCH con el id", async () => {
    const { container } = await abrirConfiguracion("admin");
    const editar = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.getAttribute("aria-label") || "").startsWith("Editar «Calle 19 Central"),
    );
    fireEvent.click(editar!);
    const edicion = container.querySelector('[data-testid="edicion-1"]');
    expect(edicion).toBeTruthy();
    const campo = edicion!.querySelector<HTMLInputElement>('input[aria-label="Destino"]');
    fireEvent.change(campo!, { target: { value: "Calle 19 Central" } });
    const guardar = Array.from(edicion!.querySelectorAll("button")).find(
      (b) => (b.textContent || "").trim() === "Guardar",
    );
    fireEvent.click(guardar!);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    const patches = pedidos.filter((p) => p.metodo === "PATCH" && p.url.includes("destinos-config"));
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toContain("id=1");
    expect(patches[0].body).toMatchObject({ destino: "Calle 19 Central" });
  });
});
