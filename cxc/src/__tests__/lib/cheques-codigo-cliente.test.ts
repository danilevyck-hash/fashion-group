// ─────────────────────────────────────────────────────────────────────────────
// CHEQUES SE ATA AL CLIENTE POR CÓDIGO — Y GUÍAS YA LO ESTABA.
//
// El pedido era poder preguntar *"¿qué le despaché, qué cheques me dio y cuánto
// me debe este cliente?"*. Medido contra producción el 8-ago-2026, de las dos
// mitades sólo UNA faltaba:
//
//   · **Guías YA está atado**, y en el lugar correcto: `guia_items.cliente_codigo`
//     (migración 20260607131000, jun-2026). El cliente de una guía vive en las
//     LÍNEAS, no en el encabezado.
//
//   · 🔴 **`guia_transporte.receptor_nombre` NO es el cliente** — es la persona
//     que FIRMA el recibido, con su cédula y la placa del camión. Medido: de las
//     **109** guías con receptor anotado, **0** coinciden con el nombre de un
//     cliente. Son nombres de personas ("Nicolás guillen", "Reynel", "Walter
//     arauz"). Ponerle un `cliente_codigo` habría sido atarle un código de
//     cliente al nombre de un chofer.
//
//   · **Cheques NO tenía dónde guardarlo.** El formulario YA elegía al cliente
//     con el selector cerrado compartido y YA conocía su código — y lo TIRABA.
//     Por eso llevaba `mostrarVinculo={false}`: *"no se promete un vínculo que
//     no existe"*. Eso es lo que arregla este cambio.
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
import { POST } from "@/app/api/cheques/route";
import { construirFilaCheque } from "@/lib/cheques-fila";

process.env.SESSION_SECRET ||= "test-secret-para-firmar-sesiones";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

const CHEQUE_OK = {
  cliente: "Jerusalem De Panama",
  empresa: "vistana",
  numero_cheque: "246001",
  monto: 1000,
  fecha_deposito: "2026-08-15",
  notas: "",
  vendedor: "Rey",
};

function req(body: unknown): NextRequest {
  const cookie = signSession({ role: "secretaria", userId: "u1", userName: "t", sessionToken: "s" });
  return new NextRequest("http://localhost/api/cheques", {
    method: "POST",
    headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

let escrito: Record<string, unknown> | null = null;

beforeEach(() => {
  escrito = null;
  vi.clearAllMocks();
  mockFrom.mockImplementation(() => ({
    insert: (campos: Record<string, unknown>) => {
      escrito = campos;
      return { select: () => ({ single: async () => ({ data: { id: "nuevo", ...campos }, error: null }) }) };
    },
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la fila del cheque lleva el código, y el nombre se conserva", () => {
  it("guarda el código cuando el selector eligió un cliente", () => {
    const fila = construirFilaCheque({ ...CHEQUE_OK, cliente_codigo: "D-80" });
    expect(fila.cliente_codigo).toBe("D-80");
    // El texto SIEMPRE se conserva como display — no se reemplaza por el código.
    expect(fila.cliente).toBe("Jerusalem De Panama");
  });

  it('"sin vincular" queda en NULL, no en cadena vacía', () => {
    // La opción "Otro" del selector es un estado legítimo. Un "" haría que
    // `cliente_codigo IS NOT NULL` contara cheques que no están vinculados.
    for (const v of ["", "   ", null, undefined]) {
      expect(construirFilaCheque({ ...CHEQUE_OK, cliente_codigo: v as string | null }).cliente_codigo).toBeNull();
    }
    expect(construirFilaCheque(CHEQUE_OK).cliente_codigo).toBeNull();
  });

  it("el POST lo escribe", async () => {
    await POST(req({ ...CHEQUE_OK, cliente_codigo: "D-80" }));
    expect(escrito).toHaveProperty("cliente_codigo", "D-80");
    expect(escrito).toHaveProperty("cliente", "Jerusalem De Panama");
  });
});

// ⚠️ Cambio de dirección (3-sep-2026): la tolerancia a la DDL se retiró —
// `cheques.cliente_codigo` existe desde 20260808190000. Un PGRST204 que nombre
// la columna ya NO reintenta sin ella: guardar el cheque sin su cliente y
// seguir sería registrar plata a nombre de nadie sin que nadie se entere.
describe("guardar un cheque con un error de columna FALLA VISIBLE (antes: reintentaba sin el vínculo)", () => {
  it("con PGRST204 responde 500, escribe UNA sola vez y NO devuelve `_falta_migracion_codigo`", async () => {
    let intentos = 0;
    mockFrom.mockImplementation(() => ({
      insert: (campos: Record<string, unknown>) => {
        intentos++;
        escrito = campos;
        const falta = "cliente_codigo" in campos;
        return {
          select: () => ({
            single: async () =>
              falta
                ? { data: null, error: { code: "PGRST204", message: "Could not find the 'cliente_codigo' column of 'cheques'" } }
                : { data: { id: "nuevo", ...campos }, error: null },
          }),
        };
      },
    }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req({ ...CHEQUE_OK, cliente_codigo: "D-80" }));
    expect(res.status).toBe(500);
    expect(intentos).toBe(1);                                 // sin reintento
    expect(escrito).toHaveProperty("cliente_codigo", "D-80"); // se mandó CON el vínculo
    expect(await res.json()).not.toHaveProperty("_falta_migracion_codigo");
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("BARRIDO ESTÁTICO — el formulario y la migración", () => {
  const MODAL = "src/app/recordatorios/components/ChequeFormModal.tsx";
  const MIGRACION = "supabase/migrations/20260808190000_cheques_cliente_codigo.sql";

  /** El WHERE del UPDATE de backfill, SIN comentarios: es lo único que ejecuta. */
  function whereDelUpdate(): string {
    const sql = leer(MIGRACION)
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    const i = sql.indexOf("UPDATE cheques");
    expect(i, "la migración tiene que traer el UPDATE de backfill").toBeGreaterThan(-1);
    const fin = sql.indexOf(";", i);
    return sql.slice(i, fin === -1 ? undefined : fin);
  }

  it("el selector ya NO apaga el distintivo de vínculo", () => {
    // Iba apagado porque la tabla no guardaba el código. Ahora sí lo guarda.
    expect(leer(MODAL)).not.toContain("mostrarVinculo={false}");
  });

  it("el formulario manda el código al guardar", () => {
    expect(leer(MODAL)).toContain("cliente_codigo: clienteCodigo");
  });

  it("editar un cheque NO lo desvincula en silencio", () => {
    // Al abrir, el modal reseteaba el código a "": editar y volver a guardar
    // habría borrado el vínculo sin que nadie lo pidiera.
    const src = leer(MODAL);
    expect(src).not.toMatch(/setClienteCodigo\(""\)/);
    expect(src).toContain("setClienteCodigo(initialRef.current.cliente_codigo");
  });

  it("la migración es ADITIVA y no destructiva", () => {
    const sql = leer(MIGRACION);
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS cliente_codigo");
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("el backfill SÓLO ata códigos D-XXX — Boston no entra por la puerta de atrás", () => {
    // Hay 10 nombres que existen en los dos mundos (CITY MALL DAVID,
    // EL MACHETAZO-CALIDONIA…): sin el filtro, un cheque podría atarse a Boston.
    expect(whereDelUpdate()).toContain("cm.codigo LIKE 'D-%'");
  });

  it("el backfill no pisa lo vinculado a mano ni toca cheques borrados", () => {
    const w = whereDelUpdate();
    expect(w).toContain("ch.cliente_codigo IS NULL");
    expect(w).toContain("ch.deleted = false");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GUÍAS — no se le pone código al receptor, y por qué", () => {
  it("`receptor_nombre` sigue SIN cliente_codigo", () => {
    // Medido: 0 de 109 receptores coinciden con el nombre de un cliente. Son
    // choferes. El cliente de la guía vive en `guia_items.cliente_codigo`.
    const sql = leer("supabase/migrations/20260607131000_guia_items_add_cliente_codigo.sql");
    expect(sql).toContain("ALTER TABLE guia_items");
    expect(sql).not.toContain("ALTER TABLE guia_transporte");
  });

  it("las líneas de guía siguen atándose por código", () => {
    expect(leer("src/app/guias/components/types.ts")).toContain("cliente_codigo");
  });
});
