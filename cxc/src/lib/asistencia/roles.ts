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
export const APROBACIONES_ROLES = ["admin"] as const;

export function aprobacionesRoles(): string[] {
  return [...APROBACIONES_ROLES];
}
