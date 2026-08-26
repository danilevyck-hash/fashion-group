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
export const APROBACIONES_ROLES = ["admin", "bodega"] as const;

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
  return aprobacionesRoles().filter((r) => !conAsistencia.has(r));
}

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

export function vePestana(rol: string, pestana: string): boolean {
  const esDeAprobacion = (PESTANAS_DE_APROBACION as readonly string[]).includes(pestana);
  return esDeAprobacion
    ? aprobacionesRoles().includes(rol)
    : (ASISTENCIA_ROLES as readonly string[]).includes(rol);
}
