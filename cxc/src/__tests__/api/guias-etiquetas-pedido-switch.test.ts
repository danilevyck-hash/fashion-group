// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL N.° DE PEDIDO SE TRAE DEL PANEL DE SWITCH (12-nov-2026).
//   1. El lector de «Referencia Pedido» (HTML y PDF): con, sin, espacios raros
//      y una página que no es factura → null.
//   2. Varios pedidos se juntan con « / » solo si caben en 30.
//   3. La ruta: los roles de Etiquetas y, si Switch falla, `null` (nunca 500).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { deflateSync } from "zlib";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import { pedidoPropuesto } from "@/lib/guias/etiquetas-por-envio";

vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    from: () => {
      const q = { select: () => q, eq: () => q, gte: () => q, limit: () => Promise.resolve({ data: [], error: null }) };
      return q;
    },
  },
}));
const login = vi.fn();
vi.mock("@/lib/switch-api/web-client", () => ({
  loginSwitchWeb: (...a: unknown[]) => login(...a),
  leerFacturaMostrar: vi.fn(),
  cerrarSesionWeb: vi.fn(async () => {}),
}));

const { extraerReferenciaPedido } = await import("@/lib/guias/pedido-de-factura");
const { GET } = await import("@/app/api/guias/etiquetas/pedido/route");

// La forma REAL de la vista HTML (Fashion Wear, 12-nov-2026).
const HTML = (valor: string) =>
  `<html><title>FA 11-000003370</title><table><tr><td style="font-size: 9pt;"><label style="font-weight: bold;">Vencimiento a: </label><label>10-02-2027</label></td></tr>
   <tr><td style="width: 100%; font-size: 9pt;"><label style="font-weight: bold;">Referencia Pedido:</label><label>${valor}</label></td></tr></table></html>`;

/** Un PDF mínimo como el de DOMPDF (Fashion Shoes, Active Shoes, Joystep). */
function pdf(contenido: string): Uint8Array {
  const stream = deflateSync(Buffer.from(contenido, "latin1"));
  return new Uint8Array(Buffer.concat([
    Buffer.from("%PDF-1.3\n7 0 obj\n<< /Filter /FlateDecode /Length " + stream.length + " >>\nstream\n"),
    stream,
    Buffer.from("\nendstream\nendobj\n%%EOF"),
  ]));
}

describe("1. extraerReferenciaPedido", () => {
  it("HTML con pedido", () => {
    expect(extraerReferenciaPedido(HTML(" 16-000002889"))).toBe("16-000002889");
  });
  it("espacios y saltos raros alrededor", () => {
    expect(extraerReferenciaPedido(HTML("\n\t  16-000002898 &nbsp; "))).toBe("16-000002898");
    expect(extraerReferenciaPedido("Referencia   Pedido:\n16-000000241")).toBe("16-000000241");
  });
  it("sin pedido (la línea no viene, o viene vacía) → null", () => {
    expect(extraerReferenciaPedido("<html><title>FA 11-000000355</title></html>")).toBeNull();
    expect(extraerReferenciaPedido(HTML(" ") + "<td>Código</td><td>16-000009999</td>")).toBeNull();
  });
  it("una página que no es factura (el login) → null", () => {
    expect(extraerReferenciaPedido('<form action="/users/login"><input name="_token" value="x"></form>')).toBeNull();
  });
  it("un valor que no es número de pedido → null", () => {
    expect(extraerReferenciaPedido(HTML("ver nota"))).toBeNull();
    expect(extraerReferenciaPedido(HTML("10-02-2027"))).toBeNull();
  });
  it("PDF de DOMPDF: el texto viene en cadenas TJ comprimidas", () => {
    const con = pdf("BT 311.560 457.276 Td /F2 9.0 Tf  [(Referencia Pedido:)] TJ ET\nBT 384.793 457.276 Td /F1 9.0 Tf  [( 16-000002205)] TJ ET");
    expect(extraerReferenciaPedido(con)).toBe("16-000002205");
    const sin = pdf("BT 311.560 470.968 Td /F2 9.0 Tf  [(Vencimiento a: )] TJ ET");
    expect(extraerReferenciaPedido(sin)).toBeNull();
  });
});

describe("2. pedidoPropuesto", () => {
  it("uno, repetidos y vacíos", () => {
    expect(pedidoPropuesto(["16-000002889", null, "16-000002889"])).toEqual({ valor: "16-000002889", noCabe: false });
    expect(pedidoPropuesto([null, null])).toEqual({ valor: "", noCabe: false });
  });
  it("dos distintos caben; tres no", () => {
    expect(pedidoPropuesto(["16-000002889", "16-000002898"]).valor).toBe("16-000002889 / 16-000002898");
    expect(pedidoPropuesto(["16-000002889", "16-000002898", "16-000002900"])).toEqual({ valor: "", noCabe: true });
  });
});

describe("3. GET /api/guias/etiquetas/pedido", () => {
  const PREV = process.env.SESSION_SECRET;
  beforeAll(() => { process.env.SESSION_SECRET = "test-secret-pedido"; });
  afterAll(() => { process.env.SESSION_SECRET = PREV; });
  const pedir = (role: string | null, qs = "empresa=fashion_wear&ids=9874,9872") => {
    const headers: Record<string, string> = {};
    if (role) headers.cookie = `cxc_session=${signSession({ role, userId: "u", userName: role, sessionToken: "t", modules: ["guias"] })}`;
    return GET(new NextRequest(`http://x/api/guias/etiquetas/pedido?${qs}`, { headers }));
  };

  it("sin sesión 401; vendedor (solo lee guías) 403", async () => {
    expect((await pedir(null)).status).toBe(401);
    expect((await pedir("vendedor")).status).toBe(403);
  });
  it("🔴 si el login de Switch falla, contesta 200 con null en cada factura", async () => {
    login.mockRejectedValueOnce(new Error("login caído"));
    {
      const role = "bodega";
      const r = await pedir(role);
      expect(r.status).toBe(200);
      const j = await r.json();
      expect(j.pedidos).toEqual({ "9874": null, "9872": null });
      expect(j.motivo).toBe("error");
    }
  });
  it("empresa fuera del grupo o sin ids: no entra a Switch", async () => {
    login.mockClear();
    expect(await (await pedir("secretaria", "empresa=confecciones_boston&ids=1")).json()).toEqual({ pedidos: {} });
    expect(await (await pedir("admin", "empresa=fashion_wear&ids=abc")).json()).toEqual({ pedidos: {} });
    expect(login).not.toHaveBeenCalled();
  });
});
