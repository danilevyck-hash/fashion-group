/**
 * QUE SE VEA CUANDO EL RELOJ DEL TELÉFONO ESTÁ CORRIDO (14-sep-2026).
 *
 * 🩸 EL HUECO, MEDIDO EN LA PRUEBA DE DANIEL. Cambió el reloj de su iPhone DOS
 * HORAS y marcó CON SEÑAL. El sistema hizo lo correcto: guardó su hora real
 * (22:50:40) e ignoró la del teléfono (00:49:40). Pero esa diferencia de dos
 * horas quedó guardada y NO LA VEÍA NADIE: el aviso a la contadora solo salía
 * cuando la marca venía `sin_senal`.
 *
 * Por qué importa: si esa persona un día marca SIN señal, la hora que entra es
 * la de su teléfono. Si su reloj está corrido, esa hora entra mal.
 *
 * ⚠️ NO ES UNA ACUSACIÓN: la causa común es un teléfono mal configurado. Y
 * 🔴 NADA CAMBIA EN EL CÁLCULO: la hora que manda sigue siendo la del servidor.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  DESFASE_QUE_SE_DICE_MS,
  cuantoCorrido,
  desfaseDelTelefonoMs,
  textoRelojCorrido,
} from "@/lib/marcacion/marcacion";
import { marcasPorDia, type MarcaTelefonoCruda } from "@/lib/marcacion/en-el-reporte";

/** La marca de la prueba de Daniel, tal como quedó en la base. */
const COMO_MARCO_DANIEL: MarcaTelefonoCruda = {
  id: "m1",
  empleado_codigo: "13",
  // La hora que CUENTA: la del servidor, 22:50:40 de Panamá.
  ocurrio_en: "2026-09-15T03:50:40.000Z",
  tipo: "entrada",
  // 🔴 CON SEÑAL. Éste es el punto: antes solo se decía algo si era sin señal.
  sin_senal: false,
  created_at: "2026-09-15T03:50:45.000Z",
  // Lo que decía su iPhone: dos horas adelante.
  hora_telefono: "2026-09-15T05:49:40.000Z",
  foto_path: "13/2026-09-14/m1.jpg",
  lat: 8.98,
  lng: -79.51,
};

describe("cuánto está corrido", () => {
  it("la diferencia sale de las dos horas que ya se guardaban", () => {
    const ms = desfaseDelTelefonoMs(COMO_MARCO_DANIEL.ocurrio_en, COMO_MARCO_DANIEL.hora_telefono);
    expect(ms).toBe(119 * 60_000);
  });

  it("sin la hora del teléfono no se dice nada: no se inventa un desfase", () => {
    expect(desfaseDelTelefonoMs("2026-09-15T03:50:40.000Z", null)).toBeNull();
    expect(textoRelojCorrido("2026-09-15T03:50:40.000Z", null)).toBeNull();
    expect(textoRelojCorrido("2026-09-15T03:50:40.000Z", "no es una fecha")).toBeNull();
  });

  it("se lee en palabras y siempre en positivo", () => {
    expect(cuantoCorrido(7 * 60_000)).toBe("7 min");
    expect(cuantoCorrido(-7 * 60_000)).toBe("7 min");
    expect(cuantoCorrido(120 * 60_000)).toBe("2 h");
    expect(cuantoCorrido(90 * 60_000)).toBe("1 h 30 min");
  });
});

describe("🔴 desde cuándo se dice, y desde cuándo no", () => {
  it("cinco minutos o menos NO se dicen: es un reloj que nadie ajustó", () => {
    expect(DESFASE_QUE_SE_DICE_MS).toBe(5 * 60_000);
    expect(textoRelojCorrido("2026-09-15T03:50:40.000Z", "2026-09-15T03:54:40.000Z")).toBeNull();
    expect(textoRelojCorrido("2026-09-15T03:50:40.000Z", "2026-09-15T03:55:40.000Z")).toBeNull();
  });

  it("pasados los cinco minutos SÍ, adelantado o atrasado", () => {
    expect(textoRelojCorrido("2026-09-15T03:50:40.000Z", "2026-09-15T03:57:40.000Z"))
      .toBe("el reloj de su teléfono está corrido 7 min");
    expect(textoRelojCorrido("2026-09-15T03:50:40.000Z", "2026-09-15T03:43:40.000Z"))
      .toBe("el reloj de su teléfono está corrido 7 min");
  });

  it("🔴 el caso de Daniel: CON SEÑAL, y la contadora lo ve", () => {
    const [m] = marcasPorDia([COMO_MARCO_DANIEL])["13|2026-09-14"];
    // ⚠️ SE DICE LO QUE ES Y NO SE REDONDEA A «2 h»: entre las dos horas
    // medidas hay 1 h 59 min. Redondear sería escribir un número que el sistema
    // no midió, y de eso se trata el módulo entero.
    expect(m.relojCorrido).toBe("el reloj de su teléfono está corrido 1 h 59 min");
    // Y la hora que se muestra sigue siendo la que CUENTA, la del servidor.
    expect(m.hora).toBe("22:50");
    expect(m.detalle).toBe("Marcada desde el teléfono");
  });

  it("dos horas exactas se leen «2 h»", () => {
    expect(textoRelojCorrido("2026-09-15T03:50:40.000Z", "2026-09-15T05:50:40.000Z"))
      .toBe("el reloj de su teléfono está corrido 2 h");
  });

  it("CONTROL: un teléfono en hora no dice nada de más", () => {
    const [m] = marcasPorDia([
      { ...COMO_MARCO_DANIEL, hora_telefono: "2026-09-15T03:50:41.000Z" },
    ])["13|2026-09-14"];
    expect(m.relojCorrido).toBeNull();
  });

  it("CONTROL: una marca del reloj de la tienda no trae hora de teléfono y no se la inventa", () => {
    const [m] = marcasPorDia([{ ...COMO_MARCO_DANIEL, hora_telefono: null }])["13|2026-09-14"];
    expect(m.relojCorrido).toBeNull();
  });
});

describe("🔴 el texto que lee la contadora", () => {
  const texto = textoRelojCorrido("2026-09-15T03:50:40.000Z", "2026-09-15T05:50:40.000Z")!;

  it("no usa la palabra «llegó» — se entendería «llegó a trabajar»", () => {
    expect(texto.toLowerCase()).not.toContain("llegó");
    expect(texto.toLowerCase()).not.toContain("llego");
  });

  it("no acusa a nadie: ni trampa, ni mentira, ni alterar", () => {
    for (const fea of ["tramp", "minti", "minte", "false", "alter", "fraude", "cambió la hora"]) {
      expect(texto.toLowerCase()).not.toContain(fea);
    }
  });

  it("y está en español neutro, sin voseo", () => {
    expect(texto).not.toMatch(/tenés|podés|mirá|revisá|acá está/);
  });
});

describe("🔴 nada del cálculo depende de esto", () => {
  const RAIZ = path.join(process.cwd(), "src");

  it("la hora del teléfono se LEE para decirlo, y no entra a ninguna cuenta", () => {
    // La columna viaja en la lectura APARTE del reporte (la tolerante), no en
    // el `select` del motor: con la migración sin correr, el reporte es el de
    // siempre y esto viene vacío.
    const lector = fs.readFileSync(path.join(RAIZ, "lib/marcacion/reporte-server.ts"), "utf8");
    expect(lector).toContain("hora_telefono");
    const motor = fs.readFileSync(path.join(RAIZ, "lib/asistencia/reporte.ts"), "utf8");
    expect(motor).not.toContain("hora_telefono");
    expect(motor).not.toContain("relojCorrido");
  });
});
