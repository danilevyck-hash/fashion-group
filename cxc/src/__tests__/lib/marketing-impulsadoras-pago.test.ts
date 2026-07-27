// ============================================================================
// Marketing — registrarPagoImpulsadora con período trabajado (quincenas)
// ============================================================================
// El cambio de "un pago por mes" a "un pago por rango de días" toca plata: si
// el anti-duplicado queda flojo se paga dos veces, y si queda duro no se puede
// cargar la 2ª quincena. Estos tests fijan las dos puntas contra la función
// real, con Supabase simulado.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

// ── Supabase simulado ────────────────────────────────────────────────────────

interface FacturaFila {
  impulsadora_id: string;
  impulsadora_mes: string | null;
  periodo_desde?: string | null;
  periodo_hasta?: string | null;
}

interface EstadoDb {
  /** Pagos ya registrados que devuelve mk_facturas. */
  facturas: FacturaFila[];
  /** false = migración 20260727140000 SIN correr (columnas ausentes). */
  columnasPeriodo: boolean;
  /** Inserts capturados por tabla. */
  inserts: Record<string, Record<string, unknown>[]>;
}

const ERROR_COL = {
  code: "42703",
  message: 'column mk_facturas.periodo_desde does not exist',
};

function makeDb(estado: EstadoDb) {
  return {
    from(tabla: string) {
      let cols = "";
      const builder: Record<string, unknown> = {};
      const chain = () => builder;

      const resolver = () => {
        if (tabla === "mk_facturas") {
          if (/periodo_desde|periodo_hasta/.test(cols) && !estado.columnasPeriodo) {
            return { data: null, error: ERROR_COL };
          }
          return { data: estado.facturas, error: null };
        }
        if (tabla === "mk_impulsadora_marcas") {
          return {
            data: [{ impulsadora_id: "imp-1", marca_id: "marca-1", porcentaje: 100 }],
            error: null,
          };
        }
        return { data: [], error: null };
      };

      Object.assign(builder, {
        select: (c?: string) => {
          cols = c ?? "";
          return chain();
        },
        in: chain,
        is: chain,
        eq: chain,
        not: chain,
        gte: chain,
        lte: chain,
        limit: chain,
        order: chain,
        delete: chain,
        insert: (fila: Record<string, unknown>) => {
          (estado.inserts[tabla] ??= []).push(fila);
          return {
            select: () => ({
              single: async () => ({ data: { id: `id-${(estado.inserts[tabla] ?? []).length}` }, error: null }),
            }),
            then: (res: (v: unknown) => unknown) => res({ data: null, error: null }),
          };
        },
        maybeSingle: async () =>
          tabla === "mk_impulsadoras"
            ? { data: { id: "imp-1", nombre: "Ana Pérez" }, error: null }
            : { data: null, error: null },
        single: async () => resolver(),
        // Awaitable: `await supabaseServer.from(...).select(...).in(...)`
        then: (res: (v: unknown) => unknown) => res(resolver()),
      });
      return builder;
    },
  };
}

const comprobante = {
  path: "marketing/comprobantes/x.pdf",
  tipo: "pdf_factura" as const,
  nombreOriginal: "x.pdf",
  sizeBytes: 1234,
};

/** Carga la lib con un estado de DB fresco (resetea el cache de columnas). */
async function cargarLib(estado: EstadoDb) {
  vi.resetModules();
  vi.doMock("@/lib/supabase-server", () => ({
    supabaseServer: makeDb(estado),
    HAS_SERVICE_ROLE: true,
  }));
  vi.doMock("@/lib/marketing/queries", () => ({
    getMarcas: async () => [
      { id: "marca-1", nombre: "Tommy Hilfiger", codigo: "TH", empresa_codigo: "vistana", activo: true },
    ],
  }));
  return import("@/lib/marketing/impulsadoras");
}

function estadoBase(over: Partial<EstadoDb> = {}): EstadoDb {
  return { facturas: [], columnasPeriodo: true, inserts: {}, ...over };
}

beforeEach(() => {
  vi.resetModules();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("registrarPagoImpulsadora — quincenas", () => {
  it("guarda una quincena con su rango y deriva impulsadora_mes del inicio", async () => {
    const estado = estadoBase();
    const { registrarPagoImpulsadora } = await cargarLib(estado);

    const res = await registrarPagoImpulsadora("imp-1", {
      desde: "2026-07-01",
      hasta: "2026-07-15",
      monto: 400,
      comprobante,
    });

    expect(res.facturasCreadas).toBe(1);
    const f = estado.inserts["mk_facturas"][0];
    expect(f.periodo_desde).toBe("2026-07-01");
    expect(f.periodo_hasta).toBe("2026-07-15");
    // impulsadora_mes se sigue guardando → los reportes por año no cambian.
    expect(f.impulsadora_mes).toBe("2026-07-01");
    expect(f.concepto).toBe("Impulsadora Ana Pérez — 1–15 de julio 2026");
    expect(f.numero_factura).toBe("IMP-2026-07-01");
  });

  it("PERMITE un segundo pago en el mismo mes (2ª quincena)", async () => {
    const estado = estadoBase({
      facturas: [
        {
          impulsadora_id: "imp-1",
          impulsadora_mes: "2026-07-01",
          periodo_desde: "2026-07-01",
          periodo_hasta: "2026-07-15",
        },
      ],
    });
    const { registrarPagoImpulsadora } = await cargarLib(estado);

    const res = await registrarPagoImpulsadora("imp-1", {
      desde: "2026-07-16",
      hasta: "2026-07-31",
      monto: 400,
      comprobante,
    });

    expect(res.facturasCreadas).toBe(1);
    expect(estado.inserts["mk_facturas"][0].periodo_desde).toBe("2026-07-16");
  });

  it("RECHAZA un pago que pisa días ya pagados", async () => {
    const estado = estadoBase({
      facturas: [
        {
          impulsadora_id: "imp-1",
          impulsadora_mes: "2026-07-01",
          periodo_desde: "2026-07-01",
          periodo_hasta: "2026-07-15",
        },
      ],
    });
    const { registrarPagoImpulsadora } = await cargarLib(estado);

    await expect(
      registrarPagoImpulsadora("imp-1", {
        desde: "2026-07-10",
        hasta: "2026-07-20",
        monto: 400,
        comprobante,
      }),
    ).rejects.toThrow(/Ya hay un pago registrado que cubre esos días \(1–15 de julio 2026\)/);
    expect(estado.inserts["mk_facturas"]).toBeUndefined();
  });

  it("un pago MENSUAL VIEJO (sin rango) sigue bloqueando el mes entero", async () => {
    const estado = estadoBase({
      facturas: [{ impulsadora_id: "imp-1", impulsadora_mes: "2026-07-01" }],
    });
    const { registrarPagoImpulsadora } = await cargarLib(estado);

    await expect(
      registrarPagoImpulsadora("imp-1", {
        desde: "2026-07-16",
        hasta: "2026-07-31",
        monto: 400,
        comprobante,
      }),
    ).rejects.toThrow(/Julio 2026/);
  });

  it("un pago mensual viejo NO estorba al mes siguiente", async () => {
    const estado = estadoBase({
      facturas: [{ impulsadora_id: "imp-1", impulsadora_mes: "2026-06-01" }],
    });
    const { registrarPagoImpulsadora } = await cargarLib(estado);

    const res = await registrarPagoImpulsadora("imp-1", {
      desde: "2026-07-01",
      hasta: "2026-07-15",
      monto: 400,
      comprobante,
    });
    expect(res.facturasCreadas).toBe(1);
  });

  it("rechaza 'hasta' anterior a 'desde' sin tocar la base", async () => {
    const estado = estadoBase();
    const { registrarPagoImpulsadora } = await cargarLib(estado);

    await expect(
      registrarPagoImpulsadora("imp-1", {
        desde: "2026-07-15",
        hasta: "2026-07-01",
        monto: 400,
        comprobante,
      }),
    ).rejects.toThrow("La fecha final no puede ser anterior a la inicial.");
    expect(estado.inserts["mk_facturas"]).toBeUndefined();
  });

  it("sigue exigiendo comprobante", async () => {
    const estado = estadoBase();
    const { registrarPagoImpulsadora } = await cargarLib(estado);
    await expect(
      registrarPagoImpulsadora("imp-1", {
        desde: "2026-07-01",
        hasta: "2026-07-15",
        monto: 400,
        comprobante: { path: "", tipo: "pdf_factura" },
      }),
    ).rejects.toThrow("El comprobante es obligatorio");
  });

  it("SIN la migración corrida: guarda igual, sin las columnas nuevas", async () => {
    const estado = estadoBase({ columnasPeriodo: false });
    const { registrarPagoImpulsadora } = await cargarLib(estado);

    const res = await registrarPagoImpulsadora("imp-1", {
      desde: "2026-07-01",
      hasta: "2026-07-15",
      monto: 400,
      comprobante,
    });

    expect(res.facturasCreadas).toBe(1);
    const f = estado.inserts["mk_facturas"][0];
    expect(f.periodo_desde).toBeUndefined();
    expect(f.impulsadora_mes).toBe("2026-07-01");
    // El período no se pierde: queda escrito en el concepto del gasto.
    expect(f.concepto).toBe("Impulsadora Ana Pérez — 1–15 de julio 2026");
  });
});

describe("listImpulsadoras — chips con meses a medias", () => {
  it("un mes con una sola quincena queda 'parcial' y dice qué falta", async () => {
    const estado = estadoBase({
      facturas: [
        {
          impulsadora_id: "imp-1",
          impulsadora_mes: "2026-07-01",
          periodo_desde: "2026-07-01",
          periodo_hasta: "2026-07-15",
        },
      ],
    });
    vi.resetModules();
    vi.doMock("@/lib/supabase-server", () => ({
      supabaseServer: {
        from: (tabla: string) => {
          if (tabla === "mk_impulsadoras") {
            return {
              select: () => ({
                order: () => ({
                  order: () => ({
                    then: (res: (v: unknown) => unknown) =>
                      res({
                        data: [
                          {
                            id: "imp-1",
                            nombre: "Ana Pérez",
                            monto_mensual: 800,
                            activa: true,
                            created_at: "",
                            updated_at: "",
                          },
                        ],
                        error: null,
                      }),
                  }),
                }),
              }),
            };
          }
          return makeDb(estado).from(tabla);
        },
      },
      HAS_SERVICE_ROLE: true,
    }));
    vi.doMock("@/lib/marketing/queries", () => ({
      getMarcas: async () => [
        { id: "marca-1", nombre: "Tommy Hilfiger", codigo: "TH", empresa_codigo: "vistana", activo: true },
      ],
    }));
    vi.doMock("@/lib/marketing/meses", async (orig) => {
      const real = (await orig()) as Record<string, unknown>;
      return { ...real, mesActualISO: () => "2026-07-01", mesAnteriorISO: () => "2026-06-01" };
    });

    const { listImpulsadoras } = await import("@/lib/marketing/impulsadoras");
    const [imp] = await listImpulsadoras();

    expect(imp.mesActual.estado).toBe("parcial");
    expect(imp.mesActual.faltan).toBe("16–31");
    expect(imp.mesActual.pagado).toBe(false);
    expect(imp.mesAnterior.estado).toBe("pendiente");
    expect(imp.ultimosPeriodos).toEqual(["1–15 jul 2026"]);
  });
});
