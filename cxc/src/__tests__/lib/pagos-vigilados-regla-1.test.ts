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
  medirFrescura,
  empresasDe,
  type EstadoDato,
} from "@/lib/datos-frescos";
import { supabaseServer } from "@/lib/supabase-server";
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
describe("los pagos son un dato de la regla 1, no una regla nueva", () => {
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
describe("qué empresas se vigilan, y de dónde sale la lista", () => {
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
describe("🔴 la tabla de recibos NO se vigila, y por eso esto vive en la regla 1", () => {
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
describe("el mensaje habla como Daniel", () => {
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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LO QUE LOS 15 CASOS DE ARRIBA NO PODÍAN VER (9-sep-2026).
//
// La verificación por mutación encontró TRES roturas que ningún candado cazaba,
// y las tres son de la parte que toca la base (`medirFrescura`), no de las
// funciones puras. La peor de las tres: **sacar «pagos» de la lista de datos que
// se miden**. El código compila, los 15 casos siguen verdes, `empresasDe("pagos")`
// sigue contestando las 8 — y la alerta no vuelve a sonar nunca. Un candado que
// no ve eso no está cuidando nada.
//
// Estos tres casos se agregaron DESPUÉS de medir, por eso están aparte: no
// cambian la especificación, la terminan.
describe("🔴 lo que de verdad se le pregunta a la base", () => {
  /** Stub encadenable de Supabase que ANOTA qué se pidió y con qué filtros.
   *  No toca la red: solo devuelve una fecha fresca para todo. */
  function anotarPedidos(): { tabla: string; eq: Record<string, string> }[] {
    const pedidos: { tabla: string; eq: Record<string, string> }[] = [];
    const ahora = new Date().toISOString();
    vi.mocked(supabaseServer.from).mockImplementation(((tabla: string) => {
      const registro = { tabla, eq: {} as Record<string, string> };
      pedidos.push(registro);
      const cadena: Record<string, unknown> = {};
      for (const m of ["select", "order", "limit"]) cadena[m] = () => cadena;
      cadena.eq = (k: string, v: string) => {
        registro.eq[k] = v;
        return cadena;
      };
      cadena.maybeSingle = async () => ({
        data: { synced_at: ahora, started_at: ahora, finished_at: ahora },
        error: null,
      });
      return cadena;
    }) as never);
    return pedidos;
  }

  it("los pagos SE MIDEN de verdad: una lectura por cada una de las 8 empresas", async () => {
    // 🩸 Sin este caso, borrar "pagos" del recorrido deja el aviso mudo para
    // siempre sin poner un solo test en rojo.
    anotarPedidos();
    const estados = await medirFrescura();
    const dePagos = estados.filter((e) => e.dato === "pagos");
    expect(dePagos).toHaveLength(8);
    expect(dePagos.map((e) => e.empresa).sort()).toEqual([...empresasConRecibos()].sort());
  });

  it("los pagos se leen de la CORRIDA del sync, nunca de la tabla de recibos", async () => {
    // Es la línea entera del cambio: preguntarle a `switch_recibos.synced_at`
    // sería el falso positivo eterno (319 h sin escribir estando sano).
    const pedidos = anotarPedidos();
    await medirFrescura();
    const dePagos = pedidos.filter((p) => p.eq.sync_type === "recibos");
    expect(dePagos).toHaveLength(8);
    for (const p of dePagos) {
      expect(p.tabla).toBe("switch_sync_log");
      expect(p.eq.status).toBe("success");
    }
    // Y a la tabla de la cartera solo se le pregunta por la CARTERA: 7 lecturas,
    // ni una más. Si los pagos cayeran ahí, serían 15.
    expect(pedidos.filter((p) => p.tabla === "switch_estadocuenta")).toHaveLength(7);
  });

  it("el peor caso manda AUNQUE VENGA SEGUNDO en la lista", () => {
    // Los otros casos ponían el peor primero, así que «tomar el primero» pasaba
    // por «tomar el peor» sin serlo.
    const t = mensajeDatosViejos([pagos("vistana", 30), pagos("active_shoes", 72)]);
    expect(t).toContain("72 horas");
    expect(t).not.toContain("30 horas");
  });
});
