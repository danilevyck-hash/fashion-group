// ─────────────────────────────────────────────────────────────────────────────
// EL HUECO QUE EL PROGRAMA YA NO ALCANZA — candados del aviso.
//
// Pedido de Daniel, textual (12-ago-2026): "ok lo corro pero si pasa mas de 15
// dias que me llegue notificacion a telegram alertas para saber q hay q
// arreglarlo". Es la 4ª alerta de sistema, aprobada por él.
//
// Lo que estos tests FIJAN, y por qué cada uno existe:
//   1. EL UMBRAL SALE DEL AGENTE, no de un 15 copiado a mano. Se importa el
//      archivo REAL del programa de la PC y se compara — si alguien mueve uno
//      solo de los dos números, esto se pone rojo.
//   2. NULL no es hueco (reloj recién puesto): no avisa.
//   3. 14 días no avisa, 16 sí. El borde exacto (15) tampoco: el aviso es
//      "MÁS de 15 días", no "15 o más".
//   4. UN mensaje por episodio: la segunda pasada del cron (3 por día) no
//      repite.
//   5. Cerrado el hueco, el "ya se arregló" sale UNA vez y solo si hubo
//      alerta previa.
//   6. El route del vigía usa las funciones de acá y `enviarSistema` — nunca
//      `sendTelegramAlert` directo — y los textos no tienen jerga.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
// @ts-expect-error — el agente es JS puro a propósito: corre en una PC de la
// oficina donde nadie compila TypeScript. Importar el archivo REAL es lo que
// hace que este candado mida el programa instalado y no una copia.
import { VENTANA_RECUPERACION_DIAS_DEFAULT } from "../../../scripts/agente-reloj/config.mjs";
import {
  DIAS_RECUPERACION_AGENTE,
  vigiaDebeAlertarHueco,
  vigiaHuecoCerrado,
  textoHuecoViejo,
  textoHuecoCerrado,
  esColumnaFaltante,
  type FilaDispositivo,
} from "@/lib/asistencia/agente";

const AHORA = Date.parse("2026-08-12T16:00:00Z");
const haceDias = (d: number) => new Date(AHORA - d * 24 * 60 * 60 * 1000).toISOString();

const fila = (extra: Partial<FilaDispositivo>): FilaDispositivo => ({
  dispositivo: "reloj cboston",
  visto_en: haceDias(0),
  ...extra,
});

describe("el umbral se deriva del agente (no se copia un 15 a mano)", () => {
  it("DIAS_RECUPERACION_AGENTE es EXACTAMENTE la ventana de recuperación del agente v1.1.0", () => {
    // Si el programa de la PC cambia su ventana, la constante compartida tiene
    // que moverse con él en el MISMO cambio. Verificado por mutación: poner 14
    // o 16 en cualquiera de los dos lados pone esto rojo.
    expect(DIAS_RECUPERACION_AGENTE).toBe(VENTANA_RECUPERACION_DIAS_DEFAULT);
  });

  it("el texto del aviso dice el número de la constante, no uno propio", () => {
    const t = textoHuecoViejo("reloj cboston", DIAS_RECUPERACION_AGENTE);
    expect(t).toContain(`más de ${DIAS_RECUPERACION_AGENTE} días`);
    expect(t).toContain(`hasta ${DIAS_RECUPERACION_AGENTE} días hacia atrás`);
  });
});

describe("vigiaDebeAlertarHueco — cuándo suena", () => {
  it("sin fecha de lectura NO avisa (reloj recién puesto, no es un hueco)", () => {
    expect(vigiaDebeAlertarHueco(fila({ leido_hasta: null }), AHORA)).toBe(false);
    expect(vigiaDebeAlertarHueco(fila({}), AHORA)).toBe(false);
    expect(vigiaDebeAlertarHueco(null, AHORA)).toBe(false);
  });

  it("14 días NO avisa (el programa todavía lo alcanza solo)", () => {
    expect(vigiaDebeAlertarHueco(fila({ leido_hasta: haceDias(14) }), AHORA)).toBe(false);
  });

  it("15 días EXACTOS tampoco: el aviso es 'MÁS de 15', no '15 o más'", () => {
    expect(vigiaDebeAlertarHueco(fila({ leido_hasta: haceDias(15) }), AHORA)).toBe(false);
  });

  it("16 días SÍ avisa (ese hueco ya no entra solo)", () => {
    expect(vigiaDebeAlertarHueco(fila({ leido_hasta: haceDias(16) }), AHORA)).toBe(true);
  });

  it("la segunda pasada del cron NO repite: el candado hueco_alertado_en frena", () => {
    const f = fila({ leido_hasta: haceDias(20), hueco_alertado_en: haceDias(1) });
    expect(vigiaDebeAlertarHueco(f, AHORA)).toBe(false);
  });

  it("una fecha ilegible NO avisa (no se puede medir el hueco)", () => {
    expect(vigiaDebeAlertarHueco(fila({ leido_hasta: "no-es-fecha" }), AHORA)).toBe(false);
  });

  it("el episodio de SILENCIO no interfiere: alertado_en puesto no frena el del hueco", () => {
    // Son episodios independientes: la PC puede llevar horas callada Y tener
    // un hueco viejo. Cada aviso tiene su candado propio.
    const f = fila({ leido_hasta: haceDias(20), alertado_en: haceDias(1) });
    expect(vigiaDebeAlertarHueco(f, AHORA)).toBe(true);
  });
});

describe("vigiaHuecoCerrado — el 'ya se arregló' sale una vez y con alerta previa", () => {
  it("hueco cerrado CON alerta previa → sí manda la recuperación", () => {
    const f = fila({ leido_hasta: haceDias(2), hueco_alertado_en: haceDias(3) });
    expect(vigiaHuecoCerrado(f, AHORA)).toBe(true);
  });

  it("cerrado el episodio (marca limpiada), la pasada siguiente NO repite la recuperación", () => {
    const f = fila({ leido_hasta: haceDias(2), hueco_alertado_en: null });
    expect(vigiaHuecoCerrado(f, AHORA)).toBe(false);
  });

  it("hueco cerrado SIN alerta previa → nada (no hay a quién tranquilizar)", () => {
    expect(vigiaHuecoCerrado(fila({ leido_hasta: haceDias(2) }), AHORA)).toBe(false);
  });

  it("con el hueco todavía abierto NO se declara cerrado", () => {
    const f = fila({ leido_hasta: haceDias(20), hueco_alertado_en: haceDias(1) });
    expect(vigiaHuecoCerrado(f, AHORA)).toBe(false);
  });

  it("sin fecha legible no se afirma nada: ni cerrado ni abierto", () => {
    expect(vigiaHuecoCerrado(fila({ leido_hasta: null, hueco_alertado_en: haceDias(1) }), AHORA)).toBe(
      false,
    );
  });
});

describe("los textos — español simple, sin jerga", () => {
  it("el aviso dice qué pasó, qué significa y qué hacer", () => {
    const t = textoHuecoViejo("reloj cboston");
    expect(t).toContain("Qué significa:");
    expect(t).toContain("Qué hacer:");
    expect(t).toContain("ampliar la ventana");
    // 1-sep-2026: el texto de pantalla pasó a tuteo neutro (sin voseo) — candado en `nada-de-voseo.test.ts`.
    expect(t).toContain("pídele los pasos a Claude");
  });

  it("ni el aviso ni la recuperación nombran columnas ni tablas", () => {
    for (const t of [textoHuecoViejo("reloj cboston"), textoHuecoCerrado("reloj cboston")]) {
      expect(t).not.toContain("leido_hasta");
      expect(t).not.toContain("hueco_alertado_en");
      expect(t).not.toContain("asistencia_dispositivos");
    }
  });

  it("la recuperación del hueco se distingue de la del silencio de la PC", () => {
    expect(textoHuecoCerrado("reloj cboston")).toContain("atrasadas");
  });
});

describe("degradar sin la migración corrida", () => {
  it("esColumnaFaltante reconoce hueco_alertado_en (PGRST204 y 42703)", () => {
    expect(
      esColumnaFaltante({
        code: "PGRST204",
        message: "Could not find the 'hueco_alertado_en' column of 'asistencia_dispositivos'",
      }),
    ).toBe(true);
    expect(
      esColumnaFaltante({ code: "42703", message: 'column "hueco_alertado_en" does not exist' }),
    ).toBe(true);
  });
});

describe("candado estático: el route del vigía", () => {
  const ruta = path.join(process.cwd(), "src/app/api/cron/asistencia-vigia/route.ts");
  const codigo = readFileSync(ruta, "utf8");

  it("usa las funciones compartidas para decidir y para redactar", () => {
    expect(codigo).toContain("vigiaDebeAlertarHueco");
    expect(codigo).toContain("vigiaHuecoCerrado");
    expect(codigo).toContain("textoHuecoViejo");
    expect(codigo).toContain("textoHuecoCerrado");
    expect(codigo).toContain("DIAS_RECUPERACION_AGENTE");
  });

  it("manda por enviarSistema, NUNCA sendTelegramAlert directo", () => {
    expect(codigo).toContain("enviarSistema");
    expect(codigo).not.toContain("sendTelegramAlert");
  });

  it("no tiene un umbral de días escrito a mano", () => {
    // El 15 solo puede vivir en la constante compartida (que a su vez se
    // compara contra el agente). Un `15` suelto en el route sería la segunda
    // copia que este diseño existe para impedir. Se toleran los 15 de horarios
    // en comentarios ("15:00", "17:15") mirando solo el código sin comentarios.
    const sinComentarios = codigo.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(sinComentarios).not.toMatch(/\b15\s*\*\s*24\b|\bdias\s*=\s*15\b|\b15\s*días\b/);
  });
});
