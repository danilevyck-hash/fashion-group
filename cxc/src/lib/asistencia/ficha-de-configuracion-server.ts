/* ─────────────────────────────────────────────────────────────────────────────
 * EL I/O DE LA FICHA — las MISMAS seis fuentes, enteras o de a una persona.
 *
 * La regla (cómo una fila se vuelve una persona) vive en
 * `ficha-de-configuracion.ts` y es UNA sola para los dos caminos. Acá está lo
 * único que de verdad los diferencia: a QUÉ le pregunta cada uno.
 *
 * ── 🩸 POR QUÉ EXISTE EL CAMINO DE UNA PERSONA (14-sep-2026) ─────────────────
 *
 * Abrir `/asistencia/colaboradores/:codigo` pedía la lista COMPLETA y se
 * quedaba con una fila: 6.998 marcaciones de 180 días en 7 páginas de
 * PostgREST, 835 KB, para dibujar a una persona. Medido contra producción ese
 * día: **1.656 ms**; pidiendo solo a esa persona, **189-408 ms** según cuántas
 * veces marcó.
 *
 * 🔴 EL FILTRO VA EN LA CONSULTA, NO EN MEMORIA. Filtrar después de leer todo
 * sería el mismo derroche con otro nombre.
 *
 * ⚠️ Y EL FILTRO ES EXACTO, NUNCA POR PARECIDO: `.eq(codigo)`. El camino de la
 * lista recorta los espacios al leer (`.trim()`), así que un código guardado
 * como « 12 » lo encontraría la lista y no lo encontraría un `.eq("12")`.
 * Medido el 14-sep-2026 sobre las seis tablas —marcaciones, fichas, horarios,
 * repartos, ignorados y préstamos—: **ni un código con espacios a los bordes**.
 * El candado compara los dos caminos persona por persona justamente para que,
 * el día que aparezca uno, el build se ponga rojo antes que la pantalla mienta.
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { leerDeudaPorCodigo } from "@/lib/prestamos-lista-server";
import { diaPanama } from "./reporte";
import { crearDirectorio } from "./directorio";
import { agruparPorCodigo, TABLA_REPARTO, type FilaReparto } from "./reparto";
import { TABLA_CODIGOS_IGNORADOS } from "./codigos-ignorados";
import {
  leerReglas,
  leerPersonas,
  leerTrabajaAfuera,
  TABLA_PERSONAS,
  DIAS_VENTANA_PERSONAS,
  type FilaPersonaDb,
} from "./config-server";
import {
  agruparMarcas,
  type FilaMarca,
  type InsumosDeUnaPersona,
} from "./ficha-de-configuracion";

/** El arranque de la ventana de marcaciones. La MISMA de la lista: una pantalla
 *  que ve 180 días y otra que ve 90 mostrarían universos distintos. */
export function arranqueDeLaVentana(ahora = Date.now()): string {
  return new Date(ahora - DIAS_VENTANA_PERSONAS * 86_400_000).toISOString();
}

/**
 * Las marcaciones de la ventana. Sin `codigo`, todas (lo que lee la lista);
 * con `codigo`, solo las de esa persona.
 *
 * ⚠️ Paginado y verificado contra el COUNT en los dos casos: PostgREST corta en
 * 1.000 filas EN SILENCIO. Para una persona hoy son ~130 en 180 días y una sola
 * página alcanza, pero el que se quede sin paginar es el que un día pierde
 * días enteros sin avisar.
 */
export function leerMarcasDeLaVentana(desde: string, codigo?: string): Promise<FilaMarca[]> {
  return leerTodoPaginado<FilaMarca>(
    codigo ? "asistencia_marcaciones (una persona)" : "asistencia_marcaciones (configuración)",
    (pedirCount, from, to) => {
      const q = supabaseServer
        .from("asistencia_marcaciones")
        .select(
          "empleado_codigo, empleado_nombre, ocurrio_en, dispositivo",
          pedirCount ? { count: "exact" } : {},
        )
        .gte("ocurrio_en", desde);
      return (codigo ? q.eq("empleado_codigo", codigo) : q)
        .order("ocurrio_en", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
    },
  );
}

/** Los códigos con fila en `asistencia_horarios`. `null` si no se pudo leer. */
export async function leerCodigosConHorario(): Promise<Set<string> | null> {
  const { data, error } = await supabaseServer
    .from("asistencia_horarios")
    .select("empleado_codigo");
  if (error) return null;
  return new Set((data ?? []).map((h) => String(h.empleado_codigo ?? "").trim()).filter(Boolean));
}

/**
 * ¿ESTA persona tiene horario? `null` = no se pudo leer.
 *
 * 🔑 Falla ABIERTA igual que la de la lista: sin lectura, `null`, y no se acusa
 * a nadie de que le falta el horario.
 */
export async function tieneHorarioDe(codigo: string): Promise<boolean | null> {
  const { data, error } = await supabaseServer
    .from("asistencia_horarios")
    .select("empleado_codigo")
    .eq("empleado_codigo", codigo);
  if (error) return null;
  return (data ?? []).length > 0;
}

/** ¿Este código está escondido? Misma regla que `leerIgnorados`, una fila.
 *  🔑 Falla ABIERTA: si no se puede leer, no se esconde a nadie. */
export async function estaIgnoradoEnLaBase(codigo: string): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from(TABLA_CODIGOS_IGNORADOS)
    .select("empleado_codigo")
    .eq("empleado_codigo", codigo)
    .eq("activo", true);
  if (error) return false;
  return (data ?? []).length > 0;
}

/** Las filas de reparto de UNA persona. Mismo `select` y mismo orden. */
export async function leerRepartoDe(codigo: string): Promise<FilaReparto[]> {
  const { data, error } = await supabaseServer
    .from(TABLA_REPARTO)
    .select("empleado_codigo, empresa, salario_mensual, paga_seguros, paga_horas_extra, orden")
    .eq("empleado_codigo", codigo)
    // 🔑 El MISMO orden que la lectura completa: de él sale el orden de las
    // partes que la pantalla enseña.
    .order("empleado_codigo", { ascending: true })
    .order("empresa", { ascending: true });
  // 🔴 Un error acá es un error, igual que en `leerRepartos`: degradar a «no
  // reparte» convertiría un timeout en una planilla de más.
  if (error) throw new Error(`No se pudieron leer los repartos: ${error.message}`);
  return (data ?? []) as unknown as FilaReparto[];
}

/** La ficha de UNA persona. `undefined` = el código marca y nadie dijo quién es. */
export async function leerFichaDe(codigo: string): Promise<FilaPersonaDb | undefined> {
  // 🔑 Se piden las MISMAS columnas que la lista, y por el mismo camino: se
  // reusa `leerPersonas` acotado, no un `select` escrito de nuevo — dos listas
  // de columnas para la misma ficha es cómo una pantalla pierde una casilla.
  const { filas } = await leerPersonas(codigo);
  return filas.find((f) => String(f.empleado_codigo) === codigo);
}

/**
 * 🔴 TODO LO QUE HACE FALTA PARA UNA PERSONA, EN UN SOLO VIAJE EN PARALELO.
 *
 * Devuelve `null` cuando el código está IGNORADO, que es exactamente lo que ve
 * hoy la página: la lista lo filtra con `sinIgnorados` y el `find` no lo
 * encuentra. Que la respuesta sea la misma no es casualidad — es lo que el
 * candado exige.
 */
export async function leerInsumosDeUnaPersona(
  codigo: string,
  ahora = Date.now(),
): Promise<(InsumosDeUnaPersona & { trabajaAfuera: boolean }) | null> {
  const desde = arranqueDeLaVentana(ahora);
  const [marcas, { reglas }, ficha, filasReparto, deudaDe, conHorario, ignorado, afuera] =
    await Promise.all([
      leerMarcasDeLaVentana(desde, codigo),
      leerReglas(),
      leerFichaDe(codigo),
      leerRepartoDe(codigo),
      // 🔑 La MISMA función de la lista, acotada a este código: el saldo se
      // suma con `calcularSaldoPrestamo` en un solo lugar. Nunca tumba esta
      // pantalla — si Préstamos no contesta, el mapa viene vacío.
      leerDeudaPorCodigo(codigo),
      tieneHorarioDe(codigo),
      estaIgnoradoEnLaBase(codigo),
      // 🔴 QUIÉN TRABAJA AFUERA (14-sep-2026). La MISMA lectura que usa la
      // lista, y por el mismo motivo se queda AFUERA de
      // `armarPersonaDeConfiguracion`: su columna se lee aparte porque la
      // migración puede no estar aplicada, y ahí el conjunto viene vacío.
      // ⚠️ Es la única de las siete que no se acota por código — son 48 filas de
      // dos columnas y va en paralelo con las demás, así que no cuesta tiempo;
      // acotarla sería tocar una función que no es de este cambio.
      leerTrabajaAfuera(),
    ]);

  if (ignorado) return null;

  const visto = agruparMarcas(marcas).get(codigo);

  // 🔴 EL UNIVERSO ES «CÓDIGOS DEL RELOJ ∪ FICHAS GUARDADAS», IGUAL QUE EN LA
  // LISTA. Sin ficha y sin una sola marcación, este código no es nadie: la
  // lista nunca lo arma y el `find` de la página devolvía `undefined`. Sin esta
  // línea, un código inventado en la dirección contestaba una ficha en blanco
  // —con `jornadaSemanal: 48`, `pagaSeguros: true` y todo— que se veía como una
  // persona real sin configurar. Lo cazó el candado, no una pantalla.
  if (!ficha && !visto) return null;

  return {
    codigo,
    visto,
    ficha,
    // El MISMO traductor de siempre, armado con la única ficha que hay: la
    // regla de respaldo —sin nombre, el código— sigue viviendo en un solo lugar.
    directorio: crearDirectorio(ficha ? [ficha] : []),
    reglas,
    filasReparto: agruparPorCodigo(filasReparto).get(codigo),
    deudaPrestamo: deudaDe.get(codigo) ?? 0,
    tieneHorario: conHorario,
    trabajaAfuera: afuera.has(codigo),
    // El día de hoy en Panamá. Solo decide cómo se REDACTA la baja.
    hoy: diaPanama(new Date(ahora).toISOString()),
  };
}

export { TABLA_PERSONAS };
