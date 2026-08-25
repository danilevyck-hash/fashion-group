/**
 * CANDADO DE CONDUCTA — el rechazo queda REGISTRADO con documento y monto.
 *
 * ─── 🩸 EL DÍA QUE LO HIZO FALTA (medido en producción, 25-ago-2026) ────────
 *
 * `switch_sync_log` de `confecciones_boston / estadocuenta`, últimos 10 días:
 *
 *     6 corridas con records_skipped > 0 · con detalle 0 · SIN detalle 6
 *
 * O sea: se sabía que ALGO se había rechazado, pero **no cuál ni de cuánto**.
 * La causa era una sola línea: `finishSwitchSyncLog` se llamaba con `skipped`
 * pero SIN `skipDetails`, y ese camino es el ÚNICO por el que pasa Boston. Los
 * otros syncs sí lo pasaban (5 de 5 corridas de `catalogo_tommy`, con detalle).
 *
 * Sin ese registro la pantalla no tiene qué decir, así que este candado es la
 * base de todo lo demás.
 *
 * ─── POR QUÉ CORRE EL SYNC DE VERDAD ────────────────────────────────────────
 *
 * Un barrido de texto (`expect(FUENTE).toContain("skipDetails")`) se satisface
 * con el comentario que explica el arreglo — este repo ya pagó cuatro veces ese
 * candado. Acá se ejecuta `syncCarteraWeb` con un reporte que trae el documento
 * REAL de Boston y se lee QUÉ se escribió en el log; después ese mismo detalle
 * se le da al lector y se exige la línea exacta que ve Daniel.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Doble de Supabase ──────────────────────────────────────────────────────
// `calibrarUmbral` pide `.order().limit()`, que este doble no tiene: revienta y
// el guard cae FAIL-OPEN al piso de la familia ($2.000.000). Es exactamente el
// comportamiento de producción cuando no se puede calibrar, y alcanza de sobra
// para rechazar la cifra de $266.541.352.
function nuevaQuery() {
  const q: Record<string, unknown> = {};
  for (const m of ["eq", "lt", "neq", "gt", "not", "in"]) q[m] = () => q;
  q.select = () => Promise.resolve({ data: [], error: null });
  (q as { then: unknown }).then = (res: (v: unknown) => unknown) => res({ data: null, error: null });
  return q;
}
function nuevaLectura() {
  const q: Record<string, unknown> = {};
  for (const m of ["eq", "neq", "lt", "gt", "not", "in"]) q[m] = () => q;
  // Sin clientes conocidos NO hay vara para el guard del reporte incompleto:
  // es el caso de la primera carga y deja pasar, que es lo que este test quiere.
  q.range = () => Promise.resolve({ data: [], error: null });
  return q;
}
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: () => ({ upsert: () => nuevaQuery(), update: () => nuevaQuery(), select: () => nuevaLectura() }),
  },
}));

// ⚠️ `vi.mock` se IZA al principio del archivo, así que su fábrica no puede
// cerrar sobre una variable declarada acá arriba (`Cannot access before
// initialization`). Los dobles se crean DENTRO y se recuperan con `vi.mocked`.
vi.mock("@/lib/switch-api/sync-log", async (orig) => {
  const real = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...real,
    createSwitchSyncLog: vi.fn(async () => "log-1"),
    finishSwitchSyncLog: vi.fn(async () => {}),
  };
});

vi.mock("@/lib/switch-api/web-client", () => ({
  loginSwitchWeb: vi.fn(async () => ({ empresaKey: "confecciones_boston", baseUrl: "x", cookies: new Map() })),
  fetchCarteraAntiguedad: vi.fn(),
  cerrarSesionWeb: vi.fn(async () => {}),
}));

// Telegram nunca se toca en un test.
vi.mock("@/lib/alertas/canal", () => ({ enviarSistema: vi.fn(async () => {}), enviarNegocio: vi.fn(async () => {}) }));

import { syncCarteraWeb } from "@/lib/switch-api/sync-estadocuenta-web";
import { finishSwitchSyncLog } from "@/lib/switch-api/sync-log";
import { fetchCarteraAntiguedad } from "@/lib/switch-api/web-client";
import { campoSkip } from "@/lib/switch-api/monto-guard";
import { textoDeRechazos, type RechazoDeSwitch } from "@/lib/rechazos-de-switch";

// ─── El documento REAL de Boston ────────────────────────────────────────────
const DOC_MALO = "155-000000129";
const MONTO_MALO = 266_541_352;
const CLIENTE_MALO = "EL MACHETAZO";

function elemento(over: Record<string, unknown> = {}) {
  return {
    clienteCodigo: "TCKCTA",
    clienteNombre: "VENTAS",
    secuencial: "155-000000058",
    numeroFiscal: null,
    numeroOrden: "4154200155",
    tipoComprobante: "Transacción",
    abrev: "CNF",
    total: "25.1500",
    saldo: "25.1500",
    debito: "25.1500",
    credito: 0,
    plazoCredito: "0.0000",
    dias: 71,
    fechaCreacion: "2026-05-20",
    ...over,
  };
}

function cliente(id: number, codigo: string, nombre: string, saldo: number, elems: unknown[]) {
  return {
    clienteId: id,
    codigo,
    nombre,
    saldoTotal: saldo,
    saldos: [
      { title: "0-30", saldo: 0 },
      { title: "31-60", saldo: 0 },
      { title: "61-90", saldo },
      { title: "91-120", saldo: 0 },
      { title: "121-180", saldo: 0 },
      { title: "181-270", saldo: 0 },
      { title: "271-365", saldo: 0 },
      { title: "Mas de 365", saldo: 0 },
    ],
    elements: elems,
  };
}

/** El reporte tal como lo devolvería Switch: un documento sano y el imposible. */
function reporteConLaCifraImposible() {
  return {
    clientes: [
      cliente(1, "TCKCTA", "VENTAS", 25.15, [elemento()]),
      cliente(2, "MACH", CLIENTE_MALO, MONTO_MALO, [
        elemento({
          clienteCodigo: "MACH",
          clienteNombre: CLIENTE_MALO,
          secuencial: DOC_MALO,
          total: String(MONTO_MALO),
          saldo: String(MONTO_MALO),
          debito: String(MONTO_MALO),
        }),
      ]),
    ],
    // 🔴 El CUADRE se hace ANTES del guard y con TODAS las filas, así que los
    // totales que publica Switch tienen que incluir la cifra imposible. Es lo
    // que pasa en producción: el reporte de Switch sale corrupto por ella.
    saldosTotales: [
      { title: "0-30", saldo: 0 },
      { title: "31-60", saldo: 0 },
      { title: "61-90", saldo: 25.15 + MONTO_MALO },
      { title: "91-120", saldo: 0 },
      { title: "121-180", saldo: 0 },
      { title: "181-270", saldo: 0 },
      { title: "271-365", saldo: 0 },
      { title: "Mas de 365", saldo: 0 },
    ],
    saldoTotalGlobal: 0,
    recordsTotal: 2,
    fechaReporte: "25-08-2026",
    rondas: 1,
  };
}

interface SkipGuardado {
  campo?: unknown;
  secuencial?: unknown;
  valorCrudo?: unknown;
}

/** Los skips del guard de montos que quedaron en el log de la corrida. */
const finishMock = vi.mocked(finishSwitchSyncLog);
const reporteMock = vi.mocked(fetchCarteraAntiguedad);

function skipsDeMontos(): SkipGuardado[] {
  const [, estado, campos] = finishMock.mock.calls.at(-1) as unknown as [
    string,
    string,
    { skipDetails?: SkipGuardado[]; skipped?: number },
  ];
  expect(estado, "la corrida no terminó bien").toBe("success");
  return (campos?.skipDetails ?? []).filter((d) => String(d?.campo) === campoSkip("cxc"));
}

beforeEach(() => {
  finishMock.mockClear();
  reporteMock.mockReset();
  reporteMock.mockResolvedValue(reporteConLaCifraImposible());
});

// ─────────────────────────────────────────────────────────────────────────────

describe("🩸 el rechazo NO puede quedar en `records_skipped` sin detalle", () => {
  it("la corrida guarda el detalle del descarte, no solo el conteo", async () => {
    const r = await syncCarteraWeb({ triggeredBy: "manual" });
    expect(r.ok, r.error).toBe(true);
    const [, , campos] = finishMock.mock.calls.at(-1) as unknown as [
      string,
      string,
      { skipDetails?: unknown[]; skipped?: number },
    ];
    expect(campos.skipped).toBeGreaterThan(0);
    expect(campos.skipDetails, "records_skipped > 0 con skip_details vacío: el bug del 25-ago").toBeTruthy();
    expect((campos.skipDetails ?? []).length).toBeGreaterThan(0);
  });

  it("el detalle trae el NÚMERO del documento", async () => {
    await syncCarteraWeb({ triggeredBy: "manual" });
    const skips = skipsDeMontos();
    expect(skips).toHaveLength(1);
    expect(String(skips[0].secuencial)).toContain(DOC_MALO);
  });

  it("el detalle trae el MONTO imposible", async () => {
    await syncCarteraWeb({ triggeredBy: "manual" });
    const columnas = (skipsDeMontos()[0].valorCrudo as { columnas?: Array<{ valor: number }> })?.columnas ?? [];
    expect(columnas.length).toBeGreaterThan(0);
    expect(columnas.some((c) => Math.abs(Number(c.valor)) === MONTO_MALO)).toBe(true);
  });

  it("y el CLIENTE, para poder buscarlo en Switch", async () => {
    await syncCarteraWeb({ triggeredBy: "manual" });
    expect(String(skipsDeMontos()[0].secuencial)).toContain(CLIENTE_MALO);
  });

  it("🔴 la cifra imposible NO entra a la base: la fila buena se escribe sola", async () => {
    const r = await syncCarteraWeb({ triggeredBy: "manual" });
    // 2 documentos en el reporte, 1 escrito: el imposible se quedó afuera.
    expect(r.documentos).toBe(1);
  });

  it("un reporte SANO no deja ningún detalle de monto imposible", async () => {
    reporteMock.mockResolvedValue({
      ...reporteConLaCifraImposible(),
      clientes: [cliente(1, "TCKCTA", "VENTAS", 25.15, [elemento()])],
      saldosTotales: [
        { title: "0-30", saldo: 0 },
        { title: "31-60", saldo: 0 },
        { title: "61-90", saldo: 25.15 },
        { title: "91-120", saldo: 0 },
        { title: "121-180", saldo: 0 },
        { title: "181-270", saldo: 0 },
        { title: "271-365", saldo: 0 },
        { title: "Mas de 365", saldo: 0 },
      ],
      recordsTotal: 1,
    });
    await syncCarteraWeb({ triggeredBy: "manual" });
    expect(skipsDeMontos()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// De lo que se guardó a la línea que Daniel lee. Es la cadena completa.
// ─────────────────────────────────────────────────────────────────────────────

describe("de lo guardado a la línea de la pantalla", () => {
  it("lo que quedó en el log alcanza para escribir la línea exacta", async () => {
    await syncCarteraWeb({ triggeredBy: "manual" });
    const skip = skipsDeMontos()[0];

    // Lo mismo que hace `rechazosDeSwitch` al leer el log.
    const documento = String(skip.secuencial).split("·")[0].trim();
    const columnas = (skip.valorCrudo as { columnas: Array<{ valor: number }> }).columnas;
    const monto = columnas.reduce((may, c) => (Math.abs(c.valor) > Math.abs(may) ? c.valor : may), 0);

    const rechazo: RechazoDeSwitch = {
      familia: "cxc",
      empresaKey: "confecciones_boston",
      documento,
      monto,
      cuando: "2026-08-25T02:11:38.767495+00:00",
    };
    expect(textoDeRechazos([rechazo])).toBe(
      "1 documento fuera de la cuenta: el 155-000000129 llega con $266,541,352.00. Está mal en Switch.",
    );
  });
});
