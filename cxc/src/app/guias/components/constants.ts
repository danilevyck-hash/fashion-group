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
export const DEFAULT_DIRECCIONES = ["Paso Canoas", "David", "Santiago", "Guabito", "Changuinola"];

export function loadList(key: string, defaults: string[]): string[] {
  if (typeof window === "undefined") return defaults;
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "[]") as string[];
    const merged = [...defaults];
    for (const s of stored) {
      if (s && !merged.includes(s)) merged.push(s);
    }
    return merged;
  } catch {
    return defaults;
  }
}

export function saveList(key: string, defaults: string[], list: string[]) {
  const custom = list.filter((s) => !defaults.includes(s));
  localStorage.setItem(key, JSON.stringify(custom));
}

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
