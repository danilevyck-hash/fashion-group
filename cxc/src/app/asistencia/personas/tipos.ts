/* ─────────────────────────────────────────────────────────────────────────────
 * LOS TIPOS DE LA PÁGINA DE UNA PERSONA.
 *
 * 🔑 Es exactamente lo que YA devuelve `/api/asistencia/configuracion`, no una
 * forma nueva: la página lee la misma ficha que la lista. Están acá y no dentro
 * de un componente para que las cuatro secciones y el formulario nombren lo
 * mismo — dos definiciones de «una persona» en el mismo módulo es cómo termina
 * una pantalla mostrando un campo que la otra no manda.
 * ────────────────────────────────────────────────────────────────────────── */

import type { MotivoSalida } from "@/lib/asistencia/vigencia";

export interface PersonaDeLaPagina {
  codigo: string;
  nombre: string | null;
  salarioMensual: number | null;
  jornadaSemanal: number;
  empresa: string | null;
  servicioProfesional: boolean;
  pagaSeguros: boolean;
  baseSeguros: number | null;
  noMarcaReloj: boolean;
  posicion?: string | null;
  cedula?: string | null;
  reparto?: { empresa: string; salarioMensual: number }[];
  fechaIngreso: string | null;
  fechaSalida: string | null;
  motivoSalida: MotivoSalida | null;
  saldoVacacionesDias: number | null;
  saldoVacacionesCorte: string | null;
  activo: boolean;
  baja: string | null;
  marcaciones: number;
  ultimaMarca: string | null;
  deudaPrestamo?: number;
}

/**
 * Lo que el SERVIDOR dice que se puede hacer. No es una opinión de la pantalla:
 * cada bandera cuelga de que la migración de esa columna haya corrido.
 *
 * ⚠️ Cuando una está en `false` el campo se DIBUJA y se dice por qué no se
 * puede tocar. Esconderlo sería dejar a alguien buscando un interruptor que la
 * pantalla decidió no enseñarle.
 */
export interface PermisosDeLaPagina {
  puedeDarDeBaja: boolean;
  puedeMarcarServicioProfesional: boolean;
  puedeQuitarSeguros: boolean;
  puedeCargarBaseSeguros: boolean;
  puedeMarcarSueldoFijo: boolean;
  puedeCargarSaldoVacaciones: boolean;
}
