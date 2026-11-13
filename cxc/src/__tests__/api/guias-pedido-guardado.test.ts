// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL N.° DE PEDIDO SE GUARDA CON LA FACTURA (12-nov-2026).
//   1. facturas-cliente lo devuelve con cada factura, en la MISMA llamada.
//   2. El paso del sync (`llenarPedidosGuardados`) está ACOTADO (7 días, 20,
//      solo lo no leído), no abre sesión sin pendientes, guarda solo una vista
//      que es factura y NUNCA lanza.
//   3. El respaldo de la pantalla pide solo lo no leído y reciente, por empresa.
//   4. El sync de facturas llama al paso por las empresas del grupo, sin tocar
//      sus errores ni su heartbeat.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import { idsSinPedidoLeido, MAX_FACTURAS_PEDIDO } from "@/lib/guias/etiquetas-por-envio";

type Llamada = { tabla: string; metodo: string; args: unknown[] };
const llamadas: Llamada[] = [];
let respuestas: Record<string, { data: unknown; error: unknown }> = {};
let lanzaEn: string | null = null;

function cadena(tabla: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "gte", "or", "order", "limit", "like", "update"]) {
    q[m] = (...args: unknown[]) => {
      llamadas.push({ tabla, metodo: m, args });
      if (lanzaEn === tabla) throw new Error("base caída");
      return q;
    };
  }
  q.then = (ok: (v: unknown) => unknown) => ok(respuestas[tabla] ?? { data: [], error: null });
  return q;
}

vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: { from: (t: string) => cadena(t) },
}));
vi.mock("@/lib/guias/ya-salio-server", () => ({ leerIndiceYaSalio: async () => new Map(), leerYaSalio: async () => ({ indice: new Map(), despachadas: new Map() }) }));
const login = vi.fn();
const leer = vi.fn();
vi.mock("@/lib/switch-api/web-client", () => ({
  loginSwitchWeb: (...a: unknown[]) => login(...a),
  leerFacturaMostrar: (...a: unknown[]) => leer(...a),
  cerrarSesionWeb: vi.fn(async () => {}),
}));

const { llenarPedidosGuardados, leerVistaFactura, DIAS_LLENAR_PEDIDO, MAX_LLENAR_PEDIDO } = await import("@/lib/guias/pedido-de-factura");
const { GET: facturasCliente } = await import("@/app/api/guias/facturas-cliente/route");

const VISTA = (pedido: string) => `<p>CUFE: FE01</p><label>Referencia Pedido:</label><label>${pedido}</label>`;

beforeEach(() => {
  llamadas.length = 0;
  respuestas = {};
  lanzaEn = null;
  login.mockReset();
  leer.mockReset();
});

describe("1. facturas-cliente trae el pedido con cada factura", () => {
  const PREV = process.env.SESSION_SECRET;
  beforeAll(() => { process.env.SESSION_SECRET = "test-secret-pedido-guardado"; });
  afterAll(() => { process.env.SESSION_SECRET = PREV; });

  it("pedido guardado, sin pedido y todavía sin leer", async () => {
    respuestas = {
      switch_clientes: { data: [{ empresa_key: "fashion_wear", cliente_switch_id: 7 }], error: null },
      switch_facturas: {
        data: [
          { empresa_key: "fashion_wear", switch_factura_id: 3, secuencial: "11-3", fecha: "2026-11-12", total: 10, pedido_referencia: "16-000002894", pedido_leido_en: "2026-11-12T15:00:00Z" },
          { empresa_key: "fashion_wear", switch_factura_id: 2, secuencial: "11-2", fecha: "2026-11-11", total: 10, pedido_referencia: null, pedido_leido_en: "2026-11-12T15:00:00Z" },
          { empresa_key: "fashion_wear", switch_factura_id: 1, secuencial: "11-1", fecha: "2026-11-10", total: 10, pedido_referencia: null, pedido_leido_en: null },
        ],
        error: null,
      },
    };
    const cookie = `cxc_session=${signSession({ role: "bodega", userId: "u", userName: "b", sessionToken: "t", modules: ["guias"] })}`;
    const r = await facturasCliente(new NextRequest("http://x/api/guias/facturas-cliente?codigo=D-25", { headers: { cookie } }));
    expect(r.status).toBe(200);
    const { facturas } = await r.json();
    expect(facturas.map((f: { pedido: string | null; pedidoLeido: boolean }) => [f.pedido, f.pedidoLeido])).toEqual([
      ["16-000002894", true],
      [null, true],
      [null, false],
    ]);
    const sel = llamadas.find((l) => l.tabla === "switch_facturas" && l.metodo === "select");
    expect(String(sel?.args[0])).toMatch(/pedido_referencia, pedido_leido_en/);
    // Nadie entra al panel para armar la lista.
    expect(login).not.toHaveBeenCalled();
  });
});

describe("2. llenarPedidosGuardados (el paso del sync)", () => {
  it("acotado: solo lo no leído, de los últimos 7 días, como mucho 20", async () => {
    await llenarPedidosGuardados("vistana");
    const de = (m: string) => llamadas.filter((l) => l.tabla === "switch_facturas" && l.metodo === m).map((l) => l.args);
    expect(de("is")).toEqual([["pedido_leido_en", null]]);
    expect(de("limit")).toEqual([[MAX_LLENAR_PEDIDO]]);
    const desde = new Date(Date.now() - DIAS_LLENAR_PEDIDO * 86_400_000).toISOString().slice(0, 10);
    expect(de("gte")).toEqual([["fecha", desde]]);
    expect(de("eq")).toContainEqual(["empresa_key", "vistana"]);
    expect(MAX_LLENAR_PEDIDO).toBeLessThanOrEqual(20);
  });

  it("sin pendientes NO abre sesión en el panel", async () => {
    const r = await llenarPedidosGuardados("vistana");
    expect(r).toEqual({ empresaKey: "vistana", pendientes: 0, leidas: 0 });
    expect(login).not.toHaveBeenCalled();
  });

  it("guarda el pedido (y el «sin pedido») con UN login; una página que no es factura no se guarda", async () => {
    respuestas.switch_facturas = { data: [{ switch_factura_id: 9 }, { switch_factura_id: 8 }, { switch_factura_id: 7 }], error: null };
    login.mockResolvedValue({ empresaKey: "vistana" });
    leer
      .mockResolvedValueOnce(VISTA("16-000002388"))
      .mockResolvedValueOnce("<p>CUFE: FE01</p> sin la línea")
      .mockResolvedValueOnce('<form action="/users/login"><input name="_token"></form>');
    const r = await llenarPedidosGuardados("vistana");
    expect(login).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ pendientes: 3, leidas: 2, motivo: "error" });
    const updates = llamadas.filter((l) => l.metodo === "update").map((l) => (l.args[0] as { pedido_referencia: string | null }).pedido_referencia);
    expect(updates).toEqual(["16-000002388", null]);
  });

  it("la factura vieja sin CUFE (Vistana 11-000003143) también es factura; el login no", () => {
    expect(leerVistaFactura("FA 11-000003143 Vendedor EDWIN Cliente TCKCTA Referencia Pedido: 16-000002394"))
      .toEqual({ esFactura: true, pedido: "16-000002394" });
    expect(leerVistaFactura('<form action="/users/login"><input name="usuario"></form>').esFactura).toBe(false);
  });

  it("🔴 un login caído o la base caída NUNCA lanzan", async () => {
    respuestas.switch_facturas = { data: [{ switch_factura_id: 9 }], error: null };
    login.mockRejectedValue(new Error("login caído"));
    await expect(llenarPedidosGuardados("vistana")).resolves.toMatchObject({ leidas: 0, motivo: "error" });
    lanzaEn = "switch_facturas";
    await expect(llenarPedidosGuardados("vistana")).resolves.toMatchObject({ leidas: 0, motivo: "error" });
  });
});

describe("3. el respaldo de la pantalla (idsSinPedidoLeido)", () => {
  const hoy = new Date("2026-11-12T18:00:00Z");
  it("solo lo no leído y reciente, por empresa, las más nuevas primero", () => {
    const m = idsSinPedidoLeido([
      { empresa_key: "vistana", switch_factura_id: 1, fecha: "2026-11-10", pedidoLeido: false },
      { empresa_key: "vistana", switch_factura_id: 2, fecha: "2026-11-12", pedidoLeido: false },
      { empresa_key: "vistana", switch_factura_id: 3, fecha: "2026-11-12", pedidoLeido: true },
      { empresa_key: "vistana", switch_factura_id: 4, fecha: "2026-10-01", pedidoLeido: false },
      { empresa_key: "joystep", switch_factura_id: 5, fecha: "2026-11-11", pedidoLeido: false },
      { empresa_key: "joystep", switch_factura_id: 6, fecha: "2026-11-11" }, // ruta vieja: no se pide
    ], hoy);
    expect([...m]).toEqual([["vistana", [2, 1]], ["joystep", [5]]]);
  });
  it("como mucho MAX_FACTURAS_PEDIDO por empresa (un login)", () => {
    const muchas = Array.from({ length: 25 }, (_, i) => ({ empresa_key: "vistana", switch_factura_id: i + 1, fecha: "2026-11-12", pedidoLeido: false }));
    expect(idsSinPedidoLeido(muchas, hoy).get("vistana")).toHaveLength(MAX_FACTURAS_PEDIDO);
  });
});

describe("4. el sync de facturas llena el pedido sin poner en riesgo la corrida", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src", "app", "api", "cron", "switch-sync", "route.ts"), "utf8");
  it("lo llama solo en corridas con facturas y solo por las empresas del grupo", () => {
    expect(src).toMatch(/if \(tipo === "facturas" \|\| tipo === "all"\) \{\s*const grupo = new Set<string>\(B2B_EMPRESA_KEYS\)/);
    expect(src).toMatch(/if \(grupo\.has\(empresaKey\)\) pedidos\.push\(await llenarPedidosGuardados\(empresaKey\)\)/);
  });
  it("su resultado no entra a `errors` (no cambia el heartbeat ni avisa)", () => {
    expect(src).not.toMatch(/errors\.push\([^)]*pedido/i);
  });
});
