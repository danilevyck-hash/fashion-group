// ─────────────────────────────────────────────────────────────────────────────
// Las reglas del agente del lado del servidor: qué se muestra en pantalla,
// cuándo se avisa por Telegram y cómo se degrada sin la migración corrida.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  DISPOSITIVO_FG,
  HORAS_PARA_VIGIA,
  MINUTOS_PARA_CALLADO,
  MINUTOS_PEDIDO_SIN_ATENDER,
  esColumnaFaltante,
  estadoAgente,
  hace,
  vigiaDebeAlertar,
  textoSilencio,
} from "@/lib/asistencia/agente";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

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

/* 🩸 ACÁ VIVÍA «LA REGLA DE LAS TRES ALERTAS», y CAMBIÓ DE DIRECCIÓN EL
 * 15-sep-2026. Este bloque probaba que a la TERCERA falla seguida se avisaba y
 * que al recuperarse salía el «ya volvió». La máquina funcionaba exactamente
 * como estaba probada — y ese era el problema.
 *
 * Daniel, con la captura de Telegram: cuatro mensajes en 35 minutos por el
 * reloj de Multifashion, a las 11:04, 11:11, 11:22 y 11:39 de la noche. Y el
 * dato que faltaba: *«pero la PC del reloj está apagada a estas horas»* — ese
 * reloj vive en la tienda, que cierra a las 7. Su decisión, textual: *«¿que me
 * avise si lleva más de 24 horas, si de lunes a viernes?»*.
 *
 * Ahora se prueba lo contrario: que esa máquina NO EXISTE. Y el CONTROL de que
 * no se perdió el aviso está abajo — el vigía sigue sonando, con 24 h. */
describe("🩸 la regla de las tres alertas se RETIRÓ (15-sep-2026)", () => {
  const modulo = leer("src/lib/asistencia/agente.ts");
  const ingest = leer("src/app/api/asistencia/ingest/route.ts");

  it("no queda ninguna de las cuatro piezas exportada", () => {
    for (const pieza of [
      "export const FALLOS_PARA_ALERTAR",
      "export function decidirAlerta",
      "export function textoCaido",
      "export function textoRecuperado",
    ]) {
      expect(modulo).not.toContain(pieza);
    }
  });

  it("🔴 el ingest ya no le escribe a nadie por Telegram", () => {
    // Las dos ramas —la del error y la del éxito— dejaron de avisar. El único
    // aviso del reloj es el vigía.
    expect(ingest).not.toContain("enviarSistema");
    expect(ingest).not.toContain("textoCaido");
    expect(ingest).not.toContain("textoRecuperado");
  });

  it("🔴 y la rama del ERROR no toca `alertado_en`: es el candado del vigía", () => {
    // Si un reporte de error marcara el candado, el vigía se quedaría mudo
    // justo cuando el reloj lleva un día sin poder leerse.
    // Con los comentarios borrados: la nota SÍ lo nombra, y tiene que poder.
    const rama = ingest
      .slice(ingest.indexOf("if (body.error) {"), ingest.indexOf("const eventos ="))
      .replace(/^\s*\/\/.*$/gm, "");
    expect(rama).not.toContain("alertado_en");
    // El contador se conserva como diagnóstico: la columna no se dropea.
    expect(rama).toContain("fallos_seguidos");
  });

  it("⚠️ el camino del ÉXITO sí lo limpia: ahí es cuando se arregló de verdad", () => {
    // Con los comentarios borrados: la nota del éxito nombra `alertado_en: null`
    // y sin esto el candado se conformaría con la nota en vez del código.
    const codigo = ingest.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).toContain("alertado_en: null");
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

  /* 🩸 CAMBIÓ DE DIRECCIÓN EL 15-sep-2026, con motivo. Este caso exigía lo
   * contrario: «no repite el mismo aviso al día siguiente». Esa regla —UN aviso
   * por episodio— dejó a Daniel sin enterarse de dos días hábiles enteros sin
   * marcaciones: los relojes callaron el viernes 11 a las 7:52 p.m., el vigía
   * avisó el SÁBADO a las 10 a.m. (el día en que la PC está apagada a
   * propósito) y con eso gastó el candado; el lunes 14 y el martes 15 no sonó.
   * Daniel, textual: «telegram me tiene que avisar, sábado y domingo la pc
   * permanece apagada». El sábado y el domingo los saca `vercel.json` (`1-5`);
   * la repetición se resuelve acá. */
  it("vuelve a avisar en la pasada siguiente mientras siga apagada", () => {
    expect(
      vigiaDebeAlertar(
        { dispositivo: "d", visto_en: haceMin(30 * 60), alertado_en: haceMin(20 * 60) },
        AHORA,
        6,
      ),
    ).toBe(true);
  });

  /* CONTROL de lo anterior: el candado NO se fue. Dos pasadas del cron muy
   * pegadas —o un reintento— no pueden mandar dos mensajes por lo mismo. */
  it("no manda dos avisos seguidos por el mismo silencio", () => {
    expect(
      vigiaDebeAlertar(
        { dispositivo: "d", visto_en: haceMin(30 * 60), alertado_en: haceMin(20) },
        AHORA,
        6,
      ),
    ).toBe(false);
  });

  it("una fecha de aviso ilegible se trata como recién avisado: ante la duda, calla", () => {
    expect(
      vigiaDebeAlertar(
        { dispositivo: "d", visto_en: haceMin(30 * 60), alertado_en: "no-es-fecha" },
        AHORA,
        6,
      ),
    ).toBe(false);
  });
});

describe("los textos que llegan al celular", () => {
  it("el único que queda dice qué pasó, qué significa y qué hacer", () => {
    const t = textoSilencio("reloj cboston", 30 * 60);
    expect(t).toContain("Qué significa");
    expect(t).toContain("Qué hacer");
    expect(t).toContain("no se pierde ninguna");
  });

  /* 🩸 CAMBIÓ EL 15-sep-2026: decía «que la PC de la oficina no manda
   * marcaciones» y ahora dice que no se puede LEER EL RELOJ. Desde que el
   * umbral mide la última lectura buena, esto suena también con la PC prendida
   * y el reloj inalcanzable (el caso de Multifashion): mandar a Daniel a mirar
   * una PC que está perfectamente prendida sería el aviso equivocado. */
  it("habla del RELOJ, y ofrece las dos causas en orden de probabilidad", () => {
    const t = textoSilencio("Reloj de Multifashion", 30 * 60);
    expect(t).toContain("no se puede leer el reloj");
    expect(t).toContain("prender la PC");
    expect(t).toContain("en la red");
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
