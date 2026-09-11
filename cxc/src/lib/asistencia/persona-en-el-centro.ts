// ─────────────────────────────────────────────────────────────────────────────
// LA PERSONA EN EL CENTRO — el acomodo del módulo de Asistencia (10-sep-2026)
//
// Daniel, textual, al aprobar el mockup v6: *«sí me gustó, para editar una info
// como seguros, que sea con Editar»*. Y sobre el nombre de la pestaña:
// *«te acepto la queja»* — «Configuración» se llama **Personas**.
//
// 🔴 Y DESDE EL 10-SEP-2026 SE LLAMA **COLABORADORES**. Daniel, textual: *«no lo
// llames personas, sino colaboradores»*. Cambia el RÓTULO, la clave de la URL
// (`?tab=colaboradores`) y la dirección de la página (`/asistencia/colaboradores/`).
// Los identificadores de código, las tablas (`asistencia_personas`) y el
// `persona=<código>` de Aprobaciones NO cambian: son nombres internos, no texto
// que alguien lea. `?tab=personas` y `/asistencia/personas/7` siguen llegando.
//
// 🔴 QUÉ CAMBIA Y QUÉ NO. Esto es REUBICAR Y PRESENTAR, no un modelo nuevo:
// las tablas, los endpoints y los cálculos son exactamente los de hoy. Lo único
// aditivo es la foto de la cédula.
//
// El acomodo de hoy son SEIS pestañas de primer nivel (siete con Préstamos
// prendido), y cuatro de ellas son LISTAS DE TODOS: todas las personas, todas
// las justificaciones, todas las vacaciones, todos los días. Para contestar
// «¿qué pasa con Alejandra?» —la pregunta que de verdad se hace— hay que
// visitar cuatro pestañas y buscar su nombre en cada una.
//
// Después: la persona tiene UNA página, y ahí está todo lo suyo.
//
// ⚠️ NO SE PIERDE LA VISTA GLOBAL, y cada una se muda a donde de verdad
// pertenece (ver `MUDANZA`, más abajo): las justificaciones del período a
// **Reporte** —explican sus ausencias— y el saldo de vacaciones de todos a
// **Personas**, como una columna y un chip. Una función que se retira de la
// pantalla se mide antes; ninguna de estas dos se retira.
//
// 🔴 TODO CUELGA DE UN INTERRUPTOR QUE ARRANCA APAGADO. Con
// `NEXT_PUBLIC_PERSONA_EN_EL_CENTRO` sin prender, el módulo es EXACTAMENTE el
// de hoy: las mismas pestañas, en el mismo orden, con el mismo aterrizaje. Es
// la regla de la casa para lo que cambia una pantalla que se usa a diario.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿Está prendido el acomodo nuevo?
 *
 * 🔑 SE LEE LA VARIABLE COMPLETA, NO SE DESESTRUCTURA. Next reemplaza
 * `process.env.NEXT_PUBLIC_*` como TEXTO al compilar, así que
 * `const { NEXT_PUBLIC_X } = process.env` no se reemplaza y en el navegador da
 * `undefined` — o sea, el interruptor quedaría apagado para siempre del lado
 * del cliente sin que nadie se entere. Es el mismo cuidado de
 * `planilla-unida.ts`.
 */
export function personaEnElCentroPrendida(): boolean {
  const v = process.env.NEXT_PUBLIC_PERSONA_EN_EL_CENTRO;
  return v === "1" || v === "true";
}

/** El valor ya resuelto, para quien solo quiere preguntar. */
export const PERSONA_EN_EL_CENTRO = personaEnElCentroPrendida();

// ─────────────────────────────────────────────────────────────────────────────
// LAS PESTAÑAS
//
// ⚠️ EL ORDEN NO ES COSMÉTICO: la pantalla aterriza en la PRIMERA que el rol
// puede ver, así que esta lista decide dónde cae cada persona al entrar.
// ─────────────────────────────────────────────────────────────────────────────

export type ClavePestana =
  | "colaboradores" | "asistencia" | "reporte" | "planilla" | "prestamos"
  | "justificaciones" | "vacaciones" | "aprobaciones" | "configuracion";

export type Pestana = readonly [ClavePestana, string];

/**
 * EL ACOMODO DE HOY — el que se ve con el interruptor apagado. No se toca.
 * Préstamos entra solo si `PLANILLA_UNIDA` está prendido (lo filtra el que
 * llama, ver `pestanasDeAsistencia`).
 */
export const PESTANAS_HOY: readonly Pestana[] = [
  ["reporte", "Reporte"],
  ["planilla", "Planilla"],
  ["prestamos", "Préstamos"],
  ["justificaciones", "Justificaciones"],
  ["vacaciones", "Vacaciones"],
  ["aprobaciones", "Aprobaciones"],
  ["configuracion", "Configuración"],
] as const;

/**
 * EL ACOMODO NUEVO — cuatro pestañas (cinco con Préstamos prendido).
 *
 * 🔴 COLABORADORES PRIMERA (era «Personas» hasta el 10-sep-2026), y es todo el punto: el módulo abre en la gente, no en un
 * cuadro. Desde ahí se entra a la persona y ahí está todo lo suyo.
 *
 * 🔴 REPORTE PASA AL FINAL, y este es el cambio que hay que mirar dos veces.
 * Desde el 2-sep-2026 Reporte era el PRIMERO por un motivo escrito: *«primero
 * se ORDENA la asistencia y recién después se PAGA»*. Ese motivo NO desapareció
 * — lo que cambió es que ordenar la asistencia de una persona ya no se hace en
 * Reporte, se hace en SU página (justificar, ver sus días, cargarle vacaciones).
 * Reporte se queda con lo que solo él sabe hacer: la mirada de CONJUNTO del
 * período —y las justificaciones que la explican—.
 *
 * ⚠️ Préstamos NO se retira. Se ganó su lugar el 10-sep-2026 por plata medida
 * (9 descuentos por $360 en el módulo contra 7 por $265 en la casilla de la
 * planilla) y sigue pegada a Planilla, que es la misma plata y el mismo día de
 * trabajo. La página de la persona muestra lo SUYO; la pestaña, el conjunto.
 */
export const PESTANAS_PERSONA_EN_EL_CENTRO: readonly Pestana[] = [
  // 🔴 «Reporte pasa a llamarse Asistencia. Tu orden» (Daniel, 10-sep-2026,
  // noche). El orden es el del TRABAJO: primero la gente, después lo que marcó
  // el reloj, después lo que se aprueba, después lo que se paga.
  ["colaboradores", "Colaboradores"],
  ["asistencia", "Asistencia"],
  ["aprobaciones", "Aprobaciones"],
  ["planilla", "Planilla"],
  ["prestamos", "Préstamos"],
] as const;

/**
 * Las pestañas que se dibujan, ya resueltas por los DOS interruptores.
 *
 * 🔴 CON `planillaUnida` APAGADO, PRÉSTAMOS NO EXISTE — ni en la barra ni por
 * la URL. Es la regla que ya tenía el módulo y no cambia.
 */
export function pestanasDeAsistencia(opts: {
  personaEnElCentro: boolean;
  planillaUnida: boolean;
}): readonly Pestana[] {
  const base = opts.personaEnElCentro ? PESTANAS_PERSONA_EN_EL_CENTRO : PESTANAS_HOY;
  return base.filter(([k]) => (k === "prestamos" ? opts.planillaUnida : true));
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS DIRECCIONES VIEJAS SIGUEN LLEGANDO A ALGÚN LADO
//
// 🔴 Nadie se queda mirando una pantalla en blanco porque tenía un enlace
// guardado. `?tab=configuracion` de un favorito, o el `?tab=justificaciones`
// que alguien mandó por WhatsApp, tienen que aterrizar donde ahora vive eso.
//
// 🔴 CADA UNA CAE DONDE DE VERDAD SE MUDÓ, y no las dos al mismo lado
// (10-sep-2026). Daniel, corrigiendo la primera versión de este cambio:
// *«Reporte es para otra cosa»*.
//
//   · JUSTIFICACIONES → **Reporte**. Una justificación EXPLICA una ausencia del
//     reporte: es la misma pregunta, mirada desde el otro lado. Va como una
//     vista propia al lado de la tabla («Justificaciones del período»), no
//     mezclada adentro ni como un bloque suelto.
//
//   · VACACIONES → **Personas**. Lo que se miraba en esa pestaña era el SALDO
//     de cada quien, y un saldo es un dato DE LA PERSONA, no del período: por
//     eso ahora es una columna de la lista y un chip «Sin saldo (N)» para
//     filtrar. El bloque de aviso «38 personas no tienen saldo…» desaparece
//     como bloque y se vuelve ese filtro — se puede TOCAR, que es lo que un
//     aviso nunca pudo.
//
// ⚠️ En los dos casos lo que se mudó es MIRAR. **Agregar** una justificación o
// una vacación se hace desde la persona, con el mismo formulario de siempre y
// la persona ya puesta.
// ─────────────────────────────────────────────────────────────────────────────

const MUDANZA: Readonly<Record<string, ClavePestana>> = Object.freeze({
  configuracion: "colaboradores",
  justificaciones: "asistencia",
  // 🔴 «Reporte» se llama «Asistencia» desde el 10-sep-2026 (noche): el enlace
  // viejo (`?tab=reporte`, y el de la sección de la ficha) sigue llegando.
  reporte: "asistencia",
  vacaciones: "colaboradores",
  // 🔴 `personas` fue la clave de esta misma pestaña del 10-sep-2026 (mañana) al
  // 10-sep-2026 (tarde), cuando Daniel pidió «colaboradores». Un enlace guardado
  // con `?tab=personas` sigue cayendo aquí.
  personas: "colaboradores",
});

/**
 * 🔴 CON QUÉ ABRE EL MÓDULO cuando la URL no dice nada.
 *
 * Apagado: **Reporte**, exactamente como hoy (Daniel, 2-sep-2026: *«primero va
 * reporte, ¿por qué es el segundo tab?»*).
 * Prendido: **Colaboradores**, que es el punto entero del acomodo nuevo — el módulo
 * abre en la gente y desde ahí se entra a cada quien.
 *
 * 🔑 No alcanza con que sea la primera de la lista: el valor por defecto de la
 * URL se resuelve ANTES de saber qué ve este rol, así que tiene que decirse
 * acá. Lo que el rol puede ver lo filtra después `pestanaQueSeAbre`.
 */
export function pestanaPorDefecto(personaEnElCentro: boolean): ClavePestana {
  return personaEnElCentro ? "colaboradores" : "reporte";
}

/**
 * A qué pestaña lleva una clave de la URL con el acomodo nuevo prendido.
 * Devuelve `null` cuando la clave no se mudó (o no se reconoce) y el que llama
 * tiene que resolverlo como siempre: por defecto, nunca en blanco.
 */
export function pestanaMudada(clave: string | null | undefined): ClavePestana | null {
  const k = String(clave ?? "").trim();
  return MUDANZA[k] ?? null;
}

/**
 * La pestaña que se va a mostrar, resolviendo la mudanza y cayendo en la que
 * corresponda cuando la clave no existe. **Nunca devuelve vacío.**
 *
 * @param clave     lo que trae la URL (puede ser basura)
 * @param visibles  las pestañas que este rol sí puede ver, en orden
 */
export function pestanaQueSeAbre(
  clave: string | null | undefined,
  visibles: readonly Pestana[],
): ClavePestana {
  const porDefecto = (visibles[0]?.[0] ?? "reporte") as ClavePestana;
  const k = String(clave ?? "").trim();
  const puedeVer = (c: string) => visibles.some(([v]) => v === c);
  if (puedeVer(k)) return k as ClavePestana;
  const mudada = pestanaMudada(k);
  if (mudada && puedeVer(mudada)) return mudada;
  return porDefecto;
}

// ─────────────────────────────────────────────────────────────────────────────
// LA DIRECCIÓN DE UNA PERSONA
//
// Ruta propia, como la ficha del cliente (`/clientes/[codigo]`): se puede
// compartir, se puede volver con el Atrás del navegador y el refresco no la
// pierde. 🔑 La identidad es el CÓDIGO, nunca el nombre.
// ─────────────────────────────────────────────────────────────────────────────

// 🔴 `/asistencia/colaboradores` desde el 10-sep-2026 (Daniel: *«no lo llames
// personas, sino colaboradores»*). La vieja, `/asistencia/personas/[codigo]`,
// redirige 307 con la query intacta desde `next.config.js`, como `/cheques` →
// `/recordatorios`. El nombre de la constante se queda: es un identificador.
export const RUTA_PERSONAS = "/asistencia/colaboradores";
/** La dirección que tuvo la página hasta el 10-sep-2026; solo para el redirect y su candado. */
export const RUTA_PERSONAS_VIEJA = "/asistencia/personas";

/** `/asistencia/colaboradores/7`. El código va codificado: puede traer cualquier cosa. */
export function rutaDePersona(codigo: string): string {
  return `${RUTA_PERSONAS}/${encodeURIComponent(String(codigo).trim())}`;
}

/** La dirección para dar de alta a alguien que todavía no tiene ficha. */
export const RUTA_PERSONA_NUEVA = `${RUTA_PERSONAS}/nueva`;

/**
 * 🔴 UNA PERSONA NUEVA ABRE DIRECTO EN EDITAR. Mostrarle a alguien una ficha
 * vacía en modo texto —«—», «—», «—»— y pedirle que además toque «Editar» es
 * un paso de más para decir lo que la pantalla ya sabe: acá no hay nada
 * cargado todavía.
 *
 * @param codigo   el de la URL. `"nueva"` = alta.
 * @param existe   ¿esa ficha ya está guardada?
 */
export function abreEnEditar(codigo: string, existe: boolean): boolean {
  return esPersonaNueva(codigo) || !existe;
}

/**
 * 🔴 CÓMO SE LLAMA LA PESTAÑA DONDE VIVEN LAS FICHAS (10-sep-2026). Los avisos
 * («se arregla en …», «se le da de alta en …») la NOMBRAN, y con el acomodo
 * nuevo esa pestaña es «Colaboradores», no «Configuración». Un aviso que manda a
 * una pestaña que no existe manda a buscar algo que no está. Daniel, sobre el
 * saldo de vacaciones: el aviso decía «Se cargan en Configuración».
 */
export function nombrePestanaFichas(prendido = PERSONA_EN_EL_CENTRO): string {
  return prendido ? "Colaboradores" : "Configuración";
}
export const PESTANA_FICHAS = nombrePestanaFichas();

/** «en la ficha de cada colaborador» / «en Configuración»: dónde se carga un dato de la ficha. */
export function dondeSeCargaLaFicha(prendido = PERSONA_EN_EL_CENTRO): string {
  return prendido ? "en la ficha de cada colaborador" : "en Configuración";
}

export function esPersonaNueva(codigo: string | null | undefined): boolean {
  return String(codigo ?? "").trim().toLowerCase() === "nueva";
}
