import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/require-auth";
import { supabaseServer } from "@/lib/supabase-server";
import {
  ALL_EMPRESA_KEYS,
  EMPRESA_KEY_TO_NAME,
  mapEmpresaName,
} from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";

const GUIAS_ROLES = ["admin", "secretaria", "bodega", "vendedor"];

// Normalizador canónico (idéntico a clientes_master.nombre_normalized):
// upper + quitar [.,] + colapsar espacios.
function norm(s: string): string {
  return (s || "").toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
}

// Mapea un string sucio de empresa (guia_items.empresa) a una de las 8 keys
// canónicas, SOLO para contar frecuencia. Sin match → null (no cuenta).
function empresaKeyFromDirty(s: string): string | null {
  const n = norm(s);
  if (!n) return null;
  for (const key of ALL_EMPRESA_KEYS) {
    const cn = norm(EMPRESA_KEY_TO_NAME[key]);
    if (n === cn || n.includes(cn) || cn.includes(n)) return key;
  }
  return null;
}

// GET /api/guias/frecuencias
// Devuelve, para los selectores del form de guía:
//   - clientes: top por frecuencia de uso en guías (solo ítems con cliente_codigo),
//     como [{ codigo, nombre }] ordenado desc.
//   - empresas: las 8 empresas canónicas (nombres display) ordenadas por
//     frecuencia de uso en guías (mapeando strings sucios a las 8 para contar).
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session || !GUIAS_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const { data, error } = await supabaseServer
      .from("guia_items")
      .select("cliente_codigo, empresa");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
      cliente_codigo: string | null;
      empresa: string | null;
    }>;

    // ── Clientes: contar por código ──
    const cntCod = new Map<string, number>();
    for (const r of rows) {
      const c = (r.cliente_codigo ?? "").trim();
      if (c) cntCod.set(c, (cntCod.get(c) ?? 0) + 1);
    }
    const topCodigos = [...cntCod.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([c]) => c);

    let clientes: Array<{ codigo: string; nombre: string }> = [];
    if (topCodigos.length > 0) {
      const { data: cmData, error: cmErr } = await supabaseServer
        .from("clientes_master")
        .select("codigo, nombre")
        .in("codigo", topCodigos)
        .eq("deleted", false);
      if (cmErr) throw new Error(cmErr.message);
      const nameByCod = new Map<string, string>();
      for (const c of (cmData ?? []) as Array<{ codigo: string; nombre: string }>) {
        nameByCod.set(c.codigo, c.nombre);
      }
      // Conserva el orden por frecuencia; descarta códigos sin nombre vivo.
      clientes = topCodigos
        .filter((c) => nameByCod.has(c))
        .map((c) => ({ codigo: c, nombre: nameByCod.get(c) as string }));
    }

    // ── Empresas: contar por key canónica, ordenar las 8 desc ──
    const cntEmp = new Map<string, number>();
    for (const r of rows) {
      const key = empresaKeyFromDirty(r.empresa ?? "");
      if (key) cntEmp.set(key, (cntEmp.get(key) ?? 0) + 1);
    }
    const empresas = ALL_EMPRESA_KEYS.map((key, idx) => ({
      key,
      idx,
      count: cntEmp.get(key) ?? 0,
    }))
      .sort((a, b) => b.count - a.count || a.idx - b.idx)
      .map((e) => mapEmpresaName(e.key));

    return NextResponse.json({ clientes, empresas });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[api/guias/frecuencias] GET:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
