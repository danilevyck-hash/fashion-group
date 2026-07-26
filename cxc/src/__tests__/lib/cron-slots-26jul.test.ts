// Incidente del 26-jul-2026 — las marcas de slot y el calendario nuevo.
//
// A las 06:14 UTC el PR #295 llevó vercel.json de 47 a 52 entradas: nacieron
// `facturas-1300/1700/1900/2100/2300` y `facturas-1500` pasó de 1 empresa a 8.
// La pasada de reconciliación de las 10:02:55 —la primera con ese calendario—
// dejó dos síntomas medidos en cron_heartbeats:
//
//  A) Marcas de "cubierto" FALSAS en entradas recién nacidas. `ultimaOcurrenciaUtc`
//     ancla en la ocurrencia programada más reciente y, para una hora que hoy aún
//     no llegó, esa ocurrencia cae AYER — cuando la entrada NO EXISTÍA. Como
//     american_classic/facturas tenía corridas posteriores (23:15:32, 00:15:40,
//     06:30:22), `facturas-1300/1700/1900/2100` recibieron `#recuperado` a las
//     10:02:53-54 certificando corridas que jamás estuvieron programadas.
//     (`facturas-2300` se salvó de casualidad: la corrida de las 23:15:32 cayó
//     dentro de su ventana de 30 min → `corrioEnVentana`.)
//
//  B) Trato distinto para dos slots en el mismo estado observable. `facturas-1500`
//     (invocación perdida ayer, pares al día hoy) recibió `#recuperado` y quedó
//     silenciado; `estadocuenta-1605` y `1610` —que ayer 16:20/16:22 CORRIERON y
//     FALLARON, y cuyos pares reparó la ronda de las 21:1x— no recibieron nada.
//     Su heartbeat quedó congelado en el 24-jul y el watchdog de Telegram alertó
//     por los dos con los datos perfectamente frescos.
//
// Todos los timestamps son los REALES de switch_sync_log y cron_heartbeats de
// producción (leídos el 26-jul a las 15:30 UTC).
import { describe, it, expect, vi } from "vitest";

// cron-telemetry importa supabase-server y telegram en el top-level.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: vi.fn(),
  shortError: (s: string) => s,
}));

import {
  SLOT_ENTRY_DEAD_HOURS,
  clasificarSlots,
  cronIsStale,
  slotConocidoDesdeMs,
  slotCubiertoPorRecuperacion,
  slotHeartbeatName,
  slotVistoName,
  ultimaOcurrenciaUtc,
  type SyncLogRowMin,
} from "@/lib/cron-telemetry";
// Calendario CONGELADO del 26-jul-2026 (el del incidente). El calendario vivo
// tiene sus propios tests en cron-calendario.test.ts.
import { SLOTS_26JUL2026 } from "../fixtures/slots-26jul2026";

const H = 3600 * 1000;
const CXC = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];

const row = (
  started_at: string,
  empresa_key: string,
  sync_type: string,
  status = "success",
  error_message: string | null = null,
): SyncLogRowMin => ({ empresa_key, sync_type, status, started_at, error_message });

/** La pasada real que disparó todo. */
const PASADA_1002 = new Date("2026-07-26T10:02:55Z");

// ── switch_sync_log REAL, 25-jul 00:00 → 26-jul 10:02 UTC ────────────────────
const LOG: SyncLogRowMin[] = [
  row("2026-07-25T05:09:40Z", "american_classic", "facturas"),
  row("2026-07-25T05:39:08Z", "vistana", "facturas"),
  row("2026-07-25T05:39:16Z", "vistana", "estadocuenta"),
  row("2026-07-25T05:41:31Z", "vistana", "costo"),
  row("2026-07-25T05:41:32Z", "active_wear", "facturas"),
  row("2026-07-25T05:41:35Z", "active_wear", "estadocuenta"),
  row("2026-07-25T05:43:19Z", "active_wear", "costo"),
  row("2026-07-25T06:52:03Z", "american_classic", "facturas"),
  row("2026-07-25T06:52:14Z", "american_classic", "costo"),
  row("2026-07-25T06:52:16Z", "confecciones_boston", "facturas"),
  row("2026-07-25T06:52:23Z", "confecciones_boston", "costo"),
  row("2026-07-25T10:28:40Z", "fashion_wear", "facturas"),
  row("2026-07-25T10:28:44Z", "fashion_wear", "estadocuenta"),
  row("2026-07-25T10:30:21Z", "fashion_wear", "costo"),
  row("2026-07-25T10:30:24Z", "fashion_shoes", "facturas"),
  row("2026-07-25T10:30:32Z", "fashion_shoes", "estadocuenta"),
  row("2026-07-25T10:32:40Z", "fashion_shoes", "costo"),
  row("2026-07-25T10:32:41Z", "active_shoes", "facturas"),
  row("2026-07-25T10:32:45Z", "active_shoes", "estadocuenta", "error", "Run previo atascado en 'running'"),
  row("2026-07-25T14:31:31Z", "active_shoes", "estadocuenta"),
  row("2026-07-25T14:33:01Z", "active_shoes", "costo"),
  row("2026-07-25T14:33:07Z", "joystep", "facturas"),
  row("2026-07-25T14:33:15Z", "joystep", "estadocuenta"),
  row("2026-07-25T14:34:52Z", "joystep", "costo"),
  // Ronda de las 16:0x — corrió TARDE y FALLÓ (el incidente del 25-jul).
  row("2026-07-25T16:20:09Z", "fashion_shoes", "estadocuenta", "error", "UPSERT estadocuenta falló: canceling statement due to statement timeout"),
  row("2026-07-25T16:22:37Z", "fashion_wear", "estadocuenta", "error", "Run previo atascado en 'running'"),
  row("2026-07-25T16:23:47Z", "vistana", "estadocuenta"),
  row("2026-07-25T16:26:23Z", "active_wear", "estadocuenta", "error", "Run previo atascado en 'running'"),
  row("2026-07-25T16:29:36Z", "active_shoes", "estadocuenta"),
  row("2026-07-25T16:31:59Z", "joystep", "estadocuenta"),
  // Ronda de las 21:1x — reparó los pares que la ronda de las 16:0x dejó rotos.
  row("2026-07-25T21:10:01Z", "vistana", "estadocuenta"),
  row("2026-07-25T21:12:29Z", "active_wear", "estadocuenta"),
  row("2026-07-25T21:15:13Z", "fashion_shoes", "estadocuenta"),
  row("2026-07-25T21:16:54Z", "fashion_wear", "estadocuenta"),
  row("2026-07-25T21:20:22Z", "active_shoes", "estadocuenta"),
  row("2026-07-25T21:22:32Z", "joystep", "estadocuenta"),
  // Ventas ACS de la noche (entrada vieja facturas-2315 y facturas-0015).
  row("2026-07-25T23:15:32Z", "american_classic", "facturas"),
  row("2026-07-26T00:15:40Z", "american_classic", "facturas"),
  // Bloque `all` de la madrugada del 26 — deja las 8 empresas al día.
  row("2026-07-26T05:30:06Z", "vistana", "facturas"),
  row("2026-07-26T05:30:15Z", "vistana", "estadocuenta"),
  row("2026-07-26T05:32:39Z", "vistana", "costo"),
  row("2026-07-26T05:32:41Z", "active_wear", "facturas"),
  row("2026-07-26T05:32:44Z", "active_wear", "estadocuenta"),
  row("2026-07-26T05:34:33Z", "active_wear", "costo"),
  row("2026-07-26T05:35:32Z", "fashion_shoes", "facturas"),
  row("2026-07-26T05:35:35Z", "fashion_shoes", "estadocuenta"),
  row("2026-07-26T05:36:44Z", "fashion_shoes", "costo"),
  row("2026-07-26T05:36:45Z", "fashion_wear", "facturas"),
  row("2026-07-26T05:36:49Z", "fashion_wear", "estadocuenta"),
  row("2026-07-26T05:38:37Z", "fashion_wear", "costo"),
  row("2026-07-26T05:40:43Z", "active_shoes", "facturas"),
  row("2026-07-26T05:40:51Z", "active_shoes", "estadocuenta"),
  row("2026-07-26T05:42:42Z", "active_shoes", "costo"),
  row("2026-07-26T05:42:43Z", "joystep", "facturas"),
  row("2026-07-26T05:42:46Z", "joystep", "estadocuenta"),
  row("2026-07-26T05:44:28Z", "joystep", "costo"),
  row("2026-07-26T06:30:22Z", "american_classic", "facturas"),
  row("2026-07-26T06:30:31Z", "american_classic", "costo"),
  row("2026-07-26T06:30:33Z", "confecciones_boston", "facturas"),
  row("2026-07-26T06:30:36Z", "confecciones_boston", "costo"),
];

/** cron_heartbeats REAL justo ANTES de la pasada de las 10:02:55. Las 5 entradas
 *  nacidas a las 06:14 no tienen fila propia ni marca de ninguna clase. */
const HB_ANTES = (): Map<string, string | null | undefined> =>
  new Map([
    ["switch-sync:all-0530", "2026-07-26T05:34:35Z"],
    ["switch-sync:all-0535", "2026-07-26T05:38:39Z"],
    ["switch-sync:all-0540", "2026-07-26T05:44:31Z"],
    ["switch-sync:all-0630", "2026-07-26T06:30:36Z"],
    ["switch-sync:facturas-1500", "2026-07-24T15:26:28Z"],
    ["switch-sync:estadocuenta-1600", "2026-07-25T16:33:54Z"],
    ["switch-sync:estadocuenta-1605", "2026-07-24T16:55:44Z"],
    ["switch-sync:estadocuenta-1610", "2026-07-24T17:10:41Z"],
    ["switch-sync:estadocuenta-2110", "2026-07-25T21:13:58Z"],
    ["switch-sync:estadocuenta-2115", "2026-07-25T21:18:44Z"],
    ["switch-sync:estadocuenta-2120", "2026-07-25T21:24:02Z"],
    ["switch-sync:facturas-0015", "2026-07-26T00:15:47Z"],
  ]);

/** Los 5 slots nacidos a las 06:14; la reconciliación les escribe #visto al
 *  empezar la pasada (insert-if-absent) — es lo que hace `reconciliarSlots-
 *  SwitchSync` antes de clasificar. Timestamps reales de producción. */
const NUEVOS = ["facturas-1300", "facturas-1700", "facturas-1900", "facturas-2100", "facturas-2300"];
const conVisto = () => {
  const hb = HB_ANTES();
  for (const [i, s] of NUEVOS.entries()) {
    hb.set(slotVistoName(s), `2026-07-26T10:02:5${2 + Math.min(i, 1)}Z`);
  }
  return hb;
};

const clasificar = (now: Date, hb: Map<string, string | null | undefined>, rows = LOG) =>
  clasificarSlots({ now, rows, heartbeats: hb, empresasConCxc: CXC, slots: SLOTS_26JUL2026 });

// ─────────────────────────────────────────────────────────────────────────────
describe("A — una entrada nacida hoy no responde por las ocurrencias de ayer", () => {
  it("la ocurrencia que se evaluaba caía AYER, antes de que la entrada existiera", () => {
    // El calendario nuevo se desplegó a las 06:14 UTC del 26.
    expect(ultimaOcurrenciaUtc("1300", PASADA_1002).toISOString()).toBe("2026-07-25T13:00:00.000Z");
    expect(ultimaOcurrenciaUtc("2100", PASADA_1002).toISOString()).toBe("2026-07-25T21:00:00.000Z");
  });

  it("el bug medido: SIN la marca #visto, la pasada certificaba 4 ocurrencias inexistentes", () => {
    // Reproduce lo que pasó en producción (marcas #recuperado 10:02:53-54).
    const out = clasificar(PASADA_1002, HB_ANTES());
    const cubiertos = out.cubiertos.map((c) => c.slot);
    expect(cubiertos).toContain("facturas-1300");
    expect(cubiertos).toContain("facturas-1700");
    expect(cubiertos).toContain("facturas-1900");
    expect(cubiertos).toContain("facturas-2100");
  });

  it("con la marca #visto de la propia pasada, esas ocurrencias no se clasifican", () => {
    const out = clasificar(PASADA_1002, conVisto());
    for (const slot of NUEVOS) {
      expect(out.cubiertos.map((c) => c.slot), `${slot} no debe recibir marca`).not.toContain(slot);
      expect(out.desatendidos.map((d) => d.slot), `${slot} no debe re-ejecutarse`).not.toContain(slot);
    }
  });

  it("el piso es la evidencia más vieja de que la entrada existía (#visto o heartbeat propio)", () => {
    const hb = conVisto();
    // Entrada nueva: solo #visto.
    expect(slotConocidoDesdeMs("facturas-1300", hb)).toBe(Date.parse("2026-07-26T10:02:52Z"));
    // Entrada vieja: su heartbeat propio ya prueba que existía.
    expect(slotConocidoDesdeMs("facturas-1500", hb)).toBe(Date.parse("2026-07-24T15:26:28Z"));
    // Sin ningún rastro → sin piso (fail-abierto: se evalúa como antes).
    expect(Number.isNaN(slotConocidoDesdeMs("facturas-1300", HB_ANTES()))).toBe(true);
  });

  it("el riesgo caro: sin el piso, ventas ACS atrasadas dispara re-syncs y alerta por corridas que nunca existieron", () => {
    // Mismo día, pero sin las corridas de ACS posteriores a las 13:00 de ayer.
    const sinAcsNocturno = LOG.filter(
      (r) => !(r.empresa_key === "american_classic" && r.started_at > "2026-07-25T13:00:00Z"),
    );
    const sinPiso = clasificar(PASADA_1002, HB_ANTES(), sinAcsNocturno);
    const d = sinPiso.desatendidos.find((x) => x.slot === "facturas-2100");
    expect(d, "sin piso, una entrada de hoy sale como invocación perdida de ayer").toBeTruthy();
    expect(d!.motivo).toBe("sin-invocacion");

    const conPiso = clasificar(PASADA_1002, conVisto(), sinAcsNocturno);
    for (const slot of NUEVOS) {
      expect(conPiso.desatendidos.map((x) => x.slot)).not.toContain(slot);
    }
  });

  it("facturas-2300 se salvó por accidente, no por la regla: el piso es lo que lo protege", () => {
    // Es la única de las 5 nuevas SIN #recuperado en cron_heartbeats, y por una
    // razón casual: la entrada VIEJA `facturas-2315` corrió a las 23:15:32, o sea
    // dentro de la ventana de 30 min de la ocurrencia de las 23:00 → la regla
    // vieja lo leía como "la entrada se invocó" y no lo cubría. Esa protección
    // era de azar puro (dependía de que otra entrada corriera cerca) y encima
    // parcial: de los 8 pares del slot solo corrió american_classic. Sin piso el
    // slot se cubre igual; con piso no se evalúa siquiera.
    const sinPiso = clasificar(PASADA_1002, HB_ANTES());
    expect(sinPiso.cubiertos.map((c) => c.slot)).toContain("facturas-2300");
    const conPiso = clasificar(PASADA_1002, conVisto());
    expect(conPiso.cubiertos.map((c) => c.slot)).not.toContain("facturas-2300");
  });

  it("desde su PRIMERA ocurrencia real el slot se evalúa normal", () => {
    // 26-jul 13:00:26 corrió de verdad (heartbeat propio real de producción).
    const hb = conVisto();
    hb.set(slotHeartbeatName("facturas-1300"), "2026-07-26T13:00:26Z");
    const rows = [...LOG, row("2026-07-26T13:00:18Z", "american_classic", "facturas")];
    const alas14 = clasificarSlots({
      now: new Date("2026-07-26T14:00:05Z"),
      rows,
      heartbeats: hb,
      empresasConCxc: CXC,
      slots: SLOTS_26JUL2026,
    });
    // Corrió y salió OK → ni cubierto ni desatendido (regla 2).
    expect(alas14.cubiertos.map((c) => c.slot)).not.toContain("facturas-1300");
    expect(alas14.desatendidos.map((d) => d.slot)).not.toContain("facturas-1300");

    // Y si esa ocurrencia real se pierde, el piso ya no la protege: se re-ejecuta.
    const sinCorrer = clasificarSlots({
      now: new Date("2026-07-26T14:00:05Z"),
      rows: LOG,
      heartbeats: conVisto(),
      empresasConCxc: CXC,
      slots: SLOTS_26JUL2026,
    });
    const d = sinCorrer.desatendidos.find((x) => x.slot === "facturas-1300");
    expect(d!.ocurrencia).toBe("2026-07-26T13:00:00.000Z");
    expect(d!.motivo).toBe("sin-invocacion");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B — mismo estado, mismo trato: facturas-1500 vs estadocuenta-1605/1610", () => {
  it("los tres estaban en el mismo estado observable: heartbeat viejo + datos frescos", () => {
    const hb = HB_ANTES();
    const now = PASADA_1002.getTime();
    for (const slot of ["facturas-1500", "estadocuenta-1605", "estadocuenta-1610"]) {
      const nombre = slotHeartbeatName(slot);
      expect(cronIsStale(nombre, hb.get(nombre), now), `${slot} debería contar como stale`).toBe(true);
    }
    // Y los pares de los tres tienen success posterior a su ocurrencia de ayer.
    expect(LOG.some((r) => r.empresa_key === "fashion_shoes" && r.sync_type === "estadocuenta" && r.status === "success" && r.started_at > "2026-07-25T16:05:00Z")).toBe(true);
    expect(LOG.some((r) => r.empresa_key === "active_wear" && r.sync_type === "estadocuenta" && r.status === "success" && r.started_at > "2026-07-25T16:10:00Z")).toBe(true);
  });

  it("la diferencia era el motivo, no el estado: 1500 no se invocó, 1605/1610 corrieron y fallaron", () => {
    const out = clasificar(PASADA_1002, conVisto());
    const c = (slot: string) => out.cubiertos.find((x) => x.slot === slot);
    expect(c("facturas-1500")!.entradaCorrio).toBe(false); // Vercel perdió la invocación
    expect(c("estadocuenta-1605")!.entradaCorrio).toBe(true); // corrió 16:20/16:22 y falló
    expect(c("estadocuenta-1610")!.entradaCorrio).toBe(true); // corrió 16:23/16:26
  });

  it("los tres quedan certificados: el criterio es el TRABAJO, no quién lo hizo", () => {
    const out = clasificar(PASADA_1002, conVisto());
    const cubiertos = out.cubiertos.map((x) => x.slot);
    expect(cubiertos).toContain("facturas-1500");
    expect(cubiertos).toContain("estadocuenta-1605");
    expect(cubiertos).toContain("estadocuenta-1610");
    // Ninguno queda pendiente de re-ejecución: los datos ya están al día.
    for (const slot of ["facturas-1500", "estadocuenta-1605", "estadocuenta-1610"]) {
      expect(out.desatendidos.map((d) => d.slot)).not.toContain(slot);
    }
  });

  it("estadocuenta-1600, que corrió y salió bien, no recibe marca", () => {
    // Su heartbeat del 25-jul 16:33 prueba que la entrada hizo su trabajo: no hay
    // huérfano que certificar (y en un día sano las marcas son cero).
    const out = clasificar(PASADA_1002, conVisto());
    expect(out.cubiertos.map((x) => x.slot)).not.toContain("estadocuenta-1600");
    expect(out.desatendidos.map((x) => x.slot)).not.toContain("estadocuenta-1600");
  });

  it("el fallo NO se tapa: mientras el trabajo seguía pendiente, la pasada de las 18:00 lo reportaba", () => {
    // Estado del 25-jul 18:00, ANTES de la ronda de las 21:1x que reparó los pares.
    const hasta18 = LOG.filter((r) => r.started_at <= "2026-07-25T18:00:00Z");
    const out = clasificarSlots({
      now: new Date("2026-07-25T18:00:00Z"),
      rows: hasta18,
      heartbeats: HB_ANTES(),
      empresasConCxc: CXC,
      slots: SLOTS_26JUL2026,
    });
    const d = out.desatendidos.find((x) => x.slot === "estadocuenta-1605");
    expect(d!.motivo).toBe("corrio-y-fallo");
    expect(d!.paresPendientes.map((p) => p.empresa).sort()).toEqual(["fashion_shoes", "fashion_wear"]);
    expect(d!.paresPendientes.find((p) => p.empresa === "fashion_shoes")!.ultimoIntento!.error_message).toContain(
      "statement timeout",
    );
    expect(out.cubiertos.map((x) => x.slot)).not.toContain("estadocuenta-1605");
  });

  it("el anti-enmascaramiento sigue siendo el tope de 50h sobre el heartbeat PROPIO", () => {
    // estadocuenta-1605: heartbeat real 24-jul 16:55:44 → vence 26-jul 18:55:44.
    const entrada = "2026-07-24T16:55:44Z";
    const marca = "2026-07-26T10:02:53Z";
    expect(slotCubiertoPorRecuperacion(entrada, marca, PASADA_1002.getTime())).toBe(true); // 41h
    expect(slotCubiertoPorRecuperacion(entrada, marca, Date.parse("2026-07-26T19:00:00Z"))).toBe(false); // >50h
    expect(Date.parse(entrada) + SLOT_ENTRY_DEAD_HOURS * H).toBeLessThan(Date.parse("2026-07-26T19:00:00Z"));
  });
});
