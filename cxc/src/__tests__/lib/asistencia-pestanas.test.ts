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
import { ASISTENCIA_ROLES, vePestana } from "@/lib/asistencia/roles";
import {
  pestanaPorDefecto,
  pestanasDeAsistencia,
} from "@/lib/asistencia/persona-en-el-centro";
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
describe("las 6 pestañas y su orden", () => {
  const src = leer(CLIENTE);

  // 🩸 ESTE CANDADO CAMBIÓ DE DIRECCIÓN EL 10-SEP-2026, NO SE BORRÓ.
  //
  // Leía los pares `["reporte", "Reporte"]` como TEXTO de `AsistenciaClient`.
  // Con el acomodo nuevo —«la persona en el centro», aprobado por Daniel— hay
  // DOS listas de pestañas (la de hoy y la nueva) y elegir entre ellas es una
  // decisión, no un renglón de JSX: se mudó a `lib/asistencia/persona-en-el-
  // centro.ts`. Lo que este bloque protege es lo MISMO de siempre —cuántas
  // pestañas hay, en qué orden y dónde aterriza cada rol— pero preguntándoselo
  // al módulo puro en vez de a una expresión regular sobre una pantalla.
  //
  // 🔴 El CONTROL de que nada se aflojó: con el interruptor APAGADO la lista
  // sigue siendo exactamente la de antes, las siete, en su orden. Eso es lo que
  // comprueba el primer caso.
  const tabs = pestanasDeAsistencia({ personaEnElCentro: false, planillaUnida: true })
    .map(([k, l]) => [k, l]);

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
  // 🩸 REPORTE Y PLANILLA SE DIERON VUELTA (2-sep-2026). Este test exigía
  // «Planilla · Reporte», con el argumento de que a la Planilla viene la
  // contable. Daniel: «primero va reporte, ¿por qué es el segundo tab?».
  // Tenía razón y estaba al revés: primero se ORDENA la asistencia (corregir
  // marcas, justificar, aprobar horas extra) y recién después se PAGA. Una
  // planilla generada antes de eso paga números que todavía se van a mover, y
  // el que abre primero el resultado no cuestiona el respaldo.
  //
  // ⚠️ El orden no es cosmético: `porDefecto` toma la PRIMERA visible, así que
  // esta lista decide dónde aterriza cada rol. Por eso el candado la fija.
  // 🩸 SON SIETE DESDE EL 10-SEP-2026, Y LA SÉPTIMA ES PRÉSTAMOS.
  //
  // Este candado exigía SEIS. No se afloja ni se borra: cambia de dirección con
  // esta nota, porque la regla que protege sigue siendo la misma —«una pestaña
  // se gana el lugar por lo que haces ahí, no por la tabla que guarda»— y
  // Préstamos la cumple igual que Vacaciones y Aprobaciones.
  //
  // Daniel, textual: *«asistencia se ingresa la info y prestamos seria para
  // como ver la info y hacer pagos extraordinarios como abonos etc»*.
  //
  // Lo que la ganó no fue una opinión de diseño: fue plata. Quincena del 1 al
  // 15 de agosto de 2026, medido contra producción — el módulo de Préstamos
  // registró **9 descuentos por $360,00** y la casilla de la planilla decía
  // **7 por $265,00**. KEVIN LUBO ($50), LUIS PARAJON ($45) y YULICAR CORONA
  // ($50) tenían el pago anotado en el módulo y la casilla EN CERO: se les bajó
  // la deuda por plata que nunca se les quitó del sueldo. LUIS ARROYO al revés.
  // Dos pantallas, en dos módulos, para la misma plata.
  //
  // ⚠️ VA PEGADA A PLANILLA y no al final: es la misma plata y el mismo día de
  // trabajo. Y el ORDEN sigue sin ser cosmético — `porDefecto` toma la PRIMERA
  // visible, así que Reporte tiene que seguir siendo el primero.
  it("son exactamente 7, en el orden Reporte · Planilla · Préstamos · Justificaciones · Vacaciones · Aprobaciones · Configuración", () => {
    expect(tabs).toEqual([
      ["reporte", "Reporte"],
      ["planilla", "Planilla"],
      ["prestamos", "Préstamos"],
      ["justificaciones", "Justificaciones"],
      ["vacaciones", "Vacaciones"],
      ["aprobaciones", "Aprobaciones"],
      ["configuracion", "Configuración"],
    ]);
  });

  // CONTROL de la nota de arriba: Reporte sigue abriendo el módulo. Si alguien
  // mueve Préstamos —o cualquier otra— al primer lugar, todo el mundo aterriza
  // en otra pantalla y este test lo dice.
  // 🩸 CAMBIÓ DE DIRECCIÓN EL 10-SEP-2026, y sigue cazando lo mismo.
  //
  // Exigía `useUrlState<Tab>("tab", "reporte")` escrito a mano. Con el acomodo
  // nuevo el módulo abre en **Personas** —que es su punto entero: se entra a la
  // gente, no a un cuadro— así que el default se DERIVA del interruptor.
  //
  // 🔴 EL CONTROL AL REVÉS SE CONSERVA: con el interruptor apagado sigue siendo
  // «reporte», al pie de la letra. Si eso se rompe, apagar el acomodo nuevo ya
  // no devuelve la pantalla de siempre.
  it("apagado, Reporte SIGUE siendo el primero y el aterrizaje de todos", () => {
    expect(tabs[0]).toEqual(["reporte", "Reporte"]);
    expect(pestanaPorDefecto(false)).toBe("reporte");
    // Y prendido abre en Colaboradores (era «Personas» hasta el 10-sep-2026,
    // Daniel: *«no lo llames personas, sino colaboradores»*), que es lo que aprobó.
    expect(pestanaPorDefecto(true)).toBe("colaboradores");
    // La pantalla no lo escribe a mano: se lo pregunta al módulo puro.
    expect(src).toMatch(/pestanaPorDefecto\(PERSONA_EN_EL_CENTRO\)/);
  });

  // 🔴 PRÉSTAMOS CUELGA DEL INTERRUPTOR. Con `PLANILLA_UNIDA` apagado la
  // pestaña no se dibuja NI se abre por la URL, y el módulo queda exactamente
  // como el día antes del cambio. Sin esto, apagar el interruptor dejaría media
  // pantalla prendida.
  // 🩸 CAMBIÓ DE DIRECCIÓN EL 10-SEP-2026: la condición se mudó al módulo puro
  // junto con las listas. La REGLA no cambió ni un poco — con el interruptor
  // apagado, Préstamos no existe ni por la URL— y ahora se prueba sobre la
  // función en vez de sobre un renglón de JSX, que es más fuerte.
  it("la pestaña Préstamos cuelga de PLANILLA_UNIDA", () => {
    expect(src).toMatch(/PLANILLA_UNIDA/);
    for (const modo of [true, false]) {
      const claves = pestanasDeAsistencia({ personaEnElCentro: modo, planillaUnida: false })
        .map(([k]) => k);
      expect(`${modo}:${claves.includes("prestamos")}`).toBe(`${modo}:false`);
    }
    expect(
      pestanasDeAsistencia({ personaEnElCentro: false, planillaUnida: true })
        .map(([k]) => k),
    ).toContain("prestamos");
  });

  it("Aprobaciones NO se le muestra a quien no puede aprobar", () => {
    // 🔑 Esto es la NAVEGACIÓN, no el candado: el freno de verdad está en
    // `/api/asistencia/aprobaciones`, que exige el rol. Pero si la pestaña se
    // viera para todos, la contadora tendría a la vista un botón que le da 403.
    expect(src).toMatch(/APROBACIONES_ROLES/);
    // 🩸 Decía `const visibles = TABS.filter`; desde el 10-sep-2026 las
    // pestañas salen del módulo puro y se filtran por rol acá. La regla es la
    // misma: se filtra por `vePestana`, y lo que no se ve no se abre por la URL.
    expect(src).toMatch(/pestanasDeAsistencia\(\{/);
    expect(src).toMatch(/\.filter\(\(\[k\]\) => vePestana\(rol, k\)\)/);
    // Y una pestaña que no se ve tampoco se abre escribiendo la URL: la regla
    // vive en `pestanaQueSeAbre`, que cae en la primera VISIBLE.
    expect(src).toMatch(/pestanaQueSeAbre\(tabRaw, visibles\)/);
  });

  it("Vacaciones va APARTE de Justificaciones, con su propio componente", () => {
    // 🔴 Si la pestaña montara `JustificacionesTab`, el rótulo diría una cosa y
    // la pantalla haría otra — que es exactamente el enredo que este cambio
    // vino a deshacer.
    expect(src).toMatch(/from "\.\/VacacionesTab"/);
    expect(src).toMatch(/tab === "vacaciones" && <VacacionesTab \/>/);
  });

  it("abre en Reporte — primero se ordena la asistencia, después se paga", () => {
    // Desde el 12-ago-2026 la pestaña vive en la URL (?tab=) para que el
    // refresh no la pierda.
    //
    // 🩸 El default era «planilla», con el argumento de que es a lo que viene
    // la contable (2-sep-2026). Daniel lo dio vuelta: primero se CORRIGE el
    // Reporte —marcas, justificaciones, horas extra aprobadas— y recién
    // después se genera la Planilla, que lee de ahí. Abrir en el resultado
    // hace que nadie mire el respaldo.
    // 🩸 El literal `"reporte"` se fue del renglón el 10-sep-2026: ahora lo
    // decide `pestanaPorDefecto`, que con el interruptor apagado devuelve
    // exactamente eso. Se comprueba el VALOR, no el texto del archivo.
    expect(pestanaPorDefecto(false)).toBe("reporte");
    expect(src).toMatch(/useUrlState<Tab>\("tab", pestanaPorDefecto\(/);
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
// 🩸 VACACIONES SE APAGÓ Y SE VOLVIÓ A ENCENDER EL MISMO DÍA (1-sep-2026), y
// ESTE CANDADO VOLVIÓ A CAMBIAR DE DIRECCIÓN.
//
// Por la mañana: *«olvida lo de las vacaciones por ahora, quitalo del ERP para
// no enrredar»* — y estos casos pasaron a exigir que la pestaña NO se viera.
// Unas horas después: *«vacaciones quedamos que sí, dejalo, solo que haslo
// bien»*. Lo que enredaba era el TEXTO del interruptor, no la pestaña, y eso se
// arregló en `vacaciones.ts` en vez de esconder la pantalla.
//
// 🔑 Queda escrito porque es la lección, no la anécdota: apagar una pantalla
// para tapar una redacción confusa se deshace en horas y deja atrás un
// mecanismo («pestañas apagadas») que después alguien usa para lo mismo. Esa
// lista se borró ENTERA.
// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 la pestaña Vacaciones se ve, y sin permiso propio", () => {
  const src = leer(CLIENTE);
  // 🩸 Igual que arriba: la lista salía de una expresión regular sobre el
  // archivo de pantalla y desde el 10-sep-2026 vive en un módulo puro. Se
  // pregunta por el acomodo APAGADO, que es donde Vacaciones sigue siendo
  // pestaña.
  const tabs = pestanasDeAsistencia({ personaEnElCentro: false, planillaUnida: true })
    .map(([k, l]) => [k, l]);

  it("la ve quien tiene Asistencia — no es una pestaña de aprobación", () => {
    for (const rol of ASISTENCIA_ROLES) {
      expect(`${rol}:${vePestana(rol, "vacaciones")}`).toBe(`${rol}:true`);
    }
    // 🩸 La vara: si `vePestana` devolviera `true` para TODO, lo de arriba
    // pasaría igual. Quien entra solo a aprobar no la ve.
    expect(vePestana("bodega", "vacaciones")).toBe(false);
  });

  it("⛔ NO quedó ningún mecanismo de «pestañas apagadas»", () => {
    // 🔴 Una lista vacía es una puerta esperando que alguien la use para tapar
    // un problema en vez de arreglarlo — que es exactamente lo que pasó.
    const roles = leer("lib/asistencia/roles.ts");
    expect(roles).not.toMatch(/export const PESTANAS_OCULTAS/);
    expect(src).not.toMatch(/PESTANAS_OCULTAS/);
  });

  it("está declarada, importada y montada — y su ruta viva", () => {
    expect(src).toMatch(/import VacacionesTab from "\.\/VacacionesTab"/);
    expect(src).toMatch(/tab === "vacaciones" && <VacacionesTab \/>/);
    // 🩸 Con el acomodo nuevo Vacaciones deja de ser PESTAÑA —su saldo se mudó
    // a la lista de Personas y cargarlas se hace desde la persona— pero la
    // pantalla sigue montada y su ruta viva, que es lo que este caso protege.
    // Apagado el interruptor, la pestaña está donde siempre.
    expect(tabs.map((t) => t[0])).toContain("vacaciones");
    expect(() => leer("app/asistencia/VacacionesTab.tsx")).not.toThrow();
    expect(() => leer("app/api/asistencia/vacaciones/route.ts")).not.toThrow();
  });

  it("🔴 y el interruptor PREGUNTA: la redacción que la había hecho apagar", () => {
    // Daniel: *«me enrreda lo de Ya se le pagó / Se le pagan estos días»*. El
    // texto vive en `vacaciones.ts` y la pantalla lo pide; acá se comprueba que
    // no volvió a escribirse a mano el título viejo.
    const tab = leer("app/asistencia/VacacionesTab.tsx");
    expect(tab).toMatch(/PREGUNTA_YA_COBRADAS/);
    expect(tab).not.toMatch(/>Ya se le pagó</);
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
// 🔴 10-sep-2026: «persona» pasó a «colaborador» en todo texto visible del módulo
// (Daniel: *«no lo llames personas, sino colaboradores»*). Este candado cambió de
// texto, no de regla. Ver `asistencia-colaboradores-no-personas.test.ts`.
    expect(a.titulo).toBe("10 colaboradores de 38 todavía no salen en la planilla.");
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
    expect(a.titulo).toBe("1 colaborador de 38 todavía no sale en la planilla.");
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
// 🔴 LA PRUEBA DE QUE TOCAR ESTA PESTAÑA NO LE MUEVE UN CENTAVO A ELOYN.
//
// 🩸 Nació el 1-sep-2026, el día que la pestaña se apagó unas horas, y SIGUE
// TAL CUAL con la pestaña encendida: lo que vigila no es la pantalla, es el
// motor. Hay DOS vacaciones
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
// sobre el rango REAL de ella, y mira los DÓLARES.
// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 la plata de ELOYN MENDOZA no depende de la pantalla", () => {
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
