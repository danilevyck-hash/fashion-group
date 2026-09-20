// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL NOMBRE DEL CLIENTE SE ESCRIBE IGUAL EN TODAS LAS PANTALLAS
// (20-sep-2026, pedido de Daniel).
//
// 🩸 QUÉ PASABA. La lista de Cuentas por Cobrar GRITABA `CITY MODA DEL ESTE SA`
// —el `nombre_normalized`, que existe para PAREAR las seis empresas y no para
// leerse— mientras el papel del MISMO cliente decía `City Moda Del Este, S.A.`,
// y Guías y Reclamos también lo escribían capitalizado. Cuatro pantallas del
// mismo sistema, el mismo cliente, cuatro grafías.
//
// LA REGLA ES UNA Y YA EXISTÍA: `nombreDelPapel()` —el nombre que escribe
// Switch, tal cual; y solo cuando Switch no lo manda, el normalizado
// capitalizado respetando siglas—. Lo que faltaba era que las pantallas la
// usaran: había TRES copias sueltas del `find(...)?.nombre ?? nombre_normalized`
// (la hoja «Cobrar», el modal de correo y el cajón del estado de cuenta), cada
// una sin el respaldo capitalizado, y la lista ni eso.
//
// 🔴 EL PAREO NO SE TOCA. `nombre_normalized` sigue siendo la llave con la que
// se consolidan las seis empresas, la que ordena, la que busca, la que recuerda
// qué fila está abierta y la que ata las anotaciones. Lo único que cambia es lo
// que se DIBUJA.
//
// 🔴 Y ESTO NO JUNTA A BOSTON CON EL GRUPO. Daniel, textual: *«no puedes juntar
// Boston con Fashion Gr, nunca te darán los mismos nombres, por eso no se
// mezclan»*. Boston ya mostraba el nombre de Switch, y lo lee de SU propia
// fuente (`/api/cxc/boston`, `switch_clientes` acotado a Boston). Acá no entra
// ni una fila suya: esta función recibe el cliente que la pantalla ya tiene.
// ─────────────────────────────────────────────────────────────────────────────

import { nombreDelPapel } from "./estado-cuenta-switch";

/** Lo mínimo que hace falta de un cliente para saber cómo se escribe su nombre. */
export interface ClienteConNombre {
  /** La llave de pareo, en MAYÚSCULAS. Es el respaldo, nunca la primera opción. */
  nombre_normalized: string;
  /** Las empresas del cliente; cada una trae el nombre tal cual lo escribe Switch. */
  companies: Record<string, { nombre?: string | null } | undefined>;
}

/**
 * El nombre que se LEE: el de Switch, tal cual lo escribe.
 *
 * ⚠️ Se usa SIN transformar: «ACTIVE SHOES, S.A.» está en mayúsculas en Switch y
 * así sale, porque así lo imprime el papel que el cliente ya recibe.
 * Capitalizarlo a la fuerza daría `R.j.a.s.a.`.
 *
 * Sin nombre de Switch cae al normalizado CAPITALIZADO (`nombreDelPapel`), para
 * no volver a mandar un grito.
 */
export function nombreDeCliente(c: ClienteConNombre): string {
  const deSwitch = Object.values(c.companies ?? {}).find((x) => x?.nombre)?.nombre;
  return nombreDelPapel(deSwitch, c.nombre_normalized);
}
