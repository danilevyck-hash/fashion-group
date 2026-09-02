// ─────────────────────────────────────────────────────────────────────────────
// Quién puede usar Asistencia — UNA sola lista.
//
// 🩸 Estaba escrita a mano en cada ruta (`["admin", "secretaria"]` × 6 archivos)
// más otra copia en `modules.ts`. Es exactamente la forma del bug que dejó a
// Tommy sin vendedor de Switch: varias listas iguales, y agregar un rol obliga
// a acordarse de todas. Acá se agrega en un lugar.
//
// `contabilidad` entra el 6-ago-2026 por pedido de Daniel: la planilla quincenal
// la arma la contable a mano, y los minutos de tardanza, las horas extra y las
// ausencias que necesita para llenarla salen de este módulo.
//
// ⚠️ La lista de `modules.ts` es la NAVEGACIÓN (qué tarjeta se ve); la de las
// rutas es el CANDADO. Esconder la tarjeta no cierra nada —cualquiera con el
// módulo entra por URL—, así que las dos tienen que decir lo mismo y hay un
// test que lo exige.
// ─────────────────────────────────────────────────────────────────────────────

import { ROL_BOSTON } from "@/lib/boston/rol";

export const ASISTENCIA_ROLES = ["admin", "secretaria", "contabilidad"] as const;

export function asistenciaRoles(): string[] {
  return [...ASISTENCIA_ROLES];
}

// ─────────────────────────────────────────────────────────────────────────────
// QUIÉN APRUEBA LAS HORAS EXTRA
//
// Daniel, textual: *«que en el usuario de julio y daniel haya un tab para
// aprobaciones»*. Son DOS personas, y hoy solo una tiene con qué entrar.
//
// 🔴 JULIO GARAY NO TIENE USUARIO EN EL SISTEMA (medido el 26-ago-2026 contra
// `fg_users`: 10 usuarios, ninguno es él). Es el empleado código 11 de
// `asistencia_personas`, empresa VISTANA — pero eso es una FICHA DE PLANILLA,
// no una cuenta. Crearle una es decisión de Daniel, no de quien escribe esto.
//
// ⚠️ POR ESO ACÁ DICE SOLO `admin` Y NO UN ROL NUEVO. Inventar un rol
// `supervisor` vacío, o meter a Julio en `secretaria` —que abre Asistencia
// ENTERA, con los salarios de todo el mundo— serían las dos formas de resolver
// esto mal. El día que Daniel decida qué cuenta tiene Julio, este arreglo es
// agregar su rol a esta línea y nada más.
//
// 🔑 Lo que NO está acá igual se ve: el aviso ámbar de las horas que no se
// pagaron vive en la Planilla y lo lee cualquiera con Asistencia —incluida la
// contadora—. Aprobar es lo restringido; enterarse, no.
// 🔑 `contabilidad` entra el 27-ago-2026 por pedido de Daniel: *«que
// contabilidad tambien pueda aprobar»*. Es quien arma la planilla, así que ya
// veía el aviso de lo que quedó sin aprobar — ahora además puede destrabarlo
// sin tener que buscar a alguien.
//
// ⚠️ NO entra en `soloApruebaRoles()`: contabilidad YA está en
// `ASISTENCIA_ROLES`, así que sigue viendo el módulo completo como siempre. La
// lista de abajo se deriva justamente para que este matiz no haya que
// acordárselo.
// 🔑 `gerente_boston` entra el 31-ago-2026: David aprueba las horas extra de las
// 21 personas de SU empresa, y de ninguna otra. El reparto por empresa vive en
// `asistencia_aprobador_empresa`, no acá — esta lista dice QUIÉN puede aprobar;
// la tabla, DE QUIÉN.
export const APROBACIONES_ROLES = ["admin", "bodega", "contabilidad", ROL_BOSTON] as const;

export function aprobacionesRoles(): string[] {
  return [...APROBACIONES_ROLES];
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 QUIEN APRUEBA PERO **NO** ENTRA A ASISTENCIA — el caso de Julio Garay.
//
// Daniel, 26-ago-2026, textual: *«julio usa el usuario bodega, asi que ponlo
// ahi»*. Y ahí está el problema que hay que resolver ANTES de darle el módulo:
//
//   1. `Bodega` NO es Julio: es un usuario COMPARTIDO. Lo que se le abre a esa
//      cuenta se le abre a cualquiera que la use.
//   2. Entrar a Asistencia hoy significa ver la PLANILLA: el sueldo de las 38
//      personas, una por una. Julio necesita autorizar horas extra, no saber
//      cuánto gana cada quien.
//
// Por eso `bodega` entra a `APROBACIONES_ROLES` y **NO** a `ASISTENCIA_ROLES`.
// Esta lista es la diferencia entre las dos, y de ella salen las tres cosas que
// lo hacen cierto:
//
//   · la NAVEGACIÓN — solo ve la pestaña Aprobaciones (`AsistenciaClient`);
//   · el CANDADO — las otras diez rutas de `/api/asistencia/*` siguen exigiendo
//     `asistenciaRoles()` y le responden 403;
//   · 🔑 el RECORTE — `/api/asistencia/planilla` es la única que sí necesita,
//     porque de ahí salen las horas de cada persona. A quien está en esta lista
//     le contesta SIN el bloque de dinero. Esconderlo en la pantalla no
//     alcanzaría: el sueldo viajaría igual en el JSON.
//
// ⚠️ Se DERIVA, no se escribe a mano. Una cuarta lista que hubiera que
// acordarse de tocar es exactamente el bug que `ASISTENCIA_ROLES` vino a matar.
export function soloApruebaRoles(): string[] {
  const conAsistencia = new Set<string>(ASISTENCIA_ROLES);
  return aprobacionesRoles().filter((r) => !conAsistencia.has(r) && r !== ROL_BOSTON);
}

// 🔴 POR QUÉ `gerente_boston` SE EXCLUYE DE ARRIBA, Y NO ES UN CASO ESPECIAL
// GRATUITO. `soloApruebaRoles()` significa «entra a Asistencia SOLO para
// aprobar, así que la planilla le contesta sin el bloque de dinero». Eso es
// cierto de `bodega` —Julio no tiene otro motivo para estar ahí— y es FALSO de
// David: él tiene su propia pantalla de planilla en /boston, con las 18 columnas
// de plata que Daniel abrió el 31-ago. Sin esta línea, agregarlo a
// `APROBACIONES_ROLES` le habría vaciado esa pantalla el mismo día.
//
// ⚠️ Lo que a él SÍ le recorta la ruta es otra cosa y sigue intacto:
// `planillaSinDinero`, que deriva de `VE_SUELDOS_DE_BOSTON`.

/** ¿Este rol entra a Asistencia SOLO para aprobar horas extra? */
export function soloAprueba(rol: string): boolean {
  return soloApruebaRoles().includes(rol);
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 QUÉ PESTAÑAS VE CADA ROL — la regla, en un solo lugar y sin navegador.
//
// 🩸 Vivía como una expresión adentro de `AsistenciaClient.tsx` y NINGÚN test
// la tocaba: se pudo cambiar por la versión vieja —la que le muestra la
// Planilla, con los 38 sueldos, a quien solo aprueba— y toda la suite siguió
// en verde. Un barrido de texto tampoco servía: el archivo NOMBRA lo que
// prohíbe. Acá es una función pura y hay mutación que lo prueba.
//
// Las dos preguntas son independientes y hay que hacer las DOS:
//   · ¿es una pestaña de aprobación? → la ve quien aprueba;
//   · ¿es cualquier otra?            → la ve quien tiene Asistencia.
// `admin` contesta que sí a las dos, y por eso ve todo — pero eso es una
// CONSECUENCIA de la regla, no un caso especial escrito a mano.
// ─────────────────────────────────────────────────────────────────────────────

/** Las pestañas que son solo de quien aprueba horas extra. */
export const PESTANAS_DE_APROBACION = ["aprobaciones"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 PESTAÑAS APAGADAS — 1-sep-2026, VACACIONES.
//
// Daniel, textual: *«olvida lo de las vacaciones por ahora, quitalo del ERP
// para no enrredar»*. Se está trabajando el flujo de generar y cerrar la
// planilla, y una pestaña más en el medio es ruido mientras eso se decide.
//
// 🔴 «QUITAR» ES **SOLO LA PANTALLA**. EL MOTOR SIGUE HONRANDO LAS VACACIONES
// QUE YA ESTÁN CARGADAS, y esto no es una sutileza: hay DOS filas vivas en
// producción, las dos de ELOYN MENDOZA (código 29, fashion_wear) — 16-jul →
// 13-ago-2026 y 14-ago-2026, ninguna marcada «ya se le pagó». Hoy esos días no
// le cuestan un centavo porque el motor los reconoce y el quincenal los cubre.
// El día que alguien deje de LEER `asistencia_vacaciones` en el cálculo, esos
// mismos días pasan a contarse como AUSENCIA —ella no marcó— y la planilla le
// come una quincena entera EN SILENCIO. Por eso acá no se tocó una sola línea
// del motor: ni `reporte.ts`, ni `planilla.ts`, ni `vacaciones.ts`, ni la ruta
// `/api/asistencia/planilla`. La tabla, los datos, las migraciones, la ruta
// `/api/asistencia/vacaciones` y `VacacionesTab.tsx` quedan **enteros**.
//
// 🔑 POR QUÉ UNA CONSTANTE Y NO BORRAR LA PESTAÑA DEL ARREGLO `TABS`: volver a
// encenderla tiene que ser **borrar una línea**, no reconstruir el import, el
// render, el orden y los tests. La pestaña sigue declarada, su componente
// sigue montado en el archivo y su API sigue viva: lo único que cambia es que
// nadie la ve. Se apaga acá —y no en `AsistenciaClient`— porque éste es el
// único lugar donde ya se contesta «¿esta persona ve esta pestaña?», y así el
// `?tab=vacaciones` de un marcador cae solo en la pestaña por defecto (la
// pantalla filtra por `vePestana` ANTES de resolver la URL).
//
// ⚠️ Es una lista y no un booleano a propósito: la próxima que haya que apagar
// se agrega acá y no inventa un segundo mecanismo.
// Candado: `src/__tests__/lib/asistencia-pestanas.test.ts`.
//
// ── 🔴 QUÉ HAY QUE ARREGLAR **ANTES** DE VOLVER A ENCENDERLA ─────────────────
//
// No la apagó una duda de negocio: la apagó un TEXTO que confunde. Daniel, con
// la pantalla delante, textual: *«me enrreda lo de Ya se le pagó / Se le pagan
// estos días»*. Y tiene razón — es un defecto de REDACCIÓN, no de lógica.
// Desmarcada, el interruptor se lee así:
//
//     ☐ Ya se le pagó
//       Se le pagan estos días.
//
// El título es el ESTADO y la línea de abajo es la CONSECUENCIA de cómo está la
// casilla AHORA (`efectoDelInterruptor` sí cambia al marcarla, más abajo en
// `vacaciones.ts`). Pero juntas y desmarcadas se leen como UNA sola frase que se
// contradice: dice «ya se le pagó» y abajo «se le pagan». Quien carga la
// vacación tiene que adivinar cuál de las dos manda — y de eso depende que a
// alguien se le descuente media quincena.
//
// EL ARREGLO PROPUESTO, y que Daniel dejó anotado para cuando se reactive:
//
//     ☐ ¿Ya cobró estos días antes?
//       Sí → no se le pagan, ya los cobró.
//
// …con la línea de abajo visible **SOLO cuando está marcada**, que es el caso
// raro y el ÚNICO que mueve plata. Una pregunta se contesta; un estado hay que
// interpretarlo.
//
// ⚠️ NO SE IMPLEMENTÓ, A PROPÓSITO. Se le ofrecieron las dos salidas —arreglar
// el texto ahora, u ocultar la pestaña— y eligió ocultarla mientras se trabaja
// la planilla. `efectoDelInterruptor` y el JSX de `VacacionesTab.tsx` quedaron
// EXACTAMENTE como estaban: cambiar el texto de una pantalla que nadie ve sería
// un cambio sin nadie que lo revise.
// ─────────────────────────────────────────────────────────────────────────────
export const PESTANAS_OCULTAS = ["vacaciones"] as const;

export function vePestana(rol: string, pestana: string): boolean {
  // Apagada para TODOS, admin incluido: no es un permiso, es una pantalla que
  // por ahora no se muestra.
  if ((PESTANAS_OCULTAS as readonly string[]).includes(pestana)) return false;
  const esDeAprobacion = (PESTANAS_DE_APROBACION as readonly string[]).includes(pestana);
  return esDeAprobacion
    ? aprobacionesRoles().includes(rol)
    : (ASISTENCIA_ROLES as readonly string[]).includes(rol);
}
