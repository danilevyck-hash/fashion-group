/**
 * Las guardas de «falta la columna» de CxC y Clientes se retiraron (9-oct-2026).
 *
 * `cxc_emails_enviados.canal` y `clientes_master.contacto` existen en
 * producción. Antes, un error de escritura que NOMBRARA la columna se leía como
 * «falta la migración» y se reescribía sin ella: el dato quedaba a medias y la
 * pantalla decía «guardado». Acá se mide que ese error ya NO se traga.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const ERROR_QUE_NOMBRA = (col: string, tabla: string) => ({
  code: "PGRST204",
  message: `Could not find the '${col}' column of '${tabla}' in the schema cache`,
});

let errorDeEscritura: { code: string; message: string } | null = null;
let escrituras: Array<{ tabla: string; payload: unknown }> = [];

function cadena(tabla: string) {
  const res = () => Promise.resolve({ data: null, error: errorDeEscritura });
  const self: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) self[m] = () => self;
  for (const m of ["insert", "update"]) {
    self[m] = (payload: unknown) => {
      escrituras.push({ tabla, payload });
      return self;
    };
  }
  self.maybeSingle = res;
  self.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => res().then(ok, bad);
  return self;
}

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: (t: string) => cadena(t) } }));
vi.mock("@/lib/requireRole", () => ({ requireRole: () => ({ role: "admin", userId: "u-1", userName: "Daniel" }) }));
vi.mock("@/lib/require-auth", () => ({ requireAuth: () => null }));
vi.mock("@/lib/clientes/mundos", () => ({ esCodigoDelGrupo: async () => true }));

const pedir = (url: string, metodo: string, cuerpo: unknown) =>
  new NextRequest(`https://fashiongr.com${url}`, { method: metodo, body: JSON.stringify(cuerpo) });

beforeEach(() => {
  errorDeEscritura = null;
  escrituras = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("un error de escritura que nombra la columna ya no se guarda a medias", () => {
  it("anotar un envío de CxC: 500 y UN solo intento (antes: segundo insert sin `canal`)", async () => {
    errorDeEscritura = ERROR_QUE_NOMBRA("canal", "cxc_emails_enviados");
    const { POST } = await import("@/app/api/cxc/envios/route");
    const res = await POST(pedir("/api/cxc/envios", "POST", { codigo: "D-24", canal: "whatsapp" }));
    expect(res.status).toBe(500);
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0].payload).toMatchObject({ canal: "whatsapp" });
  });

  it("editar el cliente: 500 y UN solo intento (antes: se guardaba el teléfono y se perdía el contacto)", async () => {
    errorDeEscritura = ERROR_QUE_NOMBRA("contacto", "clientes_master");
    const { PATCH } = await import("@/app/api/clientes/[codigo]/route");
    const res = await PATCH(
      pedir("/api/clientes/D-24", "PATCH", { contacto: "Ana", telefono: "6000-0000" }),
      { params: Promise.resolve({ codigo: "D-24" }) },
    );
    expect(res.status).toBe(500);
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0].payload).toMatchObject({ contacto: "Ana", telefono: "6000-0000" });
  });
});
