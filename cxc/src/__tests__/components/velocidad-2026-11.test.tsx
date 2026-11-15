// ─────────────────────────────────────────────────────────────────────────────
// velocidad-2026-11 — lo que se aceleró, y la prueba de que NINGÚN NÚMERO
// cambió. Cada bloque es un interruptor de `lib/ui/velocidad-2026-11.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react";
import { NextRequest } from "next/server";

// ── dobles ───────────────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  sync: vi.fn(),
  logoutAll: vi.fn(async () => {}),
  logoutUnas: vi.fn(async (_e: readonly string[]) => {}),
  motor: vi.fn(),
  aviso: vi.fn(async () => true),
  filaViva: null as null | { id: string },
  inserts: [] as unknown[],
  rpc: vi.fn(),
  ultimaCarga: "2026-11-15T15:00:00Z" as string | null,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/catalogo-publico/tommy",
}));
vi.mock("@/lib/require-auth", () => ({ requireAuth: () => null }));
vi.mock("@/lib/switch-api/sync-empresa", () => ({ syncEmpresaFacturas: h.sync }));
vi.mock("@/lib/switch-api/client", () => ({ logoutAllSwitchSessions: h.logoutAll, logoutSwitchSessions: h.logoutUnas }));
vi.mock("@/lib/catalogo/switch-envio", () => ({ enviarPedidoSwitch: h.motor }));
vi.mock("@/lib/alertas/canal", () => ({ enviarSistema: h.aviso }));
vi.mock("@/lib/supabase-server", () => {
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q, eq: () => q, gte: () => q, order: () => q,
    limit: async () => ({ data: h.ultimaCarga ? [{ finished_at: h.ultimaCarga }] : [], error: null }),
  });
  return { supabaseServer: { from: () => q, rpc: h.rpc } };
});
// La caché de Next fuera de Next: un mapa por llave, como `unstable_cache`.
vi.mock("next/cache", () => {
  const guardado = new Map<string, unknown>();
  return {
    unstable_cache: (fn: (...a: unknown[]) => Promise<unknown>, partes: string[]) =>
      async (...args: unknown[]) => {
        const k = JSON.stringify([partes, args]);
        if (guardado.has(k)) return guardado.get(k);
        const v = await fn(...args);
        guardado.set(k, v);
        return v;
      },
    revalidateTag: () => {},
  };
});

import { variantesDeContrasena } from "@/lib/login-variantes";
import { enviarEnSegundoPlano, entregarAWaitUntil, motivoSinEnvio } from "@/lib/catalogo/envio-en-segundo-plano";
import { leerProyeccionCierre, leerProyeccionCierreCacheada, llaveProyeccion } from "@/lib/ventas/proyeccion-cache";
import { POST as facturasHoy } from "@/app/api/guias/facturas-hoy/route";
import SyncNowButton from "@/components/shared/SyncNowButton";
import CatalogoPublicoPage, { productosDelPaquete } from "@/components/catalogo/CatalogoPublicoPage";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import * as V from "@/lib/ui/velocidad-2026-11";

function makeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: makeStorage(), configurable: true, writable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: makeStorage(), configurable: true, writable: true });
  h.sync.mockReset(); h.logoutAll.mockClear(); h.logoutUnas.mockClear();
  h.motor.mockReset(); h.aviso.mockClear(); h.rpc.mockReset();
  h.filaViva = null; h.inserts = []; h.ultimaCarga = "2026-11-15T15:00:00Z";
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("los interruptores existen y están prendidos", () => {
  it("cada punto se puede apagar por separado", () => {
    expect(V.PEDIDOS_ACTUALIZAR_EN_PARALELO).toBe(true);
    expect(V.FACTURAS_HOY_EN_PARALELO).toBe(true);
    expect(V.PEDIDO_A_SWITCH_EN_SEGUNDO_PLANO).toBe(true);
    expect(V.CATALOGO_PUBLICO_DESDE_EL_SERVIDOR).toBe(true);
    expect(V.LOGIN_UNA_PASADA).toBe(true);
    expect(V.PROYECCION_EN_CACHE).toBe(true);
  });
});

// ── 1 · Pedidos › «Actualizar»: las 6 a la vez ───────────────────────────────
describe("«Actualizar» en paralelo pide las 6 empresas A LA VEZ y cuenta igual", () => {
  function red() {
    const pendientes: Array<() => void> = [];
    const pedidas: string[] = [];
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
      const empresa = JSON.parse(String(init?.body ?? "{}")).empresa as string;
      pedidas.push(empresa);
      return new Promise((resolve) => {
        pendientes.push(() => resolve({ ok: true, status: 200, json: async () => ({ ok: true }) }));
      });
    }));
    return { pendientes, pedidas };
  }
  const opciones = B2B_EMPRESA_KEYS.map((empresa) => ({ modulo: "pedidos" as const, empresa, label: empresa }));

  it("con `paralelo`, las 6 salen antes de que conteste la primera", async () => {
    sessionStorage.setItem("cxc_role", "admin");
    const { pendientes, pedidas } = red();
    render(<SyncNowButton opciones={opciones} secuencial paralelo onSuccess={() => {}} />);
    fireEvent.click(await screen.findByRole("button"));
    await waitFor(() => expect(pedidas).toHaveLength(6));
    expect(new Set(pedidas)).toEqual(new Set(B2B_EMPRESA_KEYS));
    await act(async () => { pendientes.forEach((r) => r()); });
    await waitFor(() => expect(screen.getByText("6 empresas actualizadas")).toBeTruthy());
  });

  it("sin `paralelo`, una por una (lo de antes)", async () => {
    sessionStorage.setItem("cxc_role", "admin");
    const { pendientes, pedidas } = red();
    render(<SyncNowButton opciones={opciones} secuencial onSuccess={() => {}} />);
    fireEvent.click(await screen.findByRole("button"));
    await waitFor(() => expect(pedidas).toHaveLength(1));
    for (let i = 0; i < 6; i++) {
      await act(async () => { pendientes[i](); });
      await waitFor(() => expect(pedidas.length).toBe(Math.min(i + 2, 6)));
    }
    await waitFor(() => expect(screen.getByText("6 empresas actualizadas")).toBeTruthy());
  });
});

// ── 2 · facturas de hoy: las 6 a la vez, y cierra solo SUS sesiones ─────────
describe("facturas de hoy en el servidor", () => {
  // Sin corrida reciente en la bitácora: ninguna está «fresca».
  beforeEach(() => { h.ultimaCarga = null; });

  it("las 6 entran a Switch a la vez y el resultado es el mismo", async () => {
    const sueltas: Array<() => void> = [];
    h.sync.mockImplementation(() => new Promise((r) => sueltas.push(() => r({ inserted: 2, updated: 1 }))));
    const respuesta = facturasHoy(new NextRequest("http://x/api/guias/facturas-hoy", { method: "POST" }));
    await waitFor(() => expect(h.sync).toHaveBeenCalledTimes(6));
    sueltas.forEach((r) => r());
    const r = await (await respuesta).json();
    expect(r.resultados.map((x: { empresa: string }) => x.empresa)).toEqual([...B2B_EMPRESA_KEYS]);
    expect(r.resultados.every((x: { escritas: number }) => x.escritas === 3)).toBe(true);
    expect(h.logoutUnas).toHaveBeenCalledWith(B2B_EMPRESA_KEYS);
    expect(h.logoutAll).not.toHaveBeenCalled();
  });

  it("una empresa caída no frena a las demás", async () => {
    h.sync.mockImplementation(async (e: string) => {
      if (e === B2B_EMPRESA_KEYS[0]) throw new Error("Switch no contesta");
      return { inserted: 0, updated: 0 };
    });
    const r = await (await facturasHoy(new NextRequest("http://x", { method: "POST" }))).json();
    expect(r.resultados[0].resultado).toBe("error");
    expect(r.resultados.slice(1).every((x: { resultado: string }) => x.resultado === "ok")).toBe(true);
  });
});

// ── 3 · Confirmar pedido: en segundo plano, at-most-once intacto ─────────────
describe("el envío a Switch en segundo plano", () => {
  function db() {
    const q: Record<string, unknown> = {};
    Object.assign(q, {
      select: () => q, eq: () => q, neq: () => q, limit: () => q,
      maybeSingle: async () => ({ data: h.filaViva, error: null }),
      insert: async (fila: unknown) => { h.inserts.push(fila); return { error: null }; },
    });
    return { from: () => q } as never;
  }
  const params = () => ({
    empresaKey: "fashion_shoes", enviosTable: "tommy_switch_envios", db: db(), orderId: "o-1",
    orderNumber: "TOM-100", marcaLabel: "Tommy", items: [], bultoSize: () => 1,
    categoryByProduct: new Map(), bultoPzasByProduct: new Map(), clienteId: 5, vendedorId: 2,
  });

  it("usa el MISMO motor, una vez, con los mismos datos", async () => {
    h.motor.mockResolvedValue({ kind: "ok", numeroInterno: "9", pedidoSwitchId: 9, verificado: true, warnings: [], documento: "pedido" });
    const p = params();
    await enviarEnSegundoPlano(p);
    expect(h.motor).toHaveBeenCalledTimes(1);
    expect(h.motor).toHaveBeenCalledWith(p);
    expect(h.inserts).toHaveLength(0);
    expect(h.aviso).not.toHaveBeenCalled();
    expect(h.logoutUnas).toHaveBeenCalledWith(["fashion_shoes"]);
  });

  it("si no pasa la pre-validación queda anotado como 'error' (Reintentar) y avisa", async () => {
    h.motor.mockResolvedValue({ kind: "prevalidacion", errores: ["SKU X no existe"], warnings: [], avisos: [], lineas: [] });
    await enviarEnSegundoPlano(params());
    expect(h.inserts).toEqual([expect.objectContaining({ order_id: "o-1", estado: "error", error_detalle: expect.stringContaining("SKU X no existe") })]);
    expect(h.aviso).toHaveBeenCalledTimes(1);
  });

  it("si el motor revienta también queda 'error' y avisa", async () => {
    h.motor.mockRejectedValue(new Error("boom"));
    await enviarEnSegundoPlano(params());
    expect(h.inserts).toHaveLength(1);
    expect(h.aviso).toHaveBeenCalledTimes(1);
  });

  it("🔴 con una fila viva (pudo salir) NO se anota un error que invite a reintentar", async () => {
    h.motor.mockRejectedValue(new Error("se cayó después del POST"));
    h.filaViva = { id: "viva" };
    await enviarEnSegundoPlano(params());
    expect(h.inserts).toHaveLength(0);
  });

  it("rechazo y ambiguo no se anotan dos veces (el motor ya lo hizo)", () => {
    expect(motivoSinEnvio({ kind: "rechazado", error: "x", warnings: [] })).toBeNull();
    expect(motivoSinEnvio({ kind: "ambiguo", error: "x" })).toBeNull();
    expect(motivoSinEnvio({ kind: "carrera" })).toBeNull();
    expect(motivoSinEnvio({ kind: "ya_enviado", detalle: "1" })).toBeNull();
    expect(motivoSinEnvio({ kind: "switch_caido", error: "caído" })).toBe("caído");
  });

  it("waitUntil de Vercel: se entrega si existe; si no, el llamador espera", () => {
    const g = globalThis as unknown as Record<symbol, unknown>;
    const k = Symbol.for("@vercel/request-context");
    expect(entregarAWaitUntil(Promise.resolve())).toBe(false);
    const entregadas: unknown[] = [];
    g[k] = { get: () => ({ waitUntil: (p: unknown) => entregadas.push(p) }) };
    try {
      expect(entregarAWaitUntil(Promise.resolve())).toBe(true);
      expect(entregadas).toHaveLength(1);
    } finally {
      delete g[k];
    }
  });
});

// ── 6 · Login: mismo veredicto con la mitad de pruebas ───────────────────────
describe("inicio de sesión: las variantes que se prueban", () => {
  it("prueba EXACTAMENTE el mismo conjunto que antes, sin repetir", () => {
    for (const pw of ["hola123", "Hola123", "HOLA", "ñandú", "Ñandú", "", "12345", "aBc"]) {
      expect(new Set(variantesDeContrasena(pw))).toEqual(new Set([pw, pw.toLowerCase()]));
      expect(variantesDeContrasena(pw).length).toBe(pw === pw.toLowerCase() ? 1 : 2);
    }
  });
});

// ── 7 · Proyección: guardada, mismo número ───────────────────────────────────
describe("la proyección guardada da el MISMO número", () => {
  const PROY = { totales_grupo: { proyeccion_cierre: 12345678.9, delta_vs_anio_anterior_total: 0.031 }, empresas: [{ empresa_key: "vistana", proyeccion_cierre: 4567890.12 }] };

  it("la cacheada devuelve exactamente lo de la directa, y la 2.ª vez no va a la base", async () => {
    h.rpc.mockResolvedValue({ data: PROY, error: null });
    const directa = await leerProyeccionCierre(2026);
    const llamadasDirecta = h.rpc.mock.calls.length;
    const a = await leerProyeccionCierreCacheada(2026);
    const b = await leerProyeccionCierreCacheada(2026);
    expect(a.data).toEqual(directa.data);
    expect(b.data).toEqual(directa.data);
    expect(h.rpc.mock.calls.length).toBe(llamadasDirecta * 2); // directa + 1 sola cacheada
  });

  it("una carga nueva de facturas o un día nuevo cambian la llave", () => {
    expect(llaveProyeccion(2026, "2026-11-15", "a")).not.toBe(llaveProyeccion(2026, "2026-11-15", "b"));
    expect(llaveProyeccion(2026, "2026-11-15", "a")).not.toBe(llaveProyeccion(2026, "2026-11-16", "a"));
  });

  it("un error nunca se guarda", async () => {
    h.ultimaCarga = "2026-11-15T16:00:00Z";
    h.rpc.mockResolvedValue({ data: null, error: { message: "timeout", code: "57014" } });
    const r = await leerProyeccionCierreCacheada(2026);
    expect(r.data).toBeNull();
    h.rpc.mockResolvedValue({ data: PROY, error: null });
    const r2 = await leerProyeccionCierreCacheada(2026);
    expect(r2.data).toEqual(PROY);
  });

  it("sin saber la última carga, lee directo", async () => {
    h.ultimaCarga = null;
    h.rpc.mockResolvedValue({ data: PROY, error: null });
    const antes = h.rpc.mock.calls.length;
    await leerProyeccionCierreCacheada(2026);
    await leerProyeccionCierreCacheada(2026);
    expect(h.rpc.mock.calls.length - antes).toBe(2);
  });
});

// ── 4 · Catálogo público: llega puesto, y es el MISMO catálogo ───────────────
describe("catálogo público con los productos desde el servidor", () => {
  const prod = (sku: string, disponibilidad: number, price: number) => ({
    id: sku, sku, name: "Women-Sneakers", price, image_url: null, category: "sneakers", gender: "women",
    bulto_pzas: 12, disponibilidad, active: true,
  });
  const PAQUETE = { products: [prod("FW0FW01", 24, 38), prod("FW0FW02", 0, 40), prod("FW0FW03", 12, 55.5)] };

  function precios(): string[] {
    return Array.from(document.querySelectorAll("p, span"))
      .map((n) => (n.textContent || "").trim())
      .filter((t) => /^\$\d/.test(t));
  }

  it("con el paquete del servidor NO se pide nada y se ve lo mismo que pidiéndolo", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => PAQUETE }));
    vi.stubGlobal("fetch", fetchSpy);
    render(<CatalogoPublicoPage marca="tommy" />);
    await waitFor(() => expect(screen.getByText("FW0FW03")).toBeTruthy());
    const pedido = { codigos: ["FW0FW01", "FW0FW03"].map((c) => !!screen.queryByText(c)), precios: precios() };
    expect(fetchSpy.mock.calls.some((c) => String((c as unknown[])[0]).includes("/public"))).toBe(true);
    cleanup();

    const fetchSpy2 = vi.fn(async () => ({ ok: true, status: 200, json: async () => PAQUETE }));
    vi.stubGlobal("fetch", fetchSpy2);
    render(<CatalogoPublicoPage marca="tommy" inicial={PAQUETE} />);
    expect(screen.getByText("FW0FW03")).toBeTruthy(); // ya en el primer pintado
    expect(screen.queryByText("FW0FW02")).toBeNull(); // sin disponibilidad, igual que antes
    const servidor = { codigos: ["FW0FW01", "FW0FW03"].map((c) => !!screen.queryByText(c)), precios: precios() };
    expect(servidor).toEqual(pedido);
    expect(fetchSpy2.mock.calls.some((c) => String((c as unknown[])[0]).includes("/public"))).toBe(false);
  });

  it("la regla del paquete es una sola", () => {
    const r = productosDelPaquete("tommy", PAQUETE);
    expect(r.map((p) => p.sku)).toEqual(["FW0FW01", "FW0FW03"]);
    expect(r.map((p) => p._stock)).toEqual([24, 12]);
  });
});
