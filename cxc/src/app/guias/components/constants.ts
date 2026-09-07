import type { GuiaItem } from "./types";
import { nuevoUid } from "./guia-form-logic";

// DEFAULT_TRANSPORTISTAS eliminado en Sprint 3 — los transportistas ahora
// viven en la tabla `transportistas` y se cargan vía /api/transportistas.
//
// DEFAULT_CLIENTES y DEFAULT_EMPRESAS eliminados en jul-2026: eran CÓDIGO
// MUERTO. Los clientes salen del directorio real (clientes_master vía
// /api/clientes) desde que el campo pasó a selector; la lista de localStorage
// solo alimentaba un `<datalist id="clientes-list">` que ningún input usaba.
// Y `DEFAULT_EMPRESAS` se cargaba en el hook pero nunca llegaba al formulario:
// las empresas son las 8 del grupo y viven en `guia-form-logic.ts`
// (EMPRESAS_CANONICAS), derivadas de empresa-mapping.ts.

// 🔴 «Changuinola» CON «U» (5-sep-2026). Daniel: *«es changuinola»*.
// 🩸 Esta lista es la que el formulario OFRECE en el `<datalist>` de Dirección,
// y decía «Changinola». Medido contra producción el 5-sep-2026: **26 renglones
// vivos** escritos «Changinola» contra **1** bien escrito, y los dos destinos
// DEFINIDOS de ese pueblo (D-156 Wolf Mall y D-147 Top Shop, en
// `guias_destino_cliente`) dicen «Changuinola». O sea: la lista ofrecía la
// grafía mala, la gente la tocaba, y el mismo pueblo contaba como DOS destinos
// distintos en el agrupado histórico. Los 26 renglones viejos se corrigen con
// la migración `20261005120000_guias_changuinola.sql` (acotada al valor exacto,
// nunca un LIKE suelto).
//
// ⚠️ DESDE EL 7-SEP-2026 ESTA LISTA ES SOLO LA RED. La lista que el campo
// ofrece de verdad vive en la base (`guias_destino_lista`) y se administra en
// Guías › Configuración: es COMPARTIDA por todo el equipo. Acá queda el
// re-export de `DESTINOS_BASE` para no mover a quien ya la importaba.
export { DESTINOS_BASE as DEFAULT_DIRECCIONES } from "@/lib/guias/destinos-lista";

// 🩸 ACÁ VIVÍAN `loadList` y `saveList` — RETIRADAS el 7-sep-2026.
//
// Guardaban en `localStorage` (`fg_direcciones`) la lista de destinos del campo
// Dirección, así que un destino que agregaba Angela NO lo veía nadie más, y no
// se podía quitar desde ninguna pantalla: se podía agregar, nunca borrar. Así
// quedó vivo para siempre un destino de prueba llamado «hola» en un solo
// navegador. Daniel, textual: *«lo de solo ver en mi pantalla no tiene lógica,
// el sistema debe de trabajar todo igual, que sea para todo»*.
//
// Ahora la lista vive en la tabla `guias_destino_lista` y se pide por
// `/api/guias/destinos-lista`. `localStorage` se queda para las comodidades de
// cada persona —el último transportista, un filtro, un borrador—, nunca para
// datos que otro necesita ver. Hay candado que lo exige.

export function emptyItem(orden: number): GuiaItem {
  return { uid: nuevoUid(), orden, cliente: "", cliente_codigo: "", direccion: "", empresa: "", facturas: "", bultos: 0, numero_guia_transp: "" };
}

export function clientesSummary(items: GuiaItem[]): string {
  if (!items || items.length === 0) return "";
  const uniqueClientes = [...new Set(items.map((i) => i.cliente).filter(Boolean))];
  if (uniqueClientes.length === 0) return "";
  if (uniqueClientes.length === 1) return uniqueClientes[0];
  return `${uniqueClientes[0]} y ${uniqueClientes.length - 1} más`;
}

export function destinosSummary(items: GuiaItem[]): string {
  if (!items || items.length === 0) return "";
  const uniqueDestinos = [...new Set(items.map((i) => i.direccion).filter(Boolean))];
  if (uniqueDestinos.length === 0) return "";
  if (uniqueDestinos.length === 1) return uniqueDestinos[0];
  return `${uniqueDestinos[0]} y ${uniqueDestinos.length - 1} más`;
}

export function getMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es", { year: "numeric", month: "long" });
    options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return options;
}
