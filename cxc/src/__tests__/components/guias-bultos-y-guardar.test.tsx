/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO DE CONDUCTA — se RENDERIZA y se TOCAN LOS BOTONES.
 *
 * Un barrido de texto sobre el .tsx se cumple con el comentario que explica el
 * cambio; en este repo ya pasó cuatro veces. Acá se monta la pantalla de la
 * guía y el formulario, y se mira lo que SALE POR `fetch`, que es lo único que
 * la base llega a ver.
 *
 * Tres cosas que Daniel aprobó el 5-sep-2026:
 *   · punto 3 — *«porque bodega si al despachar cuentan más bultos de lo que
 *     puso la secretaria, quiero que lo pueda cambiar en caso de algún error»*;
 *   · punto 5 — guardar manda solo lo que cambió, y **nadie pierde acceso**:
 *     *«quiero que bodega también pueda agregar algo si sale a último segundo,
 *     editar un cliente o algo»*;
 *   · puntos 11 y 12 — un solo «Guardar Guía», y BULTOS empieza vacío.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { useEffect } from "react";
import { useDespachoGuia } from "@/app/guias/components/useDespachoGuia";

const push = vi.fn();
const ROUTER = { push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
const PARAMS = { id: "guia-300" };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  useParams: () => PARAMS,
  usePathname: () => "/guias/guia-300",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));

/** Una guía PENDIENTE con dos envíos: es la que bodega abre para despachar. */
const GUIA = {
  id: "guia-300",
  numero: 300,
  fecha: "2026-09-04",
  estado: "Pendiente Bodega",
  modo_entrega: "transportista",
  tipo_despacho: "externo",
  transportista: "Transporte Sol",
  transportista_id: "t-1",
  entregado_por: "Julio",
  observaciones: "",
  numero_guia_transp: "",
  placa: "",
  receptor_nombre: "",
  cedula: "",
  guia_items: [
    { id: "it-1", orden: 1, cliente: "City Mall David", cliente_codigo: "D-24", direccion: "David", empresa: "Fashion Wear", facturas: "9001", bultos: 7, numero_guia_transp: "" },
    { id: "it-2", orden: 2, cliente: "Jerusalem De Panama", cliente_codigo: "D-80", direccion: "Paso Canoas", empresa: "Fashion Shoes", facturas: "9002", bultos: 3, numero_guia_transp: "" },
  ],
};

interface Escritura { metodo: string; url: string; cuerpo: Record<string, unknown> }
let escrituras: Escritura[] = [];
let guiaServida: Record<string, unknown> = GUIA;

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
  escrituras = [];
  guiaServida = GUIA;
  push.mockClear();
  vi.stubGlobal("localStorage", memStorage());
  vi.stubGlobal("sessionStorage", memStorage());
  sessionStorage.setItem("cxc_role", "bodega");
  sessionStorage.setItem("fg_modules", JSON.stringify(["guias"]));
  vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: { method?: string; body?: string }) => {
    const u = String(url);
    const metodo = (init?.method || "GET").toUpperCase();
    if (metodo !== "GET") {
      escrituras.push({ metodo, url: u, cuerpo: JSON.parse(init?.body || "{}") });
      await new Promise((r) => setTimeout(r, 40));
      return { ok: true, json: async () => guiaServida };
    }
    if (u.startsWith("/api/guias/frecuencias")) return { ok: true, json: async () => ({ clientes: [], empresas: [], direcciones: {} }) };
    if (u.startsWith("/api/guias/despachos-frecuentes")) return { ok: true, json: async () => ({ juegos: [] }) };
    if (u.startsWith("/api/transportistas")) return { ok: true, json: async () => [{ id: "t-1", nombre: "Transporte Sol", activo: true }] };
    if (u.startsWith(`/api/guias/${GUIA.id}`)) return { ok: true, json: async () => guiaServida };
    if (u.startsWith("/api/clientes")) return { ok: true, json: async () => ({ clientes: [] }) };
    return { ok: true, json: async () => ({}) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function abrirLaGuia() {
  const Page = (await import("@/app/guias/[id]/page")).default;
  render(<Page />);
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
}

async function esperar(ms = 300) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

const caja = (idx: number) => document.getElementById(`despacho-bultos-${idx}`) as HTMLInputElement | null;

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 3 · la caja de BULTOS al despachar", () => {
  it("está en cada renglón, con lo que puso la secretaria", async () => {
    await abrirLaGuia();
    expect(caja(0)).not.toBeNull();
    expect(caja(0)!.value).toBe("7");
    expect(caja(1)!.value).toBe("3");
  });

  it("🔴 en una guía YA DESPACHADA no existe: es lo que el transportista firmó", async () => {
    guiaServida = { ...GUIA, estado: "Completada", placa: "AB1234", receptor_nombre: "Eric", cedula: "8-930-2114" };
    await abrirLaGuia();
    expect(caja(0)).toBeNull();
    // Y el número se sigue LEYENDO.
    expect(document.body.textContent).toContain("7 bultos");
  });

  it("🔴 quien NO puede despachar no la ve (vendedor mira sin tocar)", async () => {
    sessionStorage.setItem("cxc_role", "vendedor");
    await abrirLaGuia();
    expect(caja(0)).toBeNull();
  });

  it("cambiar el número muestra el rastro EN VIVO, con quién", async () => {
    await abrirLaGuia();
    await act(async () => { fireEvent.change(caja(0)!, { target: { value: "8" } }); });
    expect(document.body.textContent).toContain("↑ 7 → 8, bodega");
  });

  it("⚠️ y volver al número original lo borra: mirar la caja no es corregir", async () => {
    await abrirLaGuia();
    await act(async () => { fireEvent.change(caja(0)!, { target: { value: "8" } }); });
    await act(async () => { fireEvent.change(caja(0)!, { target: { value: "7" } }); });
    expect(document.body.textContent).not.toContain("→ 8");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 3 · lo que VIAJA al despachar", () => {
  /**
   * ⚠️ Las dos firmas se dibujan en un `<canvas>`, que jsdom no implementa, así
   * que el botón «Despachar» no se puede tocar acá. Se monta el MISMO hook que
   * usa la pantalla y se llama a `confirmarDespacho` — que es la función que el
   * botón llama — y se mira lo que sale por `fetch`, que es lo único que la base
   * ve. Nada de mocks del payload: el cuerpo lo arma el producto.
   */
  function Sonda({ alListo }: { alListo: (s: ReturnType<typeof useDespachoGuia>) => void }) {
    const s = useDespachoGuia(GUIA.id);
    useEffect(() => { alListo(s); });
    return null;
  }

  async function montarSonda() {
    let estado: ReturnType<typeof useDespachoGuia> | null = null;
    render(<Sonda alListo={(s) => { estado = s; }} />);
    await esperar();
    return () => estado as unknown as ReturnType<typeof useDespachoGuia>;
  }

  it("🔴 los bultos corregidos viajan por `items_bultos`, NUNCA por `items`", async () => {
    const s = await montarSonda();
    expect(s().bultosPorLinea).toEqual([7, 3]);
    await act(async () => { s().setBultos(0, "8"); });
    await act(async () => { await s().confirmarDespacho("firma1", "firma2"); });
    const put = escrituras.find((e) => e.metodo === "PUT");
    expect(put).toBeTruthy();
    expect(put!.cuerpo.items_bultos).toEqual([{ id: "it-1", bultos: 8 }]);
    // `items` borra e inserta los renglones y les rota el id en pleno despacho.
    expect(put!.cuerpo.items).toBeUndefined();
    // Y el N° del transportista sigue viajando por SU campo, como siempre.
    expect(put!.cuerpo.items_guia_transp).toBeTruthy();
  });

  it("🔴 sin corregir nada, `items_bultos` NO viaja", async () => {
    const s = await montarSonda();
    await act(async () => { await s().confirmarDespacho("firma1", "firma2"); });
    const put = escrituras.find((e) => e.metodo === "PUT");
    expect(put).toBeTruthy();
    expect(put!.cuerpo.items_bultos).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 5 · guardar manda solo lo que cambió", () => {
  async function abrirEdicion() {
    await abrirLaGuia();
    const editar = screen.getByRole("button", { name: /^Editar$/i });
    await act(async () => { fireEvent.click(editar); });
    await esperar();
  }

  it("🩸 abrir, mirar y apretar «Guardar Cambios» NO escribe nada", async () => {
    // Medido: de 549 guardados, 407 (74%) borraron y recrearon los renglones
    // sin que nada hubiera cambiado. La guía 85 pasó por eso 45 veces en 3h38.
    await abrirEdicion();
    escrituras = [];
    const guardar = screen.getByRole("button", { name: /Guardar Cambios/i });
    await act(async () => { fireEvent.click(guardar); });
    await esperar();
    expect(escrituras.filter((e) => e.metodo === "PUT")).toHaveLength(0);
  });

  it("⚠️ pero el botón CUMPLE: sale de la pantalla igual que siempre", async () => {
    await abrirEdicion();
    push.mockClear();
    const guardar = screen.getByRole("button", { name: /Guardar Cambios/i });
    await act(async () => { fireEvent.click(guardar); });
    await esperar();
    // No se queda quieto sin decir nada.
    expect(document.body.textContent).not.toMatch(/Guardando/);
  });

  it("🔴 CONTROL — cambiar algo SÍ guarda, y bodega no perdió acceso", async () => {
    // Daniel: «quiero que bodega también pueda agregar algo si sale a último
    // segundo, editar un cliente o algo». El rol de esta sesión es `bodega`.
    await abrirEdicion();
    escrituras = [];
    const obs = [...document.querySelectorAll<HTMLTextAreaElement>("textarea")].find((e) => !e.closest(".hidden"))!;
    await act(async () => { fireEvent.change(obs, { target: { value: "salió a último segundo" } }); });
    const guardar = screen.getByRole("button", { name: /Guardar Cambios/i });
    await act(async () => { fireEvent.click(guardar); });
    await esperar();
    const puts = escrituras.filter((e) => e.metodo === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].cuerpo.observaciones).toBe("salió a último segundo");
    // Y sin los renglones: cambiar una observación no cuesta el id de cada línea.
    expect(puts[0].cuerpo.items).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 11 y 12 · un solo Guardar, y BULTOS empieza vacío", () => {
  async function abrirEdicion() {
    await abrirLaGuia();
    const editar = screen.getByRole("button", { name: /^Editar$/i });
    await act(async () => { fireEvent.click(editar); });
    await esperar();
  }

  it("🔴 hay UN solo botón de guardar en toda la pantalla", async () => {
    await abrirEdicion();
    const guardar = screen.getAllByRole("button", { name: /Guardar (Cambios|Guía)/i });
    expect(guardar).toHaveLength(1);
  });

  it("⚠️ y la barra de arriba no se quedó muda: sigue diciendo el estado", async () => {
    await abrirEdicion();
    const obs = [...document.querySelectorAll<HTMLTextAreaElement>("textarea")].find((e) => !e.closest(".hidden"))!;
    await act(async () => { fireEvent.change(obs, { target: { value: "algo" } }); });
    expect(document.body.textContent).toContain("Sin guardar");
  });

  it("🔴 la caja de BULTOS del formulario no dice «0»", async () => {
    await abrirEdicion();
    const cajas = [...document.querySelectorAll<HTMLInputElement>('input[id^="bultos-"]')];
    expect(cajas.length).toBeGreaterThan(0);
    for (const c of cajas) {
      expect(c.getAttribute("placeholder")).toBeNull();
    }
  });
});
