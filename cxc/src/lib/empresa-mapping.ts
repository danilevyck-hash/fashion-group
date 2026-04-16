import { supabaseServer } from "@/lib/supabase-server";

export const EMPRESA_KEY_TO_NAME: Record<string, string> = {
  vistana: "Vistana International",
  fashion_wear: "Fashion Wear",
  fashion_shoes: "Fashion Shoes",
  active_shoes: "Active Shoes",
  active_wear: "Active Wear",
  joystep: "Joystep",
  boston: "Confecciones Boston",
  american_classic: "Multifashion",
};

export function mapEmpresaName(key: string): string {
  return EMPRESA_KEY_TO_NAME[key] ?? key;
}

export async function getVentasMensuales(year: number, month?: number): Promise<{
  empresa: string; mes: number; ventas_netas: number; utilidad: number; costo: number;
}[]> {
  const PAGE = 1000;
  let allRows: { empresa: string; mes: number; subtotal: number; utilidad: number; costo: number }[] = [];
  let offset = 0;
  while (true) {
    let q = supabaseServer
      .from("ventas_raw")
      .select("empresa, mes, subtotal, utilidad, costo")
      .eq("anio", year)
      .order("fecha", { ascending: true })
      .order("n_sistema", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (month) q = q.eq("mes", month);
    const { data, error } = await q;
    if (error) break;
    allRows = allRows.concat(data ?? []);
    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }

  // Aggregate by empresa + mes
  const map = new Map<string, { ventas_netas: number; utilidad: number; costo: number }>();
  for (const r of allRows) {
    const name = mapEmpresaName(r.empresa);
    const key = `${name}|${r.mes}`;
    const entry = map.get(key) ?? { ventas_netas: 0, utilidad: 0, costo: 0 };
    entry.ventas_netas += Number(r.subtotal) || 0;
    entry.utilidad += Number(r.utilidad) || 0;
    entry.costo += Number(r.costo) || 0;
    map.set(key, entry);
  }

  return [...map.entries()].map(([key, v]) => {
    const [empresa, mes] = key.split("|");
    return { empresa, mes: parseInt(mes), ...v };
  });
}
