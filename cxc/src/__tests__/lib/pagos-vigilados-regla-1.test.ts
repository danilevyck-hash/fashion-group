// ═══════════════════════════════════════════════════════════════════════════
//   ⏸️  EN PAUSA — 9-sep-2026. ESTE CANDADO ES LA ESPECIFICACIÓN, NO UNA DEUDA.
//
//   La medición está hecha y la conclusión sostenida (los pagos van por la
//   REGLA 1, no por la alerta B). Lo que falta es la implementación en
//   `datos-frescos.ts`, y se perdió por un accidente del método, no del diseño:
//
//   🩸 El script de mutación traía `trap 'git checkout -- …' EXIT`. El agente
//      que lo escribió se colgó EN MEDIO de la verificación, el trap disparó al
//      morir el proceso y `git checkout` devolvió los archivos a HEAD — le borró
//      su propia implementación sin commitear. El candado sobrevivió; el código
//      no. El trap ya está arreglado (copia a /tmp) y la lección quedó anotada
//      en la skill de la casa.
//
//   🔴 NO SE BORRA. Es la especificación de lo que hay que construir: dice con
//      qué números, con qué palabras y para qué empresas. Al retomarlo, se le
//      quita el `.skip` y se implementa hasta que los 15 casos pasen.
//
//   Los 4 bloques están en `describe.skip` para que el build no quede rojo por
//   una obra a medias. Nada de esto está en producción.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
//   🩸 LOS PAGOS — LA PLATA QUE ENTRA — NO LOS VIGILABA NADIE (9-sep-2026)
//
//   Daniel, textual: «Siempre que me llega un telegrama me dices que es falsa
//   alarma. Quiero que me lleguen de veras.»
// ═══════════════════════════════════════════════════════════════════════════
//
// En los pendientes quedó anotado «meter los recibos a la vigilancia de 24 h»,
// y se volvió a MEDIR antes de tocar nada — porque el 7-sep-2026 se había
// medido lo CONTRARIO para la alerta B, y las dos cosas parecían chocar.
//
// No chocan: son la misma pregunta con dos lentes, y solo una de las dos
// funciona sobre los recibos.
//
// ── LO QUE NO SE HACE, Y CON QUÉ NÚMEROS (medido 9-sep-2026) ────────────────
//
// La ALERTA B mira cuándo se ESCRIBIÓ la tabla. `switch_recibos` se escribe por
// DIFERENCIA (`diffRecibos`: borra e inserta solo los recibos que cambiaron),
// así que con las cuatro pasadas del día corridas y todo perfectamente sano:
//
//     active_wear         312,7 h sin una escritura  (13 días)
//     joystep             144,7 h
//     active_shoes        116,7 h
//     fashion_shoes · fw · vistana · boston   0,7 h (acababa de correr)
//
// Hueco más largo en 90 días: joystep 581 h · active_shoes 262 h · active_wear
// 192 h. Y `switch_ingresos_mercancia` es todavía peor: solo escribe cuando
// llegó mercancía, y su hueco más largo en 90 días llega a 694 h (29 días).
//
// 🔴 BACKTEST de la alerta B (umbral 40 h, 270 pasadas de la reconciliación en
// 90 días): **26 mensajes, TODOS ruido** — 13 por los cobros y 13 por las
// compras, uno cada 3,5 días, sin una sola avería detrás. Por eso las dos
// tablas siguen FUERA de `TABLAS_VIGILADAS`, y eso lo exige
// `alertas-que-llegan.test.ts`, que no se tocó.
//
// ── LO QUE SÍ SE HACE ───────────────────────────────────────────────────────
//
// La REGLA 1 no mira la tabla: mira la ÚLTIMA CORRIDA EXITOSA DEL SYNC. Es el
// truco que ya usaba con las ventas, inventado justamente para esquivar este
// problema. Mismo umbral (24 h), mismo dedup (20 h), misma pasada, cero crons
// nuevos, cero DDL.
//
// 🔴 BACKTEST (90 días, las mismas 270 pasadas): **6 mensajes, y los 6 con una
// avería real detrás** — 13, 16, 20, 21, 23 y 25-jun-2026, cada uno con su fila
// en `error` en `switch_sync_log` (TOKEN INVALIDO y la caída del 20-jun, que
// tumbó cinco empresas a la vez). En los últimos 44 días —las 8 empresas vivas
// y el cron corriendo 4×/día— **0 mensajes**.
//
// 🔴 Y EL AGUJERO ERA REAL: de esas 6 averías, la regla 2 avisó UNA (21-jun).
// Las otras cinco fueron un fallo suelto que nunca llegó a dos seguidos, así
// que nadie dijo nada mientras los cobros de active_shoes se quedaban 72 h sin
// llegar (19 al 22-jun). Ninguna otra regla los cubre: la alerta A excluye
// `recibos` a propósito (carga el mes en curso, el día 1 vale 0 por
// definición), la B queda descartada arriba, y el vigía de crons prohíbe
// estructuralmente los syncs de Switch.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));

import {
  HORAS_DATO_VIEJO,
  HORAS_ENTRE_AVISOS,
  clasificarDatosViejos,
  mensajeDatosViejos,
  empresasDe,
  type EstadoDato,
} from "@/lib/datos-frescos";
import { empresasConRecibos, empresasConFacturas } from "@/lib/switch-api/empresas";
import { TABLAS_VIGILADAS } from "@/lib/alertas/silencio-de-datos";
import { corridasPorDiaDelPar } from "@/lib/cron-telemetry";

const pagos = (empresa: string, horas: number | null): EstadoDato => ({
  dato: "pagos",
  empresa,
  ultimaIso: horas === null ? null : new Date(Date.now() - horas * 3600e3).toISOString(),
  horas,
});
const cartera = (empresa: string, horas: number): EstadoDato => ({
  dato: "cartera",
  empresa,
  ultimaIso: new Date(Date.now() - horas * 3600e3).toISOString(),
  horas,
});

// ─────────────────────────────────────────────────────────────────────────────
describe.skip("los pagos son un dato de la regla 1, no una regla nueva", () => {
  it("«pagos» se clasifica con el MISMO umbral de 24 h que la cartera y las ventas", () => {
    // Si alguien le pusiera un umbral propio, esto sería una cuarta regla
    // disfrazada — y la lista de reglas de SISTEMA es cerrada.
    expect(HORAS_DATO_VIEJO).toBe(24);
    expect(clasificarDatosViejos([pagos("vistana", 24)])).toEqual([]);
    expect(clasificarDatosViejos([pagos("vistana", 24.1)])).toHaveLength(1);
  });

  it("comparte el dedup de 20 h: no estrena una llave propia", () => {
    expect(HORAS_ENTRE_AVISOS).toBe(20);
  });

  it("un pago fresco no aparece, y no arrastra a los otros datos", () => {
    const r = clasificarDatosViejos([
      pagos("vistana", 2),
      pagos("joystep", 40),
      cartera("fashion_wear", 3),
    ]);
    expect(r.map((x) => `${x.dato}:${x.empresa}`)).toEqual(["pagos:joystep"]);
  });

  it("«nunca se sincronizó» cuenta como viejo (fail-closed), igual que los otros", () => {
    expect(clasificarDatosViejos([pagos("vistana", null)])).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe.skip("qué empresas se vigilan, y de dónde sale la lista", () => {
  it("pagos = las 8 empresas que traen cobros, DERIVADAS, nunca escritas a mano", () => {
    // `empresasConRecibos()` sale de EMPRESA_SYNC_CAPABILITIES: una empresa que
    // mañana empiece a traer recibos nace vigilada sin que nadie se acuerde.
    expect(empresasDe("pagos").sort()).toEqual([...empresasConRecibos()].sort());
    expect(empresasDe("pagos")).toHaveLength(8);
  });

  it("incluye a Boston y a Multifashion: sus cobros también son plata que entra", () => {
    expect(empresasDe("pagos")).toContain("confecciones_boston");
    expect(empresasDe("pagos")).toContain("american_classic");
  });

  it("⚠️ esto NO mezcla a Boston con el grupo: la medición y el mensaje son POR EMPRESA", () => {
    // Igual que la cartera: se mide empresa por empresa y el mensaje las nombra.
    // No hay un total, ni una suma, ni una fila de Boston contestando por el grupo.
    const t = mensajeDatosViejos([pagos("confecciones_boston", 100)]);
    expect(t).toContain("confecciones_boston");
    for (const e of ["vistana", "fashion_wear", "fashion_shoes", "active_shoes"]) {
      expect(t).not.toContain(e);
    }
  });

  it("agregar los pagos no le sacó empresas a los otros dos datos", () => {
    expect(empresasDe("ventas").sort()).toEqual([...empresasConFacturas()].sort());
    expect(empresasDe("cartera")).toHaveLength(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe.skip("🔴 la tabla de recibos NO se vigila, y por eso esto vive en la regla 1", () => {
  it("`switch_recibos` sigue fuera de la alerta B (312 h sin escribir, sano)", () => {
    // Medido el 9-sep-2026 con las 4 pasadas del día corridas: active_wear
    // llevaba 312,7 h sin una escritura, joystep 144,7 y active_shoes 116,7.
    // Backtest de B con 40 h: 13 mensajes en 90 días, todos falsos.
    const tablas = TABLAS_VIGILADAS.map((t) => t.tabla);
    expect(tablas).not.toContain("switch_recibos");
    expect(tablas).not.toContain("switch_ingresos_mercancia");
  });

  it("el sync de recibos corre 4×/día — por eso un tropiezo suelto NUNCA llega a 24 h", () => {
    // Ésta es la razón de que el backtest de los últimos 44 días dé 0 mensajes:
    // con 4 pasadas, un fallo se cura en horas. Solo suena si los pagos se
    // detienen un día entero. Si alguien bajara el cron a 1×/día, este número
    // cambia y hay que volver a medir el umbral.
    for (const e of empresasConRecibos()) {
      expect(corridasPorDiaDelPar(e, "recibos"), `${e}: cambió el ritmo del cron`).toBe(4);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe.skip("el mensaje habla como Daniel", () => {
  const texto = mensajeDatosViejos([pagos("active_shoes", 72), pagos("vistana", 30)]);

  it("dice QUÉ dato en palabras del negocio: la plata que entra", () => {
    expect(texto).toContain("los pagos (la plata que te entra)");
  });

  it("no dice «recibos» ni «cobros» a secas: la palabra de Daniel es «pagos»", () => {
    expect(texto).not.toContain("recibos");
  });

  it("manda el peor caso y nombra las empresas", () => {
    expect(texto).toContain("72 horas");
    expect(texto).not.toContain("30 horas");
    expect(texto).toContain("active_shoes");
    expect(texto).toContain("vistana");
  });

  it("no vomita jerga: ni tablas, ni nombres de cron, ni HTML", () => {
    for (const jerga of [
      "switch_recibos",
      "switch_sync_log",
      "synced_at",
      "sync-recibos",
      "diffRecibos",
      "undefined",
      "NaN",
      "null",
    ]) {
      expect(texto, `no debe decir "${jerga}"`).not.toContain(jerga);
    }
  });

  it("los tres datos conviven sin mezclarse en una sola línea", () => {
    const t = mensajeDatosViejos([
      cartera("vistana", 40),
      { dato: "ventas", empresa: "joystep", ultimaIso: null, horas: 50 },
      pagos("active_wear", 60),
    ]);
    expect(t).toContain("la cartera (lo que te deben)");
    expect(t).toContain("las ventas");
    expect(t).toContain("los pagos (la plata que te entra)");
    expect(t).toContain("40 horas");
    expect(t).toContain("50 horas");
    expect(t).toContain("60 horas");
  });
});
