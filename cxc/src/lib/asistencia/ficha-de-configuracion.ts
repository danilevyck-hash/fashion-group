/* ─────────────────────────────────────────────────────────────────────────────
 * LA FICHA DE UNA PERSONA, ARMADA EN UN SOLO LUGAR (14-sep-2026)
 *
 * ── 🩸 POR QUÉ SE MUDÓ ACÁ ───────────────────────────────────────────────────
 *
 * `PersonaPagina.tsx` decía, textual: *«EL MISMO GET DE SIEMPRE. No se estrena
 * una ruta "de una persona": dos lecturas de la misma ficha es cómo nacen dos
 * verdades»*. La nota tenía razón en el MIEDO y se equivocaba en el REMEDIO: lo
 * que no puede haber son dos CÁLCULOS, no dos lecturas. Mientras el remedio fue
 * «pedí la lista entera», abrir la ficha de una persona costaba leer las 6.998
 * marcaciones de 180 días (835 KB en 7 páginas de PostgREST) para quedarse con
 * una fila — 1.656 ms medidos contra producción el 14-sep-2026.
 *
 * 🔴 EL REMEDIO DE HOY: el cálculo vive acá, y lo llaman LOS DOS caminos —la
 * lista (`/api/asistencia/configuracion`) y la ficha de una persona
 * (`/api/asistencia/configuracion/persona`)—. No es «el mismo cálculo copiado»:
 * es la MISMA función. Lo único que cambia entre los dos es a qué le pregunta
 * cada uno a la base; el mapeo de una fila a una persona es este archivo y
 * ninguno más.
 *
 * 🔴 Y COMO ESO SOLITO NO ALCANZA, hay candado:
 * `asistencia-ficha-una-persona.test.ts` corre los DOS caminos sobre el mismo
 * universo de personas y exige igualdad CAMPO POR CAMPO. Si un día difieren en
 * uno solo, el build se pone rojo. De esta ficha sale lo que se le paga a la
 * gente: dos verdades acá no se pagan con una pantalla fea, se pagan en plata.
 *
 * ⚠️ NO HACE I/O: no toca la base, no arma una consulta y no llama a `new
 * Date()` — el «hoy» y las seis lecturas se las pasa quien lo llame. Importa
 * de `config-server.ts` los lectores de UNA fila (`vigenciaDeFila`,
 * `pagaSegurosDeFila`…), que son puros y viven ahí desde antes, pegados al
 * `select` que trae esas columnas. Mudarlos sería tocar media docena de
 * archivos ajenos a este cambio.
 * ────────────────────────────────────────────────────────────────────────── */

import { valorMinuto, type Jornada, type ReglasAsistencia } from "./config";
import { rataPorHoraCalculo } from "./rata";
import { partesDe, validarReparto, type FilaReparto } from "./reparto";
import type { ParteReparto } from "./planilla";
import {
  vigenciaDeFila,
  servicioProfesionalDeFila,
  pagaSegurosDeFila,
  baseSegurosDeFila,
  noMarcaRelojDeFila,
  cobraHorasExtraDeFila,
  type FilaPersonaDb,
} from "./config-server";
import type { Directorio } from "./directorio";
import { diaPanama } from "./reporte";
import {
  fraseBaja,
  marcoDespuesDeLaBaja,
  tieneBaja,
  type MarcaPosterior,
  type MotivoSalida,
} from "./vigencia";

/** Una marcación del reloj, en lo mínimo que esta pantalla usa. */
export interface FilaMarca {
  empleado_codigo: string | null;
  empleado_nombre: string | null;
  ocurrio_en: string;
  dispositivo: string | null;
}

/** Qué se sabe de un código POR EL RELOJ. */
export interface VistoEnElReloj {
  marcaciones: number;
  ultima: string;
  nombreReloj: string | null;
  dispositivo: string | null;
}

/**
 * Las marcaciones, agrupadas por código.
 *
 * 🔑 Acá se RECORTA el código (`.trim()`), igual que hacía la ruta de la lista.
 * Medido contra producción el 14-sep-2026: ni un solo código —en marcaciones,
 * fichas, horarios, repartos, ignorados ni préstamos— trae espacios a los
 * bordes. Por eso el camino nuevo puede pedirle a la base `.eq(codigo)` exacto
 * y encontrar lo mismo que encuentra el que lee todo y recorta después.
 */
export function agruparMarcas(
  marcas: readonly FilaMarca[],
): Map<string, VistoEnElReloj> {
  const vistos = new Map<string, VistoEnElReloj>();
  for (const m of marcas) {
    const cod = (m.empleado_codigo ?? "").trim();
    if (!cod) continue;
    const v = vistos.get(cod);
    if (!v) {
      vistos.set(cod, {
        marcaciones: 1,
        ultima: m.ocurrio_en,
        // El reloj lo manda vacío en todas las filas medidas; se guarda igual
        // por si alguna vez llega, y sirve de semilla del nombre.
        nombreReloj: (m.empleado_nombre ?? "").trim() || null,
        dispositivo: m.dispositivo,
      });
    } else {
      v.marcaciones += 1;
      if (m.ocurrio_en > v.ultima) v.ultima = m.ocurrio_en;
      if (!v.nombreReloj && (m.empleado_nombre ?? "").trim()) {
        v.nombreReloj = (m.empleado_nombre ?? "").trim();
      }
      if (!v.dispositivo) v.dispositivo = m.dispositivo;
    }
  }
  return vistos;
}

/** Todo lo que hace falta para armar UNA persona. Nada de acá se va a buscar. */
export interface InsumosDeUnaPersona {
  codigo: string;
  /** Lo que el reloj sabe de ese código. `undefined` = no marcó en la ventana. */
  visto: VistoEnElReloj | undefined;
  /** Su ficha guardada. `undefined` = el código marca y nadie dijo quién es. */
  ficha: FilaPersonaDb | undefined;
  /** El traductor código → nombre. La regla de respaldo vive en `directorio.ts`. */
  directorio: Directorio;
  reglas: ReglasAsistencia;
  /** Sus filas de reparto, sin validar. `undefined` = cobra entero. */
  filasReparto: FilaReparto[] | undefined;
  /** Lo que debe en Préstamos. `0` = no debe. */
  deudaPrestamo: number;
  /** ¿Hay fila en `asistencia_horarios`? `null` = no se pudo leer (no se acusa). */
  tieneHorario: boolean | null;
  /** El día de hoy en Panamá. Solo decide cómo se REDACTA la baja. */
  hoy: string;
}

/** La persona tal como la devuelve la ruta. Lo que lee `ConfiguracionTab` y la
 *  página de un colaborador; ver `colaboradores/tipos.ts`. */
export type PersonaDeConfiguracion = ReturnType<typeof armarPersonaDeConfiguracion>["persona"];

/**
 * 🔴 EL ÚNICO LUGAR DONDE UNA FILA SE VUELVE UNA PERSONA.
 *
 * Salió TAL CUAL del cuerpo del `map` de `configuracion/route.ts` el
 * 14-sep-2026: ni un campo se agregó, se quitó ni cambió de valor. Lo que
 * cambió es quién lo llama — ahora, los dos caminos.
 */
export function armarPersonaDeConfiguracion(ins: InsumosDeUnaPersona): {
  persona: {
    codigo: string;
    nombre: string | null;
    salarioMensual: number | null;
    jornadaSemanal: Jornada;
    empresa: string | null;
    configurado: boolean;
    servicioProfesional: boolean;
    pagaSeguros: boolean;
    baseSeguros: number | null;
    noMarcaReloj: boolean;
    cobraHorasExtra: boolean;
    posicion: string | null;
    cedula: string | null;
    tieneHorario: boolean | null;
    reparto: ParteReparto[];
    motivoReparto: string | null;
    faltaSalario: boolean;
    marcaciones: number;
    ultimaMarca: string | null;
    dispositivo: string | null;
    fechaIngreso: string | null;
    fechaSalida: string | null;
    motivoSalida: MotivoSalida | null;
    activo: boolean;
    baja: string | null;
    marcoDespuesDeLaBaja: boolean;
    deudaPrestamo: number;
    rataHora: number | null;
    valorMinuto: number | null;
  };
  /** 🩸 El que no se puede esconder: dada de baja y sigue marcando. `null` = no
   *  es el caso. La ruta de la lista los junta para el aviso de arriba. */
  marcaPosterior: MarcaPosterior | null;
} {
  const { codigo, visto: v, ficha: f, directorio, reglas } = ins;

  const salario =
    f?.salario_mensual === null || f?.salario_mensual === undefined
      ? null
      : Number(f.salario_mensual);
  const jornada = (Number(f?.jornada_semanal) === 40 ? 40 : 48) as Jornada;

  // La baja de esta persona, si la tiene.
  const vig = f ? vigenciaDeFila(f) : null;
  // 🔴 Sin ficha NO se puede estar fuera de planilla: la bandera vive en la
  // ficha. Un código que marca y nadie configuró sigue siendo un pendiente.
  const servicioProfesional = f ? servicioProfesionalDeFila(f) : false;
  // 🔑 Sin ficha, SÍ paga seguros: es el default de siempre y lo que hace
  // que un código todavía sin configurar no aparezca como una excepción.
  const pagaSeguros = f ? pagaSegurosDeFila(f) : true;
  // 🔑 Sin ficha NO hay base propia: los seguros salen del bruto, que es el
  // default de siempre. Es el monto de UNA QUINCENA — ver `seguros-base.ts`.
  const baseSeguros = f ? baseSegurosDeFila(f) : null;
  // 🔴 Sin ficha NO se puede cobrar fijo: la bandera vive en la ficha. Un
  // código que marca y nadie configuró sigue siendo un pendiente.
  const noMarcaReloj = f ? noMarcaRelojDeFila(f) : false;
  // 🔑 Sin ficha SÍ cobra horas extra: es el default de siempre (10-sep-2026).
  const cobraHorasExtra = f ? cobraHorasExtraDeFila(f) : true;
  // 🔴 EL REPARTO, ya validado. Vacío = cobra entero en su empresa, que es
  // el caso de 36 de las 37 fichas. `motivoReparto` trae el porqué cuando
  // hay filas cargadas y el guard las rechaza — rechazar sí, esconder no.
  const filasReparto = ins.filasReparto;
  const reparto: ParteReparto[] = partesDe(salario, filasReparto);
  const motivoReparto =
    filasReparto && filasReparto.length > 0 && reparto.length === 0
      ? (validarReparto(salario, filasReparto) as { ok: false; error: string }).error
      : null;
  const ultimaMarca = v ? diaPanama(v.ultima) : null;
  const etiqueta = directorio.nombre(codigo) ?? v?.nombreReloj ?? `Código ${codigo}`;
  const marcaPosterior: MarcaPosterior | null =
    vig && marcoDespuesDeLaBaja(vig, ultimaMarca)
      ? { etiqueta, fechaSalida: vig.fechaSalida!, ultimaMarca: ultimaMarca! }
      : null;

  return {
    marcaPosterior,
    persona: {
      codigo,
      // Del directorio, no de un `??` escrito acá: la regla de respaldo vive
      // en un solo lugar. El nombre del reloj queda de último por si algún día
      // el aparato empieza a mandarlo (hoy viene vacío en las 3.287 filas).
      nombre: directorio.nombre(codigo) ?? v?.nombreReloj ?? null,
      salarioMensual: Number.isFinite(salario as number) ? (salario as number) : null,
      jornadaSemanal: jornada,
      empresa: f?.empresa ?? null,
      // `false` = el código marca en el reloj pero nadie dijo quién es. Es
      // exactamente lo que la pantalla tiene que destacar.
      configurado: !!f,
      // 🔴 «Va en planilla» o «servicio profesional». La segunda mitad del
      // dato: sigue en el control de asistencia, fuera de todo cálculo de pago.
      servicioProfesional,
      // 🔴 ¿Se le descuentan el social y el educativo? Los dos JUNTOS —ver
      // `seguros.ts`—. `true` mientras nadie diga lo contrario: es el
      // comportamiento que la planilla tenía para las 38 fichas.
      pagaSeguros,
      // 🔴 Sobre QUÉ MONTO se le calculan, por quincena. `null` = sobre el
      // bruto, como toda la vida. No enciende nada: con `pagaSeguros` en
      // `false` las dos columnas siguen en $0,00 aunque haya base.
      baseSeguros,
      // 🔴 Cobra fijo y no pasa por el reloj. Sigue en la planilla, con
      // seguros y todo; lo que se le ignora son las marcaciones.
      noMarcaReloj,
      // 🔴 ¿Cobra horas extra? `true` para todos salvo que alguien lo apague
      // en la ficha (10-sep-2026, Daniel: «por default a todos sí»).
      cobraHorasExtra,
      // 🔴 LOS DOS TEXTOS QUE SOLO EXISTEN PARA EL COMPROBANTE DE PAGO: el
      // cargo («POSICION DESEMPEÑADA») y la cédula del pie. `null` = todavía
      // no se cargó, y el papel escribe un guion o deja la línea en blanco.
      // Ninguno de los dos toca el cálculo. Ver `datos-del-papel.ts`.
      posicion: f?.posicion ?? null,
      cedula: f?.cedula ?? null,
      // 🔴 ¿Tiene hora de salida cargada? `null` = no se pudo leer (no se acusa).
      // Lo lee `lib/asistencia/que-le-falta.ts` para el chip «Falta para pagar».
      tieneHorario: ins.tieneHorario,
      // 🔴 Su sueldo se paga entre dos empresas y sale en las dos planillas.
      // Es de SOLO LECTURA en esta pantalla: la regla la fija la contadora y
      // los montos tienen que sumar el salario de la ficha. Ver `reparto.ts`.
      reparto,
      motivoReparto,
      // Falta el sueldo, pero la empresa ya está: se puede emitir la planilla
      // de las otras y saber a quién le falta el dato.
      //
      // 🔴 A QUIEN NO VA EN PLANILLA NO LE FALTA EL SALARIO: no lo necesita.
      // Sin esta condición, YULISSA saldría para siempre en «les falta el
      // salario» y ese aviso —el que la contable usa para saber cuánto le
      // queda— dejaría de significar algo.
      faltaSalario:
        !!f && !servicioProfesional && (salario === null || !Number.isFinite(salario as number)),
      marcaciones: v?.marcaciones ?? 0,
      ultimaMarca,
      dispositivo: v?.dispositivo ?? null,
      // ── ALTAS Y BAJAS ────────────────────────────────────────────────────
      // 🔑 `activo` es DERIVADO de la fecha, no un campo aparte: dos fuentes
      // para el mismo hecho es la forma de que se contradigan.
      fechaIngreso: vig?.fechaIngreso ?? null,
      // 🩸 Acá viajaban el SALDO DE VACACIONES escrito a mano y su fecha de
      // corte. Se fueron el 17-sep-2026: los días se CALCULAN desde
      // `fecha_ingreso` —que sí viaja, arriba— con la regla de
      // `vacaciones-corresponden.ts`. Las columnas quedan en la base sin
      // lectores; el candado prohíbe volver a traerlas.
      fechaSalida: vig?.fechaSalida ?? null,
      motivoSalida: vig?.motivoSalida ?? null,
      activo: !tieneBaja(vig),
      /** «Renunció el 12 de agosto de 2026». `null` si sigue trabajando. */
      baja: fraseBaja(vig, ins.hoy),
      marcoDespuesDeLaBaja: marcoDespuesDeLaBaja(vig, ultimaMarca),
      // Derivados, solo para mirar: confirman que los números configurados
      // producen una rata creíble antes de que se calcule ninguna planilla.
      //
      // 🔴 `rataPorHoraCalculo` y NO `rataPorHora`: la primera devuelve la
      // rata A CENTAVOS, que es la que multiplica de verdad en `planilla.ts`.
      // La segunda devuelve 4 decimales y la pantalla enseñaba `$3.0201` donde
      // la planilla de la contable dice `$3.02`. Ver `lib/asistencia/rata.ts`.
      // 🔴 LO QUE DEBE EN PRÉSTAMOS. Se muestra al dar de baja, con nombre y
      // monto: rechazar sí, esconder no — y acá ni siquiera se rechaza nada,
      // solo se dice a tiempo. 0 = no debe.
      deudaPrestamo: ins.deudaPrestamo,
      rataHora: rataPorHoraCalculo(salario, jornada, reglas),
      valorMinuto: valorMinuto(salario, jornada, reglas),
    },
  };
}

/**
 * Las banderas «qué se puede hacer» que la respuesta lleva desde el
 * 3-sep-2026 con valor CONSTANTE (la tolerancia a la DDL pendiente se retiró
 * ese día). Viven acá porque las mandan las DOS rutas y las lee la misma
 * pantalla: escritas dos veces, una podría quedarse atrás de la otra.
 */
export const BANDERAS_DE_CONFIGURACION = {
  faltaMigracion: false,
  avisoMigracion: null,
  avisoMigracionBajas: null,
  puedeDarDeBaja: true,
  avisoMigracionServicioProfesional: null,
  puedeMarcarServicioProfesional: true,
  avisoMigracionSeguros: null,
  puedeQuitarSeguros: true,
  avisoMigracionBaseSeguros: null,
  puedeCargarBaseSeguros: true,
  avisoMigracionNoMarcaReloj: null,
  puedeMarcarSueldoFijo: true,
  avisoMigracionReparto: null,
} as const;
