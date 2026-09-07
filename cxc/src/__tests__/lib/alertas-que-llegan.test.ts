// ═══════════════════════════════════════════════════════════════════════════
//   CANDADO — «Siempre que me llega un telegrama me dices que es falsa alarma.
//   Quiero que me lleguen de veras.» (Daniel, 7-sep-2026)
//
//   Cuatro arreglos al canal 🔧 SISTEMA, todos medidos contra producción sobre
//   los 90 días de `switch_sync_log` (9.948 corridas) y `cron_email_errors`:
//
//   1. Vuelven a vigilarse los crons cuya caída NO deja rastro en ningún dato
//      que otra regla mire — entre ellos los cinco cuyo PRODUCTO es el mensaje.
//   2. La regla 2 gana anti-loop (48 h por avería) y un umbral que depende del
//      RITMO del par. Antes: 20 mensajes en 90 días. Después: 13, con las 10
//      averías reales intactas.
//   3. El resumen de caída de Switch NO va a Telegram (y no puede volver).
//   4. `switch_recibos` y `switch_ingresos_mercancia` NO entran a la alerta B,
//      y acá quedan los números que lo explican para que nadie los agregue sin
//      volver a medir.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Nada de esto toca la base: se prueban módulos PUROS y se barren archivos.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));

import {
  CRONS_CUYO_TRABAJO_ES_UN_MENSAJE,
  DIAS_ENTRE_AVISOS_CRON,
  TIPO_CRON_SIN_CORRER,
  cronsQueAvisanCaidos,
  mensajeCronsSinCorrer,
  tipoDeCron,
} from "@/lib/alertas/crons-que-avisan";
import {
  CRONS_CONOCIDOS,
  SYNC_TYPES_POR_CRON,
  corridasPorDiaDelPar,
  cronStaleThresholdHours,
} from "@/lib/cron-telemetry";
import {
  CORRIDAS_PARA_TRES_FALLOS,
  FALLOS_PARA_AVISAR,
  FALLOS_PARA_AVISAR_ALTA_FRECUENCIA,
  HORAS_ENTRE_AVISOS_RACHA,
  fallosParaAvisar,
  tipoDeRacha,
} from "@/lib/switch-api/alert-policy";
import { TABLAS_VIGILADAS } from "@/lib/alertas/silencio-de-datos";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

const PURO = leer("src/lib/alertas/crons-que-avisan.ts");
const IO = leer("src/lib/alertas/crons-que-avisan-io.ts");
const POLICY = leer("src/lib/switch-api/alert-policy.ts");
const OUTAGE = leer("src/lib/switch-api/outage-resumen.ts");
const RECON = leer("src/app/api/cron/switch-reconciliacion/route.ts");
const SILENCIO_IO = leer("src/lib/alertas/silencio-de-datos-io.ts");
const VERCEL = JSON.parse(leer("vercel.json")) as { crons: Array<{ path: string }> };

const H = 3_600_000;
const AHORA = Date.parse("2026-09-07T12:00:00.000Z");
/** Todos frescos menos los que se pasen. */
function heartbeats(overrides: Record<string, string | null> = {}) {
  const filas = Object.keys(CRONS_CUYO_TRABAJO_ES_UN_MENSAJE).map((cron_name) => ({
    cron_name,
    last_success_at: new Date(AHORA - 2 * H).toISOString(),
  }));
  return filas
    .map((f) =>
      Object.prototype.hasOwnProperty.call(overrides, f.cron_name)
        ? { ...f, last_success_at: overrides[f.cron_name] }
        : f,
    )
    .filter((f) => f.last_success_at !== undefined);
}

// ═══════════════════════════════════════════════════════════════════════════
describe("1) los crons cuya caída no deja rastro en ningún dato", () => {
  it("la lista es exactamente la aprobada, y vive en UN solo lugar", () => {
    expect(Object.keys(CRONS_CUYO_TRABAJO_ES_UN_MENSAJE).sort()).toEqual([
      "acs-fidelizacion",
      "acs-resumen-diario",
      "cheques-alert",
      "grupo-resumen-mensual",
      "guias-pendientes",
      "prestamos-caducan",
    ]);
    // El io la lee del módulo puro: ni un nombre repetido a mano. (La
    // reconciliación nombra algunos de estos crons por OTRO motivo —la
    // recuperación de colaterales—, así que ahí no aplica.)
    for (const cron of Object.keys(CRONS_CUYO_TRABAJO_ES_UN_MENSAJE)) {
      expect(IO).not.toContain(`"${cron}"`);
    }
    expect(IO).toContain("./crons-que-avisan");
  });

  it("todos son crons que el sistema conoce (si uno se retira, el build lo dice)", () => {
    for (const cron of Object.keys(CRONS_CUYO_TRABAJO_ES_UN_MENSAJE)) {
      expect(CRONS_CONOCIDOS.has(cron)).toBe(true);
    }
  });

  it("🔴 NINGUNO escribe en switch_sync_log — los syncs de Switch NO vuelven al vigía", () => {
    // Es el candado que impide repetir el error de julio: un sync cuyo trabajo
    // igual se hizo no puede volver a sonar acá. A los syncs los miran la regla 2
    // (dos o tres fallos seguidos), la alerta A y la alerta B, por el RESULTADO.
    for (const cron of Object.keys(CRONS_CUYO_TRABAJO_ES_UN_MENSAJE)) {
      expect(SYNC_TYPES_POR_CRON[cron] ?? []).toEqual([]);
    }
  });

  it("los CINCO cuyo producto es el mensaje de verdad mandan un mensaje", () => {
    // `acs-fidelizacion` es la excepción declarada: no manda nada, entra por el
    // otro motivo (no registra su corrida, así que no lo mira nadie).
    for (const cron of Object.keys(CRONS_CUYO_TRABAJO_ES_UN_MENSAJE)) {
      if (cron === "acs-fidelizacion") continue;
      const route = leer(`src/app/api/cron/${cron}/route.ts`);
      expect(route).toMatch(/enviarNegocioPrivado\(|enviarNegocio\(|enviarSistema\(/);
    }
  });

  it("`acs-fidelizacion` NO manda ningún mensaje — el motivo escrito tiene que seguir siendo cierto", () => {
    const route = leer("src/app/api/cron/acs-fidelizacion/route.ts");
    expect(route).not.toMatch(/enviarNegocioPrivado\(|enviarNegocio\(|enviarSistema\(/);
  });

  it("un cron fresco no dispara nada", () => {
    expect(cronsQueAvisanCaidos(heartbeats(), AHORA)).toEqual([]);
  });

  it("un cron diario con 30 h sin un éxito SÍ dispara (umbral de 26 h)", () => {
    const r = cronsQueAvisanCaidos(
      heartbeats({ "cheques-alert": new Date(AHORA - 30 * H).toISOString() }),
      AHORA,
    );
    expect(r.map((c) => c.cronName)).toEqual(["cheques-alert"]);
    expect(r[0].horas).toBe(30);
  });

  it("🔴 el resumen MENSUAL usa su propio umbral, no el de 26 h", () => {
    expect(cronStaleThresholdHours("grupo-resumen-mensual")).toBe(33 * 24);
    const a30dias = new Date(AHORA - 30 * 24 * H).toISOString();
    expect(
      cronsQueAvisanCaidos(heartbeats({ "grupo-resumen-mensual": a30dias }), AHORA),
    ).toEqual([]);
    const a34dias = new Date(AHORA - 34 * 24 * H).toISOString();
    expect(
      cronsQueAvisanCaidos(heartbeats({ "grupo-resumen-mensual": a34dias }), AHORA).map(
        (c) => c.cronName,
      ),
    ).toEqual(["grupo-resumen-mensual"]);
  });

  it("sin fila de heartbeat cuenta como caído (fail-closed): los seis llevan meses corriendo", () => {
    const r = cronsQueAvisanCaidos(
      heartbeats({ "prestamos-caducan": null }),
      AHORA,
    );
    expect(r.map((c) => c.cronName)).toEqual(["prestamos-caducan"]);
    expect(r[0].horas).toBeNull();
    expect(mensajeCronsSinCorrer(r)).toContain("no hay registro");
  });

  it("no alerta si la SEGUNDA entrada del día todavía viene en camino (alerta fantasma)", () => {
    // acs-fidelizacion corre 11:30 y 16:30 UTC. A las 12:00, con 27 h de atraso,
    // la de las 16:30 todavía puede repararlo → se calla.
    const stale = new Date(AHORA - 27 * H).toISOString();
    expect(cronsQueAvisanCaidos(heartbeats({ "acs-fidelizacion": stale }), AHORA)).toEqual([]);
    // A las 17:00 ya no queda ninguna → suena.
    const tarde = Date.parse("2026-09-07T17:00:00.000Z");
    const stale2 = new Date(tarde - 27 * H).toISOString();
    expect(
      cronsQueAvisanCaidos(heartbeats({ "acs-fidelizacion": stale2 }), tarde).map((c) => c.cronName),
    ).toEqual(["acs-fidelizacion"]);
  });

  it("el mensaje dice qué pasó / qué significa / qué hacer, sin jerga", () => {
    const r = cronsQueAvisanCaidos(
      heartbeats({ "cheques-alert": new Date(AHORA - 30 * H).toISOString() }),
      AHORA,
    );
    const m = mensajeCronsSinCorrer(r);
    expect(m).toContain("dejó de correr");
    expect(m).toContain("Qué significa:");
    expect(m).toContain("Qué hacer:");
    expect(m).toContain("una vez por semana");
    // Ni nombres de cron, ni de tabla, ni códigos, ni HTML del proveedor.
    for (const prohibido of [
      "cheques-alert",
      "cron_heartbeats",
      "switch_sync_log",
      "HTTP",
      "<!DOCTYPE",
      "empresa_key",
    ]) {
      expect(m).not.toContain(prohibido);
    }
  });

  it("🔴 el anti-loop se consulta ANTES de mandar", () => {
    const iDedup = IO.indexOf("await yaAvisadoPorCron(c.cronName");
    const iEnvio = IO.indexOf("await enviarSistema(mensajeCronsSinCorrer");
    expect(iDedup).toBeGreaterThan(-1);
    expect(iEnvio).toBeGreaterThan(-1);
    expect(iDedup).toBeLessThan(iEnvio);
    expect(DIAS_ENTRE_AVISOS_CRON).toBe(7);
    expect(tipoDeCron("cheques-alert")).toBe(`${TIPO_CRON_SIN_CORRER}:cheques-alert`);
  });

  it("🔴 la llave del dedup se escribe DESPUÉS del envío, y solo si Telegram confirmó", () => {
    const iEnvio = IO.indexOf("const enviado = await enviarSistema(");
    const iGuard = IO.indexOf("if (!enviado)");
    const iLog = IO.indexOf("await logCronError(tipoDeCron(");
    expect(iEnvio).toBeGreaterThan(-1);
    expect(iGuard).toBeGreaterThan(iEnvio);
    expect(iLog).toBeGreaterThan(iGuard);
  });

  it("sale por enviarSistema — nunca sendTelegramAlert directo", () => {
    expect(IO).toContain("enviarSistema(");
    expect(IO).not.toContain("sendTelegramAlert");
    expect(PURO).not.toContain("sendTelegramAlert");
  });

  it("🔴 NO estrena una entrada de cron: cuelga de la reconciliación que ya corre", () => {
    // La llamada tiene que estar EN EL FLUJO, no solo importada: se exige la
    // sentencia que la ejecuta, no que la palabra aparezca en algún lado.
    expect(RECON).toContain("const cronsSinAvisar = await checkCronsQueAvisan();");
    expect(RECON).toContain("return await revisarCronsQueAvisan();");
    const paths = VERCEL.crons.map((c) => c.path);
    expect(paths.some((p) => p.includes("crons-que-avisan"))).toBe(false);
    expect(paths.filter((p) => p.startsWith("/api/cron/switch-reconciliacion")).length).toBe(3);
  });

  it("el umbral se REUSA de cron-telemetry, no se inventa uno nuevo", () => {
    expect(PURO).toContain("cronIsStale");
    expect(PURO).toContain("staleEsPendingRecovery");
    // Ni una constante de horas propia: eso sería la segunda fuente de verdad.
    expect(PURO).not.toMatch(/HORAS_[A-Z_]*\s*=\s*\d/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("2) la regla 2 — un aviso por avería, no uno por día", () => {
  it("🔴 «cuántas veces al día corre» se DERIVA del cronograma", () => {
    // Espejo de vercel.json vía SWITCH_CRON_ENTRADAS. Si alguien mueve una
    // entrada, estos números cambian solos — y este candado lo dice.
    expect(corridasPorDiaDelPar("vistana", "recibos")).toBe(4);
    expect(corridasPorDiaDelPar("vistana", "facturas")).toBe(5);
    expect(corridasPorDiaDelPar("american_classic", "facturas")).toBe(9);
    expect(corridasPorDiaDelPar("vistana", "estadocuenta")).toBe(3);
    expect(corridasPorDiaDelPar("vistana", "utilidad")).toBe(1);
    expect(corridasPorDiaDelPar("fashion_shoes", "catalogo_tommy")).toBe(4);
    // Boston: el bloque `all` NO le corre el estadocuenta (su cartera viene del
    // reporte web) → solo boston-cartera.
    expect(corridasPorDiaDelPar("confecciones_boston", "estadocuenta")).toBe(1);
    // Semanal: cuenta como 1/7.
    expect(corridasPorDiaDelPar("confecciones_boston", "clientes")).toBeCloseTo(1 / 7, 6);
    // Un par que el cronograma no conoce → 0, o sea el umbral bajo (avisa antes).
    expect(corridasPorDiaDelPar("vistana", "ventas_tipos")).toBe(0);
  });

  it("🔴 el tercer fallo se pide desde CINCO corridas al día, no cuatro", () => {
    expect(CORRIDAS_PARA_TRES_FALLOS).toBe(5);
    expect(FALLOS_PARA_AVISAR).toBe(2);
    expect(FALLOS_PARA_AVISAR_ALTA_FRECUENCIA).toBe(3);
    // Ventas: 5 y 9 corridas/día → tercer fallo.
    expect(fallosParaAvisar("vistana", "facturas")).toBe(3);
    expect(fallosParaAvisar("american_classic", "facturas")).toBe(3);
    // 🩸 RECIBOS SE QUEDA EN DOS. Con el corte en 4 entraba, y el backtest mostró
    // que eso perdía una avería real: active_shoes/recibos del 21-jun-2026 falló
    // dos veces, avisó, y volvió a funcionar recién 24 h después — nunca habría
    // llegado a un tercer fallo.
    expect(corridasPorDiaDelPar("active_shoes", "recibos")).toBe(4);
    expect(fallosParaAvisar("active_shoes", "recibos")).toBe(2);
    // Los diarios y los desconocidos, en dos.
    expect(fallosParaAvisar("vistana", "utilidad")).toBe(2);
    expect(fallosParaAvisar("confecciones_boston", "estadocuenta")).toBe(2);
    expect(fallosParaAvisar("vistana", "ventas_tipos")).toBe(2);
  });

  it("el umbral se aplica de verdad en la evaluación (no queda de adorno)", () => {
    expect(POLICY).toMatch(/const umbral = fallosParaAvisar\(empresaKey, syncType\);/);
    expect(POLICY).toMatch(/if \(streak >= umbral\) return \{ escalate: true/);
    // Un streak por debajo de SU umbral no se disfraza de «primer fallo».
    expect(POLICY).toContain('motivo: "racha-corta"');
  });

  it("🔴 la llave del anti-loop lleva el ARRANQUE de la racha: una avería nueva suena en el acto", () => {
    const a = tipoDeRacha("confecciones_boston", "estadocuenta", "2026-08-20T08:10:00Z");
    const b = tipoDeRacha("confecciones_boston", "estadocuenta", "2026-08-27T08:10:00Z");
    expect(a).not.toBe(b);
    // Un par distinto tampoco comparte llave.
    expect(tipoDeRacha("vistana", "estadocuenta", "2026-08-20T08:10:00Z")).not.toBe(a);
    // Sin fecha (sin-historia / lectura-fallo) también tiene su llave.
    expect(tipoDeRacha("vistana", "facturas", null)).toContain("sin-fecha");
  });

  it("🔴 el anti-loop es de 48 h, no de un día ni de una semana", () => {
    // 24 h no arreglaba el caso que originó el cambio: la cartera de Boston corre
    // UNA vez al día, así que con 24 h volvía a avisar todos los días igual.
    // 7 días (el patrón de la casa) es demasiado para algo que se arregla hoy.
    expect(HORAS_ENTRE_AVISOS_RACHA).toBe(48);
  });

  it("🔴 se consulta ANTES de mandar y la llave se escribe DESPUÉS de que Telegram confirme", () => {
    const iDedup = POLICY.indexOf("await yaAvisadoPorRacha(e.empresaKey");
    const iEnvio = POLICY.indexOf("const enviado = await enviarSistema(construirMensajeEscalado");
    const iGuard = POLICY.indexOf("if (enviado) {");
    const iLog = POLICY.indexOf("tipoDeRacha(e.empresaKey, e.syncType, e.escalacion.sinceIso),");
    expect(iDedup).toBeGreaterThan(-1);
    expect(iEnvio).toBeGreaterThan(iDedup);
    expect(iGuard).toBeGreaterThan(iEnvio);
    expect(iLog).toBeGreaterThan(iGuard);
  });

  it("lo que se calla NO se pierde: queda escrito con su motivo", () => {
    expect(POLICY).toContain("fallo repetido SIN alerta (anti-loop de");
  });

  it("🩸 las alertas A y B también marcan el dedup DESPUÉS del envío", () => {
    // Antes iba antes, y un envío fallido quemaba los 7 días de silencio del
    // módulo. Este candado cambió de dirección el 7-sep-2026, a propósito; el
    // que exige que el anti-loop se CONSULTE antes de mandar sigue intacto en
    // `silencio-de-datos.test.ts`.
    const iEnvio = SILENCIO_IO.indexOf("const enviado = await enviarSistema(mensajeSilencio");
    const iGuard = SILENCIO_IO.indexOf("if (!enviado)");
    const iLog = SILENCIO_IO.indexOf("await logCronError(\n      tipoDeModulo(modulo),");
    expect(iEnvio).toBeGreaterThan(-1);
    expect(iGuard).toBeGreaterThan(iEnvio);
    expect(iLog).toBeGreaterThan(iGuard);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("3) el resumen de caída de Switch NO va a Telegram", () => {
  it("🔴 el mensaje se guarda en el registro y no se manda a nadie", () => {
    // Medido el 7-sep-2026: en 90 días hubo 3 filas `switch_outage_resumen`
    // (2, 4 y 13 de agosto) y las tres decían «todo re-sincronizado, sin
    // impacto». Un aviso que te dice que no pasó nada entrena a ignorar los que
    // sí. Está apagado desde el 27-jul-2026 y este candado impide que vuelva.
    expect(OUTAGE).toContain("buildMensajeCaida");
    expect(OUTAGE).toContain("{ telegram: false }");
    expect(OUTAGE).not.toMatch(/enviarSistema\(|enviarNegocio\(|enviarNegocioPrivado\(/);
    expect(OUTAGE).not.toContain("sendTelegramAlert");
  });

  it("tampoco lo manda quien lo invoca: de la reconciliación solo sale el estado", () => {
    expect(RECON).toMatch(/enviarResumenCaidaSiAplica\(\)\)\.resumen|outage\.resumen/);
    expect(RECON).not.toContain("buildMensajeCaida");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("4) qué NO entra a la alerta B, y por qué (medido el 7-sep-2026)", () => {
  const vigiladas = TABLAS_VIGILADAS.map((t) => t.tabla);

  it("🔴 `switch_recibos` NO se vigila por B: escribe SOLO lo que cambió", () => {
    // El sync corre 4 veces al día en las 8 empresas (1.898 corridas en 90 días)
    // pero solo inserta los recibos que cambiaron, así que la última escritura de
    // una empresa sana envejece sin límite. Medido con TODO al día, el mismo día
    // en que el cron corrió 4 veces:
    //   active_wear 263 h · joystep 95 h · active_shoes 67 h · fashion_shoes 67 h
    //   confecciones_boston 67 h · fashion_wear 63 h · vistana 43 h · ACS 30 h
    // Con el umbral de 40 h, SIETE de las OCHO empresas dispararían desde la
    // primera pasada estando perfectamente sanas. Y el peor hueco histórico de
    // joystep es de 581 h (24 días).
    expect(vigiladas).not.toContain("switch_recibos");
  });

  it("🔴 `switch_ingresos_mercancia` tampoco: su universo puede estar VACÍO y eso es normal", () => {
    // Éste sí reescribe la ventana entera en cada corrida (14 de 14 corridas con
    // filas, ninguna en cero), pero la ventana son 45 días y la compra es un
    // hecho del negocio que puede no ocurrir: medido sobre toda la historia, el
    // hueco más largo SIN una sola compra es active_wear 452 días, joystep 206,
    // active_shoes 139, fashion_shoes 56 y vistana 52 — cinco de las seis por
    // encima de la ventana. Con la ventana vacía no se escribe nada y la alerta
    // sonaría para siempre con el sync perfecto.
    expect(vigiladas).not.toContain("switch_ingresos_mercancia");
  });

  it("las que SÍ vigila B siguen siendo las tres de siempre", () => {
    expect(vigiladas.sort()).toEqual([
      "egresos_varios",
      "switch_articulo_info",
      "switch_clientes",
    ]);
  });
});
