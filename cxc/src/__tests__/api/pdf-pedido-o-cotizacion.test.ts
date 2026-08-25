// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO — EL PAPEL DICE CUÁL DE LAS DOS FUE (25-ago-2026)
//
// Daniel mandó TOM-027 como COTIZACIÓN, Switch la aceptó (15-000000123), y el
// PDF que se le manda al cliente igual decía «Pedido: TOM-027» en el
// encabezado, al lado del cliente y la fecha. Textual: *"esto fue una
// cotización, porque dice pedidos en pdf?"*. Una cotización NO aparta
// mercancía: el papel que dice «Pedido» hace creer que la mercancía está
// apartada cuando no lo está.
//
// Este archivo llama a la RUTA de verdad y mira lo que sale:
//   1. La palabra del encabezado del PDF (`documentoLabel`) es la de Switch.
//   2. El nombre del archivo lleva la MISMA palabra — y con la tilde viva
//      (RFC 6266), porque Content-Disposition es un encabezado HTTP.
//   3. 🔴 EL NÚMERO NO CAMBIA: TOM-027 sigue siendo TOM-027 en los dos casos.
//   4. Un pedido que TODAVÍA NO salió a Switch queda como estaba: «Pedido».
//   5. Tolerancia al DDL 20260824160000: sin la columna `documento`, «Pedido».
//   6. Las 4 marcas hacen lo mismo (Joybees es espejo exacto de Reebok).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { makeDb, type MockDb } from "../helpers/catalogo-mock-db";

let reebokDb: MockDb;
vi.mock("@/lib/reebok-supabase-server", () => ({
  reebokServer: { from: (t: string) => reebokDb.from(t), rpc: (...a: unknown[]) => reebokDb.rpc(...a) },
}));
let joybeesDb: MockDb;
vi.mock("@/lib/joybees-supabase-server", () => ({
  joybeesServer: { from: (t: string) => joybeesDb.from(t), rpc: (...a: unknown[]) => joybeesDb.rpc(...a) },
}));
let tommyDb: MockDb;
vi.mock("@/lib/tommy-supabase-server", () => ({
  tommyServer: { from: (t: string) => tommyDb.from(t), rpc: (...a: unknown[]) => tommyDb.rpc(...a) },
}));
let calvinDb: MockDb;
vi.mock("@/lib/calvin-supabase-server", () => ({
  calvinServer: { from: (t: string) => calvinDb.from(t), rpc: (...a: unknown[]) => calvinDb.rpc(...a) },
}));
let mainDb: MockDb;
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (t: string) => mainDb.from(t), rpc: (...a: unknown[]) => mainDb.rpc(...a) },
}));

/** El PDF de verdad se lee con `pdftotext` en `scripts/_verif-pdf-dice-la-verdad.mjs`.
 *  Acá lo que se fija es QUÉ PALABRA le llega al generador. */
const pdfCalls: Array<Record<string, unknown>> = [];
vi.mock("@/lib/catalogo/order-pdf", () => ({
  buildCatalogoOrderPdf: vi.fn(async (opts: Record<string, unknown>) => {
    pdfCalls.push(opts);
    return Buffer.from("%PDF-1.3 fake");
  }),
}));

import type { NextRequest } from "next/server";
import { GET as pdfGet } from "@/app/api/catalogo/[marca]/orders/[id]/pdf/route";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

beforeAll(() => { process.env.SESSION_SECRET = TEST_SECRET; });

const OID = "33333333-3333-4333-8333-333333333333";
const NUMERO = "TOM-027";

const MARCAS = [
  { marca: "reebok", db: () => reebokDb, orders: "reebok_orders", items: "reebok_order_items", envios: "reebok_switch_envios", productos: "products" },
  { marca: "joybees", db: () => joybeesDb, orders: "joybees_orders", items: "joybees_order_items", envios: "joybees_switch_envios", productos: "joybees_products" },
  { marca: "tommy", db: () => tommyDb, orders: "tommy_orders", items: "tommy_order_items", envios: "tommy_switch_envios", productos: "tommy_products" },
  { marca: "calvin", db: () => calvinDb, orders: "calvin_orders", items: "calvin_order_items", envios: "calvin_switch_envios", productos: "calvin_products" },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  pdfCalls.length = 0;
  reebokDb = makeDb(); joybeesDb = makeDb(); tommyDb = makeDb(); calvinDb = makeDb(); mainDb = makeDb();
});

/** Arma el pedido en la base falsa y llama a la ruta. `envio` = fila del envío
 *  ACTIVO, o null si el pedido todavía no salió a Switch. */
async function pedirPdf(
  m: (typeof MARCAS)[number],
  envio: Record<string, unknown> | null,
  opts: { errorDocumento?: boolean } = {},
) {
  const db = m.db();
  db.queue(m.orders, {
    data: {
      order_number: NUMERO,
      client_name: "COMERCIAL EL MACHETAZO, S.A.",
      created_at: "2026-08-25T12:00:00Z",
      [m.items]: [{ product_id: "p1", sku: "TH-1", name: "Tee", quantity: 2, unit_price: 18.5, image_url: "", is_preorder: false }],
    },
    error: null,
  });
  db.queue(m.productos, { data: [{ id: "p1", category: "CAMISETAS", bulto_pzas: 12 }], error: null });
  // 🔴 El escalón tolerante: con `errorDocumento` la primera lectura (la que
  // pide la columna `documento`) falla como si el DDL no estuviera corrido, y
  // la ruta tiene que releer sin ella.
  if (opts.errorDocumento) {
    db.queue(m.envios, { data: null, error: { message: 'column "documento" does not exist' } }, { data: envio, error: null });
  } else {
    db.queue(m.envios, { data: envio, error: null });
  }

  const req = makeReq(`https://x/api/catalogo/${m.marca}/orders/${OID}/pdf`, { role: "admin" }) as NextRequest;
  const res = await pdfGet(req, { params: { marca: m.marca, id: OID } });
  return {
    res,
    disposition: res.headers.get("Content-Disposition") || "",
    label: pdfCalls.at(-1)?.documentoLabel as string | undefined,
    numero: pdfCalls.at(-1)?.orderNumber as string | undefined,
  };
}

describe("🔴 el PDF nombra lo que hay en Switch — las 4 marcas", () => {
  for (const m of MARCAS) {
    it(`${m.marca}: una COTIZACIÓN se llama Cotización, adentro y en el nombre`, async () => {
      const r = await pedirPdf(m, { estado: "verificado", documento: "cotizacion" });
      expect(r.res.status).toBe(200);
      expect(r.label).toBe("Cotización");
      // El número de la casa NO cambia: sigue siendo TOM-027.
      expect(r.numero).toBe(NUMERO);
      expect(r.disposition).toContain(`Cotizacion-${NUMERO}`); // respaldo ASCII
      expect(r.disposition).toContain("filename*=UTF-8''"); // el bueno, con tilde
      expect(decodeURIComponent(r.disposition)).toContain(`Cotización-${NUMERO}`);
      expect(r.disposition).not.toMatch(new RegExp(`Pedido-${NUMERO}`));
    });

    it(`${m.marca}: un PEDIDO sigue llamándose Pedido`, async () => {
      const r = await pedirPdf(m, { estado: "enviado", documento: "pedido" });
      expect(r.label).toBe("Pedido");
      expect(r.numero).toBe(NUMERO);
      expect(r.disposition).toContain(`Pedido-${NUMERO}`);
      expect(r.disposition).not.toContain("Cotizacion");
    });

    it(`${m.marca}: si TODAVÍA NO salió a Switch, no se le inventa etiqueta`, async () => {
      const r = await pedirPdf(m, null);
      // Ni "Cotización" (no lo es) ni nada nuevo: queda como estaba.
      expect(r.label).toBeUndefined();
      expect(r.disposition).toContain(`Pedido-${NUMERO}`);
    });

    it(`${m.marca}: con el DDL 20260824160000 pendiente sale PEDIDO y no se cae`, async () => {
      const r = await pedirPdf(m, { estado: "verificado" }, { errorDocumento: true });
      expect(r.res.status).toBe(200);
      expect(r.label).toBe("Pedido");
      expect(r.disposition).toContain(`Pedido-${NUMERO}`);
    });

    it(`${m.marca}: la CONSULTA filtra por estado — no rotula cualquier envío`, async () => {
      // 🔴 Mismo criterio que el candado de edición. Sin este filtro, un
      // intento FALLIDO (o uno 'pendiente' que nunca llegó) rotularía el papel
      // como si la mercancía estuviera apartada. Se mira la consulta REAL que
      // salió, no el resultado: el doble de Supabase no filtra por su cuenta.
      await pedirPdf(m, { estado: "verificado", documento: "cotizacion" });
      const llamada = m.db().calls.find((c) => c.table === m.envios);
      expect(llamada, `no se consultó ${m.envios}`).toBeTruthy();
      const enCalls = (llamada!.chain._calls.in ?? []) as unknown[][];
      const filtroEstado = enCalls.find((args) => args[0] === "estado");
      expect(filtroEstado, "la lectura NO filtró por estado").toBeTruthy();
      expect([...(filtroEstado![1] as string[])].sort()).toEqual(["enviado", "verificado"]);
      // Y acotada al pedido que se pidió, no a la tabla entera.
      const eqCalls = (llamada!.chain._calls.eq ?? []) as unknown[][];
      expect(eqCalls.some((args) => args[0] === "order_id" && args[1] === OID)).toBe(true);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EL ADJUNTO DEL CORREO — el mismo papel, el mismo nombre
//
// "Enviar por email al cliente" sigue disponible DESPUÉS de mandar a Switch, así
// que el adjunto puede ser el de una cotización. Si el archivo se llama
// "Pedido-TOM-027.pdf", el cliente cree que tiene la mercancía apartada.
// ─────────────────────────────────────────────────────────────────────────────

import { POST as sendOrderPost } from "@/app/api/catalogo/[marca]/send-order/route";

/** Lo que se le manda a Resend. */
function stubResend() {
  const enviados: Array<Record<string, unknown>> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("api.resend.com")) {
      enviados.push(JSON.parse(String(init?.body ?? "{}")));
      return { ok: true, status: 200, json: async () => ({ id: "e1" }) } as unknown as Response;
    }
    return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({}) } as unknown as Response;
  }));
  return enviados;
}

async function mandarCorreo(m: (typeof MARCAS)[number], envio: Record<string, unknown> | null) {
  const db = m.db();
  db.queue(m.orders, {
    data: {
      order_number: NUMERO, client_name: "Sporting Shoes", comment: null,
      created_at: "2026-08-25T12:00:00Z",
      [m.items]: [{ product_id: "p1", sku: "TH-1", name: "Tee", quantity: 2, unit_price: 18.5, image_url: "", is_preorder: false }],
    },
    error: null,
  });
  db.queue(m.productos, { data: [{ id: "p1", category: "CAMISETAS", bulto_pzas: 12 }], error: null });
  db.queue(m.envios, { data: envio, error: null });

  const enviados = stubResend();
  const req = makeReq(`https://x/api/catalogo/${m.marca}/send-order`, {
    role: "admin", method: "POST", body: { orderId: OID, clientEmail: "cliente@x.com" },
  }) as NextRequest;
  const res = await sendOrderPost(req, { params: { marca: m.marca } });
  return { res, adjunto: (enviados.at(-1)?.attachments as Array<{ filename: string }> | undefined)?.[0] };
}

describe("🔴 el adjunto del correo lleva la misma palabra", () => {
  beforeAll(() => { process.env.RESEND_API_KEY = "re_test"; });

  for (const m of MARCAS) {
    it(`${m.marca}: una COTIZACIÓN se adjunta como Cotización-${NUMERO}`, async () => {
      const r = await mandarCorreo(m, { estado: "verificado", documento: "cotizacion" });
      expect(r.res.status).toBe(200);
      expect(r.adjunto?.filename).toMatch(new RegExp(`^Cotización-${NUMERO}-`));
      expect(r.adjunto?.filename).not.toMatch(/^Pedido-/);
      // Y la palabra también entró al papel.
      expect(pdfCalls.at(-1)?.documentoLabel).toBe("Cotización");
    });

    it(`${m.marca}: un PEDIDO se adjunta como Pedido-${NUMERO}`, async () => {
      const r = await mandarCorreo(m, { estado: "verificado", documento: "pedido" });
      expect(r.adjunto?.filename).toMatch(new RegExp(`^Pedido-${NUMERO}-`));
      expect(pdfCalls.at(-1)?.documentoLabel).toBe("Pedido");
    });

    it(`${m.marca}: sin salir a Switch, el adjunto queda como estaba`, async () => {
      const r = await mandarCorreo(m, null);
      expect(r.adjunto?.filename).toMatch(new RegExp(`^Pedido-${NUMERO}-`));
      expect(pdfCalls.at(-1)?.documentoLabel).toBeUndefined();
    });
  }
});
