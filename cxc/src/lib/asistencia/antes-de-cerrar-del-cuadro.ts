/* ─────────────────────────────────────────────────────────────────────────────
 * «ANTES DE CERRAR», ARMADO DESDE EL CUADRO — el puente, PURO.
 *
 * `armarAntesDeCerrar` (en `antes-de-cerrar.ts`) recibe **quince campos** que
 * salen todos del mismo sitio: la respuesta de `/api/asistencia/planilla`. Esa
 * traducción vivía escrita a mano adentro de `PlanillaTab`.
 *
 * 🔴 DESDE EL 19-sep-2026 HAY DOS PANTALLAS QUE LA NECESITAN: la Planilla de
 * una empresa y el TABLERO de cierre de «Todas», que muestra qué le falta a
 * cada una. Copiar los quince campos a la segunda sería una segunda verdad
 * sobre qué frena un cierre — el día que se agregue un aviso, una de las dos se
 * quedaría vieja y nadie se enteraría.
 *
 * Acá no se decide nada nuevo: se ARMA la entrada, y la regla sigue siendo
 * `armarAntesDeCerrar`.
 * ────────────────────────────────────────────────────────────────────────── */

import { armarAntesDeCerrar, type AntesDeCerrar } from "./antes-de-cerrar";
import { prestamosSinDescontar } from "./casilla-sin-descontar";
import { cuotasRecortadas, netosNegativos } from "./neto-no-negativo";
import { marcasImparesDeLineas } from "./marcas-impares";
import type { LineaPlanilla } from "./planilla";
import type { ExtraNoAprobada } from "./aprobaciones";
import type { CodigoSinFicha } from "./periodo";
import type { PrestamoSinAtar } from "./prestamos-planilla";

/** Lo que la ruta de la planilla contesta, en lo que a los avisos respecta. */
export interface CuadroParaAvisos {
  lineas: readonly LineaPlanilla[];
  corte?: string | null;
  periodo?: { desde: string; hasta: string } | null;
  quincena?: { hasta: string } | null;
  avisos: {
    periodoAbierto?: { diasHabiles: number } | null;
    rangoLibre?: boolean;
    extraSinAprobar?: readonly ExtraNoAprobada[];
    sinFicha?: readonly CodigoSinFicha[];
    sinHorario?: number;
    fueraPorBaja?: number;
    marcoDespuesDeIrse?: number;
    avisoRepartoRechazado?: string | null;
    prestamoSinAtar?: readonly PrestamoSinAtar[];
    avisoPrestamo?: string | null;
    avisoVacacionesNoPagadas?: string | null;
    avisoDiasLibres?: string | null;
    conSabado?: number;
    factorBase?: number;
    diasCalendario?: number;
    faltaMigracionConfiguracion?: string | null;
    faltaMigracionManual?: string | null;
    faltaMigracionBajas?: string | null;
    faltaMigracionServicioProfesional?: string | null;
    faltaMigracionVacaciones?: string | null;
    faltaMigracionAprobaciones?: string | null;
    faltaMigracionReparto?: string | null;
    faltaMigracionAmarrePrestamos?: string | null;
    faltaMigracionDiaLibre?: string | null;
    faltaMigracionHorario?: string | null;
  };
}

/**
 * «Antes de cerrar» de ESE cuadro.
 *
 * @param rango          el período que se está mirando (para los enlaces)
 * @param conCorte       `PLANILLA_UNIDA`: sin el interruptor el corte no existe
 * @param pestanaFichas  cómo se llama hoy la pestaña de las fichas
 */
export function antesDeCerrarDelCuadro(
  data: CuadroParaAvisos,
  rango: { desde: string; hasta: string } | null,
  conCorte: boolean,
  pestanaFichas: string,
): AntesDeCerrar {
  const a = data.avisos;
  return armarAntesDeCerrar({
    periodoAbierto: a.periodoAbierto ?? null,
    esQuincena: !a.rangoLibre,
    rango,
    extraSinAprobar: a.extraSinAprobar ?? [],
    sinFicha: a.sinFicha ?? [],
    sinHorario: a.sinHorario ?? 0,
    corte: conCorte ? data.corte ?? null : null,
    hasta: data.periodo?.hasta ?? data.quincena?.hasta ?? "",
    fueraPorBaja: a.fueraPorBaja ?? 0,
    marcoDespuesDeIrse: a.marcoDespuesDeIrse ?? 0,
    avisoRepartoRechazado: a.avisoRepartoRechazado ?? null,
    prestamoSinAtar: a.prestamoSinAtar ?? [],
    avisoPrestamo: a.avisoPrestamo ?? null,
    // 🔴 Todas estas salen de las MISMAS líneas que dibuja la tabla.
    sinDescontar: prestamosSinDescontar(data.lineas),
    recortadas: cuotasRecortadas(data.lineas),
    netosNegativos: netosNegativos(data.lineas),
    marcasImpares: marcasImparesDeLineas(data.lineas),
    avisoVacacionesNoPagadas: a.avisoVacacionesNoPagadas ?? null,
    avisoDiasLibres: a.avisoDiasLibres ?? null,
    conSabado: a.conSabado ?? 0,
    rangoLibre: !!a.rangoLibre,
    factorBase: a.factorBase ?? 1,
    diasCalendario: a.diasCalendario ?? 0,
    migraciones: [
      a.faltaMigracionConfiguracion, a.faltaMigracionManual,
      a.faltaMigracionBajas, a.faltaMigracionServicioProfesional,
      a.faltaMigracionVacaciones, a.faltaMigracionAprobaciones,
      a.faltaMigracionReparto, a.faltaMigracionAmarrePrestamos,
      a.faltaMigracionDiaLibre ?? null,
      a.faltaMigracionHorario ?? null,
    ].filter((m): m is string => !!m),
    pestanaFichas,
  });
}
