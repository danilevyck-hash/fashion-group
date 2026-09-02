// ─────────────────────────────────────────────────────────────────────────────
// CANDADO DEL ACOMODO DE ASISTENCIA (6-ago-2026)
//
// Tres cosas que costaron trabajo entender y que se rompen sin querer:
//
//  1. SON 6 PESTAÑAS Y EN ESTE ORDEN. Eran 7 — un menú, no una herramienta.
//     Horarios y Feriados pasaron a SECCIONES de Configuración (una pestaña se
//     gana el lugar por lo que hacés ahí, no por la tabla que guarda) y "Cómo
//     funciona" pasó a ser el botón «?». Nada se borró: cambió dónde vive, y
//     este test también verifica que las dos pantallas SIGAN montadas.
//
//  2. LA RATA VA A CENTAVOS. Es el número con el que la planilla multiplica de
//     verdad. Mostrar 4 decimales donde el Excel de la contable dice 2 no es un
//     detalle de formato: es enseñar un número con el que nadie calcula.
//
//  3. UN SOLO AVISO DE PENDIENTES, y UN SOLO indicador por fila.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  armarPlanilla,
  calcularDinero,
  grupoDeLinea,
  jornadaDiariaMin,
  FALTA,
  MIN_DIA_NO_TRABAJADO,
  type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import {
  armarReporte,
  type HorarioPersona,
  type Marcacion,
} from "@/lib/asistencia/reporte";
import { motivosDeQuienNoMarco } from "@/lib/asistencia/periodo";
import type { Vacacion } from "@/lib/asistencia/vacaciones";
import {
  ASISTENCIA_ROLES,
  APROBACIONES_ROLES,
  PESTANAS_OCULTAS,
  vePestana,
} from "@/lib/asistencia/roles";
import { rataPorHoraCalculo } from "@/lib/asistencia/rata";
import {
  avisoPendientes,
  faltaEnPersona,
  fraseFalta,
} from "@/lib/asistencia/configuracion-avisos";

const raiz = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");

const CLIENTE = "app/asistencia/AsistenciaClient.tsx";
const CONFIG = "app/asistencia/ConfiguracionTab.tsx";

// ─────────────────────────────────────────────────────────────────────────────
describe("las 5 pestañas y su orden", () => {
  const src = leer(CLIENTE);

  /** Los pares [clave, "Etiqueta"] del arreglo TABS, en el orden del archivo. */
  const tabs = [...src.matchAll(/\["(\w+)",\s*"([^"]+)"\]/g)].map((m) => [m[1], m[2]]);

  // ⚠️ ESTE CANDADO SE AMPLIÓ A CONCIENCIA el 25-ago-2026, no se aflojó: entró
  // VACACIONES, y se ganó el lugar por lo que se hace ahí, no por la tabla que
  // guarda. Es lo CONTRARIO de una sección más de Justificaciones — existe
  // justamente porque una vacación NO es una justificación (no se paga por
  // asistencia y lleva su propia cuenta de días), y meterlas en la misma lista
  // hacía imposible distinguir quién estuvo enfermo de quién estuvo de
  // vacaciones.
  //
  // ⚠️ Y SE VOLVIÓ A AMPLIAR EL 26-AGO-2026, también a conciencia: entró
  // APROBACIONES. Se gana el lugar por dos motivos que ninguna otra pestaña
  // tiene: es la única donde alguien AUTORIZA algo en vez de cargar un dato, y
  // NO LA VE TODO EL MUNDO. Meter «aprobar las horas extra» adentro de la
  // Planilla habría puesto un botón que mueve el pago de treinta personas justo
  // donde la contadora teclea montos.
  //
  // El candado sigue cerrado para cualquier OTRA pestaña.
  it("son exactamente 6, en el orden Planilla · Reporte · Justificaciones · Vacaciones · Aprobaciones · Configuración", () => {
    expect(tabs).toEqual([
      ["planilla", "Planilla"],
      ["reporte", "Reporte"],
      ["justificaciones", "Justificaciones"],
      ["vacaciones", "Vacaciones"],
      ["aprobaciones", "Aprobaciones"],
      ["configuracion", "Configuración"],
    ]);
  });

  it("Aprobaciones NO se le muestra a quien no puede aprobar", () => {
    // 🔑 Esto es la NAVEGACIÓN, no el candado: el freno de verdad está en
    // `/api/asistencia/aprobaciones`, que exige el rol. Pero si la pestaña se
    // viera para todos, la contadora tendría a la vista un botón que le da 403.
    expect(src).toMatch(/APROBACIONES_ROLES/);
    expect(src).toMatch(/const visibles = TABS\.filter/);
    // Y una pestaña que no se ve tampoco se abre escribiendo la URL.
    expect(src).toMatch(/visibles\.some\(\(\[k\]\) => k === tabRaw\)/);
  });

  it("Vacaciones va APARTE de Justificaciones, con su propio componente", () => {
    // 🔴 Si la pestaña montara `JustificacionesTab`, el rótulo diría una cosa y
    // la pantalla haría otra — que es exactamente el enredo que este cambio
    // vino a deshacer.
    //
    // ⚠️ SIGUE VALIENDO CON LA PESTAÑA APAGADA (1-sep-2026), y es a propósito:
    // se apagó la VISIBILIDAD, no el código. Ver el bloque de abajo.
    expect(src).toMatch(/from "\.\/VacacionesTab"/);
    expect(src).toMatch(/tab === "vacaciones" && <VacacionesTab \/>/);
  });

  it("abre en Planilla — es a lo que viene la contable", () => {
    // Desde el 12-ago-2026 la pestaña vive en la URL (?tab=) para que el
    // refresh no la pierda; el DEFAULT sigue siendo Planilla.
    expect(src).toMatch(/useUrlState<Tab>\("tab", "planilla"\)/);
  });

  it("Horarios y Feriados YA NO son pestañas de primer nivel", () => {
    const claves = tabs.map((t) => t[0]);
    expect(claves).not.toContain("horarios");
    expect(claves).not.toContain("feriados");
    // Y tampoco se importan acá: si volvieran, volverían como pestaña.
    expect(src).not.toMatch(/from "\.\/HorariosTab"/);
    expect(src).not.toMatch(/from "\.\/FeriadosTab"/);
  });

  it("«Cómo funciona» dejó de ser pestaña y es el botón ?", () => {
    expect(tabs.map((t) => t[0])).not.toContain("ayuda");
    // Sigue existiendo, como ayuda: el componente se monta y el botón lo nombra
    // para quien use lector de pantalla.
    expect(src).toMatch(/from "\.\/ComoFuncionaTab"/);
    expect(src).toMatch(/aria-label="Cómo funciona"/);
  });

  it("NO se borró ninguna funcionalidad: Horarios y Feriados viven en Configuración", () => {
    const cfg = leer(CONFIG);
    expect(cfg).toMatch(/from "\.\/HorariosTab"/);
    expect(cfg).toMatch(/from "\.\/FeriadosTab"/);
    expect(cfg).toMatch(/<HorariosTab \/>/);
    expect(cfg).toMatch(/<FeriadosTab \/>/);
  });

  it("todas las pestañas y el botón de ayuda son tocables (44 px)", () => {
    // La regla de la casa: nada táctil por debajo de 44 px.
    expect(src).toMatch(/min-h-\[44px\]/);
    expect(src).toMatch(/h-11 w-11/); // el «?» es redondo: 44 × 44
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 🔴 VACACIONES ESTÁ APAGADA (1-sep-2026) — y este candado CAMBIÓ DE DIRECCIÓN.
//
// Daniel, textual: *«olvida lo de las vacaciones por ahora, quitalo del ERP
// para no enrredar»*. Hasta ayer este archivo exigía que la pestaña se VIERA;
// hoy exige que NO se vea. Lo que NO cambió —y es la mitad que importa— es que
// la pestaña sigue DECLARADA, su componente sigue MONTADO y la ruta sigue
// viva: se apagó una pantalla, no se borró un trabajo. Volver a encenderla es
// borrar `"vacaciones"` de `PESTANAS_OCULTAS`, y estos casos vuelven a fallar
// para avisarlo — que es exactamente lo que tiene que pasar.
// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 la pestaña Vacaciones está apagada, no borrada", () => {
  const src = leer(CLIENTE);
  const tabs = [...src.matchAll(/\["(\w+)",\s*"([^"]+)"\]/g)].map((m) => [m[1], m[2]]);
  const TODOS = [...new Set([...ASISTENCIA_ROLES, ...APROBACIONES_ROLES])];

  it("nadie la ve — ni admin, que ve todo lo demás", () => {
    for (const rol of TODOS) expect(`${rol}:${vePestana(rol, "vacaciones")}`).toBe(`${rol}:false`);
    // 🩸 La vara: si `vePestana` devolviera `false` para TODO, esto también
    // pasaría en verde. Las otras pestañas siguen abriéndose para admin.
    for (const p of ["planilla", "reporte", "justificaciones", "configuracion", "aprobaciones"]) {
      expect(`${p}:${vePestana("admin", p)}`).toBe(`${p}:true`);
    }
  });

  it("la lista de apagadas dice exactamente cuál, y en un solo lugar", () => {
    expect([...PESTANAS_OCULTAS]).toEqual(["vacaciones"]);
    // La pantalla no reimplementa la regla: la pide.
    expect(src).toMatch(/const visibles = TABS\.filter\(\(\[k\]\) => vePestana\(rol, k\)\)/);
  });

  it("⚠️ un `?tab=vacaciones` guardado cae en la pestaña por defecto, NO en blanco", () => {
    // La pantalla resuelve la URL CONTRA `visibles`, y vacaciones ya no está
    // ahí. Sin esta línea, el marcador de alguien abriría el módulo vacío.
    expect(src).toMatch(/visibles\.some\(\(\[k\]\) => k === tabRaw\)/);
    expect(src).toMatch(/const porDefecto: Tab = \(visibles\[0\]\?\.\[0\] \?\? "planilla"\)/);
    // Y para el rol de la contable la primera visible sigue siendo Planilla.
    const primeraVisible = tabs.find(([k]) => vePestana("contabilidad", k))![0];
    expect(primeraVisible).toBe("planilla");
  });

  it("⛔ NO se borró: el componente sigue importado, montado y en el arreglo", () => {
    // 🔴 Si alguien «limpia» esto borrando el import y el render, encenderla de
    // nuevo deja de ser una línea y hay que rehacer el trabajo.
    expect(src).toMatch(/import VacacionesTab from "\.\/VacacionesTab"/);
    expect(src).toMatch(/tab === "vacaciones" && <VacacionesTab \/>/);
    expect(tabs.map((t) => t[0])).toContain("vacaciones");
  });

  it("⛔ ni el archivo, ni su ruta de API", () => {
    expect(() => leer("app/asistencia/VacacionesTab.tsx")).not.toThrow();
    expect(() => leer("app/api/asistencia/vacaciones/route.ts")).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la rata que se MUESTRA es la que se USA para calcular", () => {
  const reglas = REGLAS_DEFAULT;

  /** Lo que la planilla multiplica de verdad, sacado del motor, no de una copia. */
  function rataDeLaPlanilla(salario: number, jornada: number): number {
    const d = calcularDinero(
      salario,
      jornada,
      {
        extraDiurnoMin: 0, extraNocturnoMin: 0, excedenteMin: 0,
        domingoMin: 0, feriadoMin: 0, ausenciaMin: 0, tardanzaMin: 0,
      },
      { isr: 0, prestamo: 0, terceros: 0, mercancia: 0, otrosServicios: 0 },
      reglas,
    );
    if (!d) throw new Error("la planilla no calculó");
    return d.rataHora;
  }

  it("los dos casos que se veían mal en pantalla: $3.0201 → 3.02 y $4.6155 → 4.62", () => {
    // $628,19 ÷ 208 = 3,020144…  ·  $960,03 ÷ 208 = 4,61552…
    expect(rataPorHoraCalculo(628.19, 48, reglas)).toBe(3.02);
    expect(rataPorHoraCalculo(960.03, 48, reglas)).toBe(4.62);
  });

  it("el salario real de Boston ($523,47 a 48 h) da la misma rata que la planilla", () => {
    expect(rataPorHoraCalculo(523.47, 48, reglas)).toBe(rataDeLaPlanilla(523.47, 48));
  });

  it("coincide con el motor en 40 y en 48 horas, salario por salario", () => {
    for (const salario of [400, 523.47, 628.19, 850, 960.03, 1200.5, 2500]) {
      for (const jornada of [40, 48]) {
        expect(rataPorHoraCalculo(salario, jornada, reglas)).toBe(
          rataDeLaPlanilla(salario, jornada),
        );
      }
    }
  });

  it("nunca tiene más de 2 decimales", () => {
    for (const salario of [523.47, 628.19, 777.77, 960.03, 1111.11]) {
      for (const jornada of [40, 48]) {
        const r = rataPorHoraCalculo(salario, jornada, reglas)!;
        expect(Math.round(r * 100) / 100).toBe(r);
      }
    }
  });

  it("🩸 redondear DOS veces (a 4 y después a 2) da otro centavo — por eso se redondea una sola vez", () => {
    // `salario / 208 = 3.0249512…`: a 4 decimales sube a 3.0250 y de ahí a 2
    // sube a 3.03, mientras el cálculo real se queda en 3.02.
    const salario = 629.19;
    const largo = salario / 208;
    const dosVueltas = Math.round((Math.round(largo * 1e4) / 1e4) * 100) / 100;
    expect(dosVueltas).toBe(3.03);
    expect(rataPorHoraCalculo(salario, 48, reglas)).toBe(3.02);
    expect(rataPorHoraCalculo(salario, 48, reglas)).toBe(rataDeLaPlanilla(salario, 48));
  });

  it("no inventa una rata cuando no hay con qué", () => {
    expect(rataPorHoraCalculo(null, 48, reglas)).toBeNull();
    expect(rataPorHoraCalculo(undefined, 48, reglas)).toBeNull();
    expect(rataPorHoraCalculo(0, 48, reglas)).toBeNull();
    expect(rataPorHoraCalculo(-100, 48, reglas)).toBeNull();
    expect(rataPorHoraCalculo(NaN, 48, reglas)).toBeNull();
    // Divisor inservible → null, nunca Infinity.
    expect(rataPorHoraCalculo(850, 48, { ...reglas, divisor48: 0 })).toBeNull();
    expect(rataPorHoraCalculo(850, 44, reglas)).toBeNull();
  });

  it("la pantalla de Configuración NO vuelve a pedir 4 decimales", () => {
    const cfg = leer(CONFIG);
    expect(cfg).not.toMatch(/money\([^)]*,\s*4\s*\)/);
    // Y usa la rata del cálculo, no la de 4 decimales de `config.ts`.
    expect(cfg).toMatch(/rataPorHoraCalculo/);
    expect(cfg).not.toMatch(/\brataPorHora\b(?!Calculo)/);
  });

  it("el servidor devuelve la rata del CÁLCULO, no la de 4 decimales", () => {
    const route = leer("app/api/asistencia/configuracion/route.ts");
    expect(route).toMatch(/rataHora: rataPorHoraCalculo\(/);
    expect(route).not.toMatch(/rataHora: rataPorHora\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("un solo aviso de pendientes, con el desglose adentro", () => {
  it("sin pendientes no hay aviso — un cartel permanente se deja de leer", () => {
    expect(avisoPendientes({ total: 38, sinConfigurar: 0, sinSalario: 0 })).toBeNull();
  });

  it("el caso de producción (38 personas, 6 sin ficha y 4 sin salario) es UN aviso con DOS renglones", () => {
    const a = avisoPendientes({ total: 38, sinConfigurar: 6, sinSalario: 4 })!;
    expect(a.titulo).toBe("10 personas de 38 todavía no salen en la planilla.");
    expect(a.detalle).toHaveLength(2);
    expect(a.detalle[0]).toContain("6 marcan en el reloj");
    expect(a.detalle[1]).toContain("4 ya tienen ficha");
  });

  it("con una sola clase de pendiente, un solo renglón de detalle", () => {
    expect(avisoPendientes({ total: 38, sinConfigurar: 6, sinSalario: 0 })!.detalle).toHaveLength(1);
    expect(avisoPendientes({ total: 38, sinConfigurar: 0, sinSalario: 4 })!.detalle).toHaveLength(1);
  });

  it("habla en singular cuando es una sola persona", () => {
    const a = avisoPendientes({ total: 38, sinConfigurar: 1, sinSalario: 0 })!;
    expect(a.titulo).toBe("1 persona de 38 todavía no sale en la planilla.");
  });

  it("la palabra «vencido» no aparece — se dice qué falta, no se reta a nadie", () => {
    const a = avisoPendientes({ total: 38, sinConfigurar: 6, sinSalario: 4 })!;
    expect(`${a.titulo} ${a.detalle.join(" ")}`.toLowerCase()).not.toContain("vencido");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("un solo indicador por fila; el detalle al abrirla", () => {
  it("dice todo lo que falta, en el orden en que se llena", () => {
    expect(faltaEnPersona({ nombre: null, empresa: null, salarioMensual: null })).toEqual([
      "el nombre", "la empresa", "el salario",
    ]);
    expect(faltaEnPersona({ nombre: "  ", empresa: "vistana", salarioMensual: 850 })).toEqual([
      "el nombre",
    ]);
    expect(faltaEnPersona({ nombre: "Ángela", empresa: "vistana", salarioMensual: 850 })).toEqual([]);
  });

  it("se lee como una frase, no como una lista de alarmas", () => {
    expect(fraseFalta(["el nombre"])).toBe("el nombre");
    expect(fraseFalta(["el nombre", "la empresa"])).toBe("el nombre y la empresa");
    expect(fraseFalta(["el nombre", "la empresa", "el salario"]))
      .toBe("el nombre, la empresa y el salario");
    expect(fraseFalta([])).toBe("");
  });

  it("la fila colapsada NO repite «Falta el nombre / la empresa / el salario» tres veces", () => {
    const cfg = leer(CONFIG);
    expect(cfg).not.toMatch(/Falta el nombre/);
    expect(cfg).not.toMatch(/Falta la empresa/);
    expect(cfg).not.toMatch(/Falta el salario/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la pantalla de Configuración se ve editable y se lee en columnas", () => {
  const cfg = leer(CONFIG);

  it("edición en línea que guarda al cambiar, como HorariosTab — sin botón «Guardar esta persona»", () => {
    expect(cfg).not.toMatch(/Guardar esta persona/);
    expect(cfg).toMatch(/onBlur=\{\(\) => void guardar\(/);
    expect(cfg).toMatch(/cambiarYGuardar/);
    expect(cfg).toMatch(/Se guarda solo/);
  });

  it("columnas alineadas en escritorio y tarjetas en celular", () => {
    // El corte es lg (1024): el iPad de 834 no aguanta seis columnas.
    expect(cfg).toMatch(/lg:grid lg:grid-cols-\[minmax\(0,1fr\)/);
    expect(cfg).toMatch(/block lg:hidden/);
  });

  it("los números van en tabular-nums y alineados a la derecha", () => {
    expect(cfg).toMatch(/text-right text-\[13px\] tabular-nums/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 🔴 LA PRUEBA DE QUE APAGAR LA PESTAÑA NO LE TOCÓ UN CENTAVO A ELOYN.
//
// 🩸 EL RIESGO REAL DE ESTE CAMBIO, escrito antes de hacerlo: hay DOS vacaciones
// vivas en producción, las dos de ELOYN MENDOZA (código 29, fashion_wear) —
// 16-jul → 13-ago-2026 y 14-ago-2026—, ninguna marcada «ya se le pagó». Ella no
// marca el reloj esos días. Si «quitar las vacaciones del ERP» se hubiera
// entendido como *dejar de leer `asistencia_vacaciones` en el cálculo*, esos
// días pasaban a contarse como AUSENCIA y la planilla le comía una quincena
// entera SIN DECIR NADA. Es la misma trampa que el módulo ya documenta: «un día
// de vacaciones que aparece con 47 minutos de tardanza el día de pago».
//
// Por eso este bloque no mira una pantalla: corre el MOTOR de verdad
// —`armarReporte` + `armarPlanilla`, los mismos que arman el Excel y el PDF—
// sobre el rango REAL de ella, y mira los DÓLARES. Y lo hace afirmando, en el
// mismo archivo, que la pestaña está apagada: las dos cosas son ciertas a la vez
// o este archivo se pone rojo.
// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 apagar la pestaña NO le movió la plata a ELOYN MENDOZA", () => {
  const R = REGLAS_DEFAULT;

  // ── Las DOS filas REALES de producción ─────────────────────────────────────
  const CODIGO = "29";
  const NOMBRE = "ELOYN MENDOZA";
  /** 16-jul → 13-ago-2026 (29 días) y 14-ago-2026 (1 día). Ninguna «ya pagada». */
  const VACACIONES_REALES: Vacacion[] = [
    { empleado_codigo: CODIGO, desde: "2026-07-16", hasta: "2026-08-13", ya_pagadas: false },
    { empleado_codigo: CODIGO, desde: "2026-08-14", hasta: "2026-08-14", ya_pagadas: false },
  ];

  // La quincena 1 → 15 de agosto de 2026, que las toca a las dos.
  const Q_DESDE = "2026-08-01";
  const Q_HASTA = "2026-08-15";
  /** Los 10 hábiles de esa quincena. Del 3 al 13 los cubre la vacación larga. */
  const HABILES = [
    "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07",
    "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14",
  ];
  const VIERNES_14 = "2026-08-14";

  const ficha: FichaPlanilla = {
    codigo: CODIGO, nombre: NOMBRE,
    salarioMensual: 566.52, jornadaSemanal: 40, empresa: "fashion_wear",
  };
  const horarios: HorarioPersona[] = [
    { empleado_codigo: CODIGO, entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 },
  ];

  /** Panamá es UTC−5 fijo. Nada de `new Date()`. */
  const enPanama = (dia: string, hhmm: string) =>
    new Date(Date.parse(`${dia}T${hhmm}:00-05:00`)).toISOString();
  const marcasDe = (d: string): Marcacion[] =>
    ["08:00", "12:00", "12:30", "17:00"].map((h) => ({
      empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: enPanama(d, h),
    }));

  /** La planilla como la arma la ruta: mismo motor, mismos argumentos. */
  function lineaDe(opts: { vacaciones?: Vacacion[]; marca?: string[] }) {
    const personas = armarReporte({
      marcaciones: (opts.marca ?? []).flatMap(marcasDe),
      horarios,
      justificaciones: [],
      vacaciones: opts.vacaciones,
      feriados: new Map(),
      desde: Q_DESDE, hasta: Q_HASTA, reglas: R,
      nombres: new Map([[CODIGO, NOMBRE]]),
      incluirNoHabiles: true,
    });
    const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
    return armarPlanilla({
      personas,
      fichas: new Map([[CODIGO, ficha]]),
      jornadaDiariaMin: (c) => jornadaDiariaMin(horarioDe.get(c)),
      reglas: R,
      empresa: "fashion_wear",
      justificados: motivosDeQuienNoMarco({ vacaciones: opts.vacaciones }),
    }).find((l) => l.codigo === CODIGO)!;
  }

  it("🔑 el escenario es el de HOY: la pestaña está apagada mientras se mide esto", () => {
    // Si alguien vuelve a encender la pestaña, este caso falla y obliga a
    // releer el bloque entero en vez de dejarlo mintiendo.
    expect([...PESTANAS_OCULTAS]).toContain("vacaciones");
    expect(vePestana("admin", "vacaciones")).toBe(false);
  });

  it("🔴 con sus DOS vacaciones reales y cero marcas: no se le descuenta NADA", () => {
    const l = lineaDe({ vacaciones: VACACIONES_REALES });
    // Sin número y fuera del total: la decide una persona. NO un descuento.
    expect(l.dinero).toBeNull();
    expect(l.faltaConfigurar).toEqual([]);
    expect(grupoDeLinea(l)).toBe("decidir");
    expect(l.decidirAMano).toContain("Vacaciones");
    // Y el motor las reconoció como vacaciones, no como faltas.
    expect(l.horas.ausenciaDias).toBe(0);
    expect(l.horas.ausenciaMin).toBe(0);
  });

  it("🩸 LA VARA: si el motor dejara de leerlas, sería «no marcó ni un día» (ámbar)", () => {
    // Es el caso que este trabajo NO podía producir. Sin él, un motor que no
    // descuenta nada nunca pondría el archivo en rojo.
    const l = lineaDe({});
    expect(l.faltaConfigurar).toContain(FALTA.sinMarcaciones);
    expect(grupoDeLinea(l)).toBe("falta");
  });

  it("🔴 EN DÓLARES: con la vacación viva cobra la quincena COMPLETA, ausencias $0.00", () => {
    // Para que haya un número que mirar, la persona marca el viernes 14 —el
    // día que la vacación larga ya no cubre—. Los 9 hábiles anteriores son
    // vacaciones. La vara es la MISMA quincena trabajada entera.
    const conVacacion = lineaDe({
      vacaciones: [VACACIONES_REALES[0]], marca: [VIERNES_14],
    });
    const perfecta = lineaDe({ marca: HABILES });

    expect(conVacacion.dinero).not.toBeNull();
    expect(conVacacion.dinero!.ausencias).toBe(0);
    expect(conVacacion.dinero!.vacacionesYaPagadas).toBe(0);
    expect(conVacacion.dinero!.tardanzas).toBe(0);
    // Campo por campo contra la quincena trabajada entera: si mañana entra una
    // columna nueva, se compara sola.
    for (const k of Object.keys(conVacacion.dinero!) as Array<keyof typeof conVacacion.dinero>) {
      expect(`${String(k)}=${conVacacion.dinero![k]}`).toBe(`${String(k)}=${perfecta.dinero![k]}`);
    }
  });

  it("🩸 y sin la vacación esos MISMOS días serían 9 ausencias de día completo", () => {
    const sinVacacion = lineaDe({ marca: [VIERNES_14] });
    const rata = sinVacacion.dinero!.rataHora;
    // 9 hábiles × 8 h × la rata. `MIN_DIA_NO_TRABAJADO` es la constante de la
    // casa: 8 h fijas, no el horario de la persona.
    const esperado = Math.round(9 * (MIN_DIA_NO_TRABAJADO / 60) * rata * 100) / 100;
    expect(sinVacacion.horas.ausenciaDias).toBe(9);
    expect(sinVacacion.dinero!.ausencias).toBe(esperado);
    expect(esperado).toBeGreaterThan(0);
    // O sea: es exactamente la quincena que se le habría comido en silencio.
    expect(sinVacacion.dinero!.netoPagar).toBeLessThan(
      lineaDe({ vacaciones: [VACACIONES_REALES[0]], marca: [VIERNES_14] }).dinero!.netoPagar,
    );
  });
});
