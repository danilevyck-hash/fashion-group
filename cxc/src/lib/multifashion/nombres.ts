// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SE ESCRIBE UN NOMBRE EN LA PANTALLA DE MULTIFASHION (6-sep-2026).
//
// 🩸 Switch manda los nombres como se los tecleó cada quien, y en la MISMA lista
// convivían «Martin Montenegro» y «MARIA APARICIO» — la segunda se lee como un
// grito y hace que la lista parezca dos listas.
//
// 🔴 SOLO CAMBIA CÓMO SE MUESTRA. Lo guardado no se toca, la clave de agrupación
// sigue siendo la de siempre (mayúsculas, en la base y en `metas-clave.ts`) y no
// se mueve un solo número.
//
// Se REUSA la regla de Comisiones (`nombreVendedorEnPantalla`, 3-sep-2026,
// Daniel: *«si capitiliza reynaldo»*) en vez de escribir una segunda: si algún
// día cambia cómo se capitaliza un nombre en el sistema, cambia en un lugar.
// ─────────────────────────────────────────────────────────────────────────────

import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";

/** «MARIA APARICIO» → «Maria Aparicio». Vacío → "". */
export function nombreEnPantalla(nombre: string | null | undefined): string {
  return nombreVendedorEnPantalla(nombre ?? "");
}
