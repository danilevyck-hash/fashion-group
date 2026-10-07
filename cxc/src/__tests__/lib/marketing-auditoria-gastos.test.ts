// ============================================================================
// Marketing — quién tocó un gasto, cuándo y qué cambió
// ============================================================================
// La factura 0000000142 apareció editada y no se pudo saber quién: el PATCH
// de `mk_facturas` no dejaba rastro en ningún lado, y `mk_entregas_muebles`
// (mobiliario) tampoco. Estos candados fijan que CREAR · EDITAR · BORRAR de
// las dos tablas quedan en `activity_logs` (vía `logAudit`, el mecanismo que
// ya existía para Proyectos) con quién, cuándo y el antes/después — y que la
// lectura (`getHistorialCambios` / `GET /api/marketing/historial`) los
// devuelve del más nuevo al más viejo, con el guard de roles del módulo.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SESSION_SECRET ||= "test-secret-auditoria-gastos";
});

const ID = "11111111-2222-4333-8444-555555555555";

async function cookieDe(role: string, userName = "Ángela"): Promise<string> {
  const { signSession } = await import("@/lib/session-cookie");
  return signSession({ role, userId: "u1", userName, sessionToken: "t1" });
}

beforeEach(() => {
  vi.resetModules();
});

// ── 1. Crear una factura deja rastro ────────────────────────────────────────

describe("POST /api/marketing/facturas — queda registrado quién creó el gasto", () => {
  it("logAudit se llama con action create, la fila creada y quién fue", async () => {
    const facturaCreada = {
      id: "f-1",
      numero_factura: "0000000142",
      proveedor: "Proveedor Prueba",
      total: 100,
    };
    const logAudit = vi.fn(async () => {});
    vi.doMock("@/lib/marketing/audit", () => ({ logAudit }));
    vi.doMock("@/lib/marketing/mutations", () => ({
      createFactura: vi.fn(async () => facturaCreada),
      anularFactura: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/marketing/factura-marcas", () => ({
      setMarcasDeFactura: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/log-activity", () => ({ logActivity: vi.fn(async () => {}) }));

    const { POST } = await import("@/app/api/marketing/facturas/route");
    const cookie = await cookieDe("secretaria", "Ángela");
    const r = new NextRequest("http://localhost/api/marketing/facturas", {
      method: "POST",
      headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
      body: JSON.stringify({
        numeroFactura: "0000000142",
        fechaFactura: "2026-10-07",
        proveedor: "Proveedor Prueba",
        concepto: "Material POP",
        subtotal: 100,
      }),
    });

    const res = await POST(r);
    expect(res.status).toBe(200);
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create",
        entityType: "mk_facturas",
        entityId: "f-1",
        userRole: "secretaria",
        userName: "Ángela",
        after: facturaCreada,
      }),
    );
  });
});

// ── 2. Editar una factura deja el antes y el después ────────────────────────

describe("PATCH /api/marketing/facturas/[id] — el bug de la factura 0000000142", () => {
  it("logAudit se llama con action update, con before y after", async () => {
    const before = { id: ID, numero_factura: "0000000142", proveedor: "Antes SA", total: 100 };
    const after = { id: ID, numero_factura: "0000000142", proveedor: "Después SA", total: 100 };
    const logAudit = vi.fn(async () => {});
    vi.doMock("@/lib/marketing/audit", () => ({ logAudit }));
    vi.doMock("@/lib/marketing/queries", () => ({
      getFacturaById: vi.fn(async () => before),
    }));
    vi.doMock("@/lib/marketing/mutations", () => ({
      updateFactura: vi.fn(async () => after),
    }));
    vi.doMock("@/lib/marketing/storage", () => ({
      firmarAdjuntos: vi.fn(async () => []),
    }));

    const { PATCH } = await import("@/app/api/marketing/facturas/[id]/route");
    const cookie = await cookieDe("admin", "Daniel");
    const r = new NextRequest(`http://localhost/api/marketing/facturas/${ID}`, {
      method: "PATCH",
      headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
      body: JSON.stringify({ proveedor: "Después SA" }),
    });

    const res = await PATCH(r, { params: { id: ID } });
    expect(res.status).toBe(200);
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "update",
        entityType: "mk_facturas",
        entityId: ID,
        userRole: "admin",
        userName: "Daniel",
        before,
        after,
      }),
    );
  });
});

// ── 3. Anular (= borrar) una factura también queda registrado ──────────────

describe("POST /api/marketing/facturas/[id]/anular — el borrado deja rastro", () => {
  it("logAudit se llama con action delete, before/after y el motivo", async () => {
    const before = { id: ID, numero_factura: "0000000142", anulado_en: null };
    const after = { id: ID, numero_factura: "0000000142", anulado_en: "2026-10-07T10:29:00Z" };
    const logAudit = vi.fn(async () => {});
    const getFacturaById = vi.fn();
    getFacturaById.mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    vi.doMock("@/lib/marketing/audit", () => ({ logAudit }));
    vi.doMock("@/lib/marketing/queries", () => ({ getFacturaById }));
    vi.doMock("@/lib/marketing/mutations", () => ({
      anularFactura: vi.fn(async () => {}),
    }));

    const { POST } = await import("@/app/api/marketing/facturas/[id]/anular/route");
    const cookie = await cookieDe("secretaria", "Ángela");
    const r = new NextRequest(`http://localhost/api/marketing/facturas/${ID}/anular`, {
      method: "POST",
      headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
      body: JSON.stringify({ motivo: "Duplicada por error" }),
    });

    const res = await POST(r, { params: { id: ID } });
    expect(res.status).toBe(200);
    expect(getFacturaById).toHaveBeenCalledTimes(2);
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delete",
        entityType: "mk_facturas",
        entityId: ID,
        before,
        after,
        extra: { motivo: "Duplicada por error" },
      }),
    );
  });
});

// ── 4. Crear una entrega de muebles deja rastro ─────────────────────────────

describe("POST /api/marketing/inventario/entregas — mobiliario también registra", () => {
  it("logAudit se llama con action create", async () => {
    const entregaCreada = { id: "e-1", total: 50, items: [] };
    const logAudit = vi.fn(async () => {});
    vi.doMock("@/lib/marketing/audit", () => ({ logAudit }));
    vi.doMock("@/lib/marketing/inventario", () => ({
      createEntrega: vi.fn(async () => entregaCreada),
      listAllEntregas: vi.fn(async () => []),
      listEntregasByProyecto: vi.fn(async () => []),
      listEntregasPendientes: vi.fn(async () => []),
    }));

    const { POST } = await import("@/app/api/marketing/inventario/entregas/route");
    const cookie = await cookieDe("secretaria", "Ángela");
    const r = new NextRequest("http://localhost/api/marketing/inventario/entregas", {
      method: "POST",
      headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
      body: JSON.stringify({ items: [{ productoId: "p1", cantidad: 1 }] }),
    });

    const res = await POST(r);
    expect(res.status).toBe(200);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create",
        entityType: "mk_entregas_muebles",
        entityId: "e-1",
        after: entregaCreada,
      }),
    );
  });
});

// ── 5. Editar una entrega deja el antes y el después ────────────────────────

describe("PATCH /api/marketing/inventario/entregas/[id]", () => {
  it("logAudit se llama con action update, con before y after", async () => {
    const before = { id: ID, total: 50, items: [] };
    const after = { id: ID, total: 80, items: [] };
    const logAudit = vi.fn(async () => {});
    vi.doMock("@/lib/marketing/audit", () => ({ logAudit }));
    vi.doMock("@/lib/marketing/inventario", () => ({
      getEntregaById: vi.fn(async () => before),
      updateEntrega: vi.fn(async () => after),
      deleteEntrega: vi.fn(async () => {}),
    }));

    const { PATCH } = await import(
      "@/app/api/marketing/inventario/entregas/[id]/route"
    );
    const cookie = await cookieDe("admin", "Daniel");
    const r = new NextRequest(`http://localhost/api/marketing/inventario/entregas/${ID}`, {
      method: "PATCH",
      headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
      body: JSON.stringify({ items: [{ productoId: "p1", cantidad: 2 }] }),
    });

    const res = await PATCH(r, { params: { id: ID } });
    expect(res.status).toBe(200);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "update",
        entityType: "mk_entregas_muebles",
        entityId: ID,
        before,
        after,
      }),
    );
  });
});

// ── 6. Borrar una entrega (hard delete) deja el antes, aunque la fila se vaya ─

describe("DELETE /api/marketing/inventario/entregas/[id]", () => {
  it("logAudit se llama con action delete_definitivo y before, after null", async () => {
    const before = { id: ID, total: 50, items: [] };
    const logAudit = vi.fn(async () => {});
    vi.doMock("@/lib/marketing/audit", () => ({ logAudit }));
    vi.doMock("@/lib/marketing/inventario", () => ({
      getEntregaById: vi.fn(async () => before),
      deleteEntrega: vi.fn(async () => {}),
    }));

    const { DELETE } = await import(
      "@/app/api/marketing/inventario/entregas/[id]/route"
    );
    const cookie = await cookieDe("admin", "Daniel");
    const r = new NextRequest(`http://localhost/api/marketing/inventario/entregas/${ID}`, {
      method: "DELETE",
      headers: { cookie: `cxc_session=${cookie}` },
    });

    const res = await DELETE(r, { params: { id: ID } });
    expect(res.status).toBe(200);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delete_definitivo",
        entityType: "mk_entregas_muebles",
        entityId: ID,
        before,
        after: null,
      }),
    );
  });
});

// ── 7. Leer el historial: más nuevo primero, con quién y el antes/después ──

describe("getHistorialCambios", () => {
  it("lee activity_logs por entity_type + entity_id y devuelve el más nuevo primero", async () => {
    const filas = [
      {
        id: "log-2",
        action: "update",
        user_role: "secretaria",
        details: JSON.stringify({ user_name: "Ángela", before: { total: 100 }, after: { total: 120 } }),
        created_at: "2026-10-07T10:29:00Z",
      },
      {
        id: "log-1",
        action: "create",
        user_role: "secretaria",
        details: JSON.stringify({ user_name: "Ángela", after: { total: 100 } }),
        created_at: "2026-10-01T09:00:00Z",
      },
    ];
    vi.doMock("@/lib/supabase-server", () => ({
      supabaseServer: {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({ data: filas, error: null }),
                }),
              }),
            }),
          }),
        }),
      },
    }));

    const { getHistorialCambios } = await import("@/lib/marketing/historial");
    const cambios = await getHistorialCambios("mk_facturas", "f-1");

    expect(cambios).toHaveLength(2);
    expect(cambios[0]).toMatchObject({
      id: "log-2",
      action: "update",
      userName: "Ángela",
      before: { total: 100 },
      after: { total: 120 },
    });
    expect(cambios[1]).toMatchObject({ id: "log-1", action: "create" });
  });
});

// ── 8. La ruta de lectura respeta el guard de roles del módulo ─────────────

describe("GET /api/marketing/historial — permisos", () => {
  async function cargarRuta() {
    vi.doMock("@/lib/marketing/historial", () => ({
      getHistorialCambios: vi.fn(async () => []),
    }));
    return import("@/app/api/marketing/historial/route");
  }

  it("sin sesión → 401", async () => {
    const { GET } = await cargarRuta();
    const r = new NextRequest(
      `http://localhost/api/marketing/historial?entityType=mk_facturas&entityId=${ID}`,
    );
    const res = await GET(r);
    expect(res.status).toBe(401);
  });

  for (const rol of ["bodega", "vendedor"]) {
    it(`${rol} (no ve Marketing) → 403`, async () => {
      const { GET } = await cargarRuta();
      const cookie = await cookieDe(rol);
      const r = new NextRequest(
        `http://localhost/api/marketing/historial?entityType=mk_facturas&entityId=${ID}`,
        { headers: { cookie: `cxc_session=${cookie}` } },
      );
      const res = await GET(r);
      expect(res.status).toBe(403);
    });
  }

  for (const rol of ["admin", "secretaria", "contabilidad"]) {
    it(`${rol} (ve Marketing, aunque sea solo a mirar) → 200`, async () => {
      const { GET } = await cargarRuta();
      const cookie = await cookieDe(rol);
      const r = new NextRequest(
        `http://localhost/api/marketing/historial?entityType=mk_facturas&entityId=${ID}`,
        { headers: { cookie: `cxc_session=${cookie}` } },
      );
      const res = await GET(r);
      expect(res.status).toBe(200);
    });
  }

  it("un entityType que no existe → 400", async () => {
    const { GET } = await cargarRuta();
    const cookie = await cookieDe("admin");
    const r = new NextRequest(
      `http://localhost/api/marketing/historial?entityType=tabla_inventada&entityId=${ID}`,
      { headers: { cookie: `cxc_session=${cookie}` } },
    );
    const res = await GET(r);
    expect(res.status).toBe(400);
  });

  it("un entityId que no es UUID → 400", async () => {
    const { GET } = await cargarRuta();
    const cookie = await cookieDe("admin");
    const r = new NextRequest(
      `http://localhost/api/marketing/historial?entityType=mk_facturas&entityId=no-es-uuid`,
      { headers: { cookie: `cxc_session=${cookie}` } },
    );
    const res = await GET(r);
    expect(res.status).toBe(400);
  });
});
