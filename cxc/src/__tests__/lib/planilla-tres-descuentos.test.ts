/* ─────────────────────────────────────────────────────────────────────────────
 * LOS TRES DESCUENTOS DEL COMPROBANTE, como los definió la contadora.
 *
 *   PRÉSTAMO   cuenta con cargo y cuota → la quincena propone min(cuota, saldo)
 *   TERCEROS   igual que el préstamo, en su propia cuenta (NUEVO)
 *   DAÑO       SIN cuota: la casilla queda en blanco y ella escribe el monto
 *
 * La contadora, textual:
 *   «no hacerlo manual, la información se le configura en el perfil y la debe
 *    tomar de allí.»
 *   «los descuentos a terceros debe ser manejado igual como un préstamo
 *    permitiendo colocar un monto inicial y un monto a descontar quincenal.»
 *   «los daños de mercancía debe permanecer en blanco y que nos permita colocar
 *    quincenalmente la cantidad a descontar.»
 *
 * Y Daniel: *«olvida descuento por compras»*.
 * ────────────────────────────────────────────────────────────────────────── */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CUENTAS, CUENTA_DANO, CUENTA_PRESTAMO, CUENTA_TERCEROS,
  NOMBRE_CUENTA, calcularSaldoPrestamo, cuentaDeMovimiento, cuentaMasVieja, debeLasDos,
} from "@/lib/prestamos-saldo";
import { CONCEPTOS_OFRECIDOS, CONCEPTO_TERCEROS, cuentaDeCargo } from "@/lib/prestamos-conceptos";
import { CLAVES_RENGLON, EMPRESAS, armarComprobante, identificacionEmpresa, nombreEmpresaComprobante } from "@/lib/asistencia/comprobante";
import { CASILLA_DE_CUENTA, CONCEPTO_DE_CUENTA } from "@/lib/asistencia/cierre-prestamo";
import { capitalizarNombre, esGritado } from "@/lib/nombre-en-pantalla";
import { MOTIVOS_JUSTIFICACION, MOTIVO_CONSTANCIA, motivoSeOfrece } from "@/lib/asistencia/motivos";
import { puedeCerrar } from "@/lib/asistencia/roles";
import { alcanceDe, alcanza } from "@/lib/asistencia/aprobador-empresa";

const raiz = process.cwd();
const leer = (p: string) => fs.readFileSync(path.join(raiz, p), "utf8");
const sinComentarios = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ─────────────────────────────────────────────────────────────────────────────
describe("A. LA TERCERA CUENTA — «igual como un préstamo»", () => {
  it("son TRES cuentas, con su nombre en pantalla", () => {
    expect([...CUENTAS]).toEqual(["prestamo", "dano", "terceros"]);
    expect(NOMBRE_CUENTA[CUENTA_TERCEROS]).toBe("Descuento a terceros");
  });

  it("el cargo de terceros se ofrece en el formulario y va a SU cuenta", () => {
    expect(CONCEPTOS_OFRECIDOS as readonly string[]).toContain(CONCEPTO_TERCEROS);
    expect(cuentaDeCargo(CONCEPTO_TERCEROS)).toBe(CUENTA_TERCEROS);
  });

  // 🔴 NINGÚN CONCEPTO VIEJO SE RENOMBRA: el saldo no revienta ante uno
  // desconocido, lo deja de contar EN SILENCIO.
  it("los conceptos viejos siguen escritos igual", () => {
    expect(cuentaDeCargo("Préstamo")).toBe(CUENTA_PRESTAMO);
    expect(cuentaDeCargo("Responsabilidad por daño")).toBe(CUENTA_DANO);
  });

  it("un cargo y un pago de terceros mueven SOLO su cuenta", () => {
    const s = calcularSaldoPrestamo([
      { concepto: "Descuento a terceros", monto: 79.94, estado: "aprobado", cuenta: "terceros", fecha: "2026-09-01" },
      { concepto: "Pago de terceros", monto: 40, estado: "aprobado", cuenta: "terceros", fecha: "2026-09-15" },
      { concepto: "Préstamo", monto: 100, estado: "aprobado", cuenta: "prestamo", fecha: "2026-08-01" },
    ]);
    expect(s.cuentas.terceros.saldo).toBeCloseTo(39.94, 2);
    expect(s.cuentas.prestamo.saldo).toBeCloseTo(100, 2);
    expect(s.cuentas.dano.saldo).toBe(0);
    // Y el TOTAL sigue siendo la suma de las cuentas.
    expect(s.saldo).toBeCloseTo(139.94, 2);
  });

  // 🔑 Sin columna `cuenta`, el concepto decide. Un movimiento que la pierda no
  // puede caer en «Préstamo» por descarte.
  it("sin columna `cuenta`, el concepto de terceros cae en terceros", () => {
    expect(cuentaDeMovimiento({ concepto: "Descuento a terceros", monto: 1 })).toBe(CUENTA_TERCEROS);
    expect(cuentaDeMovimiento({ concepto: "Pago de terceros", monto: 1 })).toBe(CUENTA_TERCEROS);
    expect(cuentaDeMovimiento({ concepto: "Pago", monto: 1 })).toBe(CUENTA_PRESTAMO);
  });

  it("«debe más de una» y «la más vieja» cuentan las TRES", () => {
    const s = calcularSaldoPrestamo([
      { concepto: "Descuento a terceros", monto: 50, estado: "aprobado", cuenta: "terceros", fecha: "2026-01-01" },
      { concepto: "Préstamo", monto: 50, estado: "aprobado", cuenta: "prestamo", fecha: "2026-06-01" },
    ]);
    expect(debeLasDos(s)).toBe(true);
    // La de terceros se abrió antes: cobra primero.
    expect(cuentaMasVieja(s)).toBe(CUENTA_TERCEROS);
  });

  // 🔴 La cuota vive en la FICHA, no se teclea cada quincena.
  it("la cuota de terceros se configura en la ficha", () => {
    const sql = leer("supabase/migrations/20261029120000_terceros_tercera_cuenta.sql");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS deduccion_terceros/);
    expect(sql).toMatch(/'Descuento a terceros'/);
    expect(sql).toMatch(/'Pago de terceros'/);
    expect(sql).toMatch(/'terceros'::text/);
    // ADITIVA: nada se dropea salvo los CHECK que se reescriben enteros.
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B. UNA CASILLA, UNA CUENTA — y el daño no propone", () => {
  it("las tres casillas van cada una a su cuenta", () => {
    expect(CASILLA_DE_CUENTA.map((c) => [c.campo, c.cuenta])).toEqual([
      ["prestamo", "prestamo"],
      ["terceros", "terceros"],
      ["mercancia", "dano"],
    ]);
  });

  it("cada cuenta se anota con su propio concepto", () => {
    expect(CONCEPTO_DE_CUENTA.prestamo).toBe("Pago");
    expect(CONCEPTO_DE_CUENTA.dano).toBe("Pago de responsabilidad");
    expect(CONCEPTO_DE_CUENTA.terceros).toBe("Pago de terceros");
  });

  // 🔴 EL DAÑO NO PROPONE CUOTA. `montoDeFicha` no puede volver a mirarla.
  it("el motor del préstamo NO mira la cuota de daño", () => {
    const puro = sinComentarios("src/lib/asistencia/prestamos-planilla.ts");
    const i = puro.indexOf("export function montoDeFicha");
    const j = puro.indexOf("export function montoTercerosDeFicha");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(puro.slice(i, j)).not.toMatch(/cuotaDano/);
  });

  // 🔴 EL CIERRE LEE EL SALDO DE LAS TRES CUENTAS. Si `saldoTerceros` llegara
  // en cero, el pago de terceros se omitiría como «ya no debe nada» y la deuda
  // no bajaría nunca — en silencio, porque la casilla sí muestra el monto.
  it("el cierre lee el saldo y la cuota de terceros de la ficha", () => {
    const srv = sinComentarios("src/lib/asistencia/cierre-prestamo-server.ts");
    expect(srv).toMatch(/saldoTerceros: s\.cuentas\.terceros\.saldo/);
    expect(srv).toMatch(/cuotaTerceros: num\(e\.deduccion_terceros\)/);
    expect(srv).toMatch(/deduccion_terceros/);
    // Y el «ya descontado» de terceros sale de SU cuenta, no del montón.
    expect(srv).toMatch(/yaDescontadoTerceros: descontadoTercerosDe/);
  });

  // 🔴 Y NADIE le vuelve a poner una cuota al daño desde la ficha.
  it("la ficha ya no ofrece «cuota de daño»", () => {
    const modal = leer("src/app/prestamos/components/EditEmpleadoModal.tsx");
    expect(modal).toMatch(/Cuota de terceros/);
    expect(modal).not.toMatch(/<label[^>]*>Cuota de daño/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("C. «DESCUENTO POR COMPRAS» SE FUE DEL PAPEL", () => {
  // Daniel, textual: *«olvida descuento por compras»*.
  it("no está entre los renglones del comprobante", () => {
    expect(CLAVES_RENGLON as readonly string[]).not.toContain("compras");
    const puro = sinComentarios("src/lib/asistencia/comprobante.ts");
    expect(puro).not.toMatch(/DESCUENTO POR COMPRAS/);
  });

  // 🔑 Los OTROS renglones en cero SÍ se quedan: la regla de Daniel («si alguien
  // no lo lleva se pone 0») no cambió.
  it("los otros tres descuentos siguen dibujados, aunque valgan 0.00", () => {
    for (const k of ["prestamo", "terceros", "mercancia"]) {
      expect(CLAVES_RENGLON as readonly string[]).toContain(k);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D. EL TERCEROS NO ESPERA APROBACIÓN DE DANIEL", () => {
  // 🔴 Es una ORDEN EXTERNA (pensión, embargo), no un favor. El préstamo SÍ
  // sigue con su regla de siempre.
  it("solo el PRÉSTAMO pasa por el tope y por `pendiente_aprobacion`", () => {
    const puro = sinComentarios("src/app/api/prestamos/movimientos/route.ts");
    expect(puro).toMatch(/if \(concepto === CONCEPTO_PRESTAMO\) \{/);
    // El concepto de terceros NO aparece en la condición del freno.
    const i = puro.indexOf("if (concepto === CONCEPTO_PRESTAMO)");
    const j = puro.indexOf("logActivity", i);
    expect(puro.slice(i, j)).not.toMatch(/CONCEPTO_TERCEROS|Descuento a terceros/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("E. QUIÉN CIERRA Y QUIÉN TOCA LA FICHA", () => {
  // Daniel: *«una sola persona cierra todo»*.
  it("cierran admin y contabilidad; la secretaria no", () => {
    expect(puedeCerrar("admin")).toBe(true);
    expect(puedeCerrar("contabilidad")).toBe(true);
    expect(puedeCerrar("secretaria")).toBe(false);
    expect(puedeCerrar("bodega")).toBe(false);
  });

  // 🔴 Y quien cierra alcanza a las TRES empresas, Boston incluida, sin
  // depender de una fila de configuración que alguien pueda borrar.
  it("quien cierra alcanza las tres empresas sin filas propias", () => {
    for (const rol of ["admin", "contabilidad"]) {
      const a = alcanceDe(rol, "quien-sea", []);
      expect(a.empresas).toBeNull();
      expect(alcanza(a, "confecciones_boston")).toBe(true);
    }
    // El aprobador SÍ sigue segmentado: es para lo que se hizo el reparto.
    expect(alcanceDe("bodega", "Bodega", []).empresas).not.toBeNull();
  });

  // 🔴 El cargo y la cédula los escriben Daniel y la contadora, nadie más.
  it("el cargo y la cédula solo los guarda quien puede cerrar", () => {
    const puro = sinComentarios("src/app/api/asistencia/configuracion/route.ts");
    expect(puro).toMatch(/const puedeTocarLaFicha = puedeCerrar\(String\(auth\.role \?\? ""\)\)/);
    expect(puro).toMatch(/puedeTocarLaFicha[\s\S]{0,200}COLUMNA_POSICION/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("F. UN SOLO PDF POR EMPRESA, UNA HOJA POR PERSONA", () => {
  const linea = (codigo: string, nombre: string) => ({
    codigo, etiqueta: nombre, nombre,
    empresa: "fashion_wear", empresaEtiqueta: "Fashion Wear",
    horas: {}, faltaConfigurar: [], fueraDePlanilla: false,
    dinero: { netoPagar: 100, totalBruto: 100, totalDeducciones: 0 },
  }) as never;

  it("el orden es ESTABLE, por nombre, y no depende de cómo vino el array", async () => {
    const { lineasConComprobante } = await import("@/lib/asistencia/comprobante");
    const desordenadas = [linea("3", "ZULMA"), linea("1", "ANA"), linea("2", "MARIO")];
    expect(lineasConComprobante(desordenadas).map((l) => l.nombre)).toEqual(["ANA", "MARIO", "ZULMA"]);
    // La misma entrada al revés da el MISMO orden.
    expect(lineasConComprobante([...desordenadas].reverse()).map((l) => l.nombre))
      .toEqual(["ANA", "MARIO", "ZULMA"]);
  });

  it("un solo documento con UNA hoja por persona", async () => {
    const { construirPdfComprobantes } = await import("@/lib/asistencia/comprobante-pdf");
    const periodo = { esQuincena: true, anio: 2026, mes: 8, n: 2 as const, etiqueta: "x" };
    const hojas = ["ANA", "MARIO", "ZULMA"].map((n, i) =>
      armarComprobante({ linea: linea(String(i), n) }, periodo));
    expect(construirPdfComprobantes(hojas).getNumberOfPages()).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("G. LOS NOMBRES SE MUESTRAN CAPITALIZADOS, LO GUARDADO NO SE TOCA", () => {
  // Daniel: *«no me gustan los nombres en planilla de los usuarios todo en
  // mayúscula, arréglalo a capitalización»*.
  it("capitaliza sin inventar acentos", () => {
    expect(capitalizarNombre("LUIS PARAJON")).toBe("Luis Parajon");
    expect(capitalizarNombre("KENNER HERNANDEZ")).toBe("Kenner Hernandez");
    // 🔴 SIN TILDE: lo guardado no la tiene y adivinarla es inventar un nombre.
    expect(capitalizarNombre("LUIS PARAJON")).not.toContain("ó");
  });

  it("respeta iniciales y partículas", () => {
    expect(capitalizarNombre("MARIA V. BETHANCOURTH G.")).toBe("Maria V. Bethancourth G.");
    expect(capitalizarNombre("LUZ DE LA CRUZ")).toBe("Luz de la Cruz");
    expect(capitalizarNombre("CINDY DE GRACIA")).toBe("Cindy de Gracia");
    // Una partícula que ABRE el nombre es un apellido, y va en mayúscula.
    expect(capitalizarNombre("DE GRACIA")).toBe("De Gracia");
    expect(capitalizarNombre("ALEJANDRA CAMAÑO")).toBe("Alejandra Camaño");
  });

  it("un nombre ya capitalizado sale igual, y el vacío no revienta", () => {
    expect(capitalizarNombre("Roxana Hernandez")).toBe("Roxana Hernandez");
    expect(capitalizarNombre("")).toBe("");
    expect(capitalizarNombre(null)).toBe("");
  });

  // 🔴 NINGUNA SUPERFICIE DE PLANILLA GRITA UN NOMBRE.
  it("las superficies de Planilla capitalizan el nombre", () => {
    for (const [archivo, patron] of [
      ["src/app/asistencia/PlanillaTab.tsx", /capitalizarNombre\(l\.etiqueta\)/],
      ["src/app/asistencia/PrestamosTab.tsx", /capitalizarNombre\(f\.nombre\)/],
      ["src/lib/asistencia/comprobante.ts", /capitalizarNombre\(linea\.nombre\)/],
      ["src/lib/asistencia/planilla-exportar.ts", /capitalizarNombre\(l\.etiqueta\)/],
    ] as const) {
      expect(leer(archivo)).toMatch(patron);
    }
  });

  // 🔑 Y HAY UN SOLO CAPITALIZADOR: Comisiones llama al mismo.
  it("Comisiones usa el capitalizador compartido, no una copia", () => {
    expect(sinComentarios("src/lib/comisiones/alias.ts")).toMatch(/capitalizarNombre\(v\)/);
  });

  // ⚠️ Lo GUARDADO sigue en mayúsculas: nadie escribe el nombre capitalizado.
  it("nadie escribe el nombre capitalizado en la base", () => {
    for (const p of [
      "src/app/api/asistencia/configuracion/route.ts",
      "src/lib/asistencia/planilla-guardada.ts",
    ]) {
      expect(sinComentarios(p)).not.toMatch(/capitalizarNombre/);
    }
  });

  it("`esGritado` reconoce lo que hay que evitar", () => {
    expect(esGritado("LUIS PARAJON")).toBe(true);
    expect(esGritado("Luis Parajon")).toBe(false);
    expect(esGritado("V-EG")).toBe(true); // es un código: por eso se barren nombres, no cadenas
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H. «CONSTANCIA» — un motivo más, y PAGA como los otros", () => {
  // Daniel: *«los que están en el módulo todos se deben de pagar si se
  // seleccionó, solo es agregar constancia. No hagamos justificar que no pague,
  // ensucia.»*
  it("se ofrece en el desplegable", () => {
    expect(MOTIVOS_JUSTIFICACION as readonly string[]).toContain(MOTIVO_CONSTANCIA);
    expect(motivoSeOfrece("Constancia")).toBe(true);
  });

  it("son cinco, y los cuatro de antes no se movieron", () => {
    expect([...MOTIVOS_JUSTIFICACION]).toEqual([
      "Incapacidad", "Catástrofe", "Escolares", "Trabajo de vendedor", "Constancia",
    ]);
  });

  // 🔴 NO EXISTE «justificado pero no se paga». Justificar significa que no se
  // descuenta, y esa palabra no puede volverse ambigua.
  it("ningún motivo trae una marca de «no se paga»", () => {
    const puro = sinComentarios("src/lib/asistencia/motivos.ts");
    expect(puro).not.toMatch(/noPaga|sinPago|no_paga|descuenta\s*:\s*true/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("I. IGNORAR UN CÓDIGO — esconde, no borra", () => {
  // 🩸 Medido: 39, 55 y 9999 marcan en el reloj y no son nadie. Y el reloj NUNCA
  // manda el nombre (0 de 1.000 marcaciones), así que un código sin ficha se ve
  // igual que una persona nueva: lo tiene que decir una persona.
  it("el filtro saca a los escondidos y deja a los demás", async () => {
    const { sinIgnorados, estaIgnorado } = await import("@/lib/asistencia/codigos-ignorados");
    const filas = [{ codigo: "39" }, { codigo: "56" }, { codigo: "52" }];
    const fuera = new Set(["39", "52"]);
    expect(sinIgnorados(filas, fuera).map((f) => f.codigo)).toEqual(["56"]);
    // Sin ninguno escondido, la lista sale entera.
    expect(sinIgnorados(filas, new Set()).length).toBe(3);
    expect(estaIgnorado("39", fuera)).toBe(true);
    expect(estaIgnorado("56", fuera)).toBe(false);
  });

  // 🔴 VALE PARA CUALQUIER FILA, TENGA FICHA O NO. Daniel: *«pon la opción de
  // ignorar código así como DANIEL LEVY código 52»* — él tiene ficha (52) y no
  // va en planilla. Por eso el módulo puro NO mira la ficha en ningún lado.
  it("ignorar no pregunta si hay ficha", async () => {
    const puro = leer("src/lib/asistencia/codigos-ignorados.ts");
    expect(puro).not.toMatch(/configurado|tieneFicha|\bficha\b\s*\?/);
    // Y la pantalla lo ofrece en la fila, sin condicionarlo a que falte ficha.
    const tab = leer("src/app/asistencia/ConfiguracionTab.tsx");
    expect(tab).toMatch(/Ignorar este código/);
    expect(tab).toMatch(/puedeTocarLaFicha && \(\s*\n\s*<button[\s\S]{0,400}ignorar\(p\.codigo/);
  });

  // 🔴 ESCONDE, NO BORRA: ni la ficha ni las marcaciones. Y es reversible.
  it("volver a mostrar apaga la marca; NUNCA un DELETE", () => {
    const srv = sinComentarios("src/lib/asistencia/codigos-ignorados-server.ts");
    expect(srv).toMatch(/activo: false/);
    expect(srv).toMatch(/mostrado_por/);
    expect(srv).not.toMatch(/\.delete\(\)/);
    // Y nadie toca las marcaciones ni las personas desde acá.
    expect(srv).not.toMatch(/asistencia_marcaciones|asistencia_personas/);
  });

  // 🔴 SE ESCONDE DE TODO: la lista, los conteos y la planilla. Filtrarlo solo
  // en la pantalla dejaría los números de arriba contando lo que ya no se ve.
  it("se filtra en el servidor: la lista, el resumen y la planilla", () => {
    const cfg = sinComentarios("src/app/api/asistencia/configuracion/route.ts");
    expect(cfg).toMatch(/const personasVisibles = sinIgnorados\(personas, escondidos\.codigos\)/);
    // El resumen cuenta sobre lo VISIBLE.
    expect(cfg).toMatch(/const activos = personasVisibles\.filter/);
    // Y la planilla los suma a `fuera`, el filtro que ya existía.
    const pl = sinComentarios("src/app/api/asistencia/planilla/route.ts");
    expect(pl).toMatch(/for \(const c of ignorados\) fuera\.add\(c\)/);
  });

  it("la tabla es aditiva y reversible", () => {
    const sql = leer("supabase/migrations/20261030120000_codigos_ignorados.sql");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS asistencia_codigos_ignorados/);
    expect(sql).toMatch(/activo\s+boolean NOT NULL DEFAULT true/);
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
  });

  it("lo decide quien toca las fichas, no cualquiera", () => {
    const ruta = sinComentarios("src/app/api/asistencia/codigos-ignorados/route.ts");
    expect(ruta).toMatch(/export async function POST[\s\S]{0,200}requireAsistencia\(req, cerrarPlanillaRoles\(\)\)/);
    expect(ruta).toMatch(/export async function DELETE[\s\S]{0,200}requireAsistencia\(req, cerrarPlanillaRoles\(\)\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("J. ACS (Multifashion) — la CUARTA empresa", () => {
  // Daniel: *«Sí — ACS entra completa a Asistencia y Planilla»*.
  it("entra a la lista del módulo, y se llama «Multifashion»", async () => {
    const { EMPRESAS_ASISTENCIA, etiquetaEmpresa, validarEmpresa } =
      await import("@/lib/asistencia/config");
    expect(EMPRESAS_ASISTENCIA as readonly string[]).toContain("american_classic");
    expect(etiquetaEmpresa("american_classic")).toBe("Multifashion");
    expect(validarEmpresa("american_classic").ok).toBe(true);
  });

  // 🔴 UNA SOLA FUENTE. Ninguna pantalla del módulo enumera las empresas a mano:
  // la quinta tiene que ser una línea, no una cacería.
  it("ninguna superficie del módulo escribe la lista de empresas a mano", () => {
    for (const p of [
      "src/app/asistencia/ConfiguracionTab.tsx",
      "src/app/asistencia/PlanillaTab.tsx",
      "src/app/api/asistencia/planilla/route.ts",
      "src/lib/asistencia/planilla-guardada.ts",
      "src/lib/asistencia/aprobador-empresa.ts",
    ]) {
      const puro = sinComentarios(p);
      // Una lista escrita a mano se reconoce por dos keys juntas.
      expect(puro, `${p} enumera empresas a mano`)
        .not.toMatch(/"confecciones_boston"[\s\S]{0,60}"vistana"/);
    }
  });

  // 🔴 EL NOMBRE LEGAL Y EL RUC SALEN DEL AVISO DE OPERACIÓN que mandó Daniel
  // (Ministerio de Comercio e Industrias), cargados en la MISMA lista escrita a
  // mano que usa el estado de cuenta — no en una segunda copia.
  it("el comprobante de ACS dice su nombre legal y su identificación", () => {
    expect(nombreEmpresaComprobante("american_classic", "Multifashion"))
      .toBe("MULTI FASHION HOLDING CORP.");
    expect(identificacionEmpresa("american_classic")).toBe("155638923-2-2016");
    // No se agregó una segunda lista: el nombre sale del registro fiscal.
    expect(Object.keys(EMPRESAS)).not.toContain("american_classic");
  });

  // 🔴 SU CORREO VA VACÍO. ACS es otra entidad: ponerle `info@fashiongr.com`
  // —el de las SEIS del grupo— sería firmarle el papel a nombre de otro.
  it("ACS NO hereda el correo del grupo", async () => {
    const { EMPRESA_FISCAL, CORREO_DEL_GRUPO } = await import("@/lib/cxc/empresa-fiscal");
    expect(EMPRESA_FISCAL.american_classic.correo).toBe("");
    expect(EMPRESA_FISCAL.american_classic.correo).not.toBe(CORREO_DEL_GRUPO);
    expect(EMPRESA_FISCAL.american_classic.telefono).toBe("");
  });

  // ⚠️ Y una empresa SIN registro sigue sin inventarse nada.
  it("una empresa sin registro no inventa un nombre legal ni un RUC", () => {
    expect(nombreEmpresaComprobante("empresa_nueva", "Empresa Nueva")).toBe("EMPRESA NUEVA");
    expect(identificacionEmpresa("empresa_nueva")).toBe("");
  });

  // ⚠️ La KEY no se renombra: es la misma de las ventas y las comisiones.
  it("la key sigue siendo `american_classic`", async () => {
    const { EMPRESAS_ASISTENCIA } = await import("@/lib/asistencia/config");
    expect(EMPRESAS_ASISTENCIA as readonly string[]).not.toContain("multifashion");
  });

  // 🔴 DOS RELOJES: la misma PC lee el de Boston y el de la tienda. La pantalla
  // dibuja UNO POR RELOJ; con `relojes[0]` el segundo no existía.
  it("la pantalla del reloj dibuja uno por dispositivo, no el primero", () => {
    const src = sinComentarios("src/app/asistencia/EstadoReloj.tsx");
    expect(src).toMatch(/relojes\.map\(\(r\) =>/);
    expect(src).not.toMatch(/relojes\?\.\[0\]/);
    // El pedido va POR dispositivo.
    expect(src).toMatch(/dispositivo: reloj\.dispositivo/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Un día con hora extra, con la MISMA forma que usan los otros tests del motor.
 * Salida a las 18:20 sobre una jornada que termina a las 17:00 = 80 min de
 * extra, todos DIURNOS (la ventana nocturna arranca a las 18:00 → 60 diurnos +
 * 20 nocturnos, según las reglas por defecto).
 */
function personaConExtra(salida: string, codigo = "1") {
  const d = {
    fecha: "2026-09-01",
    marcas: ["08:00:00", "12:00:00", "12:30:00", `${salida}:00`],
    marcasIds: ["a", "b", "c", "d"],
    entrada: "08:00:00", salida: `${salida}:00`,
    tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0,
    extraMin: 80, trabajadoMin: 480, revisar: false,
  };
  return {
    codigo, nombre: `P${codigo}`, salida: "17:00", almuerzoMin: 30, dias: [d],
    resumen: { diasTrabajados: 1, ausenciasSinJustificar: 0 },
  } as never;
}

describe("K. ACS: 30 MIN DE EXTRA AUTOMÁTICOS, Y LAS APRUEBA DANIEL", () => {
  // Daniel: *«ya by default allá trabajan hasta las 7pm, así que siempre sin
  // aprobación ganan 30 mins de horas extras»*.

  it("30 en ACS, 0 en las otras tres", async () => {
    const { EXTRA_AUTOMATICO_POR_EMPRESA, minutosExtraAutomaticos } =
      await import("@/lib/asistencia/extra-automatico");
    expect(EXTRA_AUTOMATICO_POR_EMPRESA.american_classic).toBe(30);
    for (const e of ["confecciones_boston", "vistana", "fashion_wear"] as const) {
      expect(EXTRA_AUTOMATICO_POR_EMPRESA[e], e).toBe(0);
    }
    // Una empresa desconocida o vacía: 0, como siempre.
    expect(minutosExtraAutomaticos("joystep")).toBe(0);
    expect(minutosExtraAutomaticos(null)).toBe(0);
  });

  // 🔴 EL MOTOR: los primeros 30 min del día se pagan; el resto espera.
  it("paga los primeros 30 y aparta el resto", async () => {
    const { medirHoras } = await import("@/lib/asistencia/planilla");
    const { REGLAS_DEFAULT } = await import("@/lib/asistencia/config");
    // Un día con 50 min de extra diurna, SIN aprobar.
    const persona = personaConExtra("18:20");
    const sinAuto = medirHoras(persona, REGLAS_DEFAULT, 480,
      { exigir: true, claves: new Set<string>(), codigo: "1", autoMin: 0 });
    const conAuto = medirHoras(persona, REGLAS_DEFAULT, 480,
      { exigir: true, claves: new Set<string>(), codigo: "1", autoMin: 30 });

    // Sin la regla: NADA se paga y todo queda sin aprobar (lo de siempre).
    expect(sinAuto.extraDiurnoMin + sinAuto.extraNocturnoMin).toBe(0);
    expect(sinAuto.extraAutoMin).toBe(0);
    // Con la regla: se pagan 30 y el resto sigue esperando.
    const pagado = conAuto.extraDiurnoMin + conAuto.extraNocturnoMin;
    expect(pagado).toBe(30);
    expect(conAuto.extraAutoMin).toBe(30);
    expect(conAuto.extraNoAprobadaMin).toBeCloseTo(sinAuto.extraNoAprobadaMin - 30, 4);
    // 🔑 Y el total medido no cambia: los 30 se MOVIERON de lado, no aparecieron.
    expect(pagado + conAuto.extraNoAprobadaMin)
      .toBeCloseTo(sinAuto.extraNoAprobadaMin, 4);
  });

  // 🔴 LOS 30 MINUTOS SALEN DE LA EMPRESA DE LA FICHA, NO DE UN NÚMERO SUELTO.
  // 🩸 Los tests de arriba le pasan `autoMin` a mano a `medirHoras`, así que
  // seguían verdes con el cableado clavado en 30 — y con eso las CUATRO
  // empresas habrían pagado media hora sin aprobar. Este va por el motor
  // entero (`armarPlanilla`), con dos personas del MISMO día y el mismo
  // horario, y lo único distinto entre las dos es la empresa de su ficha.
  // (mutación 9-sep-2026: «los minutos automáticos no salen de la empresa de
  // la ficha» se escapaba de los 51 candados.)
  it("por el motor entero: la de ACS gana 30 y la de Vistana 0", async () => {
    const { armarPlanilla } = await import("@/lib/asistencia/planilla");
    const { REGLAS_DEFAULT } = await import("@/lib/asistencia/config");
    const fichas = new Map([
      ["1", { codigo: "1", nombre: "TIENDA", salarioMensual: 1000, jornadaSemanal: 40,
              empresa: "american_classic" }],
      ["2", { codigo: "2", nombre: "OFICINA", salarioMensual: 1000, jornadaSemanal: 40,
              empresa: "vistana" }],
    ]);
    const lineas = armarPlanilla({
      personas: [personaConExtra("18:20", "1"), personaConExtra("18:20", "2")],
      fichas: fichas as never,
      jornadaDiariaMin: () => 480,
      reglas: REGLAS_DEFAULT,
      empresa: null,
      exigirAprobacionExtra: true,
      diasExtraAprobados: new Set<string>(),
    });
    const acs = lineas.find((l) => l.codigo === "1")!;
    const vis = lineas.find((l) => l.codigo === "2")!;

    expect(acs.horas.extraAutoMin).toBe(30);
    expect(acs.horas.extraDiurnoMin + acs.horas.extraNocturnoMin).toBe(30);
    // 🔴 CONTROL: la de Vistana no gana un solo minuto sin aprobación.
    expect(vis.horas.extraAutoMin).toBe(0);
    expect(vis.horas.extraDiurnoMin + vis.horas.extraNocturnoMin).toBe(0);
    // Y lo no aprobado de la de ACS es exactamente 30 menos que el de la otra.
    expect(vis.horas.extraNoAprobadaMin - acs.horas.extraNoAprobadaMin)
      .toBeCloseTo(30, 6);
  });

  // 🔴 CON EL DÍA APROBADO se paga TODO, y nada se cuenta como automático: los
  // 30 min no son un tope, son un piso que no hay que aprobar.
  it("un día aprobado se paga entero y no cuenta como automático", async () => {
    const { medirHoras } = await import("@/lib/asistencia/planilla");
    const { REGLAS_DEFAULT } = await import("@/lib/asistencia/config");
    const persona = personaConExtra("18:20");
    const h = medirHoras(persona, REGLAS_DEFAULT, 480,
      { exigir: true, claves: new Set(["1|2026-09-01"]), codigo: "1", autoMin: 30 });
    expect(h.extraNoAprobadaMin).toBe(0);
    expect(h.extraAutoMin).toBe(0);
    expect(h.extraDiurnoMin + h.extraNocturnoMin).toBeGreaterThan(30);
  });

  // 🔴 LAS OTRAS TRES EMPRESAS NO SE MUEVEN. Con 0 minutos el motor da idéntico.
  it("con 0 minutos el motor se comporta EXACTAMENTE como antes", async () => {
    const { medirHoras } = await import("@/lib/asistencia/planilla");
    const { REGLAS_DEFAULT } = await import("@/lib/asistencia/config");
    const persona = personaConExtra("18:20");
    const base = { exigir: true, claves: new Set<string>(), codigo: "1" };
    const sinCampo = medirHoras(persona, REGLAS_DEFAULT, 480, base);
    const conCero = medirHoras(persona, REGLAS_DEFAULT, 480, { ...base, autoMin: 0 });
    expect(conCero).toEqual(sinCampo);
  });

  // 🔑 SOLO la hora extra. El domingo, el feriado y el excedente son otros
  // recargos y no salen del horario de la tienda.
  it("no toca el domingo, el feriado ni el excedente", () => {
    const puro = sinComentarios("src/lib/asistencia/planilla.ts");
    const i = puro.indexOf("const auto = Math.max(0, aprob?.autoMin ?? 0);");
    const j = puro.indexOf("h.tardanzaMin += c.tardanzaMin;", i);
    const bloque = puro.slice(i, j);
    expect(bloque).not.toMatch(/domingoMin|feriadoMin|excedenteMin/);
  });

  // 🔴 SE DICE DE DÓNDE SALEN, para que nadie lo lea como un error.
  it("hay una frase que lo explica, y calla en cero", async () => {
    const { textoExtraAutomatico } = await import("@/lib/asistencia/extra-automatico");
    expect(textoExtraAutomatico(30, "Multifashion")).toBe("30 min fijos de Multifashion");
    expect(textoExtraAutomatico(0)).toBeNull();
  });

  // 🔴 Y SE CONGELA con el cuadro: una quincena vieja se tiene que poder explicar.
  it("los minutos automáticos se guardan en el cierre", async () => {
    const { COLUMNAS_HORAS } = await import("@/lib/asistencia/planilla-guardada");
    expect(COLUMNAS_HORAS.extraAutoMin).toBe("extra_auto_min");
    const sql = leer("supabase/migrations/20261101120000_acs_aprueba_daniel.sql");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS extra_auto_min/);
  });

  // 🔴 APROBAR ≠ CERRAR. Daniel: *«acs lo aprueba daniel»* — pero la contadora
  // sigue cerrando las cuatro.
  it("en ACS aprueba daniel; la contadora sale de esa fila y conserva el cierre", async () => {
    const sql = leer("supabase/migrations/20261101120000_acs_aprueba_daniel.sql");
    expect(sql).toMatch(/VALUES \('daniel', 'american_classic'\)/);
    expect(sql).toMatch(/DELETE FROM asistencia_aprobador_empresa[\s\S]{0,120}'Contabilidad'[\s\S]{0,60}'american_classic'/);
    // Y su alcance para CERRAR no depende de esa tabla.
    const { alcanceDe, alcanza } = await import("@/lib/asistencia/aprobador-empresa");
    expect(alcanza(alcanceDe("contabilidad", "Contabilidad", []), "american_classic")).toBe(true);
  });
});
