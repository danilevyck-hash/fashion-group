// ─────────────────────────────────────────────────────────────────────────────
// LO QUE FALTA EN CONFIGURACIÓN, DICHO UNA SOLA VEZ
//
// 🩸 POR QUÉ (6-ago-2026). La pantalla apilaba DOS avisos amarillos que decían
// casi lo mismo —«6 no están configuradas» y «4 sin salario»— y encima repetía
// «Falta el nombre» / «Falta la empresa» / «Falta el salario» en naranja, tres
// veces, DENTRO de la misma fila. Dos avisos del mismo color compitiendo hacen
// que no se lea ninguno, y un renglón con tres alarmas no dice qué hacer
// primero: dice que todo está mal.
//
// Acá el pendiente se cuenta UNA vez, con el desglose adentro, y cada fila lleva
// UN solo indicador; el detalle de lo que le falta aparece recién al abrirla.
//
// Es un módulo PURO a propósito: son las frases que la contable lee para saber
// cuánto trabajo le queda, y se prueban sin navegador ni base.
// ─────────────────────────────────────────────────────────────────────────────

export interface ResumenConfiguracion {
  /** Códigos en la lista = los que marcan en el reloj ∪ los que ya tienen ficha. */
  total: number;
  /** Marcan en el reloj y nadie dijo todavía quién son. */
  sinConfigurar: number;
  /** Ya tienen ficha y empresa, pero les falta el sueldo. */
  sinSalario: number;
}

export interface AvisoPendientes {
  /** El renglón principal: cuántas personas frenan la planilla, de cuántas. */
  titulo: string;
  /** El desglose. Va DENTRO del mismo aviso, nunca como un segundo cartel. */
  detalle: string[];
}

/**
 * El aviso ÚNICO de lo que falta configurar. `null` cuando no falta nada — sin
 * pendientes no se pinta un cartel verde de "todo bien": un aviso permanente es
 * un aviso que se deja de leer.
 *
 * 🔑 Las dos cuentas NO se solapan: `sinConfigurar` es "no tiene ficha" y
 * `sinSalario` es "tiene ficha y le falta el sueldo" (el servidor lo calcula con
 * `!!f && salario === null`). Por eso se pueden sumar sin contar a nadie dos
 * veces, y esa suma es la que va en el título y en la píldora del filtro.
 */
export function avisoPendientes(r: ResumenConfiguracion): AvisoPendientes | null {
  const pendientes = r.sinConfigurar + r.sinSalario;
  if (pendientes <= 0) return null;

  const personas = pendientes === 1 ? "persona" : "personas";
  const titulo =
    `${pendientes} ${personas} de ${r.total} todavía no ${pendientes === 1 ? "sale" : "salen"}` +
    " en la planilla.";

  const detalle: string[] = [];
  if (r.sinConfigurar > 0) {
    detalle.push(
      r.sinConfigurar === 1
        ? "1 marca en el reloj y todavía no tiene ficha: falta decir quién es, de qué empresa y cuánto gana."
        : `${r.sinConfigurar} marcan en el reloj y todavía no tienen ficha: falta decir quiénes son, de qué empresa y cuánto ganan.`,
    );
  }
  if (r.sinSalario > 0) {
    detalle.push(
      r.sinSalario === 1
        ? "1 ya tiene ficha y empresa, pero le falta el salario para poder calcular."
        : `${r.sinSalario} ya tienen ficha y empresa, pero les falta el salario para poder calcular.`,
    );
  }
  return { titulo, detalle };
}

export interface PersonaPendiente {
  nombre: string | null;
  empresa: string | null;
  salarioMensual: number | null;
  /** `true` = marca pero no va en planilla. Ver `participacion.ts`. */
  servicioProfesional?: boolean;
}

/**
 * Qué le falta a UNA persona, en orden de lo que hay que llenar primero.
 * Lista vacía = está lista y su planilla sale.
 *
 * La fila colapsada NO muestra esta lista: muestra un solo indicador («Falta»).
 * Esto es lo que se lee al abrirla, que es cuando sirve saber el detalle.
 *
 * 🔴 A QUIEN NO VA EN PLANILLA NO SE LE PIDE EL SALARIO. No es que lo tenga
 * pendiente: no lo necesita, porque no se le calcula pago. Es la MISMA regla que
 * aplica `faltantesDe` en `planilla.ts`; si acá dijera otra cosa, la ficha se
 * vería en ámbar mientras la planilla la da por lista.
 */
export function faltaEnPersona(p: PersonaPendiente): string[] {
  const falta: string[] = [];
  if (!p.nombre || !p.nombre.trim()) falta.push("el nombre");
  if (!p.empresa) falta.push("la empresa");
  if (
    p.servicioProfesional !== true
    && (p.salarioMensual === null || !Number.isFinite(p.salarioMensual))
  ) {
    falta.push("el salario");
  }
  return falta;
}

/** «el nombre y la empresa» / «el nombre, la empresa y el salario». */
export function fraseFalta(falta: string[]): string {
  if (falta.length === 0) return "";
  if (falta.length === 1) return falta[0];
  return `${falta.slice(0, -1).join(", ")} y ${falta[falta.length - 1]}`;
}
