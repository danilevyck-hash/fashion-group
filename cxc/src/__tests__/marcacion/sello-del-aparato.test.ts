/**
 * EL SELLO DEL TELÉFONO Y EL AVISO DE «DOS PERSONAS, UN SOLO APARATO»
 * (25-sep-2026).
 *
 * 🩸 DE DÓNDE SALE. Medido el 24-sep-2026 contra producción: las cuatro personas
 * de Multifashion marcaron juntas seis veces en tres días, al abrir y al cerrar
 * la tienda, siempre desde el mismo punto. Se pudo DESCARTAR que fuera un solo
 * teléfono —el 22-sep, en 63 segundos, marcaron tres versiones de iPhone
 * distintas— pero no se pudo decir de quién era cada aparato:
 * `asistencia_marcaciones` no guardaba NADA que identifique el teléfono.
 *
 * Lo que este candado fija:
 *   1. el sello es un número al azar del NAVEGADOR, y sin `localStorage` no hay
 *      sello y no pasa nada;
 *   2. el mismo teléfono devuelve SIEMPRE el mismo sello;
 *   3. una marca sin sello NUNCA entra a un aviso (si no, las 8.175 marcas
 *      viejas quedarían todas «en el mismo teléfono»);
 *   4. hacen falta DOS personas distintas, no dos marcas;
 *   5. el texto que le llega a Daniel es el que él aprobó;
 *   6. con `SELLO_DEL_APARATO = false` no se pone sello ni se avisa nada.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CAMPO_APARATO,
  LLAVE_SELLO,
  SELLO_DEL_APARATO,
  selloDeEsteAparato,
  selloValido,
} from "@/lib/marcacion/sello-del-aparato";
import {
  aparatosCompartidos,
  diaPanama,
  fechaCortaPanama,
  horaPanama,
  llaveDelAviso,
  textoDelAviso,
  type MarcaConSello,
} from "@/lib/asistencia/mismo-aparato";
import {
  COLUMNAS_NUEVAS,
  faltaUnaColumnaNueva,
  sinLasColumnasNuevas,
} from "@/lib/marcacion/columnas-nuevas";

const SELLO_A = "11111111-2222-3333-4444-555555555555";
const SELLO_B = "99999999-8888-7777-6666-555555555555";

/**
 * Un `localStorage` de mentira, en memoria. El entorno de los tests no siempre
 * trae uno —y es justamente el caso que el módulo tiene que aguantar—, así que
 * acá se pone uno a propósito para poder probar las dos mitades: con
 * almacenamiento y sin él.
 */
function almacenDeMentira() {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, String(v)),
    removeItem: (k: string) => void datos.delete(k),
    clear: () => datos.clear(),
    key: (i: number) => [...datos.keys()][i] ?? null,
    get length() {
      return datos.size;
    },
  } as unknown as Storage;
}

describe("el sello: qué es y qué no es", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", almacenDeMentira());
  });

  it("hoy está prendido y el campo se llama `aparatoId`", () => {
    expect(SELLO_DEL_APARATO).toBe(true);
    expect(CAMPO_APARATO).toBe("aparatoId");
    expect(LLAVE_SELLO).toBe("fg_marcacion_aparato");
  });

  it("🔴 el MISMO teléfono devuelve SIEMPRE el mismo sello", () => {
    const uno = selloDeEsteAparato();
    const dos = selloDeEsteAparato();
    expect(uno).toBeTruthy();
    expect(dos).toBe(uno);
    expect(selloValido(uno)).toBe(true);
  });

  it("🔴 sin `localStorage` no hay sello, y eso NO es un error", () => {
    // Safari en modo privado, o el almacenamiento bloqueado: tira al leer.
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("modo privado");
      },
      setItem: () => {
        throw new Error("modo privado");
      },
    } as unknown as Storage);
    expect(selloDeEsteAparato()).toBeNull();
  });

  it("solo pasa lo que tiene forma de sello", () => {
    expect(selloValido(SELLO_A)).toBe(true);
    expect(selloValido("corto")).toBe(false);
    expect(selloValido("con espacio adentro")).toBe(false);
    expect(selloValido(null)).toBe(false);
    expect(selloValido("x".repeat(65))).toBe(false);
  });
});

describe("🔴 dos personas, un solo teléfono", () => {
  const marca = (codigo: string, nombre: string, hora: string, aparato: string | null): MarcaConSello => ({
    empleado_codigo: codigo,
    empleado_nombre: nombre,
    // Las horas de la base son UTC; 13:58Z = 8:58 de Panamá.
    ocurrio_en: hora,
    aparato_id: aparato,
  });

  it("dos personas con el MISMO sello en el mismo día se avisan", () => {
    const casos = aparatosCompartidos([
      marca("2", "Ana Trejos", "2026-09-25T13:58:00.000Z", SELLO_A),
      marca("3", "Cindy De Gracia", "2026-09-25T14:00:00.000Z", SELLO_A),
    ]);
    expect(casos.length).toBe(1);
    expect(casos[0].personas.map((p) => p.nombre)).toEqual(["Ana Trejos", "Cindy De Gracia"]);
  });

  it("🔴 la MISMA persona con cuatro marcas NO se avisa — no es la pregunta", () => {
    const casos = aparatosCompartidos([
      marca("2", "Ana Trejos", "2026-09-25T13:58:00.000Z", SELLO_A),
      marca("2", "Ana Trejos", "2026-09-25T17:00:00.000Z", SELLO_A),
      marca("2", "Ana Trejos", "2026-09-25T18:00:00.000Z", SELLO_A),
      marca("2", "Ana Trejos", "2026-09-25T23:00:00.000Z", SELLO_A),
    ]);
    expect(casos).toEqual([]);
  });

  it("🔴 dos personas con sellos DISTINTOS no se avisan", () => {
    expect(
      aparatosCompartidos([
        marca("2", "Ana Trejos", "2026-09-25T13:58:00.000Z", SELLO_A),
        marca("3", "Cindy De Gracia", "2026-09-25T14:00:00.000Z", SELLO_B),
      ]),
    ).toEqual([]);
  });

  it("🔴 SIN SELLO no se dice nada — las 8.175 marcas viejas no son «el mismo teléfono»", () => {
    expect(
      aparatosCompartidos([
        marca("2", "Ana Trejos", "2026-09-25T13:58:00.000Z", null),
        marca("3", "Cindy De Gracia", "2026-09-25T14:00:00.000Z", null),
        marca("305", "Angel Pizza", "2026-09-25T14:01:00.000Z", null),
      ]),
    ).toEqual([]);
  });

  it("🔴 el mismo teléfono en DÍAS distintos son dos casos, no uno", () => {
    const casos = aparatosCompartidos([
      marca("2", "Ana Trejos", "2026-09-25T13:58:00.000Z", SELLO_A),
      marca("3", "Cindy De Gracia", "2026-09-25T14:00:00.000Z", SELLO_A),
      marca("2", "Ana Trejos", "2026-09-26T13:58:00.000Z", SELLO_A),
      marca("3", "Cindy De Gracia", "2026-09-26T14:00:00.000Z", SELLO_A),
    ]);
    expect(casos.length).toBe(2);
    expect(casos.map((c) => c.dia)).toEqual(["2026-09-25", "2026-09-26"]);
    // Y sus llaves de anti-loop son distintas: un aviso por (aparato, día).
    expect(new Set(casos.map(llaveDelAviso)).size).toBe(2);
  });

  it("🔴 el día es el de PANAMÁ, no el de UTC", () => {
    // 26-sep 02:00 UTC es todavía el 25 de septiembre en Panamá (UTC−5).
    expect(diaPanama("2026-09-26T02:00:00.000Z")).toBe("2026-09-25");
    expect(horaPanama("2026-09-25T13:58:00.000Z")).toBe("8:58");
    expect(fechaCortaPanama("2026-09-25T13:58:00.000Z")).toBe("vie 25 sep");
  });

  it("🔴 el mensaje es el que Daniel aprobó", () => {
    const [caso] = aparatosCompartidos([
      marca("2", "Ana Trejos", "2026-09-25T13:58:00.000Z", SELLO_A),
      marca("3", "Cindy De Gracia", "2026-09-25T14:00:00.000Z", SELLO_A),
    ]);
    expect(textoDelAviso(caso, "american_classic")).toBe(
      "📱 Ana Trejos y Cindy De Gracia marcaron desde el mismo teléfono · Multifashion · vie 25 sep 8:58 y 9:00",
    );
  });

  it("sin empresa en la ficha, el mensaje sale igual y no inventa una", () => {
    const [caso] = aparatosCompartidos([
      marca("2", "Ana Trejos", "2026-09-25T13:58:00.000Z", SELLO_A),
      marca("3", "Cindy De Gracia", "2026-09-25T14:00:00.000Z", SELLO_A),
    ]);
    const texto = textoDelAviso(caso, null);
    expect(texto).toContain("marcaron desde el mismo teléfono");
    expect(texto).not.toContain("Multifashion");
  });
});

describe("🔴 sin la migración, todo sigue igual — falla ABIERTA", () => {
  it("las dos columnas nuevas son exactamente dos", () => {
    expect([...COLUMNAS_NUEVAS]).toEqual(["lugar_texto", "aparato_id"]);
  });

  it("reconoce «la base todavía no tiene esa columna»", () => {
    expect(faltaUnaColumnaNueva({ code: "PGRST204", message: "Could not find the 'aparato_id' column" })).toBe(true);
    expect(faltaUnaColumnaNueva({ code: "42703", message: 'column "lugar_texto" does not exist' })).toBe(true);
  });

  it("y NO se lleva por delante cualquier otro error", () => {
    // Nombra una columna nueva pero no es un error de esquema.
    expect(faltaUnaColumnaNueva({ code: "23505", message: "duplicate key aparato_id" })).toBe(false);
    // Es de esquema pero de otra columna: ese sí tiene que romper.
    expect(faltaUnaColumnaNueva({ code: "42703", message: 'column "ocurrio_en" does not exist' })).toBe(false);
    expect(faltaUnaColumnaNueva(null)).toBe(false);
  });

  it("y la fila se reescribe SIN ellas, sin tocar nada más", () => {
    const fila = {
      dispositivo: "telefono",
      evento_id: "abc",
      ocurrio_en: "2026-09-25T13:58:00.000Z",
      lugar_texto: "City Mall David",
      aparato_id: SELLO_A,
    };
    expect(sinLasColumnasNuevas(fila)).toEqual({
      dispositivo: "telefono",
      evento_id: "abc",
      ocurrio_en: "2026-09-25T13:58:00.000Z",
    });
    // Y no muta la original.
    expect(fila.aparato_id).toBe(SELLO_A);
  });
});

describe("🔴 el aviso no bloquea ni escribe sobre la marca", () => {
  const sinComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

  const IO = sinComentarios(
    readFileSync(join(process.cwd(), "src/lib/asistencia/mismo-aparato-io.ts"), "utf8"),
  );
  const RUTA = sinComentarios(
    readFileSync(join(process.cwd(), "src/app/api/marcacion/route.ts"), "utf8"),
  );

  it("va al chat PRIVADO de Daniel, con trato de negocio", () => {
    expect(IO).toContain("enviarNegocioPrivado");
    expect(IO).not.toContain("enviarSistema");
    expect(IO).not.toContain("enviarNegocio(");
    // Y nadie llama a Telegram directo: esa es la regla de la casa.
    expect(IO).not.toContain("sendTelegramAlert");
  });

  it("🔴 la llave del anti-loop se escribe DESPUÉS de que Telegram confirme", () => {
    const orden = IO.indexOf("const enviado = await enviarNegocioPrivado");
    const marca = IO.indexOf("await logCronError(llave");
    expect(orden).toBeGreaterThan(-1);
    expect(marca).toBeGreaterThan(orden);
    expect(IO).toContain("if (!enviado) continue;");
  });

  it("🔴 no edita ni borra la marcación: solo la LEE", () => {
    expect(IO).not.toContain(".update(");
    expect(IO).not.toContain(".delete(");
    expect(IO).not.toContain(".upsert(");
  });

  it("🔴 se revisa DESPUÉS de guardar, y nunca frena una marca", () => {
    const guardar = RUTA.indexOf("guardarMarcaciones([fila])");
    const revisar = RUTA.indexOf("revisarMismoAparato(");
    expect(guardar).toBeGreaterThan(-1);
    expect(revisar).toBeGreaterThan(guardar);
    // Y el sello nunca produce un rechazo.
    expect(RUTA).not.toMatch(/aparato[\s\S]{0,120}status:\s*4\d\d/i);
  });
});
