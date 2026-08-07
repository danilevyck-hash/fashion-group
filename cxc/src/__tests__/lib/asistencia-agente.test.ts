// ─────────────────────────────────────────────────────────────────────────────
// Las reglas del agente del lado del servidor: qué se muestra en pantalla,
// cuándo se avisa por Telegram y cómo se degrada sin la migración corrida.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  DISPOSITIVO_FG,
  FALLOS_PARA_ALERTAR,
  MINUTOS_PARA_CALLADO,
  MINUTOS_PEDIDO_SIN_ATENDER,
  decidirAlerta,
  esColumnaFaltante,
  estadoAgente,
  hace,
  vigiaDebeAlertar,
  textoCaido,
  textoSilencio,
} from "@/lib/asistencia/agente";

const AHORA = Date.parse("2026-08-06T15:00:00Z");
const haceMin = (m: number) => new Date(AHORA - m * 60_000).toISOString();

describe("🔑 el nombre del reloj es el de las marcaciones ya cargadas", () => {
  it('es exactamente "reloj cboston"', () => {
    // 🩸 Verificado contra producción: las 3.287 marcaciones están todas bajo
    // este nombre. Cambiarlo haría que el índice único no reconozca nada y se
    // reinserte la historia entera — las horas trabajadas saldrían al doble.
    expect(DISPOSITIVO_FG).toBe("reloj cboston");
  });
});

describe("qué se ve en pantalla", () => {
  it("sin agente instalado NO dice que algo falló: dice que falta instalarlo", () => {
    const e = estadoAgente({ dispositivo: DISPOSITIVO_FG }, AHORA);
    expect(e.salud).toBe("nunca");
    expect(e.detalle).toContain("no entran marcaciones");
    // 🩸 Y NO ofrece el Excel como plan B. La carga manual se retiró el
    // 6-ago-2026 porque duplicaba lo que el reloj ya había traído (134
    // marcaciones duplicadas, borradas a mano). Un cartel que la sigue
    // recomendando es la forma de que el bug vuelva por la puerta de atrás.
    expect(e.detalle).not.toMatch(/Excel/i);
  });

  it("con noticias recientes, verde", () => {
    const e = estadoAgente({ dispositivo: "d", visto_en: haceMin(2) }, AHORA);
    expect(e.salud).toBe("al_dia");
  });

  it("callado más de 12 minutos = la PC está apagada, y lo dice con qué hacer", () => {
    const e = estadoAgente({ dispositivo: "d", visto_en: haceMin(MINUTOS_PARA_CALLADO + 1) }, AHORA);
    expect(e.salud).toBe("callado");
    expect(e.titulo).toContain("no responde");
    expect(e.detalle).toContain("Préndela");
    // Y tranquiliza sobre lo que de verdad preocupa: perder marcaciones.
    expect(e.detalle).toContain("no se pierde ninguna");
  });

  it("🔴 el silencio GANA sobre un error viejo", () => {
    // Un error de hace tres días no puede tapar que la PC lleva tres días
    // apagada: lo accionable es prenderla, no leer el error.
    const e = estadoAgente(
      { dispositivo: "d", visto_en: haceMin(3 * 24 * 60), ultimo_error: "ETIMEDOUT" },
      AHORA,
    );
    expect(e.salud).toBe("callado");
  });

  it("PC prendida pero reloj mudo = error, con el detalle a la vista", () => {
    const e = estadoAgente(
      { dispositivo: "d", visto_en: haceMin(1), ultimo_error: "connect ETIMEDOUT" },
      AHORA,
    );
    expect(e.salud).toBe("con_error");
    expect(e.detalle).toContain("ETIMEDOUT");
  });
});

describe("🔴 el botón no puede girar para siempre", () => {
  it("recién apretado: pendiente, y todavía no se rinde", () => {
    const e = estadoAgente({ dispositivo: "d", visto_en: haceMin(1), pedido_en: haceMin(1) }, AHORA);
    expect(e.pedidoPendiente).toBe(true);
    expect(e.pedidoSinRespuesta).toBe(false);
  });

  it("pasados 7 minutos sin que nadie lo recoja, se rinde y lo dice", () => {
    const e = estadoAgente(
      { dispositivo: "d", visto_en: haceMin(60), pedido_en: haceMin(MINUTOS_PEDIDO_SIN_ATENDER + 1) },
      AHORA,
    );
    expect(e.pedidoSinRespuesta).toBe(true);
  });

  it("atendido después del pedido: ya no hay nada pendiente", () => {
    const e = estadoAgente(
      { dispositivo: "d", visto_en: haceMin(1), pedido_en: haceMin(5), pedido_atendido_en: haceMin(2) },
      AHORA,
    );
    expect(e.pedidoPendiente).toBe(false);
  });

  it("⚠️ un pedido NUEVO hecho mientras el agente trabajaba NO se da por atendido", () => {
    // 🩸 Con un boolean esta segunda pulsación se habría perdido en silencio.
    // Se comparan instantes justamente por esto.
    const e = estadoAgente(
      { dispositivo: "d", visto_en: haceMin(1), pedido_atendido_en: haceMin(5), pedido_en: haceMin(1) },
      AHORA,
    );
    expect(e.pedidoPendiente).toBe(true);
  });
});

describe("🔴 la regla de las tres alertas", () => {
  it("a la PRIMERA falla no se avisa — casi siempre se arregla solo", () => {
    const d = decidirAlerta({ fallosSeguidos: 0, alertadoEn: null }, "falla", "T");
    expect(d.alerta).toBe("ninguna");
    expect(d.fallosSeguidos).toBe(1);
  });

  it("a la segunda tampoco", () => {
    const d = decidirAlerta({ fallosSeguidos: 1, alertadoEn: null }, "falla", "T");
    expect(d.alerta).toBe("ninguna");
  });

  it(`a la ${FALLOS_PARA_ALERTAR}ª seguida sí, y UNA sola vez`, () => {
    const tercera = decidirAlerta({ fallosSeguidos: 2, alertadoEn: null }, "falla", "T");
    expect(tercera.alerta).toBe("caido");
    expect(tercera.alertadoEn).toBe("T");

    // La cuarta, quinta y vigésima no repiten: el canal se silencia si repite.
    const cuarta = decidirAlerta(tercera, "falla", "T2");
    expect(cuarta.alerta).toBe("ninguna");
    expect(cuarta.alertadoEn).toBe("T");
  });

  it("🔴 dos fallas y una recuperación NO avisan nada", () => {
    // El caso más importante: el sistema que se repara solo es el sistema
    // funcionando bien, no un incidente.
    let e = decidirAlerta({ fallosSeguidos: 0, alertadoEn: null }, "falla", "T");
    e = decidirAlerta(e, "falla", "T");
    e = decidirAlerta(e, "exito", "T");
    expect(e.alerta).toBe("ninguna");
    expect(e.fallosSeguidos).toBe(0);
  });

  it("después de un aviso real, el 'ya volvió' SÍ se manda", () => {
    // Sin él, Daniel se queda con la última noticia mala y va a la oficina a
    // revisar algo que ya se arregló.
    const caido = { fallosSeguidos: 5, alertadoEn: "T" };
    const e = decidirAlerta(caido, "exito", "T2");
    expect(e.alerta).toBe("recuperado");
    expect(e.alertadoEn).toBeNull();
    expect(e.fallosSeguidos).toBe(0);
  });

  it("un episodio nuevo después de recuperarse vuelve a avisar", () => {
    let e = decidirAlerta({ fallosSeguidos: 3, alertadoEn: "T" }, "exito", "T2");
    e = decidirAlerta(e, "falla", "T3");
    e = decidirAlerta(e, "falla", "T3");
    e = decidirAlerta(e, "falla", "T3");
    expect(e.alerta).toBe("caido");
  });
});

describe("🔴 el vigía: el silencio no ejecuta código", () => {
  it("no reclama por un agente que nunca se instaló", () => {
    expect(vigiaDebeAlertar({ dispositivo: "d" }, AHORA)).toBe(false);
  });

  it("no avisa por unas horas: la PC pudo estar apagada de madrugada", () => {
    expect(vigiaDebeAlertar({ dispositivo: "d", visto_en: haceMin(4 * 60) }, AHORA, 6)).toBe(false);
  });

  it("con más de 6 horas mudo, avisa", () => {
    expect(vigiaDebeAlertar({ dispositivo: "d", visto_en: haceMin(7 * 60) }, AHORA, 6)).toBe(true);
  });

  it("no repite el mismo aviso al día siguiente", () => {
    expect(
      vigiaDebeAlertar(
        { dispositivo: "d", visto_en: haceMin(30 * 60), alertado_en: haceMin(20 * 60) },
        AHORA,
        6,
      ),
    ).toBe(false);
  });
});

describe("los textos que llegan al celular", () => {
  it("dicen qué pasó, qué significa y qué hacer", () => {
    const t = textoCaido("reloj cboston", "ETIMEDOUT");
    expect(t).toContain("Qué significa");
    expect(t).toContain("Qué hacer");
    expect(t).toContain("no se pierden");
  });

  it("el de silencio pide lo único que hay que hacer: prender la PC", () => {
    expect(textoSilencio("reloj cboston", 400)).toContain("prender la PC");
  });

  it("el tiempo se dice en cristiano", () => {
    expect(hace(0.5)).toBe("hace menos de un minuto");
    expect(hace(1)).toBe("hace 1 minuto");
    expect(hace(45)).toBe("hace 45 minutos");
    expect(hace(120)).toBe("hace 2 horas");
    expect(hace(60 * 24 * 3)).toBe("hace 3 días");
  });
});

describe("⚠️ tiene que aguantar que el DDL no esté corrido", () => {
  it("reconoce el PGRST204 de PostgREST por su nombre de columna", () => {
    expect(
      esColumnaFaltante({
        code: "PGRST204",
        message: "Could not find the 'pedido_en' column of 'asistencia_dispositivos' in the schema cache",
      }),
    ).toBe(true);
  });

  it("reconoce el 42703 de Postgres", () => {
    expect(esColumnaFaltante({ code: "42703", message: 'column "alertado_en" does not exist' })).toBe(
      true,
    );
  });

  it("🔴 NO se traga un error de verdad", () => {
    // Tragarse cualquier error convertiría un problema de permisos o de RLS en
    // una pantalla que miente diciendo "falta la migración".
    expect(esColumnaFaltante({ code: "42501", message: "permission denied for table" })).toBe(false);
    expect(esColumnaFaltante({ code: "PGRST301", message: "JWT expired" })).toBe(false);
    expect(esColumnaFaltante({ message: "fetch failed" })).toBe(false);
    expect(esColumnaFaltante(null)).toBe(false);
  });

  it("un error que nombra OTRA columna tampoco cuenta", () => {
    expect(
      esColumnaFaltante({
        code: "PGRST204",
        message: "Could not find the 'salario_mensual' column in the schema cache",
      }),
    ).toBe(false);
  });
});
