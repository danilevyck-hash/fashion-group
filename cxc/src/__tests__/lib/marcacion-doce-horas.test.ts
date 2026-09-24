/**
 * LA HORA EN 12 HORAS — Y SOLO EN LA PANTALLA DE MARCAR (14-sep-2026).
 *
 * Daniel, textual: *«quiero que la hora salga en formato 12 h»* y, al
 * preguntarle si valía para todo el módulo: *«pero para la planilla sí se usa
 * formato 24 horas, ¿no? Formato de 12 horas solo para esto, ¿no?»* — sí.
 *
 * 🔴 ESTE CANDADO TIENE DOS MITADES Y LAS DOS IMPORTAN:
 *   A. la pantalla de marcar habla en 12 h;
 *   B. el CONTROL: el reporte, la corrección de una hora y lo que se concilia
 *      contra la planilla siguen en 24 h. Quien mira su propia hora en el
 *      teléfono no es quien concilia una quincena.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  diasDeLaQuincena,
  enDoceHoras,
  horaAmPm,
  horaCorta,
} from "@/lib/marcacion/marcacion";
import { normalizarHora, completarSegundos } from "@/lib/asistencia/correcciones";
import { marcasPorDia, type MarcaTelefonoCruda } from "@/lib/marcacion/en-el-reporte";

const RAIZ = path.join(process.cwd(), "src");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

describe("A. cómo se ve una hora de 12 horas — UN solo lugar", () => {
  it("«18:04» se lee «6:04 p. m.» y «08:58», «8:58 a. m.»", () => {
    expect(enDoceHoras("18:04")).toBe("6:04 p. m.");
    expect(enDoceHoras("08:58")).toBe("8:58 a. m.");
  });

  it("el mediodía y la medianoche no se vuelven «0»", () => {
    expect(enDoceHoras("12:00")).toBe("12:00 p. m.");
    expect(enDoceHoras("00:15")).toBe("12:15 a. m.");
    expect(enDoceHoras("23:59")).toBe("11:59 p. m.");
  });

  it("es la forma de la casa: sin cero adelante y con el espacio de «a. m.»", () => {
    // `docs/diccionario.md` § 2.3: «1:45 a. m.». Escrito a mano y no con Intl
    // para que no dependa de la versión de ICU del teléfono — pero tiene que
    // dar lo MISMO que da es-PA.
    expect(enDoceHoras("01:45")).toBe("1:45 a. m.");
    expect(
      new Intl.DateTimeFormat("es-PA", {
        timeZone: "America/Panama", hour: "numeric", minute: "2-digit", hour12: true,
      })
        .format(new Date("2026-09-15T06:45:00.000Z"))
        .replace(/ | /g, " "),
    ).toBe("1:45 a. m.");
  });

  it("acepta segundos y lo que no es una hora sale tal cual", () => {
    expect(enDoceHoras("13:22:02")).toBe("1:22 p. m.");
    expect(enDoceHoras("")).toBe("");
    expect(enDoceHoras("—")).toBe("—");
    expect(enDoceHoras("99:99")).toBe("99:99");
  });

  it("🔑 `horaAmPm` NO tiene su propia copia de la regla: delega", () => {
    const puro = leer("lib/marcacion/marcacion.ts");
    const cuerpo = puro.slice(puro.indexOf("export function horaAmPm"));
    expect(cuerpo.slice(0, 200)).toContain("enDoceHoras(horaCorta(iso))");
    expect(horaAmPm("2026-09-15T23:04:00.000Z")).toBe(enDoceHoras(horaCorta("2026-09-15T23:04:00.000Z")));
  });
});

describe("A. la pantalla de marcar no dibuja una hora de 24 horas", () => {
  // 🔑 Son TRES archivos desde el 24-sep-2026: el cliente, la pantalla nueva
  // («un toque») y la de antes. El barrido las mira a las tres juntas — si
  // mirara una sola, un `horaCorta` en otra se escaparía.
  const pantalla = [
    leer("app/marcacion/MarcacionClient.tsx"),
    leer("app/marcacion/PantallaUnToque.tsx"),
    leer("app/marcacion/PantallaDeAntes.tsx"),
  ].join("\n");

  it("el barrido mira el archivo de verdad (si no, no miró nada)", () => {
    expect(pantalla.length).toBeGreaterThan(5000);
    expect(pantalla).toContain("enDoceHoras");
  });

  it("🔴 no llama a `horaCorta` en ninguna parte", () => {
    const sinComentarios = pantalla
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
    expect(sinComentarios).not.toMatch(/horaCorta\s*\(/);
  });

  it("la hora grande, la línea de hoy y «Mis marcas» pasan por 12 h", () => {
    expect(pantalla).toContain("{horaAmPm(isoQueCuenta)}");
    expect(pantalla).toContain("enDoceHoras(hoyMarcado.entrada)");
    expect(pantalla).toContain("enDoceHoras(d.entrada)");
  });
});

describe("🔴 B. EL CONTROL — lo que se concilia sigue en 24 horas", () => {
  it("corregir una hora se sigue eligiendo y guardando en 24 h", () => {
    const modal = leer("app/asistencia/CorregirMarcacionModal.tsx");
    expect(modal).toContain('type="time"');
    expect(modal).not.toContain("a. m.");
    expect(modal).not.toContain("enDoceHoras");
    expect(normalizarHora("18:04")).toBe("18:04:00");
    expect(completarSegundos("18:04", "18:04:37")).toBe("18:04:37");
  });

  it("las columnas del reporte no se pasan a 12 h", () => {
    const tab = leer("app/asistencia/ReporteTab.tsx");
    expect(tab).not.toContain("enDoceHoras");
  });

  it("la hora con la que la marca del teléfono PAREA con el reporte es de 24 h", () => {
    const fila: MarcaTelefonoCruda = {
      id: "m1", empleado_codigo: "2", ocurrio_en: "2026-09-15T23:04:00.000Z",
      tipo: "salida", sin_senal: false, created_at: "2026-09-15T23:04:05.000Z",
      hora_telefono: null, foto_path: null, lat: null, lng: null,
    };
    const [m] = marcasPorDia([fila])["2|2026-09-15"];
    // La que parea con la columna (24 h) y la que se LEE en la línea (12 h).
    expect(m.hora).toBe("18:04");
    expect(m.horaLarga).toBe("6:04 p. m.");
  });

  it("el dato crudo de «Mis marcas» sigue siendo de 24 h: lo que cambia es cómo se dibuja", () => {
    const [dia] = diasDeLaQuincena(
      [{ ocurrioEn: "2026-09-15T13:58:00.000Z" }, { ocurrioEn: "2026-09-15T23:04:00.000Z" }],
      "2026-09-15",
    );
    expect(dia.entrada).toBe("08:58");
    expect(dia.salida).toBe("18:04");
  });
});
