// ─────────────────────────────────────────────────────────────────────────────
// DE QUÉ EMPRESAS PUEDE APROBAR CADA UNO — la regla, sin base ni red.
//
// 🩸 Hasta el 31-ago-2026 no existía la pregunta: quien podía aprobar aprobaba a
// las 40 personas de las tres empresas. Medido en producción, Julio —empleado de
// VISTANA, que entra con la cuenta compartida `Bodega`— había aprobado **57 días
// de Confecciones Boston**, que no le corresponden.
//
// Reparto de Daniel: david → boston · Bodega (Julio) → fashion_wear + vistana ·
// admin → las tres.
// ─────────────────────────────────────────────────────────────────────────────

import { EMPRESAS_ASISTENCIA } from "./config";
import { puedeCerrar } from "./roles";

/** Una fila de `asistencia_aprobador_empresa`. */
export interface AsignacionAprobador {
  usuario: string;
  empresa: string;
}

export interface AlcanceAprobador {
  /** `null` = las tres. Un Set = exactamente esas. Vacío = ninguna. */
  empresas: ReadonlySet<string> | null;
  /**
   * SIEMPRE `false` desde el 3-sep-2026. Historia: era `true` cuando la tabla
   * todavía no existía y con eso nadie quedaba segmentado. Tolerancia retirada:
   * la tabla existe desde 20260903120000_asistencia_aprobador_empresa.sql. Se
   * conserva en el tipo porque las rutas lo leen para el aviso.
   */
  faltaTabla: boolean;
}

/** Los nombres se comparan sin distinguir mayúsculas: `Bodega` ≡ `bodega`. */
const clave = (s: string) => s.trim().toLowerCase();

/**
 * 🔴 `admin` PASA SIEMPRE, sin filas y sin mirar la tabla.
 *
 * Es la MISMA regla que `requireRole` («Admin always passes») y que
 * `getVisibleModules`. Escribirle filas sería una cuarta lista que habría que
 * acordarse de tocar el día que se agregue una empresa.
 */
export function alcanceDe(
  rol: string,
  usuario: string | undefined,
  filas: readonly AsignacionAprobador[],
): AlcanceAprobador {
  if (rol === "admin") return { empresas: null, faltaTabla: false };
  // 🔴 QUIEN CIERRA LA PLANILLA VE LAS TRES EMPRESAS, BOSTON INCLUIDA.
  //
  // Daniel, 10-sep-2026: *«una sola persona cierra todo»* — la contadora arma y
  // cierra la planilla de las tres. Este reparto nació para los APROBADORES de
  // horas extra (🩸 Julio había aprobado 57 días de Boston que no le tocaban) y
  // para ellos sigue igual; pero segmentar a quien firma el pago de las tres
  // empresas es dejar su alcance colgando de una fila de configuración que, si
  // alguien borra, le quita Boston EN SILENCIO.
  //
  // ⚠️ Se pregunta por lo que HACE el rol (`puedeCerrar`), no por su nombre:
  // así el día que entre otro rol que cierre, esto no hay que acordárselo.
  if (puedeCerrar(rol)) return { empresas: null, faltaTabla: false };
  // 🔴 QUIEN CIERRA LA PLANILLA VE LAS TRES EMPRESAS, BOSTON INCLUIDA.
  //
  // Daniel, 10-sep-2026: *«una sola persona cierra todo»* — la contadora arma y
  // cierra la planilla de las tres. Este reparto nació para los APROBADORES de
  // horas extra (🩸 Julio había aprobado 57 días de Boston que no le tocaban) y
  // para ellos sigue igual; pero segmentar a quien firma el pago de las tres
  // empresas es dejar su alcance colgando de una fila de configuración que, si
  // alguien borra, le quita Boston EN SILENCIO.
  //
  // ⚠️ Se pregunta por lo que HACE el rol (`puedeCerrar`), no por su nombre:
  // así el día que entre otro rol que cierre, esto no hay que acordárselo.
  // Historia: había un cuarto parámetro `faltaTabla` y con él en `true` NADIE
  // quedaba segmentado (fail-open el día del deploy, por una migración que en
  // este repo tardaba días). Tolerancia retirada el 3-sep-2026: la tabla existe
  // desde 20260903120000. Hoy no hay forma de pedirle a esta función que abra
  // el reparto: sin filas propias, ninguna empresa.

  const mias = new Set<string>();
  const yo = clave(usuario ?? "");
  if (yo) {
    for (const f of filas) {
      if (clave(f.usuario) === yo && (EMPRESAS_ASISTENCIA as readonly string[]).includes(f.empresa)) {
        mias.add(f.empresa);
      }
    }
  }
  // 🔴 CON LA TABLA PUESTA Y SIN FILAS PROPIAS: NINGUNA. Un aprobador que nadie
  // configuró no aprueba — y lo ve, porque el cuadro le sale vacío.
  return { empresas: mias, faltaTabla: false };
}

/** ¿Este alcance cubre esta empresa? */
export function alcanza(a: AlcanceAprobador, empresa: string | null | undefined): boolean {
  if (a.empresas === null) return true;
  return typeof empresa === "string" && a.empresas.has(empresa);
}

export interface PersonaAAprobar {
  codigo: string;
  /** La empresa de su ficha. `null` = no tiene ficha, o no se pudo leer. */
  empresa: string | null;
}

export interface Veredicto {
  ok: boolean;
  /** Los códigos que NO le corresponden. Vacío cuando `ok`. */
  fuera: string[];
  motivo: string | null;
}

/**
 * 🔴 TODO O NADA. Si UNA sola persona del pedido no le corresponde, se rechaza
 * la operación ENTERA.
 *
 * Aprobar «lo que sí puedo» y callar el resto es la peor de las dos: quien
 * apretó el botón se queda creyendo que aprobó las 12 filas que veía, y las que
 * faltan no se lo dice nadie. Un 403 lo manda a mirar.
 *
 * ⚠️ Una persona SIN ficha se rechaza igual: sin empresa no se puede afirmar
 * que le corresponda, y adivinarla sería adivinar de quién es la plata.
 */
export function puedeAprobarA(
  a: AlcanceAprobador,
  personas: readonly PersonaAAprobar[],
): Veredicto {
  if (a.empresas === null) return { ok: true, fuera: [], motivo: null };

  const fuera = personas.filter((p) => !alcanza(a, p.empresa)).map((p) => p.codigo);
  if (fuera.length === 0) return { ok: true, fuera: [], motivo: null };

  const mias = [...a.empresas];
  return {
    ok: false,
    fuera: [...new Set(fuera)].sort(),
    motivo:
      mias.length === 0
        ? "No tienes ninguna empresa asignada para aprobar horas extra. Pídele a Daniel que te la asigne."
        : fuera.length === 1
          ? "No se aprobó nada: hay un colaborador que no es de tus empresas."
          : `No se aprobó nada: hay ${fuera.length} colaboradores que no son de tus empresas.`,
  };
}
