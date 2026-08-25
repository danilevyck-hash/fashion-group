// ─────────────────────────────────────────────────────────────────────────────
// Candados de la CARTERA DE BOSTON leída del reporte WEB del panel.
//
// Contexto: `syncEmpresaEstadoCuenta` hace una llamada HTTP por cliente y Boston
// tiene 4.912 → 54 min medidos contra un techo de función de 800 s. Moría
// siempre y la cartera quedó congelada desde el 28-jul-2026. El reporte de
// antigüedad trae los mismos documentos en 2 llamadas.
//
// Lo que estos tests protegen, en orden de cuánto duele que se rompa:
//
//   A. EL SIGNO. El reporte web manda el saldo YA FIRMADO (Recibos en negativo)
//      y la vista le vuelve a aplicar su propio signo. Copiarlo tal cual hace
//      que los Recibos SUMEN, y el error es exactamente el DOBLE de lo que
//      debía restarse. Se prueba con las cifras reales del 30-jul-2026.
//   B. EL RECONCILE. Un cliente que dejó de deber queda en 0; uno que sigue
//      debiendo no se toca; y un reporte vacío no puede poner la cartera entera
//      en cero.
//   C. EL GRUPO NO SE MUEVE. Todo lo que escribe este camino va acotado a
//      `confecciones_boston`, y la vista del grupo la excluye.
//   D. LA LLAVE. `ccte_id` sintético: determinista, dentro de un `int` y
//      disjunto por construcción de los ccteId reales del API.
//
// El fixture `boston-cartera-web.json` es una MUESTRA REAL del reporte de
// producción (7 clientes / 20 documentos, los 5 tipos de comprobante que Boston
// usa hoy y los 3 tramos), no datos inventados.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

// ─── Doble de Supabase: registra la cadena de cada consulta ──────────────────
interface Llamada {
  tabla: string;
  op: "upsert" | "update";
  filtros: Array<[string, string, unknown]>;
  filas?: unknown[];
  parche?: Record<string, unknown>;
  onConflict?: string;
}
const llamadas: Llamada[] = [];
/** Filas que el `update` del reconcile dice haber tocado. */
let reconcileDevuelve: unknown[] = [];
let upsertFalla: string | null = null;

function nuevaQuery(tabla: string, op: "upsert" | "update", extra: Partial<Llamada>) {
  const registro: Llamada = { tabla, op, filtros: [], ...extra };
  llamadas.push(registro);
  const q: Record<string, unknown> = {};
  for (const m of ["eq", "lt", "neq", "gt", "not", "in"]) {
    q[m] = (...args: unknown[]) => {
      registro.filtros.push([m, String(args[0]), args[1]]);
      return q;
    };
  }
  q.select = () => Promise.resolve({ data: reconcileDevuelve, error: null });
  // Un upsert sin `.select()` se espera directo.
  (q as { then: unknown }).then = (res: (v: unknown) => unknown) =>
    res(upsertFalla && op === "upsert" ? { error: { message: upsertFalla } } : { data: null, error: null });
  return q;
}

/**
 * Clientes con saldo que la tabla "ya conoce" — la vara del guard del reporte
 * incompleto. Por defecto NINGUNO, que es el caso de la primera carga: sin vara
 * el guard deja pasar, así que los tests que no hablan de él no se enteran.
 */
let clientesConocidosMock: Array<{ cliente_switch_id: number }> = [];

/** La LECTURA del guard: `.select().eq().neq().range()` y se espera. */
function nuevaLectura() {
  const q: Record<string, unknown> = {};
  for (const m of ["eq", "neq", "lt", "gt", "not", "in"]) q[m] = () => q;
  q.range = (desde: number) =>
    Promise.resolve({ data: desde === 0 ? clientesConocidosMock : [], error: null });
  return q;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (tabla: string) => ({
      upsert: (filas: unknown[], opts?: { onConflict?: string }) =>
        nuevaQuery(tabla, "upsert", { filas, onConflict: opts?.onConflict }),
      update: (parche: Record<string, unknown>) => nuevaQuery(tabla, "update", { parche }),
      select: () => nuevaLectura(),
    }),
  },
}));
vi.mock("@/lib/switch-api/sync-log", async (orig) => {
  const real = await (orig() as Promise<Record<string, unknown>>);
  return { ...real, createSwitchSyncLog: vi.fn(async () => "log-1"), finishSwitchSyncLog: vi.fn(async () => {}) };
});
vi.mock("@/lib/switch-api/web-client", () => ({
  loginSwitchWeb: vi.fn(async () => ({ empresaKey: "confecciones_boston", baseUrl: "x", cookies: new Map() })),
  fetchCarteraAntiguedad: vi.fn(),
  cerrarSesionWeb: vi.fn(async () => {}),
}));

import {
  SIGNO_TIPO_COMPROBANTE,
  signoDeTipo,
  saldoParaGuardar,
  saldoSegunLaVista,
  ccteIdSintetico,
  construirFilas,
  tramosPublicadosPorSwitch,
  parseFechaReporte,
  CarteraWebError,
  CCTE_ID_MAX,
  CCTE_SERIE_FACTOR,
  type ClienteReporteWeb,
} from "@/lib/switch-api/estadocuenta-web";
import { syncCarteraWeb, cuadraConSwitch, EMPRESA_CARTERA_WEB } from "@/lib/switch-api/sync-estadocuenta-web";
import type { CarteraAntiguedad } from "@/lib/switch-api/web-client";

const FIXTURE: { clientes: ClienteReporteWeb[]; saldosTotales: Array<{ title: string; saldo: number }> } =
  JSON.parse(fs.readFileSync(path.resolve(__dirname, "../fixtures/boston-cartera-web.json"), "utf8"));

const MIGRACION = fs.readFileSync(
  path.resolve(__dirname, "../../../supabase/migrations/20260728120000_aging_grupo_y_boston_aparte.sql"),
  "utf8",
);

const reporte = (
  clientes: ClienteReporteWeb[],
  saldosTotales: Array<{ title: string; saldo: number }>,
): CarteraAntiguedad => ({
  clientes: clientes as unknown as Record<string, unknown>[],
  saldosTotales,
  saldoTotalGlobal: 0,
  recordsTotal: clientes.length,
  fechaReporte: "30-07-2026",
  rondas: 2,
});

beforeEach(() => {
  llamadas.length = 0;
  reconcileDevuelve = [];
  upsertFalla = null;
  clientesConocidosMock = [];
});

// ═════════════════════════════════════════════════════════════════════════════
describe("A. el SIGNO — el error que da exactamente el doble", () => {
  // Cifras REALES del reporte del 30-jul-2026 (924 documentos, 400 clientes).
  const TOTAL_CORRECTO = 225801.89;
  const TOTAL_COPIANDO_EL_SALDO_TAL_CUAL = 343530.77;
  const ABS_RECIBOS = 58864.44;

  it("la diferencia de copiar el saldo tal cual es el DOBLE de los recibos", () => {
    const diferencia = TOTAL_COPIANDO_EL_SALDO_TAL_CUAL - TOTAL_CORRECTO;
    expect(diferencia).toBeCloseTo(2 * ABS_RECIBOS, 2);
    expect(diferencia).toBeCloseTo(117728.88, 2);
  });

  it("un Recibo negativo del reporte se guarda positivo y la vista lo RESTA", () => {
    // Así viene de Switch: el recibo ya trae el signo puesto.
    const saldoReporte = -1500.25;
    const guardado = saldoParaGuardar("Recibo", saldoReporte);
    expect(guardado).toBe(1500.25); // magnitud, igual que lo que guarda el API
    expect(saldoSegunLaVista("Recibo", guardado)).toBe(saldoReporte); // vuelve a restar
  });

  it("copiar el saldo tal cual haría que el Recibo SUME (el bug)", () => {
    const saldoReporte = -1500.25;
    expect(saldoSegunLaVista("Recibo", saldoReporte)).toBe(1500.25);
    // Y el error contra la verdad es el doble del recibo.
    expect(saldoSegunLaVista("Recibo", saldoReporte) - saldoReporte).toBe(2 * 1500.25);
  });

  it("round-trip EXACTO para todos los tipos, resten o sumen", () => {
    for (const tipo of Object.keys(SIGNO_TIPO_COMPROBANTE)) {
      for (const saldoReporte of [1234.56, -1234.56, 0.01, -0.01, 0]) {
        const guardado = saldoParaGuardar(tipo, saldoReporte);
        expect(saldoSegunLaVista(tipo, guardado), `${tipo} / ${saldoReporte}`).toBe(saldoReporte);
      }
    }
  });

  it("los que RESTAN y los que SUMAN son los que dice el negocio", () => {
    for (const t of ["Nota de Crédito", "Recibo", "Recibo Saldo Anterior"]) {
      expect(signoDeTipo(t), `${t} debe restar`).toBe(-1);
    }
    for (const t of ["Factura", "Nota de Débito", "Saldo Anterior", "Transacción", "Tiquete"]) {
      expect(signoDeTipo(t), `${t} debe sumar`).toBe(1);
    }
  });

  it("la tabla de signos es ESPEJO del CASE de la vista de Boston", () => {
    // Una vista SQL no puede importar TypeScript: si las dos listas se separan,
    // la plata sale mal y nadie se entera. Se leen del propio archivo .sql.
    const bloque = MIGRACION.slice(
      MIGRACION.indexOf("CREATE OR REPLACE VIEW switch_estadocuenta_aging_boston"),
    );
    const listar = (re: RegExp) =>
      [...bloque.matchAll(re)]
        .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]))
        .sort();
    const esperado = (signo: -1 | 1) =>
      Object.keys(SIGNO_TIPO_COMPROBANTE).filter((t) => SIGNO_TIPO_COMPROBANTE[t] === signo).sort();

    expect(listar(/tipo_comprobante IN \(([^)]+)\)\s*\n?\s*THEN\s+-COALESCE/g)).toEqual(esperado(-1));
    expect(listar(/tipo_comprobante IN \(([^)]+)\)\s*\n?\s*THEN\s+COALESCE/g)).toEqual(esperado(1));
    // Y que el bloque leído sea de verdad el de Boston, no el del grupo.
    expect(bloque).toMatch(/empresa_key = 'confecciones_boston'/);
  });

  it("un tipo DESCONOCIDO no se adivina: aporta 0 y queda anotado", () => {
    expect(signoDeTipo("Vale de Caja")).toBe(0);
    expect(saldoSegunLaVista("Vale de Caja", 999)).toBe(0);
    const { skips, resumen } = construirFilas("confecciones_boston", [
      {
        clienteId: 1,
        codigo: "X",
        nombre: "X",
        elements: [
          { secuencial: "11-000000001", fechaCreacion: "2026-01-05", tipoComprobante: "Vale de Caja", saldo: 999, dias: 10 },
        ],
      },
    ]);
    expect(resumen.total).toBe(0);
    expect(skips.some((s) => s.campo === "tipo_comprobante_sin_signo")).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("A-bis. el parseo del reporte, con datos REALES de producción", () => {
  it("reproduce los tramos que publica el propio Switch, al centavo", () => {
    const { resumen } = construirFilas("confecciones_boston", FIXTURE.clientes);
    const publicado = tramosPublicadosPorSwitch(FIXTURE.saldosTotales);
    expect(resumen.total).toBe(publicado.total);
    expect(resumen.d0_90).toBe(publicado.d0_90);
    expect(resumen.d91_120).toBe(publicado.d91_120);
    expect(resumen.d121_plus).toBe(publicado.d121_plus);
    // Cifras medidas del subconjunto real.
    expect(resumen).toMatchObject({
      clientes: 7,
      documentos: 20,
      total: 12987.23,
      d0_90: 4038.99,
      d91_120: 1448.78,
      d121_plus: 7499.46,
    });
  });

  it("los 8 tramos de Switch se agrupan como los muestra la pestaña", () => {
    const p = tramosPublicadosPorSwitch([
      { title: "0-30", saldo: 1 },
      { title: "31-60", saldo: 2 },
      { title: "61-90", saldo: 4 },
      { title: "91-120", saldo: 8 },
      { title: "121-180", saldo: 16 },
      { title: "181-270", saldo: 32 },
      { title: "271-365", saldo: 64 },
      { title: "Mas de 365", saldo: 128 },
    ]);
    expect(p).toEqual({ d0_90: 7, d91_120: 8, d121_plus: 240, total: 255 });
  });

  it("la fila que se guarda tiene la forma de switch_estadocuenta", () => {
    const { filas } = construirFilas("confecciones_boston", FIXTURE.clientes);
    const f = filas[0];
    expect(Object.keys(f).sort()).toEqual(
      [
        "abrev", "ccte_id", "cliente_codigo", "cliente_nombre", "cliente_switch_id", "credito",
        "debito", "dias", "empresa_key", "fecha_creacion", "numero_fiscal", "plazo_credito",
        "raw_data", "saldo", "saldo_original", "secuencial", "tipo_comprobante", "total",
        "total_original",
      ].sort(),
    );
    expect(f.empresa_key).toBe("confecciones_boston");
    expect(f.fecha_creacion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("la fecha del reporte viene YYYY-MM-DD (el API usa DD-MM-YYYY) y se toleran las dos", () => {
    expect(parseFechaReporte("2026-05-20")).toBe("2026-05-20");
    expect(parseFechaReporte("20-05-2026")).toBe("2026-05-20");
    expect(parseFechaReporte(null)).toBeNull();
    expect(parseFechaReporte("basura")).toBeNull();
  });

  it("los tramos parten en 90 y en 120, como la vista", () => {
    const cli = (dias: number): ClienteReporteWeb => ({
      clienteId: dias,
      codigo: `C${dias}`,
      nombre: `C${dias}`,
      elements: [
        { secuencial: `11-00000${1000 + dias}`, fechaCreacion: "2026-01-05", tipoComprobante: "Factura", saldo: 100, dias },
      ],
    });
    const { resumen } = construirFilas("confecciones_boston", [cli(90), cli(91), cli(120), cli(121)]);
    expect(resumen.d0_90).toBe(100);
    expect(resumen.d91_120).toBe(200); // 91 y 120
    expect(resumen.d121_plus).toBe(100);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("D. la llave ccte_id sintética", () => {
  it("es determinista", () => {
    expect(ccteIdSintetico("11-000000076", "2026-07-23")).toEqual(
      ccteIdSintetico("11-000000076", "2026-07-23"),
    );
    // 11 · 26 · 00076 — se lee de corrido: serie, año, correlativo.
    expect(ccteIdSintetico("11-000000076", "2026-07-23")).toMatchObject({
      ok: true,
      ccteId: 112600076,
      serie: 11,
      anio: 2026,
      correlativo: 76,
    });
  });

  // ═══ 🔴 EL CASO QUE MOTIVÓ TODO — Switch reinició la numeración ═══════════
  it("el MISMO secuencial en años distintos son DOS documentos, no uno", () => {
    // Medido en producción el 25-ago-2026: 52 grupos así en confecciones_boston.
    //   11-000000009 → Factura 2022-10-14 $285,16  ·  Factura 2026-07-23 $271,25
    const a = ccteIdSintetico("11-000000009", "2022-10-14");
    const b = ccteIdSintetico("11-000000009", "2026-07-23");
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.ccteId).not.toBe(b.ccteId);
    expect(a.ccteId).toBe(112200009);
    expect(b.ccteId).toBe(112600009);
  });

  it("los dos SOBREVIVEN al armado: dos filas, no una pisando a la otra", () => {
    const { filas } = construirFilas("confecciones_boston", [
      {
        clienteId: 1,
        codigo: "A",
        nombre: "A",
        elements: [
          { secuencial: "11-000000009", fechaCreacion: "2022-10-14", tipoComprobante: "Factura", saldo: 285.16, dias: 1400 },
          { secuencial: "11-000000009", fechaCreacion: "2026-07-23", tipoComprobante: "Factura", saldo: 271.25, dias: 33 },
        ],
      },
    ]);
    expect(filas).toHaveLength(2);
    expect(new Set(filas.map((f) => f.ccte_id)).size).toBe(2);
    // Y la plata de los dos entra: 285,16 + 271,25.
    expect(filas.reduce((n, f) => n + (f.saldo ?? 0), 0)).toBeCloseTo(556.41, 2);
  });

  it("la fecha es OBLIGATORIA: sin ella no hay identidad y el documento se rechaza", () => {
    expect(ccteIdSintetico("11-000000009", null).ok).toBe(false);
    expect(ccteIdSintetico("11-000000009", "basura").ok).toBe(false);
    // Fuera de la ventana de 2 dígitos: 2100 daría el mismo id que 2000.
    expect(ccteIdSintetico("11-000000009", "2100-01-01").ok).toBe(false);
    expect(ccteIdSintetico("11-000000009", "1999-12-31").ok).toBe(false);
    expect(ccteIdSintetico("11-000000009", "2000-01-01")).toMatchObject({ ok: true, anio: 2000 });
    expect(ccteIdSintetico("11-000000009", "2099-12-31")).toMatchObject({ ok: true, anio: 2099 });
  });

  it("la identidad usa la MISMA fecha que la columna fecha_creacion", () => {
    // El API manda DD-MM-YYYY; el reporte, YYYY-MM-DD. Los dos tienen que dar
    // el mismo id y la misma columna, o la fila mentiría sobre sí misma.
    const { filas } = construirFilas("confecciones_boston", [
      {
        clienteId: 1,
        codigo: "A",
        nombre: "A",
        elements: [
          { secuencial: "11-000000009", fechaCreacion: "23-07-2026", tipoComprobante: "Factura", saldo: 10, dias: 5 },
        ],
      },
    ]);
    expect(filas[0].ccte_id).toBe(112600009);
    expect(filas[0].fecha_creacion).toBe("2026-07-23");
  });

  it("NO puede chocar con un ccte_id real del API", () => {
    // El ccte_id real más alto de TODA la tabla, medido el 30-jul-2026.
    const MAXIMO_REAL_MEDIDO = 16388;
    const { filas } = construirFilas("confecciones_boston", FIXTURE.clientes);
    for (const f of filas) {
      expect(f.ccte_id).toBeGreaterThan(MAXIMO_REAL_MEDIDO);
      // El mínimo que la fórmula puede producir es serie 1 × 10^7.
      expect(f.ccte_id).toBeGreaterThanOrEqual(CCTE_SERIE_FACTOR);
      expect(f.ccte_id).toBeLessThanOrEqual(CCTE_ID_MAX);
    }
  });

  it("entra siempre en un int de Postgres, incluso en el peor caso", () => {
    // El techo exacto: serie 200 · año 2099 · correlativo 99.999.
    const r = ccteIdSintetico("200-0099999", "2099-12-31");
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.ccteId).toBe(2_009_999_999);
      expect(r.ccteId).toBeLessThanOrEqual(CCTE_ID_MAX);
    }
  });

  it("RECHAZA en vez de desbordar cuando se sale de rango", () => {
    expect(ccteIdSintetico("201-000000001", "2026-01-01").ok).toBe(false); // serie fuera de rango
    expect(ccteIdSintetico("11-100000", "2026-01-01").ok).toBe(false); // correlativo de 6 dígitos
    expect(ccteIdSintetico("sin-guion-valido", "2026-01-01").ok).toBe(false);
    expect(ccteIdSintetico("", "2026-01-01").ok).toBe(false);
    expect(ccteIdSintetico(null, "2026-01-01").ok).toBe(false);
  });

  it("un documento que no se puede mapear se OMITE con su motivo, sin tumbar la corrida", () => {
    const { filas, skips } = construirFilas("confecciones_boston", [
      {
        clienteId: 1,
        codigo: "A",
        nombre: "A",
        elements: [
          { secuencial: "11-000000001", fechaCreacion: "2026-01-05", tipoComprobante: "Factura", saldo: 10, dias: 5 },
          { secuencial: "999-000000001", fechaCreacion: "2026-01-05", tipoComprobante: "Factura", saldo: 99, dias: 5 },
        ],
      },
    ]);
    expect(filas).toHaveLength(1);
    expect(skips.some((s) => s.campo === "ccte_id_sintetico")).toBe(true);
  });

  it("una COLISIÓN corta la corrida entera (un documento pisando a otro es plata mal contada)", () => {
    // Dos secuenciales distintos que dieran el mismo id: se lanza, no se escribe.
    const chocan: ClienteReporteWeb[] = [
      { clienteId: 1, codigo: "A", nombre: "A", elements: [{ secuencial: "11-000000001", fechaCreacion: "2026-01-05", tipoComprobante: "Factura", saldo: 10, dias: 5 }] },
      { clienteId: 2, codigo: "B", nombre: "B", elements: [{ secuencial: "11-0000000001", fechaCreacion: "2026-01-05", tipoComprobante: "Factura", saldo: 20, dias: 5 }] },
    ];
    expect(() => construirFilas("confecciones_boston", chocan)).toThrow(CarteraWebError);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 🩸 ESTE CANDADO CAMBIÓ DE DIRECCIÓN (25-ago-2026).
  //
  // Decía: «el MISMO documento repetido no es una colisión», y definía "mismo
  // documento" como "mismo secuencial" y nada más. Esa definición es JUSTO la
  // que rompió el reinicio de numeración de Switch: `11-000000009` es una
  // Factura de 2022 Y otra de 2026, con montos distintos, y la regla vieja las
  // declaraba la misma — el guard se callaba y el upsert colapsaba una de las
  // dos en silencio.
  //
  // Ahora "mismo documento" son los TRES campos: secuencial + fecha + monto.
  // Un secuencial repetido con cualquier diferencia CORTA la corrida.
  // ═══════════════════════════════════════════════════════════════════════════
  it("el MISMO documento repetido de verdad (secuencial + fecha + monto) NO es una colisión", () => {
    const doc = { secuencial: "11-000000001", fechaCreacion: "2026-01-05", tipoComprobante: "Factura", saldo: 10, dias: 5 };
    const { filas } = construirFilas("confecciones_boston", [
      { clienteId: 1, codigo: "A", nombre: "A", elements: [{ ...doc }] },
      { clienteId: 1, codigo: "A", nombre: "A", elements: [{ ...doc }] },
    ]);
    expect(filas).toHaveLength(2); // el upsert por (empresa, ccte_id) los colapsa
  });

  it("el mismo secuencial con FECHA distinta dentro del mismo año CORTA la corrida", () => {
    // El año ya separa 2022 de 2026; lo que el año no puede separar es esto, y
    // en vez de pisarse, se corta.
    const chocan: ClienteReporteWeb[] = [
      { clienteId: 1, codigo: "A", nombre: "A", elements: [{ secuencial: "11-000000001", fechaCreacion: "2026-01-05", tipoComprobante: "Factura", saldo: 10, dias: 5 }] },
      { clienteId: 2, codigo: "B", nombre: "B", elements: [{ secuencial: "11-000000001", fechaCreacion: "2026-09-30", tipoComprobante: "Factura", saldo: 10, dias: 5 }] },
    ];
    expect(() => construirFilas("confecciones_boston", chocan)).toThrow(CarteraWebError);
    expect(() => construirFilas("confecciones_boston", chocan)).toThrow(/fecha distinta/);
  });

  it("el mismo secuencial con MONTO distinto CORTA la corrida", () => {
    const chocan: ClienteReporteWeb[] = [
      { clienteId: 1, codigo: "A", nombre: "A", elements: [{ secuencial: "11-000000001", fechaCreacion: "2026-01-05", tipoComprobante: "Factura", saldo: 10, dias: 5 }] },
      { clienteId: 2, codigo: "B", nombre: "B", elements: [{ secuencial: "11-000000001", fechaCreacion: "2026-01-05", tipoComprobante: "Factura", saldo: 999, dias: 5 }] },
    ];
    expect(() => construirFilas("confecciones_boston", chocan)).toThrow(CarteraWebError);
    expect(() => construirFilas("confecciones_boston", chocan)).toThrow(/monto distinto/);
  });

  it("el error dice QUÉ documentos y POR QUÉ, no solo que hubo colisión", () => {
    const chocan: ClienteReporteWeb[] = [
      { clienteId: 1, codigo: "A", nombre: "A", elements: [{ secuencial: "11-000000001", fechaCreacion: "2026-01-05", tipoComprobante: "Factura", saldo: 10, dias: 5 }] },
      { clienteId: 2, codigo: "B", nombre: "B", elements: [{ secuencial: "11-000000001", fechaCreacion: "2026-09-30", tipoComprobante: "Factura", saldo: 20, dias: 5 }] },
    ];
    let msg = "";
    try {
      construirFilas("confecciones_boston", chocan);
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toContain("11-000000001");
    expect(msg).toContain("2026-01-05");
    expect(msg).toContain("2026-09-30");
    expect(msg).toContain("fecha distinta");
    expect(msg).toContain("monto distinto");
  });

  it("NINGÚN documento del fixture real pierde su fila por la identidad nueva", () => {
    const { filas, skips } = construirFilas("confecciones_boston", FIXTURE.clientes);
    const documentos = FIXTURE.clientes.reduce((n, c) => n + (c.elements?.length ?? 0), 0);
    expect(filas).toHaveLength(documentos);
    expect(skips.filter((s) => s.campo === "ccte_id_sintetico")).toEqual([]);
    expect(new Set(filas.map((f) => f.ccte_id)).size).toBe(documentos);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("B. el RECONCILE", () => {
  const filtroDe = (l: Llamada, m: string, col: string) =>
    l.filtros.find((f) => f[0] === m && f[1] === col);

  it("un cliente que dejó de deber queda en 0 (y en 0, no borrado)", async () => {
    reconcileDevuelve = [{ ccte_id: 110000076 }, { ccte_id: 110000086 }];
    const r = await syncCarteraWeb({ reporte: reporte(FIXTURE.clientes, FIXTURE.saldosTotales) });
    expect(r.ok).toBe(true);
    expect(r.cerrados).toBe(2);

    const rec = llamadas.find((l) => l.op === "update")!;
    expect(rec.tabla).toBe("switch_estadocuenta");
    // Se ACTUALIZA saldo a 0. Nada de DELETE: el documento queda, con saldo 0.
    expect(rec.parche).toMatchObject({ saldo: 0 });
    expect(llamadas.every((l) => l.op !== ("delete" as unknown))).toBe(true);
  });

  it("solo alcanza a lo que esta corrida NO escribió", async () => {
    await syncCarteraWeb({ reporte: reporte(FIXTURE.clientes, FIXTURE.saldosTotales) });
    const rec = llamadas.find((l) => l.op === "update")!;
    // `synced_at < runStamp` = no lo tocó esta corrida.
    expect(filtroDe(rec, "lt", "synced_at")).toBeTruthy();
    // Lo que sí escribió lleva synced_at = runStamp, así que queda fuera.
    const up = llamadas.find((l) => l.op === "upsert")!;
    const stamp = (up.filas![0] as { synced_at: string }).synced_at;
    expect(filtroDe(rec, "lt", "synced_at")![2]).toBe(stamp);
  });

  it("barre también los saldos NEGATIVOS, no solo los positivos", async () => {
    // El sync del API usa gt(saldo,0) porque guarda magnitudes. Acá un signo
    // inesperado de Switch puede dejar un saldo negativo, y un documento cerrado
    // con saldo negativo restaría de la cartera para siempre.
    await syncCarteraWeb({ reporte: reporte(FIXTURE.clientes, FIXTURE.saldosTotales) });
    const rec = llamadas.find((l) => l.op === "update")!;
    expect(filtroDe(rec, "neq", "saldo")).toBeTruthy();
    expect(filtroDe(rec, "gt", "saldo")).toBeFalsy();
  });

  it("⛔ un reporte VACÍO no escribe ni reconcilia (no es 'todos pagaron')", async () => {
    const r = await syncCarteraWeb({ reporte: reporte([], []) });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/vac[íi]o/i);
    expect(llamadas).toHaveLength(0); // ni un upsert, ni un update
  });

  it("⛔ clientes sin ningún documento tampoco cuentan como reporte válido", async () => {
    const sinDocs: ClienteReporteWeb[] = [{ clienteId: 1, codigo: "A", nombre: "A", elements: [] }];
    const r = await syncCarteraWeb({ reporte: reporte(sinDocs, []) });
    expect(r.ok).toBe(false);
    expect(llamadas).toHaveLength(0);
  });

  it("⛔ un reporte CORTO no escribe ni reconcilia (les pondría la deuda en CERO)", async () => {
    // 🔴 EL CASO QUE EL CUADRE NO PUEDE VER. El fixture trae 6 clientes con
    // saldo; si la tabla ya conoce 383, esto es una descarga a medias — y el
    // reconcile le pondría `saldo = 0` a los 377 que faltan, en silencio y con
    // la corrida anotada `success`. El cuadre no lo atrapa: compara el reporte
    // contra los totales DEL MISMO reporte, así que un reporte corto cuadra al
    // centavo consigo mismo.
    clientesConocidosMock = Array.from({ length: 383 }, (_, i) => ({ cliente_switch_id: i + 1 }));
    const r = await syncCarteraWeb({ reporte: reporte(FIXTURE.clientes, FIXTURE.saldosTotales) });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/incompleto/i);
    expect(r.error).toMatch(/383/);
    expect(llamadas).toHaveLength(0); // ni un upsert, ni un update
  });

  it("un reporte del tamaño de siempre SÍ escribe (el guard no es un freno de mano)", async () => {
    // La otra dirección: con una vara que el reporte supera, todo sigue igual.
    // Sin esto, un guard que bloqueara SIEMPRE también pasaría el test de arriba.
    const conSaldo = new Set(
      FIXTURE.clientes.map((c) => c.clienteId).filter((x): x is number => typeof x === "number"),
    ).size;
    clientesConocidosMock = Array.from({ length: conSaldo }, (_, i) => ({ cliente_switch_id: i + 1 }));
    reconcileDevuelve = [{ ccte_id: 1 }];
    const r = await syncCarteraWeb({ reporte: reporte(FIXTURE.clientes, FIXTURE.saldosTotales) });
    expect(r.ok).toBe(true);
    expect(llamadas.some((l) => l.op === "upsert")).toBe(true);
    expect(llamadas.some((l) => l.op === "update")).toBe(true);
  });

  it("⛔ un DRY-RUN corto también falla: existe para saber si se puede escribir", async () => {
    clientesConocidosMock = Array.from({ length: 383 }, (_, i) => ({ cliente_switch_id: i + 1 }));
    const r = await syncCarteraWeb({ reporte: reporte(FIXTURE.clientes, FIXTURE.saldosTotales), dryRun: true });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/incompleto/i);
  });

  it("⛔ si no cuadra con lo que publica Switch, no se escribe NADA", async () => {
    const totalesMentirosos = FIXTURE.saldosTotales.map((t) =>
      t.title === "0-30" ? { ...t, saldo: t.saldo + 1000 } : t,
    );
    const r = await syncCarteraWeb({ reporte: reporte(FIXTURE.clientes, totalesMentirosos) });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/NO cuadra/);
    expect(llamadas).toHaveLength(0);
  });

  it("el reconcile NO corre si el upsert falló (nunca se pone en cero sin haber cargado)", async () => {
    upsertFalla = "boom";
    const r = await syncCarteraWeb({ reporte: reporte(FIXTURE.clientes, FIXTURE.saldosTotales) });
    expect(r.ok).toBe(false);
    expect(llamadas.some((l) => l.op === "update")).toBe(false);
  });

  it("cuadraConSwitch acierta en las dos direcciones", () => {
    const base = { clientes: 1, documentos: 1, total: 100, d0_90: 60, d91_120: 10, d121_plus: 30 };
    const pub = { total: 100, d0_90: 60, d91_120: 10, d121_plus: 30 };
    expect(cuadraConSwitch(base, pub).ok).toBe(true);
    // Medio centavo es redondeo; dos centavos ya es otra cosa.
    expect(cuadraConSwitch({ ...base, d0_90: 60.005 }, pub).ok).toBe(true);
    expect(cuadraConSwitch({ ...base, d0_90: 60.02 }, pub).ok).toBe(false);
    expect(cuadraConSwitch({ ...base, total: 99 }, pub).ok).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("C. el GRUPO no se mueve", () => {
  it("todo lo que se escribe va acotado a confecciones_boston", async () => {
    reconcileDevuelve = [{ ccte_id: 1 }];
    await syncCarteraWeb({ reporte: reporte(FIXTURE.clientes, FIXTURE.saldosTotales) });
    expect(llamadas.length).toBeGreaterThan(0);
    for (const l of llamadas) {
      if (l.op === "upsert") {
        for (const f of l.filas as Array<{ empresa_key: string }>) {
          expect(f.empresa_key).toBe("confecciones_boston");
        }
        expect(l.onConflict).toBe("empresa_key,ccte_id");
      } else {
        // El reconcile SIEMPRE lleva el filtro de empresa. Sin él pondría en
        // cero la cartera de las 6 empresas del grupo.
        const emp = l.filtros.find((f) => f[0] === "eq" && f[1] === "empresa_key");
        expect(emp, "el reconcile tiene que filtrar por empresa_key").toBeTruthy();
        expect(emp![2]).toBe("confecciones_boston");
      }
    }
  });

  it("este camino es SOLO de Boston", () => {
    expect(EMPRESA_CARTERA_WEB).toBe("confecciones_boston");
  });

  it("la vista del GRUPO sigue excluyendo a Boston", () => {
    const grupo = MIGRACION.slice(
      MIGRACION.indexOf("CREATE OR REPLACE VIEW switch_estadocuenta_aging AS"),
      MIGRACION.indexOf("CREATE OR REPLACE VIEW switch_estadocuenta_aging_boston"),
    );
    expect(grupo).toMatch(/empresa_key NOT IN \('confecciones_boston'\)/);
  });

  it("la cartera del grupo no depende de este módulo", async () => {
    // Nada de lo que este camino escribe entra a la vista del grupo, así que sus
    // $3.583.051,22 / 219 filas no pueden moverse por acá. El candado real es el
    // filtro de arriba; esto fija la intención por si alguien agrega empresas.
    const { filas } = construirFilas("confecciones_boston", FIXTURE.clientes);
    expect(new Set(filas.map((f) => f.empresa_key))).toEqual(new Set(["confecciones_boston"]));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("E. el cron", () => {
  const VERCEL: { crons: Array<{ path: string; schedule: string }> } = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../../vercel.json"), "utf8"),
  );

  it("corre 1×/día de MADRUGADA en Panamá", () => {
    const e = VERCEL.crons.filter((c) => c.path === "/api/cron/boston-cartera");
    expect(e, "una sola entrada = una ocurrencia al día").toHaveLength(1);
    const [min, hora, ...resto] = e[0].schedule.split(" ");
    expect(resto.join(" ")).toBe("* * *"); // todos los días
    const horaPanama = (Number(hora) + 24 - 5) % 24; // Panamá es UTC-5 fijo
    expect(horaPanama, `${hora}:${min} UTC = ${horaPanama}h Panamá`).toBeGreaterThanOrEqual(1);
    expect(horaPanama).toBeLessThanOrEqual(5);
  });

  it("no cae en una ventana de deploy", () => {
    const [min, hora] = VERCEL.crons
      .find((c) => c.path === "/api/cron/boston-cartera")!
      .schedule.split(" ")
      .map(Number);
    const m = hora * 60 + min;
    const dentro = (a: number, b: number) => m >= a && m <= b;
    expect(dentro(23 * 60 + 50, 24 * 60 + 20), "23:50-00:20").toBe(false);
    expect(dentro(5 * 60 + 50, 6 * 60 + 10), "05:50-06:10").toBe(false);
  });

  it("está en el registro de crons vigilados (si no, nadie lo vigila)", async () => {
    const { CRONS_CONOCIDOS } = await import("@/lib/cron-telemetry");
    expect(CRONS_CONOCIDOS.has("boston-cartera")).toBe(true);
  });

  it("está en el cronograma de sesión única con su empresa", async () => {
    const { SWITCH_CRON_ENTRADAS } = await import("@/lib/cron-telemetry");
    const e = SWITCH_CRON_ENTRADAS.filter((x) => x.cron === "boston-cartera");
    expect(e).toHaveLength(1);
    expect(e[0].empresas).toEqual(["confecciones_boston"]);
    const [min, hora] = VERCEL.crons
      .find((c) => c.path === "/api/cron/boston-cartera")!
      .schedule.split(" ");
    expect(e[0].hhmmUtc).toBe(`${String(hora).padStart(2, "0")}${String(min).padStart(2, "0")}`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// F. CONDUCTA — el sync de verdad contra un doble, mirando QUÉ filas se
//    escribieron y EN QUÉ ORDEN.
//
// 🩸 Por qué de conducta y no de función pura: el bug de la identidad vive en la
// juntura, no en `construirFilas`. El resumen se calcula ANTES del upsert, así
// que dos documentos con el mismo `ccte_id` CUADRAN al centavo contando los dos
// y recién el upsert (lotes de 100, `onConflict empresa_key,ccte_id`) colapsa
// uno. Un test de `construirFilas` sola nunca lo vería: las dos filas están ahí.
// Lo que hay que mirar es lo que sale hacia la base.
// ═════════════════════════════════════════════════════════════════════════════
describe("F. CONDUCTA — el reinicio de numeración de Switch, de punta a punta", () => {
  /** El caso real, medido en producción el 25-ago-2026. */
  const PAR_REINICIADO: ClienteReporteWeb[] = [
    {
      clienteId: 7,
      codigo: "D-042",
      nombre: "CLIENTE CON DOS 11-000000009",
      elements: [
        { secuencial: "11-000000009", fechaCreacion: "2022-10-14", tipoComprobante: "Factura", saldo: 285.16, dias: 1400 },
        { secuencial: "11-000000009", fechaCreacion: "2026-07-23", tipoComprobante: "Factura", saldo: 271.25, dias: 33 },
      ],
    },
  ];
  const TOTALES_DEL_PAR = [
    { title: "0-30", saldo: 271.25 },
    { title: "Mas de 365", saldo: 285.16 },
  ];

  const filasEscritas = () =>
    llamadas.filter((l) => l.op === "upsert").flatMap((l) => (l.filas ?? []) as Array<Record<string, unknown>>);

  it("🔴 los DOS documentos llegan a la base: dos ccte_id, ningún pisado", async () => {
    const r = await syncCarteraWeb({ reporte: reporte(PAR_REINICIADO, TOTALES_DEL_PAR) });
    expect(r.ok).toBe(true);

    const filas = filasEscritas();
    expect(filas).toHaveLength(2);
    const ids = filas.map((f) => f.ccte_id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toEqual(expect.arrayContaining([112200009, 112600009]));

    // Y la plata de los dos: con la identidad vieja, uno de los dos habría
    // desaparecido en el upsert y la cartera habría quedado corta en $271,25.
    const suma = filas.reduce((n, f) => n + Number(f.saldo ?? 0), 0);
    expect(suma).toBeCloseTo(556.41, 2);
  });

  it("el upsert sigue colapsando por (empresa_key, ccte_id) — la llave no cambió", async () => {
    await syncCarteraWeb({ reporte: reporte(PAR_REINICIADO, TOTALES_DEL_PAR) });
    for (const l of llamadas.filter((x) => x.op === "upsert")) {
      expect(l.onConflict).toBe("empresa_key,ccte_id");
    }
  });

  it("cada fila guarda la fecha con la que se calculó su ccte_id", async () => {
    await syncCarteraWeb({ reporte: reporte(PAR_REINICIADO, TOTALES_DEL_PAR) });
    for (const f of filasEscritas()) {
      const anio = Number(String(f.fecha_creacion).slice(0, 4));
      // ccte_id = serie·10^7 + (año−2000)·10^5 + correlativo
      expect(Math.floor((Number(f.ccte_id) % 10_000_000) / 100_000)).toBe(anio - 2000);
    }
  });

  // ═══ EL ORDEN — «que la cartera nunca quede en cero ni a medias» ═══════════
  it("🔴 el RECONCILE va DESPUÉS del upsert, nunca antes", async () => {
    await syncCarteraWeb({ reporte: reporte(FIXTURE.clientes, FIXTURE.saldosTotales) });
    const primerUpsert = llamadas.findIndex((l) => l.op === "upsert");
    const primerUpdate = llamadas.findIndex((l) => l.op === "update");
    expect(primerUpsert).toBeGreaterThanOrEqual(0);
    expect(primerUpdate).toBeGreaterThan(primerUpsert);
    // Y NINGÚN update antes del último upsert: si el reconcile se colara entre
    // dos lotes, la cartera quedaría a medias mientras corre.
    const ultimoUpsert = llamadas.map((l) => l.op).lastIndexOf("upsert");
    expect(llamadas.slice(0, ultimoUpsert).every((l) => l.op === "upsert")).toBe(true);
  });

  it("el reconcile pone en 0, nunca borra: la cartera no puede pasar por vacía", async () => {
    await syncCarteraWeb({ reporte: reporte(PAR_REINICIADO, TOTALES_DEL_PAR) });
    const rec = llamadas.find((l) => l.op === "update")!;
    expect(rec.parche).toMatchObject({ saldo: 0 });
    expect(rec.filtros.find((f) => f[0] === "eq" && f[1] === "empresa_key")![2]).toBe("confecciones_boston");
  });

  it("⛔ una colisión de identidad no escribe NI UNA fila (fail-closed)", async () => {
    // Mismo secuencial, mismo año, fecha distinta: el año no puede separarlos y
    // el guard corta antes de tocar la base.
    const chocan: ClienteReporteWeb[] = [
      {
        clienteId: 1,
        codigo: "A",
        nombre: "A",
        elements: [
          { secuencial: "11-000000001", fechaCreacion: "2026-01-05", tipoComprobante: "Factura", saldo: 10, dias: 5 },
          { secuencial: "11-000000001", fechaCreacion: "2026-09-30", tipoComprobante: "Factura", saldo: 20, dias: 5 },
        ],
      },
    ];
    const r = await syncCarteraWeb({ reporte: reporte(chocan, [{ title: "0-30", saldo: 30 }]) });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/colisión de ccte_id/);
    expect(llamadas).toHaveLength(0);
  });

  it("⛔ un documento sin fecha desarma el cuadre y corta la corrida, no se escribe nada", async () => {
    // La fecha es media identidad: sin ella el documento se omite, y como el
    // resumen se arma con lo que sí se construyó, el cuadre contra Switch se
    // cae. Preferimos la cartera de ayer entera y un error a la vista.
    const sinFecha: ClienteReporteWeb[] = [
      {
        clienteId: 1,
        codigo: "A",
        nombre: "A",
        elements: [
          { secuencial: "11-000000001", fechaCreacion: "2026-01-05", tipoComprobante: "Factura", saldo: 10, dias: 5 },
          { secuencial: "11-000000002", fechaCreacion: null, tipoComprobante: "Factura", saldo: 990, dias: 5 },
        ],
      },
    ];
    const r = await syncCarteraWeb({ reporte: reporte(sinFecha, [{ title: "0-30", saldo: 1000 }]) });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/NO cuadra/);
    expect(llamadas).toHaveLength(0);
  });

  it("⛔ si el cuadre falla no se escribe nada — el orden es cuadre → upsert", async () => {
    // Los totales que publica Switch dicen otra cosa que nuestros documentos.
    const r = await syncCarteraWeb({
      reporte: reporte(PAR_REINICIADO, [{ title: "0-30", saldo: 999999 }]),
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/NO cuadra/);
    expect(llamadas).toHaveLength(0);
  });
});
