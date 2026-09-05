import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * CANDADO del aviso de cheques por vencer (pedido de Daniel, 27-jul-2026):
 *
 *   "QUIERO aviso de cuando se vence un cheque un dia antes, almenos q venca el
 *    lunes, avisame el viernes."
 *
 * El caso que hace falta proteger es el VIERNES: si ese día solo se mirara
 * "mañana", un cheque que vence el SÁBADO no se avisaría nunca (sábado y
 * domingo no hay aviso, y el lunes ya venció). Por eso el viernes cubre
 * sábado + domingo + lunes en un solo mensaje.
 *
 * Todas las fechas son FIJAS — nada de `Date.now()` real, o el test pasaría o
 * fallaría según el día en que se corra.
 *
 * Calendario de referencia (verificado con `date`):
 *   2026-07-30 jueves · 07-31 viernes · 08-01 sábado · 08-02 domingo · 08-03 lunes
 */

// ─── Doble de Supabase: despacha por tabla ───────────────────────────────────
const filasCheques = vi.fn();
const heartbeat = vi.fn();
/** Desde ago-2026 el MISMO cron lleva los recordatorios. Por defecto no hay
 *  ninguno, así que los 20 casos de cheques miden exactamente lo de siempre. */
const filasRecordatorios = vi.fn();
/** Filtros que efectivamente recibió la consulta de cheques (para probar que se
 *  excluye lo depositado y lo borrado). */
let filtros: Record<string, unknown> = {};
let rango: { desde?: string; hasta?: string } = {};

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (tabla: string) => {
      if (tabla === "recordatorios") {
        // Cadena mínima de `leerRecordatorios`: select → eq → order → order →
        // range. Sin esta rama, la lectura de recordatorios caería en el doble
        // de CHEQUES y contaminaría `filtros` — o sea que los candados de "el
        // depositado no avisa" medirían otra cosa.
        const rec = {
          select: () => rec,
          eq: () => rec,
          order: () => rec,
          range: async () => filasRecordatorios(),
        } as Record<string, unknown>;
        return rec;
      }
      if (tabla === "cron_heartbeats") {
        const hb = {
          select: () => hb,
          eq: () => hb,
          maybeSingle: () => heartbeat(),
        } as Record<string, unknown>;
        return hb;
      }
      // El doble FILTRA de verdad (no solo registra): así un cheque depositado
      // o borrado se cae por el mismo camino que en producción.
      //
      // ⚠️ Desde el 5-sep-2026 el cron hace TRES consultas sobre `cheques` en la
      // misma corrida (los que vencen · los VENCIDOS sin avisar · los
      // depositados de más de 365 días) y dos escrituras. Por eso cada
      // `from("cheques")` arma un builder NUEVO con su propio estado: con el
      // estado compartido, el rango de la segunda consulta pisaba el de la
      // primera y los candados de la ventana medían otra cosa.
      const propios: Record<string, unknown> = {};
      const miRango: { desde?: string; hasta?: string } = {};
      let esVencidos = false;
      const ch = {
        select: () => ch,
        eq: (col: string, val: unknown) => {
          propios[col] = val;
          filtros[col] = val;
          return ch;
        },
        gte: (_col: string, val: string) => {
          miRango.desde = val;
          rango.desde = val;
          return ch;
        },
        lte: (_col: string, val: string) => {
          // La retención también usa `.lte` sobre `fecha_deposito`, pero no
          // llega a `order()`: se resuelve como un `await` del builder, que
          // devuelve un objeto sin `data` y el código lo lee como "0 filas".
          miRango.hasta = val;
          if (!esVencidos) rango.hasta = val;
          return ch;
        },
        // `.is("aviso_vencido_en", null)` es la firma de la consulta de VENCIDOS.
        is: () => {
          esVencidos = true;
          return ch;
        },
        lt: (_col: string, val: string) => {
          miRango.hasta = val;
          return ch;
        },
        in: () => Promise.resolve({ data: null, error: null }),
        update: () => ch,
        order: async () => {
          if (esVencidos) return filasVencidos();
          const { data, error } = await filasCheques();
          if (error) return { data: null, error };
          const filtradas = (data ?? []).filter(
            (r: Record<string, unknown>) =>
              Object.entries(propios).every(([col, val]) => (r[col] ?? null) === val) &&
              String(r.fecha_deposito) >= String(miRango.desde) &&
              String(r.fecha_deposito) <= String(miRango.hasta),
          );
          return { data: filtradas, error: null };
        },
      } as Record<string, unknown>;
      return ch;
    },
  },
}));

/** Las filas de la consulta de VENCIDOS (el aviso único, 5-sep-2026). */
const filasVencidos = vi.fn();

const enviado = vi.fn();
const enviadoPrivado = vi.fn();
vi.mock("@/lib/alertas/canal", () => ({
  enviarNegocio: (texto: string) => {
    enviado(texto);
    return Promise.resolve(true);
  },
  enviarNegocioPrivado: (texto: string) => {
    enviadoPrivado(texto);
    return Promise.resolve(true);
  },
}));

import { runChequesAlert } from "../../lib/cheques-alert";
import {
  ventanaAviso,
  etiquetaVencimiento,
  construirMensaje,
  fechaPanama,
  inicioDiaPanamaIso,
} from "../../lib/cheques-aviso-ventana";

/** Un instante REAL de las 9:15 a.m. de Panamá (14:15 UTC) en la fecha dada. */
const nueveQuinceEnPanama = (ymd: string) => new Date(`${ymd}T14:15:00.000Z`);

const cheque = (
  cliente: string,
  fecha: string,
  monto = 1000,
  extra: { estado?: string; deleted?: boolean } = {},
) => ({
  cliente,
  empresa: "vistana",
  monto,
  fecha_deposito: fecha,
  vendedor: "",
  estado: extra.estado ?? "pendiente",
  deleted: extra.deleted ?? false,
});

beforeEach(() => {
  filasCheques.mockReset();
  filasRecordatorios.mockReset();
  heartbeat.mockReset();
  enviado.mockReset();
  filtros = {};
  rango = {};
  // Por defecto: todavía no se avisó hoy.
  heartbeat.mockResolvedValue({ data: null, error: null });
  filasCheques.mockResolvedValue({ data: [], error: null });
  filasVencidos.mockResolvedValue({ data: [], error: null });
  filasRecordatorios.mockResolvedValue({ data: [], error: null, count: 0 });
  enviadoPrivado.mockReset();
  filasVencidos.mockClear();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("ventanaAviso — qué fechas cubre el aviso de cada día", () => {
  it("JUEVES → avisa del jueves y del VIERNES", () => {
    expect(ventanaAviso("2026-07-30")).toEqual({
      habil: true,
      fechas: ["2026-07-30", "2026-07-31"],
    });
  });

  it("VIERNES → avisa de viernes, SÁBADO, DOMINGO y LUNES (el caso que pidió Daniel)", () => {
    expect(ventanaAviso("2026-07-31")).toEqual({
      habil: true,
      fechas: ["2026-07-31", "2026-08-01", "2026-08-02", "2026-08-03"],
    });
  });

  it("SÁBADO y DOMINGO → no es día hábil, no se avisa", () => {
    expect(ventanaAviso("2026-08-01")).toEqual({ habil: false, fechas: [] });
    expect(ventanaAviso("2026-08-02")).toEqual({ habil: false, fechas: [] });
  });

  it("lunes a miércoles → solo hoy y mañana", () => {
    expect(ventanaAviso("2026-08-03").fechas).toEqual(["2026-08-03", "2026-08-04"]); // lunes
    expect(ventanaAviso("2026-08-05").fechas).toEqual(["2026-08-05", "2026-08-06"]); // miércoles
  });
});

describe("etiquetaVencimiento — cómo se lee la fecha en el mensaje", () => {
  it("hoy y mañana en palabras; más lejos, día de la semana + fecha", () => {
    const viernes = "2026-07-31";
    expect(etiquetaVencimiento("2026-07-31", viernes)).toBe("HOY");
    expect(etiquetaVencimiento("2026-08-01", viernes)).toBe("MAÑANA");
    expect(etiquetaVencimiento("2026-08-02", viernes)).toBe("el domingo 2 ago");
    expect(etiquetaVencimiento("2026-08-03", viernes)).toBe("el lunes 3 ago");
  });
});

describe("fechaPanama — Panamá es UTC-5 fijo", () => {
  it("las 23:30 de Panamá siguen siendo el mismo día (04:30 UTC del siguiente)", () => {
    expect(fechaPanama(new Date("2026-08-01T04:30:00.000Z"))).toBe("2026-07-31");
    expect(fechaPanama(new Date("2026-08-01T05:00:00.000Z"))).toBe("2026-08-01");
  });

  it("el inicio del día Panamá son las 05:00 UTC", () => {
    expect(inicioDiaPanamaIso("2026-07-31")).toBe("2026-07-31T05:00:00.000Z");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("runChequesAlert — el aviso de verdad", () => {
  it("JUEVES: avisa de los cheques del VIERNES", async () => {
    filasCheques.mockResolvedValue({
      data: [cheque("XTREME SHOES", "2026-07-31", 5000)],
      error: null,
    });

    const r = await runChequesAlert(nueveQuinceEnPanama("2026-07-30"));

    expect(r).toMatchObject({ ok: true, count: 1, sent: true });
    expect(rango).toEqual({ desde: "2026-07-30", hasta: "2026-07-31" });
    expect(enviado).toHaveBeenCalledOnce();
    expect(enviado.mock.calls[0][0]).toContain("XTREME SHOES");
    expect(enviado.mock.calls[0][0]).toContain("— MAÑANA");
  });

  it("VIERNES: un solo aviso con SÁBADO, DOMINGO y LUNES", async () => {
    filasCheques.mockResolvedValue({
      data: [
        cheque("SÁBADO S.A.", "2026-08-01", 1000),
        cheque("DOMINGO S.A.", "2026-08-02", 2000),
        cheque("LUNES S.A.", "2026-08-03", 3000),
      ],
      error: null,
    });

    const r = await runChequesAlert(nueveQuinceEnPanama("2026-07-31"));

    expect(r).toMatchObject({ ok: true, count: 3, sent: true });
    // La consulta llega hasta el LUNES, no se queda en "mañana".
    expect(rango).toEqual({ desde: "2026-07-31", hasta: "2026-08-03" });

    expect(enviado).toHaveBeenCalledOnce(); // UN mensaje, no tres
    const texto = enviado.mock.calls[0][0] as string;
    expect(texto).toContain("3 cheques por vencer — $6,000.00");
    expect(texto).toContain("SÁBADO S.A.");
    expect(texto).toContain("DOMINGO S.A.");
    expect(texto).toContain("LUNES S.A.");
    expect(texto).toContain("el lunes 3 ago");
  });

  it("SÁBADO: no manda nada", async () => {
    filasCheques.mockResolvedValue({ data: [cheque("X", "2026-08-03")], error: null });
    const r = await runChequesAlert(nueveQuinceEnPanama("2026-08-01"));
    expect(r).toMatchObject({ ok: true, count: 0, sent: false });
    expect(enviado).not.toHaveBeenCalled();
  });

  it("DOMINGO: no manda nada", async () => {
    filasCheques.mockResolvedValue({ data: [cheque("X", "2026-08-03")], error: null });
    const r = await runChequesAlert(nueveQuinceEnPanama("2026-08-02"));
    expect(r).toMatchObject({ ok: true, count: 0, sent: false });
    expect(enviado).not.toHaveBeenCalled();
  });

  it("un cheque YA DEPOSITADO no genera aviso", async () => {
    filasCheques.mockResolvedValue({
      data: [
        cheque("YA COBRADO", "2026-07-31", 9999, { estado: "depositado" }),
        cheque("BORRADO", "2026-07-31", 8888, { deleted: true }),
        cheque("SIGUE PENDIENTE", "2026-07-31", 100),
      ],
      error: null,
    });

    const r = await runChequesAlert(nueveQuinceEnPanama("2026-07-30"));

    expect(r.count).toBe(1); // solo el pendiente
    const texto = enviado.mock.calls[0][0] as string;
    expect(texto).toContain("SIGUE PENDIENTE");
    expect(texto).not.toContain("YA COBRADO");
    expect(texto).not.toContain("BORRADO");
    expect(filtros).toMatchObject({ estado: "pendiente", deleted: false });
  });

  it("un cheque FUERA de la ventana no genera aviso (el jueves no mira el lunes)", async () => {
    filasCheques.mockResolvedValue({
      data: [cheque("LUNES S.A.", "2026-08-03", 3000)],
      error: null,
    });
    // Jueves: la ventana es jueves-viernes; el del lunes lo avisará el viernes.
    const r = await runChequesAlert(nueveQuinceEnPanama("2026-07-30"));
    expect(r).toMatchObject({ count: 0, sent: false, detail: "sin cheques por vencer" });
    expect(enviado).not.toHaveBeenCalled();
  });

  it("correr DOS VECES el mismo día manda UN SOLO aviso", async () => {
    filasCheques.mockResolvedValue({
      data: [cheque("XTREME SHOES", "2026-07-31", 5000)],
      error: null,
    });
    const viernes = nueveQuinceEnPanama("2026-07-31");

    const primera = await runChequesAlert(viernes);
    expect(primera.sent).toBe(true);

    // Tras el primer éxito el route deja el heartbeat de hoy. La 2ª corrida
    // (reintento de Vercel o recuperación de la reconciliación) lo ve y calla.
    heartbeat.mockResolvedValue({
      data: { last_success_at: "2026-07-31T14:15:30.000Z" },
      error: null,
    });

    const segunda = await runChequesAlert(new Date("2026-07-31T18:00:00.000Z"));

    expect(segunda).toMatchObject({ ok: true, sent: false, detail: "ya se avisó hoy" });
    expect(enviado).toHaveBeenCalledOnce(); // UNA sola vez en todo el día
  });

  it("el heartbeat de AYER no calla el aviso de hoy", async () => {
    heartbeat.mockResolvedValue({
      data: { last_success_at: "2026-07-30T14:15:30.000Z" }, // jueves
      error: null,
    });
    filasCheques.mockResolvedValue({ data: [cheque("X", "2026-08-03")], error: null });

    const r = await runChequesAlert(nueveQuinceEnPanama("2026-07-31")); // viernes
    expect(r.sent).toBe(true);
  });

  it("SIN cheques por vencer no manda ningún mensaje", async () => {
    filasCheques.mockResolvedValue({ data: [], error: null });
    const r = await runChequesAlert(nueveQuinceEnPanama("2026-07-30"));
    expect(r).toMatchObject({ ok: true, count: 0, sent: false, detail: "sin cheques por vencer" });
    expect(enviado).not.toHaveBeenCalled();
  });

  it("si la consulta falla, ok:false (el caller NO registra heartbeat) y no se manda nada", async () => {
    filasCheques.mockResolvedValue({ data: null, error: { message: "boom" } });
    const r = await runChequesAlert(nueveQuinceEnPanama("2026-07-30"));
    expect(r).toMatchObject({ ok: false, sent: false, detail: "boom" });
    expect(enviado).not.toHaveBeenCalled();
  });

  it("si NO se puede leer el heartbeat, el aviso SALE (fail-open: perder un cheque cuesta más)", async () => {
    heartbeat.mockResolvedValue({ data: null, error: { message: "db caída" } });
    filasCheques.mockResolvedValue({ data: [cheque("X", "2026-07-31")], error: null });
    const r = await runChequesAlert(nueveQuinceEnPanama("2026-07-30"));
    expect(r.sent).toBe(true);
  });
});

describe("construirMensaje — lo que se lee en la notificación del iPhone", () => {
  it("la PRIMERA línea dice cuántos y cuánto (es lo único visible sin abrirla)", () => {
    const texto = construirMensaje(
      [cheque("A", "2026-08-01", 1500.5), cheque("B", "2026-08-03", 2000)],
      "2026-07-31",
    );
    expect(texto.split("\n")[0]).toBe("⚠️ 2 cheques por vencer — $3,500.50");
  });

  it("un solo cheque va en singular", () => {
    const texto = construirMensaje([cheque("A", "2026-08-03", 1000)], "2026-07-31");
    expect(texto.split("\n")[0]).toBe("⚠️ 1 cheque por vencer — $1,000.00");
  });
});
