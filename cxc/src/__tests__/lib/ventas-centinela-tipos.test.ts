// ─────────────────────────────────────────────────────────────────────────────
// CANDADOS DEL CENTINELA DE TIPOS DE COMPROBANTE DE VENTA
//
// 🩸 Qué protegen: en mayo-2025 Switch estrenó el tipo «Transacción» (reemplazó
// a «Tiquete»). Alguien lo agregó a tiempo y no se perdió una sola venta — POR
// SUERTE. Un tipo nuevo cae al `ELSE 0` de las vistas de ventas y esa plata
// DESAPARECE del tablero: no hay error, no suena nada, el total sale más bajo.
//
// Se prueban LAS DOS DIRECCIONES, que es lo único que sirve en un centinela:
//   · con los tipos REALES de hoy, NO avisa nunca (si no, sería ruido diario);
//   · con un tipo INVENTADO que trae plata, avisa siempre.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ─── Doble de Supabase: dos vistas, contenido inyectable ─────────────────────
let filasVentas: Array<Record<string, unknown>> = [];
let filasArticulos: Array<Record<string, unknown>> = [];
let errorVentas: { message: string; code?: string } | null = null;

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (tabla: string) => ({
      select: () =>
        Promise.resolve(
          tabla === "switch_facturas_tipos_sin_clasificar"
            ? { data: filasVentas, error: errorVentas }
            : { data: filasArticulos, error: null },
        ),
    }),
  },
}));

const logs: Array<{ empresaKey: string; syncType: string; status?: string; errorMessage?: string }> = [];
vi.mock("@/lib/switch-api/sync-log", async (orig) => {
  const real = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...real,
    createSwitchSyncLog: vi.fn(async (o: { empresaKey: string; syncType: string }) => {
      logs.push({ empresaKey: o.empresaKey, syncType: o.syncType });
      return `log-${logs.length}`;
    }),
    finishSwitchSyncLog: vi.fn(async (_id: string, status: string, extra?: { errorMessage?: string }) => {
      logs[logs.length - 1].status = status;
      logs[logs.length - 1].errorMessage = extra?.errorMessage;
    }),
  };
});

import {
  TIPOS_VENTA_SUMAN,
  TIPO_VENTA_RESTA,
  TIPOS_VENTA_CONOCIDOS,
  CODIGOS_ARTICULO_CONOCIDOS,
  CODIGO_ARTICULO_A_TIPO,
  signoVenta,
  esTipoVentaConocido,
} from "@/lib/ventas/tipos-comprobante";
import {
  correrCentinelaTipos,
  hallazgosQueAvisan,
  textoDelHallazgo,
  medirTiposSinClasificar,
  SYNC_TYPE_CENTINELA,
} from "@/lib/ventas/centinela-tipos";
import { montoFirmado, TIPOS_QUE_SUMAN } from "@/lib/clientes-ytd";
import { SYNC_LOG_TYPES } from "@/lib/switch-api/sync-log-tipos";
import { consecuenciaDeSyncType } from "@/lib/switch-api/alert-policy";

const MIGRACION = fs.readFileSync(
  path.resolve(__dirname, "../../../supabase/migrations/20260826140000_ventas_tipos_sin_clasificar.sql"),
  "utf8",
);
const ROUTE = fs.readFileSync(
  path.resolve(__dirname, "../../app/api/cron/switch-sync/route.ts"),
  "utf8",
);
/** Un barrido de texto que se satisface con su propio comentario no prueba
 *  nada: ya pasó cuatro veces en este repo. Se barre el código, sin comentarios. */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

beforeEach(() => {
  filasVentas = [];
  filasArticulos = [];
  errorVentas = null;
  logs.length = 0;
});

// ═════════════════════════════════════════════════════════════════════════════
describe("A. la lista se dice en UN solo lugar", () => {
  it("los tipos conocidos son los 5 que Switch usa hoy", () => {
    expect([...TIPOS_VENTA_CONOCIDOS].sort()).toEqual(
      ["Factura", "Nota de Crédito", "Nota de Débito", "Tiquete", "Transacción"].sort(),
    );
    // Transacción es el que Switch estrenó en mayo-2025; Tiquete, el que
    // reemplazó. Los dos siguen vivos: la historia no se reescribe.
    expect(TIPOS_VENTA_SUMAN).toContain("Transacción");
    expect(TIPOS_VENTA_SUMAN).toContain("Tiquete");
    expect(TIPO_VENTA_RESTA).toBe("Nota de Crédito");
  });

  it("la vista centinela de VENTAS dice EXACTAMENTE lo mismo que el TypeScript", () => {
    // Una vista SQL no puede importar TS: si las dos listas se separan, el
    // centinela deja de ver justo lo que existe para ver.
    const bloque = MIGRACION.slice(
      MIGRACION.indexOf("CREATE OR REPLACE VIEW switch_facturas_tipos_sin_clasificar"),
      MIGRACION.indexOf("CREATE OR REPLACE VIEW switch_articulo_diario_tipos_sin_clasificar"),
    );
    const m = bloque.match(/tipo_comprobante NOT IN \(([\s\S]*?)\)/);
    expect(m, "no encontré el NOT IN de la vista de ventas").toBeTruthy();
    const enSql = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    expect(enSql).toEqual([...TIPOS_VENTA_CONOCIDOS].sort());
  });

  it("la vista centinela de ARTÍCULOS dice lo mismo que los códigos cortos", () => {
    const bloque = MIGRACION.slice(
      MIGRACION.indexOf("CREATE OR REPLACE VIEW switch_articulo_diario_tipos_sin_clasificar"),
    );
    const m = bloque.match(/tipo NOT IN \(([\s\S]*?)\)/);
    expect(m).toBeTruthy();
    const enSql = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    expect(enSql).toEqual([...CODIGOS_ARTICULO_CONOCIDOS].sort());
  });

  it("CNF es Transacción y TQ es Tiquete (los códigos cortos nombran los mismos tipos)", () => {
    expect(CODIGO_ARTICULO_A_TIPO.CNF).toBe("Transacción");
    expect(CODIGO_ARTICULO_A_TIPO.TQ).toBe("Tiquete");
    // Y todo código corto nombra un tipo conocido: no puede haber un código que
    // apunte a un tipo que las ventas no saben contar.
    for (const [codigo, tipo] of Object.entries(CODIGO_ARTICULO_A_TIPO)) {
      expect(esTipoVentaConocido(tipo), `${codigo} → ${tipo}`).toBe(true);
    }
  });

  it("clientes-ytd DERIVA la lista en vez de volver a escribirla", () => {
    expect(TIPOS_QUE_SUMAN).toBe(TIPOS_VENTA_SUMAN);
    const src = fs.readFileSync(path.resolve(__dirname, "../../lib/clientes-ytd.ts"), "utf8");
    expect(sinComentarios(src)).not.toMatch(/\["Factura",\s*"Tiquete"/);
  });

  it("el signo: los 4 suman, la NC resta, lo desconocido es 0", () => {
    for (const t of TIPOS_VENTA_SUMAN) expect(signoVenta(t), t).toBe(1);
    expect(signoVenta("Nota de Crédito")).toBe(-1);
    expect(signoVenta("Transacción B")).toBe(0);
    expect(signoVenta(null)).toBe(0);
    // Y `montoFirmado` sigue diciendo lo mismo que antes de derivar la lista.
    expect(montoFirmado("Factura", 100)).toBe(100);
    expect(montoFirmado("Nota de Crédito", 100)).toBe(-100);
    expect(montoFirmado("Vale de Caja", 100)).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("B. el centinela — las DOS direcciones", () => {
  const empresas = ["vistana", "joystep"];

  it("🟢 con los tipos REALES de hoy NO avisa NUNCA", async () => {
    // Las vistas devuelven vacío justamente porque los 5 tipos son conocidos:
    // eso ya se probó contra un Postgres de verdad. Acá se prueba la reacción.
    const errores = await correrCentinelaTipos(empresas);
    expect(errores).toEqual([]);
    // Y deja rastro de que MIRÓ y estaba limpio: sin la fila `success`, un
    // hallazgo viejo se quedaría sonando para siempre.
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.status === "success")).toBe(true);
    expect(logs.every((l) => l.syncType === SYNC_TYPE_CENTINELA)).toBe(true);
  });

  it("🔴 con un tipo INVENTADO que trae plata, avisa", async () => {
    filasVentas = [
      {
        empresa_key: "vistana",
        tipo_comprobante: "Transacción B",
        filas: 12,
        filas_con_plata: 12,
        suma_base: 45231.5,
      },
    ];
    const errores = await correrCentinelaTipos(empresas);
    expect(errores).toHaveLength(1);
    expect(errores[0].empresaKey).toBe("vistana");
    expect(errores[0].syncType).toBe(SYNC_TYPE_CENTINELA);
    expect(errores[0].error).toContain("Transacción B");
    expect(errores[0].error).toContain("$45,231.50");
    expect(errores[0].error).toMatch(/CERO/);
    // La empresa afectada queda en `error` (arranca la racha) y la limpia en
    // `success` (no arrastra una racha que no es suya).
    expect(logs.find((l) => l.empresaKey === "vistana")!.status).toBe("error");
    expect(logs.find((l) => l.empresaKey === "joystep")!.status).toBe("success");
  });

  it("🔴 también vigila el diario de ARTÍCULOS, donde el riesgo es el opuesto", () => {
    // Ahí las vistas hacen `CASE WHEN tipo='NC' THEN -x ELSE x END`: un código
    // nuevo SUMA sin permiso e infla costo y utilidad.
    const texto = textoDelHallazgo([
      { empresaKey: "vistana", tipo: "XX", fuente: "articulos", filas: 3, filasConPlata: 3, plata: 900 },
    ]);
    expect(texto).toContain("XX");
    expect(texto).toMatch(/costo/);
    expect(texto).not.toMatch(/CERO/);
  });

  it("un tipo nuevo SIN plata queda anotado pero NO despierta a nadie", async () => {
    filasVentas = [
      { empresa_key: "vistana", tipo_comprobante: "Cotización", filas: 4, filas_con_plata: 0, suma_base: 0 },
    ];
    expect(await correrCentinelaTipos(empresas)).toEqual([]);
    expect(logs.every((l) => l.status === "success")).toBe(true);
  });

  it("un tipo NULL también cuenta: una fila sin tipo tampoco la sabe contar nadie", async () => {
    filasVentas = [
      { empresa_key: "joystep", tipo_comprobante: null, filas: 1, filas_con_plata: 1, suma_base: 80 },
    ];
    const errores = await correrCentinelaTipos(empresas);
    expect(errores).toHaveLength(1);
    expect(errores[0].error).toContain("(sin tipo)");
  });

  it("dos empresas afectadas = dos renglones, no dos mensajes", async () => {
    filasVentas = [
      { empresa_key: "vistana", tipo_comprobante: "X", filas: 1, filas_con_plata: 1, suma_base: 10 },
      { empresa_key: "joystep", tipo_comprobante: "X", filas: 1, filas_con_plata: 1, suma_base: 20 },
    ];
    const errores = await correrCentinelaTipos(empresas);
    expect(errores).toHaveLength(2);
    // Los dos van en la MISMA llamada a alertSwitchCronErrors (lo verifica D).
  });

  it("⛔ si NO puede medir, lo dice y NO avisa (no pude mirar ≠ está todo bien)", async () => {
    errorVentas = { message: 'relation "switch_facturas_tipos_sin_clasificar" does not exist', code: "42P01" };
    const errores = await correrCentinelaTipos(empresas);
    expect(errores).toEqual([]);
    // Y no inventa filas de log de una medición que no ocurrió.
    expect(logs).toHaveLength(0);
    const m = await medirTiposSinClasificar();
    expect(m.ok).toBe(false);
    if (!m.ok) expect(m.motivo).toMatch(/todavía no existe/);
  });

  it("NUNCA lanza: un centinela que tumba el sync que vigila es peor que no tenerlo", async () => {
    errorVentas = { message: "boom" };
    await expect(correrCentinelaTipos(empresas)).resolves.toEqual([]);
  });

  it("hallazgosQueAvisan es PURA y filtra por plata, no por cantidad", () => {
    const base = { empresaKey: "v", tipo: "X", fuente: "ventas" as const, filas: 99, plata: 0 };
    expect(hallazgosQueAvisan([{ ...base, filasConPlata: 0 }])).toEqual([]);
    expect(hallazgosQueAvisan([{ ...base, filasConPlata: 1, plata: 5 }])).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("C. va por la política que YA existe — no estrena una alerta nueva", () => {
  it("el sync_type del centinela está en las DOS listas (si no, sus corridas son invisibles)", () => {
    expect(SYNC_LOG_TYPES).toContain(SYNC_TYPE_CENTINELA);
    expect(MIGRACION).toMatch(/'ventas_tipos'/);
  });

  it("el mensaje dice QUÉ significa en plata, no cómo se llama la tabla", () => {
    const c = consecuenciaDeSyncType(SYNC_TYPE_CENTINELA);
    expect(c).toMatch(/CERO/);
    expect(c).not.toMatch(/switch_facturas|tipo_comprobante|ELSE/);
    // Y el default genérico ya no lo tapa.
    expect(c).not.toBe(consecuenciaDeSyncType("inventado"));
  });

  it("el módulo del centinela NO manda Telegram por su cuenta", () => {
    const src = sinComentarios(
      fs.readFileSync(path.resolve(__dirname, "../../lib/ventas/centinela-tipos.ts"), "utf8"),
    );
    expect(src).not.toMatch(/enviarSistema|enviarNegocio|sendTelegramAlert/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("D. el cron lo llama bien", () => {
  const src = sinComentarios(ROUTE);

  it("hay UNA sola llamada a alertSwitchCronErrors (dos serían dos mensajes)", () => {
    expect(src.match(/await alertSwitchCronErrors\(/g) ?? []).toHaveLength(1);
  });

  it("el route no manda Telegram por su cuenta", () => {
    expect(src).not.toMatch(/enviarSistema|enviarNegocio|sendTelegramAlert/);
  });

  it("los hallazgos del centinela entran a la MISMA llamada que los fallos de sync", () => {
    expect(src).toMatch(/correrCentinelaTipos/);
    expect(src).toMatch(/paraAlertar[\s\S]{0,200}\.\.\.centinela/);
    expect(src).toMatch(/if \(paraAlertar\.length > 0\)[\s\S]{0,120}alertSwitchCronErrors/);
  });

  it("🔴 el centinela NO toca el heartbeat: las facturas se escribieron bien", () => {
    // Si un tipo nuevo suprimiera el latido, además de este aviso sonaría el de
    // "cron caído" todos los días — la alerta que suena para siempre.
    expect(src).toMatch(/if \(errors\.length === 0\)\s*\{[\s\S]{0,200}recordCronHeartbeat/);
    const i = src.indexOf("recordCronHeartbeat");
    expect(src.slice(Math.max(0, i - 300), i)).not.toMatch(/centinela|paraAlertar/);
  });

  it("solo corre en las corridas que traen facturas", () => {
    expect(src).toMatch(/tipo === "facturas" \|\| tipo === "all"[\s\S]{0,120}correrCentinelaTipos/);
  });
});
