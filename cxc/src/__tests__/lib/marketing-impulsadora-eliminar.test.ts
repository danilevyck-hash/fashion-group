// ============================================================================
// Marketing — eliminar una impulsadora (borrar de verdad vs ocultar)
// ============================================================================
// El botón toca plata por el costado: una impulsadora con pagos registrados
// tiene gastos vivos en mk_facturas, y borrarla se llevaría el historial que
// alimenta los reportes por marca y los totales del año. Estos tests fijan las
// DOS puntas — que lo que se puede borrar se borre, y que lo que no, no se
// pierda — más el guard de roles del endpoint.
// ============================================================================
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

// ── Supabase simulado ────────────────────────────────────────────────────────

interface FilaImpulsadora {
  id: string;
  nombre: string;
  monto_mensual: number;
  activa: boolean;
  created_at: string;
  updated_at: string;
}

interface FilaFactura {
  impulsadora_id: string;
  impulsadora_mes: string | null;
  periodo_desde?: string | null;
  periodo_hasta?: string | null;
  anulado_en?: string | null;
}

interface Operacion {
  tabla: string;
  op: "delete" | "update";
  payload?: Record<string, unknown>;
  filtros: Record<string, unknown>;
}

interface EstadoDb {
  impulsadoras: FilaImpulsadora[];
  facturas: FilaFactura[];
  splits: Array<{ impulsadora_id: string; marca_id: string; porcentaje: number }>;
  /** Fuerza el `count` que devuelve PostgREST (null = no verificable). */
  countForzado?: number | null;
  ops: Operacion[];
}

function makeDb(estado: EstadoDb) {
  return {
    from(tabla: string) {
      const filtros: Record<string, unknown> = {};
      let op: "select" | "delete" | "update" = "select";
      let headCount = false;
      let payload: Record<string, unknown> | undefined;

      const builder: Record<string, unknown> = {};
      const chain = () => builder;

      function resolver(): Record<string, unknown> {
        if (op === "delete") {
          estado.ops.push({ tabla, op, filtros: { ...filtros } });
          if (tabla === "mk_impulsadoras") {
            estado.impulsadoras = estado.impulsadoras.filter(
              (i) => i.id !== filtros.id,
            );
          }
          return { data: null, error: null };
        }
        if (op === "update") {
          estado.ops.push({ tabla, op, payload, filtros: { ...filtros } });
          if (tabla === "mk_impulsadoras") {
            estado.impulsadoras = estado.impulsadoras.map((i) =>
              i.id === filtros.id ? { ...i, ...(payload ?? {}) } : i,
            );
          }
          return { data: null, error: null };
        }

        if (tabla === "mk_facturas") {
          const ids = (filtros.__in_impulsadora_id as string[] | undefined) ?? null;
          const filas = estado.facturas.filter((f) => {
            if (filtros.impulsadora_id !== undefined) {
              return f.impulsadora_id === filtros.impulsadora_id;
            }
            if (ids) return ids.includes(f.impulsadora_id);
            return true;
          });
          if (headCount) {
            const count =
              estado.countForzado !== undefined ? estado.countForzado : filas.length;
            return { data: null, count, error: null };
          }
          // cargarPeriodosPagados pide .is("anulado_en", null)
          return { data: filas.filter((f) => !f.anulado_en), error: null };
        }
        if (tabla === "mk_impulsadora_marcas") {
          return { data: estado.splits, error: null };
        }
        if (tabla === "mk_impulsadoras") {
          let filas = estado.impulsadoras;
          if (filtros.activa !== undefined) {
            filas = filas.filter((i) => i.activa === filtros.activa);
          }
          if (filtros.id !== undefined) {
            filas = filas.filter((i) => i.id === filtros.id);
          }
          return { data: filas, error: null };
        }
        return { data: [], error: null };
      }

      Object.assign(builder, {
        select: (_cols?: string, opts?: { head?: boolean; count?: string }) => {
          headCount = opts?.head === true;
          return chain();
        },
        delete: () => {
          op = "delete";
          return chain();
        },
        update: (p: Record<string, unknown>) => {
          op = "update";
          payload = p;
          return chain();
        },
        eq: (col: string, val: unknown) => {
          filtros[col] = val;
          return chain();
        },
        in: (col: string, vals: unknown[]) => {
          filtros[`__in_${col}`] = vals;
          return chain();
        },
        is: chain,
        not: chain,
        gte: chain,
        lte: chain,
        limit: chain,
        order: chain,
        maybeSingle: async () => {
          const r = resolver();
          const data = (r.data as unknown[] | null) ?? [];
          return { data: Array.isArray(data) ? (data[0] ?? null) : data, error: r.error };
        },
        single: async () => resolver(),
        then: (res: (v: unknown) => unknown) => res(resolver()),
      });
      return builder;
    },
  };
}

function impulsadora(over: Partial<FilaImpulsadora> = {}): FilaImpulsadora {
  return {
    id: "imp-1",
    nombre: "Ana Prueba",
    monto_mensual: 800,
    activa: true,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...over,
  };
}

function estadoBase(over: Partial<EstadoDb> = {}): EstadoDb {
  return {
    impulsadoras: [impulsadora()],
    facturas: [],
    splits: [{ impulsadora_id: "imp-1", marca_id: "marca-1", porcentaje: 100 }],
    ops: [],
    ...over,
  };
}

async function cargarLib(estado: EstadoDb) {
  vi.resetModules();
  vi.doMock("@/lib/supabase-server", () => ({
    supabaseServer: makeDb(estado),
    HAS_SERVICE_ROLE: true,
  }));
  vi.doMock("@/lib/marketing/queries", () => ({
    getMarcas: async () => [
      {
        id: "marca-1",
        nombre: "Tommy Hilfiger",
        codigo: "TH",
        empresa_codigo: "vistana",
        activo: true,
      },
    ],
  }));
  return import("@/lib/marketing/impulsadoras");
}

beforeEach(() => {
  vi.resetModules();
});

// ── 1. Sin pagos: se borra de verdad ─────────────────────────────────────────

describe("eliminarImpulsadora — sin pagos registrados", () => {
  it("borra la fila de verdad (DELETE, no un flag)", async () => {
    const estado = estadoBase();
    const { eliminarImpulsadora } = await cargarLib(estado);

    const res = await eliminarImpulsadora("imp-1");

    expect(res).toEqual({ accion: "eliminada", nombre: "Ana Prueba" });
    expect(estado.impulsadoras).toHaveLength(0);
    expect(estado.ops.map((o) => o.op)).toEqual(["delete"]);
    expect(estado.ops[0]).toMatchObject({
      tabla: "mk_impulsadoras",
      filtros: { id: "imp-1" },
    });
  });

  it("una impulsadora que no existe no se borra en silencio", async () => {
    const estado = estadoBase({ impulsadoras: [] });
    const { eliminarImpulsadora } = await cargarLib(estado);

    await expect(eliminarImpulsadora("imp-1")).rejects.toThrow(/no existe/i);
    expect(estado.ops).toHaveLength(0);
  });
});

// ── 2. Con pagos: NO se pierde el historial ──────────────────────────────────

describe("eliminarImpulsadora — con pagos registrados", () => {
  it("NO borra: oculta con activa=false y deja las facturas intactas", async () => {
    const facturas: FilaFactura[] = [
      { impulsadora_id: "imp-1", impulsadora_mes: "2026-06-01" },
      {
        impulsadora_id: "imp-1",
        impulsadora_mes: "2026-07-01",
        periodo_desde: "2026-07-01",
        periodo_hasta: "2026-07-15",
      },
    ];
    const estado = estadoBase({ facturas });
    const { eliminarImpulsadora } = await cargarLib(estado);

    const res = await eliminarImpulsadora("imp-1");

    expect(res).toEqual({ accion: "ocultada", nombre: "Ana Prueba", pagos: 2 });
    // Lo que importa: ni un DELETE, y las facturas siguen ahí.
    expect(estado.ops.map((o) => o.op)).toEqual(["update"]);
    expect(estado.ops[0].payload).toEqual({ activa: false });
    expect(estado.facturas).toEqual(facturas);
    expect(estado.impulsadoras[0].activa).toBe(false);
  });

  it("cuenta PAGOS, no filas: un pago repartido en 3 marcas es 1 pago", async () => {
    // Mismo período en 3 filas (una por marca) = un solo pago para una persona.
    const unPagoEnTresMarcas: FilaFactura[] = [1, 2, 3].map(() => ({
      impulsadora_id: "imp-1",
      impulsadora_mes: "2026-07-01",
      periodo_desde: "2026-07-01",
      periodo_hasta: "2026-07-31",
    }));
    const estado = estadoBase({ facturas: unPagoEnTresMarcas });
    const { eliminarImpulsadora } = await cargarLib(estado);

    const res = await eliminarImpulsadora("imp-1");

    expect(res).toMatchObject({ accion: "ocultada", pagos: 1 });
  });

  it("una factura ANULADA también frena el borrado (la FK no perdona)", async () => {
    const estado = estadoBase({
      facturas: [
        {
          impulsadora_id: "imp-1",
          impulsadora_mes: "2026-07-01",
          anulado_en: "2026-07-20T00:00:00Z",
        },
      ],
    });
    const { eliminarImpulsadora } = await cargarLib(estado);

    const res = await eliminarImpulsadora("imp-1");

    // Se oculta igual, pero con 0 pagos vigentes: el texto de la UI se adapta.
    expect(res).toEqual({ accion: "ocultada", nombre: "Ana Prueba", pagos: 0 });
    expect(estado.ops.map((o) => o.op)).toEqual(["update"]);
  });

  it("FAIL-CERRADO: si no se puede contar, no se borra nada", async () => {
    const estado = estadoBase({ countForzado: null });
    const { eliminarImpulsadora } = await cargarLib(estado);

    await expect(eliminarImpulsadora("imp-1")).rejects.toThrow(
      /no se pudo verificar/i,
    );
    expect(estado.ops).toHaveLength(0);
    expect(estado.impulsadoras).toHaveLength(1);
  });
});

// ── 3. La lista no muestra las ocultas ───────────────────────────────────────

describe("listImpulsadoras — las eliminadas no vuelven a aparecer", () => {
  it("filtra activa=false y expone pagosRegistrados", async () => {
    const estado = estadoBase({
      impulsadoras: [
        impulsadora({ id: "imp-1", nombre: "Ana Prueba", activa: true }),
        impulsadora({ id: "imp-2", nombre: "Zoe Oculta", activa: false }),
      ],
      facturas: [
        {
          impulsadora_id: "imp-1",
          impulsadora_mes: "2026-07-01",
          periodo_desde: "2026-07-01",
          periodo_hasta: "2026-07-15",
        },
      ],
      splits: [
        { impulsadora_id: "imp-1", marca_id: "marca-1", porcentaje: 100 },
        { impulsadora_id: "imp-2", marca_id: "marca-1", porcentaje: 100 },
      ],
    });
    const { listImpulsadoras } = await cargarLib(estado);

    const lista = await listImpulsadoras();

    expect(lista.map((i) => i.nombre)).toEqual(["Ana Prueba"]);
    expect(lista[0].pagosRegistrados).toBe(1);
  });
});

// ── 4. El endpoint: mismo guard de roles que el resto de Marketing ───────────

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-impulsadora-eliminar";
});
afterAll(() => {
  process.env.SESSION_SECRET = SECRET_PREV;
});

const ID_OK = "11111111-2222-4333-8444-555555555555";

async function cargarRuta(): Promise<{
  DELETE: (
    req: NextRequest,
    ctx: { params: { id: string } },
  ) => Promise<NextResponse>;
  llamadas: string[];
}> {
  const llamadas: string[] = [];
  vi.resetModules();
  vi.doMock("@/lib/marketing/impulsadoras", () => ({
    eliminarImpulsadora: async (id: string) => {
      llamadas.push(id);
      return { accion: "eliminada", nombre: "Ana Prueba" };
    },
  }));
  vi.doMock("@/lib/log-activity", () => ({ logActivity: async () => {} }));
  const mod = await import("@/app/api/marketing/impulsadoras/[id]/route");
  return { DELETE: mod.DELETE as never, llamadas };
}

async function pedir(
  role: string | null,
  id = ID_OK,
): Promise<{ status: number; llamadas: string[] }> {
  const { DELETE, llamadas } = await cargarRuta();
  const { signSession } = await import("@/lib/session-cookie");
  const headers: Record<string, string> = {};
  if (role) {
    const cookie = signSession({
      role,
      userId: "u1",
      userName: "test",
      sessionToken: "t1",
    });
    headers.cookie = `cxc_session=${cookie}`;
  }
  const req = new NextRequest(
    `https://fashiongr.com/api/marketing/impulsadoras/${id}`,
    { method: "DELETE", headers },
  );
  const res = await DELETE(req, { params: { id } });
  return { status: res.status, llamadas };
}

describe("DELETE /api/marketing/impulsadoras/[id] — permisos", () => {
  it("sin sesión → 401 y no toca la base", async () => {
    const { status, llamadas } = await pedir(null);
    expect(status).toBe(401);
    expect(llamadas).toEqual([]);
  });

  for (const rol of ["bodega", "contabilidad", "vendedor", "gerente_acs"]) {
    it(`${rol} → 403 y no toca la base`, async () => {
      const { status, llamadas } = await pedir(rol);
      expect(status).toBe(403);
      expect(llamadas).toEqual([]);
    });
  }

  for (const rol of ["admin", "secretaria"]) {
    it(`${rol} → 200 (mismo guard que el resto de Marketing)`, async () => {
      const { status, llamadas } = await pedir(rol);
      expect(status).toBe(200);
      expect(llamadas).toEqual([ID_OK]);
    });
  }

  it("un id que no es UUID → 400 antes de tocar la base", async () => {
    const { status, llamadas } = await pedir("admin", "no-es-uuid");
    expect(status).toBe(400);
    expect(llamadas).toEqual([]);
  });
});
