/**
 * CANDADO — el motor NUEVO de reportes de Switch (24-ago-2026).
 *
 * ─── 🩸 LO QUE PASÓ ─────────────────────────────────────────────────────────
 * El 19-ago-2026 a las 12:37:21 Switch cambió el motor de sus reportes y
 * `POST /estadodecuenta/obtener` dejó de existir. No devolvió un 404: devolvió
 * **HTTP 200 con su página de excepción** y `Controller method not found`
 * adentro. La cartera de Confecciones Boston quedó congelada del 20 al 24 de
 * agosto — cinco corridas, el mismo error las cinco veces.
 *
 * El reemplazo NO se adivinó: se leyó del propio código del panel
 * (`assets/js/reportesmanager.js` y `assets/js/estadodecuenta.js`) y se ejecutó
 * contra producción antes de escribir una línea de parser.
 *
 * ─── QUÉ PRUEBA ESTE ARCHIVO ────────────────────────────────────────────────
 *   A. el mapa de nombres viejo → nuevo, campo por campo
 *   B. los totales, que cambiaron de forma (array `saldosTotales` → objeto `totales`)
 *   C. el CUADRE con una muestra REAL de producción — el que certifica todo
 *   D. el guard del reporte incompleto (el que impide poner saldos buenos en cero)
 *   E. el transporte por uuid, y que la página de excepción se reconozca COMO TAL
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));

import {
  adaptarReporteConsola,
  saldosTotalesDesdeTotales,
  construirFilas,
  tramosPublicadosPorSwitch,
  type ClienteReporteConsola,
} from "@/lib/switch-api/estadocuenta-web";
import {
  cuadraConSwitch,
  reporteVieneCompleto,
  PISO_CLIENTES_REPORTE,
} from "@/lib/switch-api/sync-estadocuenta-web";
import { fetchCarteraAntiguedad, SwitchWebError } from "@/lib/switch-api/web-client";

/** Muestra REAL del reporte nuevo, bajada de producción el 24-ago-2026.
 *  `totales` sale de sumar los `buckets` que publica el propio Switch cliente por
 *  cliente — o sea que es aritmética SUYA, no nuestra: por eso sirve de control. */
const MUESTRA: { data: ClienteReporteConsola[]; totales: Record<string, number> } = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../fixtures/boston-cartera-consola.json"), "utf8"),
);

// ═════════════════════════════════════════════════════════════════════════════
describe("A. el mapa de nombres viejo → nuevo", () => {
  const uno = (m: Partial<ClienteReporteConsola["comprobantes"] extends (infer T)[] | null | undefined ? T : never>) =>
    adaptarReporteConsola([
      { clienteId: 7, clienteCodigo: "D-001", clienteNombre: "ACME", comprobantes: [m] },
    ])[0].elements![0];

  it("cada campo del formato nuevo cae donde el viejo lo esperaba", () => {
    const el = uno({
      fecha: "2026-05-20 15:57:11",
      tipoComprobante: "Factura",
      nSistema: "155-000000058",
      nFiscal: "FE-123",
      debito: 100,
      credito: 0,
      plazoCredito: "30.0000",
      dias: 96,
    });
    expect(el.secuencial).toBe("155-000000058");
    expect(el.numeroFiscal).toBe("FE-123");
    expect(el.fechaCreacion).toBe("2026-05-20 15:57:11");
    expect(el.tipoComprobante).toBe("Factura");
    expect(el.plazoCredito).toBe("30.0000");
    expect(el.dias).toBe(96);
  });

  it("el cliente también: clienteCodigo/clienteNombre son el codigo/nombre de antes", () => {
    const c = adaptarReporteConsola([
      { clienteId: 7, clienteCodigo: "D-001", clienteNombre: "ACME", comprobantes: [] },
    ])[0];
    expect(c.clienteId).toBe(7);
    expect(c.codigo).toBe("D-001");
    expect(c.nombre).toBe("ACME");
  });

  it("🔴 el saldo del documento se DERIVA: debito − credito", () => {
    // Una factura suma...
    expect(uno({ tipoComprobante: "Factura", debito: 250.5, credito: 0, nSistema: "11-000000001" }).saldo).toBe(250.5);
    // ...y un recibo llega en negativo, igual que en el formato viejo, que es lo
    // que la tabla de signos espera para devolverlo a magnitud.
    expect(uno({ tipoComprobante: "Recibo", debito: 0, credito: 80.25, nSistema: "11-000000002" }).saldo).toBe(-80.25);
  });

  it("🔴 `saldoAcumulado` NO es el saldo del documento y no se usa", () => {
    // Es el CORRIDO del cliente. Usarlo como saldo del documento contaría la
    // deuda tantas veces como movimientos tenga el cliente.
    const el = uno({
      tipoComprobante: "Factura",
      debito: 25.15,
      credito: 0,
      saldoAcumulado: 999999,
      nSistema: "11-000000003",
    });
    expect(el.saldo).toBe(25.15);
    expect(el.saldo).not.toBe(999999);
  });

  it("lo que el reporte nuevo NO trae queda en null, no inventado", () => {
    const el = uno({ tipoComprobante: "Factura", debito: 10, credito: 0, nSistema: "11-000000004" });
    expect(el.abrev).toBeNull();
    expect(el.numeroOrden).toBeNull();
  });

  it("`total` es el lado del movimiento que no está en cero", () => {
    expect(uno({ tipoComprobante: "Factura", debito: 300, credito: 0, nSistema: "11-000000005" }).total).toBe(300);
    expect(uno({ tipoComprobante: "Recibo", debito: 0, credito: 45, nSistema: "11-000000006" }).total).toBe(45);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("B. los totales cambiaron de forma", () => {
  it("el objeto `totales` se dice en la forma que espera tramosPublicadosPorSwitch", () => {
    const arr = saldosTotalesDesdeTotales({ "0-30": 10, "91-120": 5, "Mas de 365": 1, total: 16 });
    expect(arr).toContainEqual({ title: "0-30", saldo: 10 });
    expect(arr).toContainEqual({ title: "91-120", saldo: 5 });
  });

  it("🔴 `total` se DESCARTA — colarlo contaría toda la cartera dos veces", () => {
    // `total` no es un tramo: es la suma de los ocho. Como no matchea ningún
    // título conocido, caería en el `else` de 121+ y duplicaría la cartera.
    const totales = { "0-30": 10, "91-120": 5, "Mas de 365": 1, total: 16 };
    expect(saldosTotalesDesdeTotales(totales).map((t) => t.title)).not.toContain("total");
    const tramos = tramosPublicadosPorSwitch(saldosTotalesDesdeTotales(totales));
    expect(tramos.total).toBe(16);
    expect(tramos.d121_plus).toBe(1);
  });

  it("los 8 tramos que manda Switch caen en las 3 franjas de la pestaña", () => {
    const t = tramosPublicadosPorSwitch(
      saldosTotalesDesdeTotales({
        "0-30": 1, "31-60": 2, "61-90": 4, "91-120": 8,
        "121-180": 16, "181-270": 32, "271-365": 64, "Mas de 365": 128, total: 255,
      }),
    );
    expect(t.d0_90).toBe(7);
    expect(t.d91_120).toBe(8);
    expect(t.d121_plus).toBe(240);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("C. el CUADRE contra datos REALES de producción", () => {
  const { filas, skips, resumen } = construirFilas(
    "confecciones_boston",
    adaptarReporteConsola(MUESTRA.data),
  );
  const publicado = tramosPublicadosPorSwitch(saldosTotalesDesdeTotales(MUESTRA.totales));

  it("la muestra tiene de verdad lo que dice tener (si no, no prueba nada)", () => {
    expect(MUESTRA.data.length).toBeGreaterThan(0);
    expect(filas.length).toBeGreaterThan(30);
    const tipos = new Set(filas.map((f) => f.tipo_comprobante));
    // Los seis tipos que la cartera conoce, incluidos los que RESTAN.
    for (const t of ["Factura", "Recibo", "Nota de Crédito", "Nota de Débito", "Saldo Anterior", "Transacción"]) {
      expect(tipos, `falta ${t} en la muestra`).toContain(t);
    }
    // Y las tres franjas con plata, o el cuadre no probaría el bucketing.
    expect(resumen.d0_90).not.toBe(0);
    expect(resumen.d91_120).not.toBe(0);
    expect(resumen.d121_plus).not.toBe(0);
  });

  it("🔑 CUADRA AL CENTAVO con lo que publica Switch, franja por franja", () => {
    // Son dos caminos independientes: nosotros sumamos DOCUMENTO por documento
    // usando `dias`; `totales` sale de los `buckets` que Switch calculó por su
    // cuenta. Que coincidan es lo que certifica la derivación del saldo.
    expect(resumen.d0_90).toBeCloseTo(publicado.d0_90, 2);
    expect(resumen.d91_120).toBeCloseTo(publicado.d91_120, 2);
    expect(resumen.d121_plus).toBeCloseTo(publicado.d121_plus, 2);
    expect(cuadraConSwitch(resumen, publicado).ok).toBe(true);
  });

  it("ningún documento real se queda sin mapear", () => {
    expect(skips).toEqual([]);
  });

  it("todo lo que se arma es de confecciones_boston y con ccte_id sintético", () => {
    for (const f of filas) {
      expect(f.empresa_key).toBe("confecciones_boston");
      expect(f.ccte_id).toBeGreaterThan(16388); // el ccte_id real más alto medido
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("D. el guard del reporte INCOMPLETO", () => {
  it("el piso es el 70%, el mismo de sync-articulo-marca", () => {
    expect(PISO_CLIENTES_REPORTE).toBe(0.7);
  });

  it("un reporte normal pasa", () => {
    // Medido el 24-ago-2026: la tabla conoce 383 y el reporte trae 386.
    expect(reporteVieneCompleto(386, 383)).toBe(true);
    // Y un día flojo, con clientes que terminaron de pagar, también.
    expect(reporteVieneCompleto(300, 383)).toBe(true);
  });

  it("🔴 media descarga NO pasa", () => {
    expect(reporteVieneCompleto(191, 383)).toBe(false);
    expect(reporteVieneCompleto(1, 383)).toBe(false);
    expect(reporteVieneCompleto(0, 383)).toBe(false);
  });

  it("el borde es exacto: justo en el 70% pasa, un cliente menos no", () => {
    expect(reporteVieneCompleto(70, 100)).toBe(true);
    expect(reporteVieneCompleto(69, 100)).toBe(false);
  });

  it("con la tabla vacía deja pasar (primera carga: no hay vara)", () => {
    // Exigirle un piso a la nada bloquearía el arranque para siempre.
    expect(reporteVieneCompleto(0, 0)).toBe(true);
    expect(reporteVieneCompleto(5, 0)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("E. el transporte por uuid", () => {
  const SESION = { empresaKey: "confecciones_boston", baseUrl: "https://sw.test", cookies: new Map() };
  const PAGINA = '<html><input name="_token" value="tok-123"></html>';

  let respuestas: Array<{ status?: number; body: string }>;
  let pedidos: Array<{ url: string; method: string; body?: string }>;

  beforeEach(() => {
    pedidos = [];
    respuestas = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      pedidos.push({ url: String(url), method: init?.method ?? "GET", body: init?.body as string });
      const r = respuestas.shift() ?? { body: PAGINA };
      return {
        status: r.status ?? 200,
        headers: { get: () => null, getSetCookie: () => [] },
        text: async () => r.body,
      } as unknown as Response;
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const traer = () => fetchCarteraAntiguedad(SESION, new Date("2026-08-24T12:00:00Z"), { intervaloMs: 1 });

  it("encarga el reporte, sondea hasta TERMINADO y devuelve el dato", async () => {
    respuestas = [
      { body: PAGINA },
      { body: JSON.stringify({ response: true, uuid: "u-1", estatus: "CREADO" }) },
      { body: JSON.stringify({ response: true, estatus: "PROCESANDO" }) },
      { body: JSON.stringify({ response: true, estatus: "TERMINADO", data: { data: MUESTRA.data, totales: MUESTRA.totales } }) },
    ];
    const r = await traer();
    expect(r.clientes).toHaveLength(MUESTRA.data.length);
    expect(r.recordsTotal).toBe(MUESTRA.data.length);
    expect(r.rondas).toBe(2); // dos sondeos: PROCESANDO y TERMINADO
    expect(r.saldoTotalGlobal).toBeCloseTo(MUESTRA.totales.total, 2);
    expect(r.saldosTotales.map((t) => t.title)).not.toContain("total");
  });

  it("pide lo que pide el panel: claseReporte 4, ESTADOCUENTACLIENTE y desde=hasta=hoy", async () => {
    respuestas = [
      { body: PAGINA },
      { body: JSON.stringify({ response: true, uuid: "u-1", estatus: "CREADO" }) },
      { body: JSON.stringify({ response: true, estatus: "TERMINADO", data: { data: [], totales: {} } }) },
    ];
    await traer();
    const crear = pedidos.find((p) => p.url.includes("crearreporteconsola"))!;
    expect(crear.method).toBe("POST");
    const cuerpo = new URLSearchParams(crear.body!);
    expect(cuerpo.get("claseReporte")).toBe("4");
    expect(cuerpo.get("tipoReporte")).toBe("ESTADOCUENTACLIENTE");
    expect(cuerpo.get("desde")).toBe("2026-08-24");
    expect(cuerpo.get("hasta")).toBe("2026-08-24");
    expect(cuerpo.get("_token")).toBe("tok-123");
    // 🔴 Los geográficos VACÍOS, nunca la palabra "null": con "null" el reporte
    // contesta sin error y con CERO clientes.
    for (const k of ["pais", "provincia", "distrito", "corregimiento"]) {
      expect(cuerpo.get(k), `${k} no puede ir en "null"`).toBe("");
    }
    // El sondeo va contra el uuid que devolvió el paso 1.
    expect(pedidos.some((p) => p.url.includes("buscarreporteconsola/u-1"))).toBe(true);
  });

  it("🔴 la página de excepción con HTTP 200 se reconoce COMO TAL (el fallo del 19-ago)", async () => {
    respuestas = [
      { body: PAGINA },
      { status: 200, body: "<!DOCTYPE html><html><body>Controller method not found</body></html>" },
    ];
    await expect(traer()).rejects.toThrow(SwitchWebError);
    await expect(traer().catch((e) => e.message)).resolves.toMatch(/página de excepción/i);
  });

  it("si el reporte termina en ERROR o CANCELADO, corta", async () => {
    for (const estatus of ["ERROR", "CANCELADO"]) {
      respuestas = [
        { body: PAGINA },
        { body: JSON.stringify({ response: true, uuid: "u-1", estatus: "CREADO" }) },
        { body: JSON.stringify({ response: true, estatus }) },
      ];
      await expect(traer(), estatus).rejects.toThrow(new RegExp(estatus));
    }
  });

  it("🔴 un `crear` sin uuid corta: sondear /undefined es perseguir un fantasma", async () => {
    // `response:true` pero sin uuid. Sin este freno, el sondeo iría contra
    // `buscarreporteconsola/undefined` hasta agotar los 90 intentos, y el error
    // final hablaría del sondeo en vez de decir que Switch nunca dio el uuid.
    for (const cuerpo of [
      { response: true, estatus: "CREADO" },
      { response: true, uuid: "", estatus: "CREADO" },
      { response: true, uuid: 12345, estatus: "CREADO" },
    ]) {
      respuestas = [{ body: PAGINA }, { body: JSON.stringify(cuerpo) }];
      await expect(traer(), JSON.stringify(cuerpo)).rejects.toThrow(SwitchWebError);
      expect(pedidos.some((p) => p.url.includes("buscarreporteconsola"))).toBe(false);
      pedidos = [];
    }
  });

  it("si Switch no acepta el pedido, lo dice con SU mensaje", async () => {
    respuestas = [
      { body: PAGINA },
      { status: 400, body: JSON.stringify({ response: false, error: "TIPO_REPORTE_REQUERIDO", message: "Se requiere el tipo de reporte" }) },
    ];
    await expect(traer()).rejects.toThrow(/Se requiere el tipo de reporte/);
  });

  it("no se queda sondeando para siempre", async () => {
    respuestas = [
      { body: PAGINA },
      { body: JSON.stringify({ response: true, uuid: "u-1", estatus: "CREADO" }) },
    ];
    // Todo lo demás cae en el default: PAGINA, que no es JSON de estatus.
    respuestas.push(...Array.from({ length: 200 }, () => ({ body: JSON.stringify({ response: true, estatus: "PROCESANDO" }) })));
    await expect(traer()).rejects.toThrow(/no terminó en \d+ sondeos/);
  }, 20000);
});
