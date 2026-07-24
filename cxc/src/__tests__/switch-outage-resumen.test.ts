/**
 * Resumen post-recuperación de caídas de Switch (outage-resumen.ts): clasifica
 * el patrón-caída, detecta la ventana (primer fallo → última recuperación) y
 * dedup por watermark. Fixtures con los datos REALES del 24-jul-2026 (medidos
 * en switch_sync_log/cron_email_errors de producción): joystep falló 06:06 UTC
 * (01:06 Panamá) con HTML-auth en sus 3 syncs y la pasada de las 10:00 UTC lo
 * recuperó 10:53-10:54 UTC (05:54 Panamá); reebok-catalogo falló ~13:04 UTC y
 * la pasada de las 14:00 lo recuperó 14:38 UTC (09:38 Panamá).
 */
import { describe, it, expect, vi } from "vitest";

// outage-resumen importa supabase-server y telegram (directo y vía
// cron-telemetry) en el top-level; se mockean para que el import no construya
// el cliente real (mismo patrón que switch-alert-policy.test.ts).
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: vi.fn() },
}));
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: vi.fn(),
  shortError: (s: string) => s,
}));

import {
  isSwitchCaida,
  normalizarTipoCron,
  extraerParesDeMensaje,
  detectarVentanaCaida,
  buildMensajeCaida,
  OUTAGE_RESUMEN_TIPO,
  type OutageSyncLogRow,
} from "@/lib/switch-api/outage-resumen";

const HTML_AUTH = "Auth respondió 200 pero sin token: <!DOCTYPE html>";
const RED = "Error de red en /autenticacion: fetch failed (UND_ERR_CONNECT_TIMEOUT)";

// Hora Panamá = UTC-5 → 06:06Z = 01:06 Panamá, 10:54Z = 05:54 Panamá.
const err = (
  empresa: string,
  tipo: string,
  startedAt: string,
  msg: string = HTML_AUTH,
): OutageSyncLogRow => ({
  empresa_key: empresa,
  sync_type: tipo,
  status: "error",
  started_at: startedAt,
  error_message: msg,
});
const ok = (empresa: string, tipo: string, startedAt: string): OutageSyncLogRow => ({
  empresa_key: empresa,
  sync_type: tipo,
  status: "success",
  started_at: startedAt,
  error_message: null,
});

describe("isSwitchCaida", () => {
  it("HTML-auth (mantenimiento Switch) y red/timeout/5xx son caída", () => {
    expect(isSwitchCaida(HTML_AUTH)).toBe(true);
    expect(isSwitchCaida(RED)).toBe(true);
    expect(isSwitchCaida("Error de red en /apifactura: fetch failed (ECONNREFUSED)")).toBe(true);
    expect(isSwitchCaida("Timeout >30000ms en /apifactura")).toBe(true);
    expect(isSwitchCaida("/apifactura → HTTP 502: Bad Gateway")).toBe(true);
  });

  it("HTML a media llamada también es caída (caso real reebok 24-jul)", () => {
    expect(
      isSwitchCaida("update products sku=100202441: <!DOCTYPE html> <!--[if lt IE 7]>…"),
    ).toBe(true);
  });

  it("401/token (colisión de sesión única) NO es caída, ni LICENCIA/negocio", () => {
    expect(isSwitchCaida("/apifactura → HTTP 401: TOKEN INVALIDO")).toBe(false);
    expect(isSwitchCaida("Auth fallo: HTTP 400 — LICENCIA NO SE ENCUENTRA ACTIVA")).toBe(false);
    expect(isSwitchCaida("Run previo atascado en 'running' (probable timeout); cerrado por el siguiente run.")).toBe(false);
    expect(isSwitchCaida(null)).toBe(false);
    expect(isSwitchCaida("")).toBe(false);
  });
});

describe("normalizarTipoCron", () => {
  it("mapea tipos de cron_email_errors al nombre de cron_heartbeats", () => {
    expect(normalizarTipoCron("sync_clientes_master_failed")).toBe("sync-clientes-master");
    expect(normalizarTipoCron("reebok_catalogo_failed")).toBe("reebok-catalogo");
    expect(normalizarTipoCron("acs-resumen-diario_failed")).toBe("acs-resumen-diario");
    expect(normalizarTipoCron("switch-sync")).toBe("switch-sync");
  });
});

describe("extraerParesDeMensaje", () => {
  it("lee los pares empresa/sync del formato de alert-policy (mensajes reales)", () => {
    expect(
      extraerParesDeMensaje(
        "3 sync(s) fallaron — joystep/facturas: Auth respondió 200 pero sin token: <!DOCTYPE html>; joystep/estadocuenta: …; joystep/costo: …",
      ),
    ).toEqual([
      { empresa_key: "joystep", sync_type: "facturas" },
      { empresa_key: "joystep", sync_type: "estadocuenta" },
      { empresa_key: "joystep", sync_type: "costo" },
    ]);
    expect(
      extraerParesDeMensaje(
        "1 sync(s) fallaron — active_shoes/catalogo_reebok: update products sku=100202441: <!DOCTYPE html>…",
      ),
    ).toEqual([{ empresa_key: "active_shoes", sync_type: "catalogo_reebok" }]);
  });

  it("no inventa pares con URLs u otros slashes (solo empresa keys canónicas)", () => {
    expect(extraerParesDeMensaje("Error de red en /autenticacion: fetch failed")).toEqual([]);
    expect(extraerParesDeMensaje("GET https://switch.example/api/x → HTTP 502")).toEqual([]);
  });
});

describe("detectarVentanaCaida — caso real 24-jul (joystep 06:06Z → 10:54Z)", () => {
  // Timestamps reales de switch_sync_log de producción (24-jul-2026): el run
  // de las 05:40 UTC de joystep encontró el mantenimiento (HTML-auth en los 3
  // tipos, 06:06Z) y la pasada de reconciliación de las 10:00 UTC recuperó los
  // 3 pares (10:53-10:54Z).
  const syncLog: OutageSyncLogRow[] = [
    err("joystep", "facturas", "2026-07-24T06:06:24+00:00"),
    err("joystep", "estadocuenta", "2026-07-24T06:06:41+00:00"),
    err("joystep", "costo", "2026-07-24T06:06:42+00:00"),
    ok("vistana", "facturas", "2026-07-24T05:32:00+00:00"),
    ok("joystep", "facturas", "2026-07-24T10:53:06+00:00"),
    ok("joystep", "estadocuenta", "2026-07-24T10:53:12+00:00"),
    ok("joystep", "costo", "2026-07-24T10:54:16+00:00"),
  ];

  it("detecta ventana recuperada: 3 syncs, solo Joystep, 06:06Z→10:54Z", () => {
    const r = detectarVentanaCaida({ syncLog, cronErrors: [], heartbeats: [], watermarkIso: null });
    expect(r.estado).toBe("recuperada");
    if (r.estado !== "recuperada") return;
    expect(r.ventana.desdeIso).toBe("2026-07-24T06:06:24+00:00");
    expect(r.ventana.hastaIso).toBe("2026-07-24T10:54:16+00:00");
    expect(r.ventana.syncsAfectados).toBe(3);
    expect(r.ventana.empresas).toEqual(["Joystep"]);
  });

  it("mensaje en español simple con hora Panamá (01:06 → 05:54)", () => {
    const r = detectarVentanaCaida({ syncLog, cronErrors: [], heartbeats: [], watermarkIso: null });
    if (r.estado !== "recuperada") throw new Error("esperaba recuperada");
    expect(buildMensajeCaida(r.ventana)).toBe(
      "ℹ️ Switch estuvo caído de 01:06 a 05:54 (hora Panamá) — 3 syncs afectados (Joystep), todo re-sincronizado, sin impacto.",
    );
  });

  it("sin success posterior → caida_activa (NO se manda nada)", () => {
    const soloErrores = syncLog.filter((r) => r.status === "error" || r.empresa_key !== "joystep");
    const r = detectarVentanaCaida({ syncLog: soloErrores, cronErrors: [], heartbeats: [], watermarkIso: null });
    expect(r.estado).toBe("caida_activa");
    if (r.estado === "caida_activa") {
      expect(r.pendientes).toContain("joystep/facturas");
    }
  });

  it("recuperación PARCIAL (1 de 3 pares sin success posterior) → caida_activa", () => {
    const parcial = syncLog.filter((r) => !(r.status === "success" && r.sync_type === "costo"));
    const r = detectarVentanaCaida({ syncLog: parcial, cronErrors: [], heartbeats: [], watermarkIso: null });
    expect(r.estado).toBe("caida_activa");
  });

  it("DEDUP: con watermark posterior a los fallos, no re-reporta (sin_caida)", () => {
    // El resumen se envió a las 10:55Z (tras la recuperación) → las pasadas de
    // las 14:00 y 18:00 UTC no deben repetirlo.
    const r = detectarVentanaCaida({
      syncLog,
      cronErrors: [
        { tipo: OUTAGE_RESUMEN_TIPO, error_message: "ℹ️ Switch estuvo caído…", created_at: "2026-07-24T10:55:00+00:00" },
      ],
      heartbeats: [],
      watermarkIso: "2026-07-24T10:55:00+00:00",
    });
    expect(r.estado).toBe("sin_caida");
  });

  it("caída NUEVA posterior al watermark sí genera su propio resumen", () => {
    // Segundo incidente del día (reebok, tarde): fallo y recovery POSTERIORES
    // al watermark del resumen de joystep → resumen propio, sin re-contar
    // los fallos de la mañana.
    const r = detectarVentanaCaida({
      syncLog: [
        ...syncLog,
        err("active_shoes", "catalogo_reebok", "2026-07-24T13:04:00+00:00", RED),
        ok("active_shoes", "catalogo_reebok", "2026-07-24T14:38:58+00:00"),
      ],
      cronErrors: [],
      heartbeats: [],
      watermarkIso: "2026-07-24T10:55:00+00:00",
    });
    expect(r.estado).toBe("recuperada");
    if (r.estado !== "recuperada") return;
    expect(r.ventana.syncsAfectados).toBe(1);
    expect(r.ventana.empresas).toEqual(["Active Shoes"]);
    expect(buildMensajeCaida(r.ventana)).toBe(
      "ℹ️ Switch estuvo caído de 08:04 a 09:38 (hora Panamá) — 1 sync afectado (Active Shoes), todo re-sincronizado, sin impacto.",
    );
  });
});

describe("detectarVentanaCaida — caso real 24-jul reebok (run murió sin finalizar su log)", () => {
  // La fila de switch_sync_log quedó 'running' y la cerró el lock con "Run
  // previo atascado" (NO patrón-caída); el error real (HTML de mantenimiento a
  // media llamada) quedó solo en cron_email_errors, que menciona el par →
  // evidencia por par con recuperación en el propio sync log (14:38 UTC).
  const syncLog: OutageSyncLogRow[] = [
    err(
      "active_shoes",
      "catalogo_reebok",
      "2026-07-24T12:59:56+00:00",
      "Run previo atascado en 'running' (probable timeout); cerrado por el siguiente run.",
    ),
    ok("active_shoes", "catalogo_reebok", "2026-07-24T14:38:58+00:00"),
  ];
  const cronErrors = [
    {
      tipo: "reebok-catalogo",
      error_message:
        "1 sync(s) fallaron — active_shoes/catalogo_reebok: update products sku=100202441: <!DOCTYPE html> <!--[if lt IE 7]>…",
      created_at: "2026-07-24T13:04:00+00:00",
    },
  ];

  it("detecta la caída vía cron_email_errors y la recuperación vía sync log", () => {
    const r = detectarVentanaCaida({ syncLog, cronErrors, heartbeats: [], watermarkIso: null });
    expect(r.estado).toBe("recuperada");
    if (r.estado !== "recuperada") return;
    expect(r.ventana.syncsAfectados).toBe(1);
    expect(r.ventana.empresas).toEqual(["Active Shoes"]);
    // 13:04 UTC = 08:04 Panamá; 14:38 UTC = 09:38 Panamá.
    expect(buildMensajeCaida(r.ventana)).toBe(
      "ℹ️ Switch estuvo caído de 08:04 a 09:38 (hora Panamá) — 1 sync afectado (Active Shoes), todo re-sincronizado, sin impacto.",
    );
  });

  it("sin el success posterior → caida_activa (no reporta)", () => {
    const r = detectarVentanaCaida({
      syncLog: syncLog.filter((x) => x.status !== "success"),
      cronErrors,
      heartbeats: [],
      watermarkIso: null,
    });
    expect(r.estado).toBe("caida_activa");
  });
});

describe("detectarVentanaCaida — colaterales y filtros", () => {
  it("errores 401 puros NO cuentan como caída (sin_caida)", () => {
    const r = detectarVentanaCaida({
      syncLog: [
        err("vistana", "facturas", "2026-07-22T11:00:00+00:00", "/apifactura → HTTP 401: TOKEN INVALIDO"),
        ok("vistana", "facturas", "2026-07-22T15:00:00+00:00"),
      ],
      cronErrors: [],
      heartbeats: [],
      watermarkIso: null,
    });
    expect(r.estado).toBe("sin_caida");
  });

  it("colateral sin switch_sync_log (clientes-master) cuenta vía cron_email_errors + heartbeat", () => {
    const r = detectarVentanaCaida({
      syncLog: [
        err("joystep", "facturas", "2026-07-22T11:06:00+00:00"),
        ok("joystep", "facturas", "2026-07-22T15:53:00+00:00"),
      ],
      cronErrors: [
        { tipo: "sync_clientes_master_failed", error_message: RED, created_at: "2026-07-22T12:00:00+00:00" },
      ],
      heartbeats: [{ cron_name: "sync-clientes-master", last_success_at: "2026-07-22T15:10:00+00:00" }],
      watermarkIso: null,
    });
    expect(r.estado).toBe("recuperada");
    if (r.estado !== "recuperada") return;
    expect(r.ventana.syncsAfectados).toBe(2);
    expect(r.ventana.empresas).toEqual(["Joystep", "sync-clientes-master"]);
  });

  it("colateral SIN heartbeat posterior bloquea el resumen (caida_activa)", () => {
    const r = detectarVentanaCaida({
      syncLog: [],
      cronErrors: [
        { tipo: "sync_clientes_master_failed", error_message: RED, created_at: "2026-07-22T12:00:00+00:00" },
      ],
      heartbeats: [{ cron_name: "sync-clientes-master", last_success_at: "2026-07-22T07:05:00+00:00" }],
      watermarkIso: null,
    });
    expect(r.estado).toBe("caida_activa");
    if (r.estado === "caida_activa") expect(r.pendientes).toEqual(["sync-clientes-master"]);
  });

  it("filas de cron_email_errors de crons YA cubiertos por switch_sync_log no duplican el conteo", () => {
    // alert-policy persiste "fallo transitorio … — joystep/facturas: …" con
    // tipo=switch-sync: es el MISMO fallo que la fila del sync log.
    const r = detectarVentanaCaida({
      syncLog: [
        err("joystep", "facturas", "2026-07-22T11:06:00+00:00"),
        ok("joystep", "facturas", "2026-07-22T15:53:00+00:00"),
      ],
      cronErrors: [
        {
          tipo: "switch-sync",
          error_message: `fallo transitorio (1ra corrida, sin alerta) — joystep/facturas: ${RED}`,
          created_at: "2026-07-22T11:06:30+00:00",
        },
        { tipo: "reebok_catalogo_failed", error_message: RED, created_at: "2026-07-22T11:07:00+00:00" },
      ],
      // reebok-catalogo también escribe switch_sync_log → excluido del conteo
      // colateral aunque no haya fila de sync log en este fixture.
      heartbeats: [],
      watermarkIso: null,
    });
    expect(r.estado).toBe("recuperada");
    if (r.estado !== "recuperada") return;
    expect(r.ventana.syncsAfectados).toBe(1);
    expect(r.ventana.empresas).toEqual(["Joystep"]);
  });

  it("tipo desconocido (sin fila en cron_heartbeats) con HTML embebido se descarta", () => {
    // Ej. un error de email que arrastra una página HTML: no es un cron Switch
    // conocido → no bloquea ni cuenta.
    const r = detectarVentanaCaida({
      syncLog: [],
      cronErrors: [
        { tipo: "cheques", error_message: "Resend rechazó: <!DOCTYPE html> …", created_at: "2026-07-22T12:00:00+00:00" },
      ],
      heartbeats: [{ cron_name: "sync-clientes-master", last_success_at: "2026-07-22T07:05:00+00:00" }],
      watermarkIso: null,
    });
    expect(r.estado).toBe("sin_caida");
  });

  it("sin ningún fallo patrón-caída → sin_caida", () => {
    const r = detectarVentanaCaida({
      syncLog: [ok("vistana", "facturas", "2026-07-22T10:30:00+00:00")],
      cronErrors: [],
      heartbeats: [],
      watermarkIso: null,
    });
    expect(r.estado).toBe("sin_caida");
  });
});

describe("buildMensajeCaida — ventana que cruza medianoche Panamá", () => {
  it("incluye la fecha en cada extremo cuando los días Panamá difieren", () => {
    const msg = buildMensajeCaida({
      // 21-jul 23:15 Panamá (=22-jul 04:15Z) → 22-jul 06:30 Panamá (=11:30Z)
      desdeIso: "2026-07-22T04:15:00+00:00",
      hastaIso: "2026-07-22T11:30:00+00:00",
      syncsAfectados: 2,
      empresas: ["Multifashion"],
    });
    expect(msg).toContain("21 jul");
    expect(msg).toContain("22 jul");
    expect(msg).toContain("23:15");
    expect(msg).toContain("06:30");
    expect(msg).toContain("2 syncs afectados (Multifashion)");
  });
});
