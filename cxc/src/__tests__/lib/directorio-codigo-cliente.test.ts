// ─────────────────────────────────────────────────────────────────────────────
// EL DIRECTORIO SE ATA AL CLIENTE REAL — Y NO SE PIERDE UN SOLO TELÉFONO.
//
// Las 33 fichas de `directorio_clientes` las cargó Daniel A MANO y son lo único
// que esa tabla aporta: teléfono, celular, WhatsApp, correo, contacto y notas.
//
// 🩸 DOS BUGS VIVOS, encontrados al agregarle el código (8-ago-2026):
//
//   1. **El formulario del catálogo BORRABA datos.** `ClientesClient.tsx` sólo
//      edita nombre/empresa/correo/WhatsApp, pero mandaba
//      `telefono: "", celular: "", contacto: "", notas: ""` en cada guardada, y
//      el PUT armaba el UPDATE con las 7 columnas SIEMPRE. Medido: **22 de las
//      33 fichas** tienen alguno de esos cuatro datos. Editar el correo de una
//      ficha le borraba el teléfono, sin decir nada y sin forma de notarlo
//      (la pantalla nunca muestra esas columnas).
//
//   2. **El campo WhatsApp era un control MUERTO.** Se escribía, se mandaba, y
//      ni el INSERT ni el UPDATE lo incluían en su destructuring.
//
// El test mira las dos direcciones: que lo que se manda se guarde, y que lo que
// NO se manda no se toque.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (...a: unknown[]) => mockFrom(...a) },
}));
vi.mock("@/lib/log-activity", () => ({ logActivity: async () => {} }));

import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import { PUT } from "@/app/api/directorio/[id]/route";
import { POST } from "@/app/api/directorio/route";
import {
  esColumnaFaltante,
  guardarTolerandoColumnaNueva,
} from "@/lib/clientes/directorio-columna-opcional";

process.env.SESSION_SECRET ||= "test-secret-para-firmar-sesiones";

const ID = "11111111-2222-3333-4444-555555555555";
const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

function req(url: string, body: unknown, method = "PUT"): NextRequest {
  const cookie = signSession({ role: "admin", userId: "u1", userName: "t", sessionToken: "s" });
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Captura lo que la ruta le manda a PostgREST. */
let escrito: Record<string, unknown> | null = null;
let errorSimulado: { code?: string; message?: string } | null = null;

beforeEach(() => {
  escrito = null;
  errorSimulado = null;
  vi.clearAllMocks();
  mockFrom.mockImplementation(() => ({
    update: (campos: Record<string, unknown>) => {
      escrito = campos;
      return {
        eq: () => ({
          select: () => ({
            single: async () =>
              errorSimulado
                ? { data: null, error: errorSimulado }
                : { data: { id: ID, ...campos }, error: null },
          }),
        }),
      };
    },
    insert: (campos: Record<string, unknown>) => {
      escrito = campos;
      return {
        select: () => ({
          single: async () =>
            errorSimulado
              ? { data: null, error: errorSimulado }
              : { data: { id: ID, ...campos }, error: null },
        }),
      };
    },
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
describe("PUT — lo que NO se manda, NO se toca", () => {
  it("editar sólo el correo no escribe teléfono, celular, contacto ni notas", async () => {
    await PUT(req(`/api/directorio/${ID}`, { correo: "nuevo@x.com" }), { params: { id: ID } });
    expect(escrito).toEqual({ correo: "nuevo@x.com" });
    for (const c of ["telefono", "celular", "contacto", "notas"]) {
      expect(escrito, `no debe tocar ${c}`).not.toHaveProperty(c);
    }
  });

  it("el caso REAL: el formulario del catálogo ya no puede borrar el teléfono", async () => {
    // Lo que manda hoy ClientesClient.tsx tras el arreglo.
    await PUT(
      req(`/api/directorio/${ID}`, { nombre: "HANNA STORE", empresa: "", correo: "a@b.c", whatsapp: "+50760000000", cliente_codigo: "D-72" }),
      { params: { id: ID } },
    );
    expect(escrito).not.toHaveProperty("telefono");
    expect(escrito).not.toHaveProperty("celular");
    expect(escrito).not.toHaveProperty("contacto");
    expect(escrito).not.toHaveProperty("notas");
  });

  it("un vacío EXPLÍCITO sí se respeta — borrar a propósito sigue siendo posible", () => {
    // La regla es "lo que no viene no se toca", no "no se puede vaciar nada".
    return PUT(req(`/api/directorio/${ID}`, { notas: "" }), { params: { id: ID } }).then(() => {
      expect(escrito).toEqual({ notas: "" });
    });
  });

  it("sin ningún campo editable responde 400 en vez de un UPDATE vacío", async () => {
    const res = await PUT(req(`/api/directorio/${ID}`, { cualquier_cosa: 1 }), { params: { id: ID } });
    expect(res.status).toBe(400);
    expect(escrito).toBeNull();
  });

  it("un nombre vacío se sigue rechazando (la columna es NOT NULL)", async () => {
    const res = await PUT(req(`/api/directorio/${ID}`, { nombre: "  " }), { params: { id: ID } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(escrito).toBeNull();
  });
});

describe("whatsapp dejó de ser un control muerto", () => {
  it("PUT lo guarda", async () => {
    await PUT(req(`/api/directorio/${ID}`, { whatsapp: "+507 6000-0000" }), { params: { id: ID } });
    expect(escrito).toEqual({ whatsapp: "+507 6000-0000" });
  });

  it("POST lo guarda", async () => {
    await POST(req("/api/directorio", { nombre: "Nuevo", whatsapp: "+507 6111-1111" }, "POST"));
    expect(escrito).toHaveProperty("whatsapp", "+507 6111-1111");
  });
});

describe("el vínculo se guarda, y si el DDL no corrió se DICE", () => {
  it("PUT manda cliente_codigo cuando viene", async () => {
    await PUT(req(`/api/directorio/${ID}`, { cliente_codigo: "D-80" }), { params: { id: ID } });
    expect(escrito).toEqual({ cliente_codigo: "D-80" });
  });

  it("desvincular (null) también se guarda", async () => {
    await PUT(req(`/api/directorio/${ID}`, { cliente_codigo: null }), { params: { id: ID } });
    expect(escrito).toEqual({ cliente_codigo: null });
  });

  it("si la columna no existe, se guarda TODO LO DEMÁS y se avisa", async () => {
    // Sin esto, guardar un teléfono fallaría entero por una columna que ni
    // siquiera se está usando.
    let intento = 0;
    mockFrom.mockImplementation(() => ({
      update: (campos: Record<string, unknown>) => {
        intento++;
        escrito = campos;
        const falta = "cliente_codigo" in campos;
        return {
          eq: () => ({
            select: () => ({
              single: async () =>
                falta
                  ? { data: null, error: { code: "PGRST204", message: "Could not find the 'cliente_codigo' column of 'directorio_clientes'" } }
                  : { data: { id: ID, ...campos }, error: null },
            }),
          }),
        };
      },
    }));
    const res = await PUT(
      req(`/api/directorio/${ID}`, { telefono: "6678-2633", cliente_codigo: "D-80" }),
      { params: { id: ID } },
    );
    expect(res.status).toBe(200);
    expect(intento).toBe(2);
    expect(escrito).toEqual({ telefono: "6678-2633" });        // el teléfono SÍ se guardó
    expect(await res.json()).toHaveProperty("_falta_migracion_codigo", true);
  });
});

describe("el reintento sin la columna es ACOTADO", () => {
  it("reconoce PGRST204 y 42703 que NOMBRAN la columna", () => {
    expect(esColumnaFaltante({ code: "PGRST204", message: "…'cliente_codigo'…" })).toBe(true);
    expect(esColumnaFaltante({ code: "42703", message: "column cliente_codigo does not exist" })).toBe(true);
  });

  it("NO reintenta ante otros errores — un problema real no se puede volver una escritura incompleta", () => {
    expect(esColumnaFaltante({ code: "42501", message: "permission denied for cliente_codigo" })).toBe(false);
    expect(esColumnaFaltante({ code: "PGRST204", message: "Could not find the 'whatsapp' column" })).toBe(false);
    expect(esColumnaFaltante({ code: "23502", message: "null value in column nombre" })).toBe(false);
    expect(esColumnaFaltante(null)).toBe(false);
  });

  it("no reintenta si la columna ni se mandó", async () => {
    let n = 0;
    const r = await guardarTolerandoColumnaNueva({ telefono: "1" }, async () => {
      n++;
      return { data: null, error: { code: "PGRST204", message: "no cliente_codigo here" } };
    });
    expect(n).toBe(1);
    expect(r.sinColumna).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("BARRIDO ESTÁTICO — el formulario y la migración", () => {
  const UI = "src/components/catalogo/ClientesClient.tsx";
  const MIGRACION = "supabase/migrations/20260808180000_directorio_clientes_codigo.sql";

  /** El WHERE del UPDATE de backfill, SIN comentarios: es lo único que ejecuta. */
  function whereDelUpdate(): string {
    const sql = leer(MIGRACION)
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    const i = sql.indexOf("UPDATE directorio_clientes");
    expect(i, "la migración tiene que traer el UPDATE de backfill").toBeGreaterThan(-1);
    const fin = sql.indexOf(";", i);
    return sql.slice(i, fin === -1 ? undefined : fin);
  }

  it("el formulario NO manda los cuatro campos que no edita", () => {
    const src = leer(UI);
    const i = src.indexOf("async function save()");
    const cuerpo = src.slice(i, i + 1200);
    for (const c of ["telefono:", "celular:", "contacto:", "notas:"]) {
      expect(cuerpo, `save() no debe mandar ${c}`).not.toContain(c);
    }
  });

  it("el formulario ofrece vincular con un cliente real", () => {
    const src = leer(UI);
    expect(src).toContain("ClienteTypeahead");
    expect(src).toContain("cliente_codigo");
  });

  it("la migración es ADITIVA y no destructiva", () => {
    const sql = leer("supabase/migrations/20260808180000_directorio_clientes_codigo.sql");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS cliente_codigo");
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("la migración SÓLO ata códigos D-XXX — Boston no entra por la puerta de atrás", () => {
    // Sin este filtro, "Shopping Center" se ataría al código 586 de Boston
    // (medido). Cliente = D-XXX Y una de las 6 del grupo.
    //
    // ⚠️ Se mira el UPDATE, NO el archivo entero: el mismo texto aparece en un
    // comentario de arriba, así que un `toContain` suelto pasaba en verde con la
    // condición borrada del WHERE (lo destapó la verificación por mutación).
    expect(whereDelUpdate()).toContain("cm.codigo LIKE 'D-%'");
  });

  it("la migración no pisa lo que alguien haya vinculado a mano", () => {
    expect(whereDelUpdate()).toContain("d.cliente_codigo IS NULL");
  });

  it("la migración no toca fichas borradas", () => {
    expect(whereDelUpdate()).toContain("d.deleted = false");
  });
});
