/**
 * Saldos de banco — el HISTORIAL por empresa, y el saldo que se copió.
 *
 * Módulo PURO (sin base, sin red, sin `Date.now()`): lo usan la API
 * (`/api/saldos-banco`) y la pantalla (la pestaña "Saldos de banco" de Gastos),
 * así que las dos ven exactamente lo mismo. Si cada una lo calculara por su
 * cuenta, el "último saldo" de arriba y el historial de abajo podrían decir
 * cosas distintas de la misma empresa — que es justo lo que este historial vino
 * a hacer visible.
 *
 * 🩸 POR QUÉ EXISTE, con un caso real. Daniel: *"hagamoslo carga manual, pero
 * que se pueda editar, corregir, ver historial, osea lo necesario para que la
 * contable meta los saldos y vea si lo hizo bien"*. Medido en producción el
 * 13-ago-2026 sobre las 52 filas de `bancos_saldos`: las **3 cargas del 10-ago
 * repiten AL CENTAVO el saldo del 31-jul** de su empresa —
 * `active_shoes $27.647,97 · active_wear $60.678,97 · fashion_shoes $74.336,02`—
 * o sea que se copiaron los de julio. La pantalla no tenía forma de mostrarlo:
 * enseñaba UN saldo por empresa y nada más.
 *
 * ⚠️ `bancos_saldos` NO se toca: se sigue escribiendo con el MISMO upsert
 * `(empresa_key, fecha_dato)` y leyendo con `leerTodoPaginado`. Acá no se
 * inventa auditoría: se muestra lo que la tabla ya guarda (`created_by`,
 * `created_at`).
 */

/** Una fila de `bancos_saldos`, tal como la devuelve la base. */
export interface FilaSaldo {
  empresa_key: string;
  saldo: number;
  fecha_dato: string; // YYYY-MM-DD
  created_by?: string | null;
  created_at?: string | null;
}

/** Una carga, ya ubicada dentro de la historia de SU empresa. */
export interface CargaSaldo extends FilaSaldo {
  /** El saldo es EXACTAMENTE el de la carga anterior de esta empresa. */
  repiteAnterior: boolean;
  /** `fecha_dato` de esa carga anterior (para poder decir "igual al 31 jul"). */
  fechaAnterior: string | null;
}

/** Comparar centavos, no números crudos: los montos se guardan y se muestran
 *  con 2 decimales (el POST hace `Math.round(saldo * 100) / 100`), así que la
 *  igualdad tiene que medirse a la precisión que se ve. Con coma flotante,
 *  `0.1 + 0.2 !== 0.3`, y "repite exacto" no puede depender de eso. */
export function mismoMonto(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

/** Ordena una lista de cargas por `fecha_dato`, de la más VIEJA a la más nueva.
 *  Las fechas son `YYYY-MM-DD`, así que el orden de texto ES el cronológico. */
function porFechaAsc(filas: FilaSaldo[]): FilaSaldo[] {
  return [...filas].sort((a, b) => (a.fecha_dato < b.fecha_dato ? -1 : a.fecha_dato > b.fecha_dato ? 1 : 0));
}

/**
 * Historial por empresa, **de la más NUEVA a la más vieja** (que es como se
 * lee en pantalla), con cada carga sabiendo si repite exacto a la anterior.
 *
 * 🔴 "La anterior" es siempre la CRONOLÓGICAMENTE anterior de la MISMA empresa,
 * nunca la de otra ni la fila de al lado en la tabla: comparar entre empresas
 * marcaría coincidencias que no significan nada.
 */
export function historialPorEmpresa(filas: FilaSaldo[]): Map<string, CargaSaldo[]> {
  const porEmpresa = new Map<string, FilaSaldo[]>();
  for (const f of filas) {
    const lista = porEmpresa.get(f.empresa_key) ?? [];
    lista.push(f);
    porEmpresa.set(f.empresa_key, lista);
  }

  const salida = new Map<string, CargaSaldo[]>();
  for (const [empresa, lista] of porEmpresa) {
    const asc = porFechaAsc(lista);
    const conMarca: CargaSaldo[] = asc.map((f, i) => {
      const prev = i > 0 ? asc[i - 1] : null;
      return {
        ...f,
        repiteAnterior: prev != null && mismoMonto(Number(prev.saldo), Number(f.saldo)),
        fechaAnterior: prev?.fecha_dato ?? null,
      };
    });
    salida.set(empresa, conMarca.reverse());
  }
  return salida;
}

/**
 * El último saldo de cada empresa: la fila con `fecha_dato` más reciente.
 *
 * 🔴 MISMO CRITERIO que la "Disponibilidad" de Vista General, que lee
 * `bancos_saldos` por su cuenta. Este módulo NO la alimenta ni puede moverle un
 * centavo — pero si acá se eligiera otra fila (la más recién cargada, por
 * ejemplo), las dos pantallas mostrarían números distintos del mismo banco.
 *
 * Empate de fecha imposible en la práctica (`UNIQUE(empresa_key, fecha_dato)`),
 * pero por si acaso gana la primera que aparece: sin fila más nueva no hay nada
 * que preferir.
 */
export function ultimoPorEmpresa(filas: FilaSaldo[]): FilaSaldo[] {
  const ultimo = new Map<string, FilaSaldo>();
  for (const f of filas) {
    const prev = ultimo.get(f.empresa_key);
    if (!prev || f.fecha_dato > prev.fecha_dato) ultimo.set(f.empresa_key, f);
  }
  return [...ultimo.values()].sort((a, b) =>
    a.fecha_dato < b.fecha_dato ? 1 : a.fecha_dato > b.fecha_dato ? -1 : 0,
  );
}

/**
 * Las empresas cuyo ÚLTIMO saldo repite exacto al anterior — o sea, el aviso
 * que va arriba de la pantalla.
 *
 * ⚠️ Solo mira el último, a propósito. Un saldo repetido en medio de la
 * historia ya está marcado en su fila y no hay nada que corregir con urgencia;
 * el que importa es el que HOY está diciendo cuánta plata hay.
 */
export function empresasConUltimoRepetido(filas: FilaSaldo[]): string[] {
  const salida: string[] = [];
  for (const [empresa, historia] of historialPorEmpresa(filas)) {
    if (historia.length > 0 && historia[0].repiteAnterior) salida.push(empresa);
  }
  return salida.sort();
}
