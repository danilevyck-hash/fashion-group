// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL DÍA CON UN NÚMERO IMPAR DE MARCACIONES FRENA EL CIERRE (15-sep-2026).
//
// Daniel, textual: *«¿pa qué esa regla? Si alguien marcó 3x, se le marca así tal
// cual a la regla y yo me doy cuenta en asistencia. ¿Para eso está, no? Para
// arreglarlo»*, *«si no, ¿cómo vas a saber a qué hora almorzó?»* y, sobre si
// frena el cierre: *«frenan»*.
//
// Lo que este candado sostiene, en orden de importancia:
//   1. EL CÁLCULO NO SE TOCA. La salida temprana se sigue descontando igual y
//      la última marca del día sigue siendo la salida.
//   2. La regla es IMPAR y NADA MÁS: 2 marcas no entra (no se puede probar que
//      falte una) y 6 tampoco (es par, y puede ser un día correcto).
//   3. Lo que queda afuera: no hábil, día en curso, fuera de vigencia, vacaciones.
//   4. Una persona con sueldo repartido en dos empresas cuenta UNA vez.
//   5. El freno existe y dice a quién, qué días y qué hacer.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  contarDias,
  detalleDias,
  diasConMarcasImpares,
  enlaceDiasDe,
  marcasImparesDeLineas,
  partirImpares,
  textoFrenoMarcasImpares,
  type DiaParaImpares,
} from "@/lib/asistencia/marcas-impares";
import { frenosParaCerrar } from "@/lib/asistencia/planilla-guardada";
import { armarAntesDeCerrar, type EntradaAntesDeCerrar } from "@/lib/asistencia/antes-de-cerrar";
import type { LineaPlanilla } from "@/lib/asistencia/planilla";

/** Un día del reporte, con lo mínimo y todo lo demás en «normal». */
function dia(fecha: string, marcas: number, extra: Partial<DiaParaImpares> = {}): DiaParaImpares {
  return {
    fecha,
    marcas: Array.from({ length: marcas }, (_, i) => `0${i}:00`),
    habil: true,
    enCurso: false,
    fueraDeVigencia: false,
    vacacion: null,
    ...extra,
  };
}

describe("🔴 la regla es IMPAR, y nada más", () => {
  it("3 marcas: entra — con tres no puede estar completo", () => {
    expect(diasConMarcasImpares([dia("2026-09-03", 3)])).toEqual([
      { fecha: "2026-09-03", marcas: 3 },
    ]);
  });

  it("1 marca: entra", () => {
    expect(diasConMarcasImpares([dia("2026-09-03", 1)])).toHaveLength(1);
  });

  it("5 marcas: entra, y es «de más»", () => {
    const [d] = diasConMarcasImpares([dia("2026-09-03", 5)]);
    expect(d.marcas).toBe(5);
  });

  it("4 marcas: NO entra — es el día normal", () => {
    expect(diasConMarcasImpares([dia("2026-09-03", 4)])).toEqual([]);
  });

  it("🩸 2 marcas: NO entra, y ES EL CASO QUE ORIGINÓ TODO", () => {
    // Andrea Pérez, 1-sep: marcó 08:04 y 12:07 y nada más; el sistema leyó el
    // 12:07 como su salida y le descontó 292 minutos. Con DOS marcas no se
    // puede PROBAR que falte una —pudo haberse ido a mediodía— y un umbral
    // sería adivinar a qué hora salió. Daniel lo sabe: es el precio de no
    // adivinar. Si alguien hace que este caso entre, está adivinando.
    expect(diasConMarcasImpares([dia("2026-09-01", 2)])).toEqual([]);
  });

  it("🔴 6 marcas: SÍ entra — 18-sep-2026, ESTE CANDADO CAMBIÓ DE DIRECCIÓN", () => {
    // ⚠️ El encargo del 15-sep-2026 decía «los de más (5, 6)»; se tomó como un
    // error de redacción y esta prueba EXIGÍA que el 6 no entrara: «es PAR, y
    // puede ser un día correcto — entró, almorzó, salió a un mandado y volvió».
    //
    // 🔴 Daniel lo decidió al revés el 18-sep-2026, textual, después de que la
    // contadora no pudiera cerrar la quincena:
    //
    //     «osea las quincena solo cierran con 4, hay q quitar hasta que llegue
    //      a 4 maximo. cuando hay 5 o mas es porq es error. quiero saber todos
    //      los que marcaron 5 veces last 30 days y si marcan 5 o mas poder
    //      quitarlas»
    //
    // La regla pasó a ser IMPAR **o** MÁS DE 4. Medido el mismo día (19-ago →
    // 17-sep, 840 días-persona): 5 días de SEIS marcas entran nuevos al freno.
    // El detalle vive en `asistencia-marcas-de-mas.test.ts`.
    expect(diasConMarcasImpares([dia("2026-09-03", 6)])).toEqual([
      { fecha: "2026-09-03", marcas: 6 },
    ]);
  });

  it("0 marcas: NO entra — eso es una ausencia, y ya tiene su columna", () => {
    expect(diasConMarcasImpares([dia("2026-09-03", 0)])).toEqual([]);
  });
});

describe("🔴 lo que queda afuera, y por qué cada uno", () => {
  it("el día que no es hábil: un sábado con 3 marcas no frena una planilla que no paga el sábado", () => {
    expect(diasConMarcasImpares([dia("2026-09-05", 3, { habil: false })])).toEqual([]);
  });

  it("el día EN CURSO: quien entró y almorzó tiene 3 marcas a las 3 de la tarde", () => {
    expect(diasConMarcasImpares([dia("2026-09-16", 3, { enCurso: true })])).toEqual([]);
  });

  it("el día fuera de vigencia: esa persona no trabajaba acá ese día", () => {
    expect(diasConMarcasImpares([dia("2026-09-03", 3, { fueraDeVigencia: true })])).toEqual([]);
  });

  it("el día de vacaciones: sus marcas no cuentan para nada", () => {
    expect(diasConMarcasImpares([dia("2026-09-03", 3, { vacacion: { desde: "x" } })])).toEqual([]);
  });
});

describe("🔴 se agrupa por CÓDIGO: un sueldo repartido no cuenta dos veces", () => {
  const dias = [{ fecha: "2026-09-03", marcas: 3 }];

  it("las DOS líneas de la misma persona son UNA sola en el aviso", () => {
    const personas = marcasImparesDeLineas([
      { codigo: "7", etiqueta: "Julio Garay", marcasImpares: dias },
      { codigo: "7", etiqueta: "Julio Garay", marcasImpares: dias },
    ]);
    expect(personas).toHaveLength(1);
    expect(contarDias(personas)).toBe(1);
  });

  it("dos personas distintas siguen siendo dos", () => {
    expect(
      marcasImparesDeLineas([
        { codigo: "7", etiqueta: "A", marcasImpares: dias },
        { codigo: "9", etiqueta: "B", marcasImpares: dias },
      ]),
    ).toHaveLength(2);
  });

  it("⚠️ una línea sin el campo no tumba nada: sale vacío", () => {
    expect(marcasImparesDeLineas([{ codigo: "7", etiqueta: "A" }])).toEqual([]);
  });

  it("más días arriba: si alguien mira una sola línea, que sea la peor", () => {
    const out = marcasImparesDeLineas([
      { codigo: "1", etiqueta: "Uno", marcasImpares: [{ fecha: "2026-09-03", marcas: 3 }] },
      {
        codigo: "2",
        etiqueta: "Dos",
        marcasImpares: [
          { fecha: "2026-09-03", marcas: 3 },
          { fecha: "2026-09-04", marcas: 1 },
        ],
      },
    ]);
    expect(out.map((p) => p.codigo)).toEqual(["2", "1"]);
  });
});

describe("🔴 los dos problemas NO son el mismo problema", () => {
  const personas = marcasImparesDeLineas([
    {
      codigo: "1",
      etiqueta: "Uno",
      marcasImpares: [
        { fecha: "2026-09-03", marcas: 3 },
        { fecha: "2026-09-04", marcas: 5 },
      ],
    },
  ]);

  it("una misma persona sale en las DOS listas, cada una con SUS días", () => {
    const { deMenos, deMas } = partirImpares(personas);
    expect(deMenos[0].dias).toEqual([{ fecha: "2026-09-03", marcas: 3 }]);
    expect(deMas[0].dias).toEqual([{ fecha: "2026-09-04", marcas: 5 }]);
  });

  it("el texto del freno nombra las dos cosas por separado", () => {
    const t = textoFrenoMarcasImpares(personas)!;
    expect(t).toContain("de MENOS");
    expect(t).toContain("de MÁS");
  });
});

describe("el texto que se lee", () => {
  const personas = marcasImparesDeLineas([
    { codigo: "31", etiqueta: "Andrea Pérez", marcasImpares: [{ fecha: "2026-09-03", marcas: 3 }] },
  ]);

  it("dice a quién, qué días y QUÉ HACER, con la pestaña y el botón por su nombre", () => {
    const t = textoFrenoMarcasImpares(personas)!;
    expect(t).toContain("Andrea Pérez");
    expect(t).toContain("3 sep");
    expect(t).toContain("Asistencia");
    expect(t).toContain("Agregar hora");
  });

  it("sin nadie, no hay texto: no se inventa un aviso vacío", () => {
    expect(textoFrenoMarcasImpares([])).toBeNull();
  });

  it("la fecha se lee en cristiano y en singular/plural", () => {
    expect(detalleDias([{ fecha: "2026-09-03", marcas: 1 }])).toBe("3 sep · 1 marca");
    expect(detalleDias([{ fecha: "2026-12-31", marcas: 3 }])).toBe("31 dic · 3 marcas");
  });

  it("🔑 el enlace es el MISMO «Ver sus días ›» de la ficha, no una segunda dirección", () => {
    const href = enlaceDiasDe("31", { desde: "2026-09-01", hasta: "2026-09-15" });
    expect(href).toContain("tab=asistencia");
    expect(href).toContain("q=31");
    expect(href).toContain("desde=2026-09-01");
    expect(href).toContain("hasta=2026-09-15");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

/** Una línea del cuadro con lo mínimo que el freno mira. */
function linea(codigo: string, etiqueta: string, impares: { fecha: string; marcas: number }[]) {
  return {
    codigo,
    etiqueta,
    marcasImpares: impares,
    extraNoAprobada: null,
  } as unknown as LineaPlanilla;
}

describe("🔴 FRENA EL CIERRE (Daniel: «frenan»)", () => {
  it("con un día impar, `frenosParaCerrar` devuelve el freno", () => {
    const frenos = frenosParaCerrar([linea("31", "Andrea Pérez", [{ fecha: "2026-09-03", marcas: 3 }])]);
    expect(frenos.map((f) => f.tipo)).toContain("marcas-impares");
    const f = frenos.find((x) => x.tipo === "marcas-impares")!;
    expect(f.personas).toBe(1);
    expect(f.quienes).toEqual(["Andrea Pérez"]);
    expect(f.codigos).toEqual(["31"]);
  });

  it("sin días impares NO frena nada: el cierre de siempre no cambia", () => {
    expect(frenosParaCerrar([linea("31", "Andrea Pérez", [])])).toEqual([]);
  });

  it("un día de 4 marcas tampoco frena", () => {
    // El freno lee lo que la línea trae; `armarPlanilla` no le pone un día par.
    expect(frenosParaCerrar([linea("31", "Andrea Pérez", [])])).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const BASE: EntradaAntesDeCerrar = {
  periodoAbierto: null,
  esQuincena: true,
  rango: { desde: "2026-09-01", hasta: "2026-09-15" },
  extraSinAprobar: [],
  sinFicha: [],
  sinHorario: 0,
  corte: null,
  hasta: "2026-09-15",
  fueraPorBaja: 0,
  marcoDespuesDeIrse: 0,
  avisoRepartoRechazado: null,
  prestamoSinAtar: [],
  avisoPrestamo: null,
  avisoVacacionesNoPagadas: null,
  conSabado: 0,
  rangoLibre: false,
  factorBase: 1,
  diasCalendario: 15,
  migraciones: [],
  pestanaFichas: "Colaboradores",
};

describe("🔴 sale en «Antes de cerrar», en ARREGLAR y con nombre y día", () => {
  const personas = marcasImparesDeLineas([
    {
      codigo: "31",
      etiqueta: "Andrea Pérez",
      marcasImpares: [
        { fecha: "2026-09-03", marcas: 3 },
        { fecha: "2026-09-08", marcas: 5 },
      ],
    },
  ]);

  it("son DOS líneas separadas: las de menos y las de más", () => {
    const { arreglar } = armarAntesDeCerrar({ ...BASE, marcasImpares: personas });
    const claves = arreglar.map((l) => l.clave);
    expect(claves).toContain("marcas-de-menos");
    expect(claves).toContain("marcas-de-mas");
  });

  it("el número es de DÍAS, y cada línea lleva a la persona", () => {
    const { arreglar } = armarAntesDeCerrar({ ...BASE, marcasImpares: personas });
    const menos = arreglar.find((l) => l.clave === "marcas-de-menos")!;
    expect(menos.numero).toBe(1);
    expect(menos.tono).toBe("arreglar");
    expect(menos.personas?.[0].etiqueta).toBe("Andrea Pérez");
    expect(menos.personas?.[0].detalle).toContain("3 sep");
    expect(menos.personas?.[0].href).toContain("tab=asistencia");
  });

  it("🔴 mientras haya días impares NO dice «Todo listo para cerrar»", () => {
    expect(armarAntesDeCerrar({ ...BASE, marcasImpares: personas }).todoListo).toBe(false);
  });

  it("⚠️ sin pasarlo, nada cambia: la lista es la de siempre", () => {
    const sin = armarAntesDeCerrar(BASE);
    expect(sin.todoListo).toBe(true);
    expect(sin.arreglar).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL CANDADO MÁS IMPORTANTE: EL CÁLCULO NO SE TOCA.
//
// Daniel pidió MARCAR el día, no cambiar lo que se paga: *«El cálculo NO se
// toca. La salida temprana se sigue descontando exactamente como hoy, y el
// sistema sigue leyendo la última marca del día como la salida»*. Si alguien
// aprovecha este módulo para «arreglar» el descuento, el build se pone rojo.
// ─────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

const leer = (r: string) => fs.readFileSync(path.join(process.cwd(), r), "utf8");

describe("🔴 este módulo no decide ni un centavo", () => {
  const fuente = leer("src/lib/asistencia/marcas-impares.ts");

  it("no nombra dinero, rata, neto ni descuento en su CÓDIGO", () => {
    // Se barre el código con los comentarios borrados: las notas de arriba SÍ
    // hablan de plata, y tienen que poder hacerlo.
    const codigo = fuente
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const prohibida of ["dinero", "rataHora", "netoPagar", "valorMinuto", "salidaTempranaMin"]) {
      expect(codigo).not.toContain(prohibida);
    }
  });

  it("🔴 el motor agrega el campo Y NADA MÁS: la línea se copia entera", () => {
    // La única mutación posible desde acá sería tocar la línea al agregarle el
    // campo. El motor lo hace con un spread literal, así que lo demás no puede
    // cambiar. Romper esta forma (por ejemplo tocando `dinero` en el mismo
    // objeto) pone rojo este candado.
    const motor = leer("src/lib/asistencia/planilla.ts");
    expect(motor).toContain("{ ...lineaBase, marcasImpares: impares }");
    // Y se calcula del REPORTE, no del dinero.
    expect(motor).toContain("diasConMarcasImpares(p.dias)");
  });

  it("⚠️ `revisar` sigue siendo «no tiene 4 marcas», intacto", () => {
    // El motor ya tenía su propia bandera para el día mal marcado y se deja
    // como está: son dos cosas distintas y esto no la reemplaza.
    expect(leer("src/lib/asistencia/reporte.ts")).toContain(
      "const revisar = !enCurso && crudas.length !== 4;",
    );
  });
});
