/**
 * Candados del CATÁLOGO DE CUENTAS — lo que le pone NOMBRE a los códigos que
 * trae Egresos Varios.
 *
 * 🔑 LO QUE MÁS IMPORTA, y es la mitad de este archivo: **un nombre no se
 * inventa nunca**. `6.02.01.00.00` parece "salarios" por vecindad con `6.01` y
 * en realidad es SERVICIOS PROFESIONALES — el gasto más grande de Vistana
 * ($63.938,43). Un nombre inventado encima de una cifra de plata es peor que el
 * código pelado: el código pelado no dice nada, el nombre inventado dice algo
 * falso.
 *
 * La otra mitad es la SIEMBRA: las 147 cuentas que Daniel bajó del panel viven
 * en la migración, y acá se vuelve a parsear el CSV real para exigir que las
 * filas del .sql sean IDÉNTICAS. Una siembra editada a mano se pone roja.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  codigoVisible,
  normalizarNombreCuenta,
  normalizarCatalogo,
  catalogoUtilizable,
  MINIMO_CUENTAS,
  armarNombres,
  nombreDeCuenta,
  codigosCandidatos,
  etiquetaCuenta,
} from "@/lib/cuentas/catalogo";
import {
  parsearCatalogoCsv,
  pareceCsvDeCuentas,
  nivelDeSegmentos,
} from "@/lib/cuentas/catalogo-csv";

const raiz = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(raiz, rel), "latin1");

const CSV = leer("src/__tests__/fixtures/catalogo-cuentas-vistana.csv");
const MIGRACION = leer("supabase/migrations/20260813180000_cuentas_contables.sql");

// ─────────────────────────────────────────────────────────────────────────────
describe("el código que se PINTA va al mismo nivel que el nombre", () => {
  it("quita los ceros de relleno del final", () => {
    expect(codigoVisible("6.02.01.00.00")).toBe("6.02.01");
    expect(codigoVisible("1.06.01.00.00")).toBe("1.06.01");
  });

  it("🩸 pero conserva un 4º segmento que SÍ dice algo", () => {
    // Recortando siempre a 3, `2.01.04.02` y `2.01.04.03` se ven las dos como
    // `2.01.04` con nombres distintos: dos renglones con el mismo código
    // diciendo cosas diferentes.
    expect(codigoVisible("2.01.04.02.00")).toBe("2.01.04.02");
    expect(codigoVisible("2.01.04.03.00")).toBe("2.01.04.03");
    expect(codigoVisible("6.01.01.02.00")).toBe("6.01.01.02");
  });

  it("nunca baja de 3 segmentos (es lo que se mostraba antes)", () => {
    expect(codigoVisible("6.03.00.00.00")).toBe("6.03.00");
    expect(codigoVisible("1.00.00.00.00")).toBe("1.00.00");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("los nombres de Switch vienen con espacios de más", () => {
  it("se colapsan para pintar", () => {
    expect(normalizarNombreCuenta(" SERVICIOS    PROFESIONALES ")).toBe("SERVICIOS PROFESIONALES");
    expect(normalizarNombreCuenta(" CUENTAS  POR  PAGAR  MULTI  FASHION  HOLDING ")).toBe(
      "CUENTAS POR PAGAR MULTI FASHION HOLDING",
    );
  });

  it("🔴 y NADA MÁS: ni mayúsculas, ni acentos, ni abreviaturas", () => {
    // El nombre es el que escribió la contadora y con ése se cuadra contra el
    // panel de Switch.
    expect(normalizarNombreCuenta(" Impuesto  sobre  la  renta ")).toBe("Impuesto sobre la renta");
    expect(normalizarNombreCuenta("Depreciación Acumulada")).toBe("Depreciación Acumulada");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 UN NOMBRE NO SE INVENTA NUNCA", () => {
  const nombres = armarNombres(
    [
      { cuenta: "6.02.01.00.00", nombre: "SERVICIOS PROFESIONALES" },
      { cuenta: "2.01.04.00.00", nombre: "RETENCIONES POR PAGAR" },
    ],
    [],
  );

  it("el que está, está", () => {
    expect(nombreDeCuenta("6.02.01.00.00", nombres)).toBe("SERVICIOS PROFESIONALES");
  });

  it("🩸 el que NO está devuelve null — jamás uno deducido por vecindad", () => {
    // 6.02.01 es SERVICIOS PROFESIONALES, no "salarios" por estar al lado de
    // 6.01. Si el catálogo no lo trae, la pantalla muestra el código pelado.
    expect(nombreDeCuenta("5.03.00.00.00", nombres)).toBeNull();
    expect(nombreDeCuenta("6.99.99.00.00", nombres)).toBeNull();
  });

  it("un auxiliar cae al nombre de SU subcuenta, no al de un vecino", () => {
    expect(nombreDeCuenta("2.01.04.02.00", nombres)).toBe("RETENCIONES POR PAGAR");
    // …pero 2.01.05 NO hereda de 2.01.04: son hermanas, no madre e hija.
    expect(nombreDeCuenta("2.01.05.01.00", nombres)).toBeNull();
  });

  it("sin nombre, la etiqueta es el código SOLO — nunca un guion colgando", () => {
    expect(etiquetaCuenta("6.02.01.00.00", "SERVICIOS PROFESIONALES")).toBe(
      "6.02.01 — SERVICIOS PROFESIONALES",
    );
    expect(etiquetaCuenta("5.03.00.00.00", null)).toBe("5.03.00");
    expect(etiquetaCuenta("5.03.00.00.00", null)).not.toContain("—");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el catálogo GANA sobre el nombre copiado en el mayor", () => {
  it("cuando los dos tienen la cuenta, manda el catálogo", () => {
    const n = armarNombres(
      [{ cuenta: "6.02.01.00.00", nombre: "SERVICIOS PROFESIONALES" }],
      [{ cuenta: "6.02.01.00.00", nombre: "SERV PROF" }],
    );
    expect(nombreDeCuenta("6.02.01.00.00", n)).toBe("SERVICIOS PROFESIONALES");
  });

  it("🔑 pero el mayor sostiene la pantalla mientras el catálogo no esté", () => {
    // Las 22 cuentas con nombre del 13-ago salieron de ahí.
    const n = armarNombres([], [{ cuenta: "6.02.01.00.00", nombre: "SERVICIOS PROFESIONALES" }]);
    expect(nombreDeCuenta("6.02.01.00.00", n)).toBe("SERVICIOS PROFESIONALES");
  });

  it("un nombre vacío no pisa a uno bueno", () => {
    const n = armarNombres(
      [{ cuenta: "6.02.01.00.00", nombre: "   " }],
      [{ cuenta: "6.02.01.00.00", nombre: "SERVICIOS PROFESIONALES" }],
    );
    expect(nombreDeCuenta("6.02.01.00.00", n)).toBe("SERVICIOS PROFESIONALES");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("se piden SÓLO los nombres que el mes usa", () => {
  it("cada cuenta y sus padres, sin repetir", () => {
    const c = codigosCandidatos(["2.01.04.02.00", "2.01.04.03.00"]);
    expect(c).toContain("2.01.04.02.00");
    expect(c).toContain("2.01.04.03.00");
    expect(c).toContain("2.01.04.00.00");
    expect(new Set(c).size).toBe(c.length);
  });

  it("una cuenta que ya termina en ceros no agrega nada", () => {
    expect(codigosCandidatos(["6.02.01.00.00"])).toEqual(["6.02.01.00.00"]);
  });

  it("un código con forma rara se descarta en vez de ensuciar la consulta", () => {
    expect(codigosCandidatos(["no-es-una-cuenta", "6.2"])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("lo que devuelve el panel se valida ANTES de escribir", () => {
  const nodo = (cuenta: string, nombreCuenta: unknown, nivel = 3) => ({ cuenta, nombreCuenta, nivel });

  it("un nodo sin nombre se DESCARTA, no se guarda vacío", () => {
    const r = normalizarCatalogo([nodo("6.02.01.00.00", "  ")]);
    expect(r.cuentas).toHaveLength(0);
    expect(r.descartados[0]).toEqual({ cuenta: "6.02.01.00.00", motivo: "vino sin nombre" });
  });

  it("un código que no son 5 segmentos se descarta", () => {
    expect(normalizarCatalogo([nodo("6.02", "ALGO")]).cuentas).toHaveLength(0);
  });

  it("un código repetido se descarta (un upsert con la llave dos veces falla entero)", () => {
    const r = normalizarCatalogo([nodo("6.02.01.00.00", "A"), nodo("6.02.01.00.00", "B")]);
    expect(r.cuentas).toHaveLength(1);
    expect(r.cuentas[0].nombre).toBe("A");
    expect(r.descartados[0].motivo).toBe("código repetido");
  });

  it("guarda el nombre CRUDO además del normalizado", () => {
    const r = normalizarCatalogo([nodo("6.02.01.00.00", " SERVICIOS    PROFESIONALES ")]);
    expect(r.cuentas[0].nombre).toBe("SERVICIOS PROFESIONALES");
    expect(r.cuentas[0].nombreCrudo).toBe(" SERVICIOS    PROFESIONALES ");
  });

  it("🔴 un catálogo CORTO no se escribe: el upsert pisa lo que toca", () => {
    const pocas = Array.from({ length: MINIMO_CUENTAS - 1 }, (_, i) =>
      nodo(`6.02.${String(i).padStart(2, "0")}.00.00`, `CUENTA ${i}`),
    );
    expect(catalogoUtilizable(normalizarCatalogo(pocas))).toBe(false);
    expect(catalogoUtilizable(normalizarCatalogo([]))).toBe(false);
  });

  it("el catálogo real de Vistana SÍ es utilizable", () => {
    const { cuentas } = parsearCatalogoCsv(CSV);
    const comoDelPanel = cuentas.map((c) => nodo(c.cuenta, c.nombreCrudo, c.nivel));
    expect(catalogoUtilizable(normalizarCatalogo(comoDelPanel))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el CSV real del catálogo (147 cuentas de Vistana, 13-ago-2026)", () => {
  const { cuentas, errores } = parsearCatalogoCsv(CSV);

  it("se lee entero, sin una sola fila perdida", () => {
    expect(cuentas).toHaveLength(147);
    expect(errores).toEqual([]);
  });

  it("arma el código de 5 segmentos uniendo las cinco columnas", () => {
    const caja = cuentas.find((c) => c.cuenta === "1.01.01.00.00");
    expect(caja?.nombre).toBe("CAJA MENUDA");
  });

  it("🔑 y confirma lo que se le había dicho mal a Daniel", () => {
    expect(cuentas.find((c) => c.cuenta === "6.02.01.00.00")?.nombre).toBe("SERVICIOS PROFESIONALES");
    expect(cuentas.find((c) => c.cuenta === "2.01.05.01.00")?.nombre).toBe("SALARIOS POR PAGAR");
  });

  it("el nivel es el último segmento que no es 00", () => {
    expect(nivelDeSegmentos(["1", "00", "00", "00", "00"])).toBe(1);
    expect(nivelDeSegmentos(["6", "02", "01", "00", "00"])).toBe(3);
    expect(nivelDeSegmentos(["2", "01", "04", "02", "00"])).toBe(4);
  });

  it("reconoce el archivo por su contenido, no por el código HTTP", () => {
    expect(pareceCsvDeCuentas(CSV)).toBe(true);
    expect(pareceCsvDeCuentas("<!DOCTYPE html><html>Exception - SWITCH SOFT")).toBe(false);
    expect(pareceCsvDeCuentas("")).toBe(false);
  });

  it("cubre 41 de las 42 cuentas que usa Egresos Varios — la que falta NO se inventa", () => {
    const nombres = armarNombres(
      cuentas.map((c) => ({ cuenta: c.cuenta, nombre: c.nombre })),
      [],
    );
    expect(nombreDeCuenta("6.02.01.00.00", nombres)).toBe("SERVICIOS PROFESIONALES");
    expect(nombreDeCuenta("6.03.98.00.00", nombres)).not.toBeNull();
    // La única que el catálogo de Daniel no trae: sale con su código pelado.
    expect(nombreDeCuenta("5.03.00.00.00", nombres)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 la SIEMBRA de la migración es el CSV, no una lista escrita a mano", () => {
  /** Las filas `('vistana', 'x.xx…', 'NOMBRE', 'CRUDO', n)` del .sql. */
  function filasSembradas(sql: string): Array<{ cuenta: string; nombre: string; crudo: string; nivel: number }> {
    const out: Array<{ cuenta: string; nombre: string; crudo: string; nivel: number }> = [];
    const re = /\(\s*'vistana',\s*'([^']+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*(\d+)\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      out.push({
        cuenta: m[1],
        nombre: m[2].replace(/''/g, "'"),
        crudo: m[3].replace(/''/g, "'"),
        nivel: Number(m[4]),
      });
    }
    return out;
  }

  const sembradas = filasSembradas(MIGRACION);
  const { cuentas } = parsearCatalogoCsv(CSV);

  it("el lector del .sql encuentra filas (si no, todo lo de abajo pasaría en verde sin mirar nada)", () => {
    expect(sembradas.length).toBeGreaterThan(100);
  });

  it("son EXACTAMENTE las del CSV, campo por campo y en el mismo orden", () => {
    expect(sembradas).toEqual(
      cuentas.map((c) => ({ cuenta: c.cuenta, nombre: c.nombre, crudo: c.nombreCrudo, nivel: c.nivel })),
    );
  });

  it("no pisa nada: la siembra es una foto de un día y de UNA empresa", () => {
    expect(MIGRACION).toMatch(/ON CONFLICT \(empresa_key, cuenta\) DO NOTHING/);
    // Ninguna otra empresa se siembra: los códigos podrían diferir.
    expect(MIGRACION).not.toMatch(/\(\s*'(fashion_wear|active_shoes|confecciones_boston)',\s*'\d/);
  });

  it("la migración es ADITIVA: ni un DROP ni un DELETE de datos", () => {
    const cuerpo = MIGRACION.replace(/^\s*--.*$/gm, "");
    expect(cuerpo).not.toMatch(/DROP\s+TABLE/i);
    expect(cuerpo).not.toMatch(/DELETE\s+FROM/i);
    expect(cuerpo).not.toMatch(/TRUNCATE/i);
  });
});
