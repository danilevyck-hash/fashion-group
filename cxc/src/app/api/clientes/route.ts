// ─────────────────────────────────────────────────────────────────────────────
// GET /api/clientes
//
// Lista paginada de clientes_master con búsqueda y filtro por provincia.
//
// 🩸 LA BÚSQUEDA IGNORA ESPACIOS Y ACENTOS (27-jul-2026). Antes era
// `nombre.ilike.%q%,codigo.ilike.%q%` — match literal contra la base. Medido:
// escribir "multifashion" daba 0 resultados y "multi fashion" daba 1, porque el
// cliente está guardado como "Multi Fashion Holding"; "d108" daba 0 porque el
// código es "D-108". Ahora se compara sobre la forma normalizada
// (`lib/buscar-normalizado`) y las cuatro formas encuentran al mismo cliente.
//
// También busca por RAZÓN SOCIAL, que antes no se miraba. No es cosmético:
// medido sobre los 149 clientes vivos, 84 tienen una razón social distinta del
// nombre de fantasía — "Millenium / David" factura como "Grupo Irmode De
// Panama, S.A", así que quien buscara "irmode" no encontraba nada.
//
// POR QUÉ EL FILTRO ES EN MEMORIA Y NO EN SQL. `clientes_master` tiene **149
// filas vivas** (medido el 27-jul-2026 contra producción; el número de ~1.700
// que se manejaba es el de `switch_clientes`, que son pares cliente-empresa de
// las 8 empresas, no clientes). Traer 149 filas y filtrarlas acá cuesta lo mismo
// que una consulta filtrada y evita meter una función SQL + su migración en el
// camino crítico de una pantalla que hoy funciona. La lectura va por
// `leerTodoPaginado`, que pagina y VERIFICA contra el COUNT: si la tabla
// creciera, esto no se rompe en silencio. ⚠️ Si algún día `clientes_master`
// pasa de ~1.000 filas, este filtro se muda a una RPC en SQL.
//
// Query params: q · provincia · page (1-indexed) · limit (default 50, max 200)
// Devuelve: { clientes, total, page, limit }
//   (las provincias del dropdown las entrega el SSR una sola vez, no este route)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { coincideBusqueda } from "@/lib/buscar-normalizado";
import { mundosDeClientes, soloClientesDelGrupo } from "@/lib/clientes/mundos";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["admin", "secretaria", "vendedor", "bodega"];

interface FilaCliente {
  id: string;
  codigo: string | null;
  nombre: string | null;
  razon_social: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  provincia: string | null;
}

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED_ROLES);
  if (authError) return authError;

  const url = req.nextUrl;
  const q = (url.searchParams.get("q") ?? "").trim();
  const provincia = (url.searchParams.get("provincia") ?? "").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "50", 10) || 50;
  const limit = Math.min(200, Math.max(1, limitRaw));

  let filas: FilaCliente[];
  try {
    filas = await leerTodoPaginado<FilaCliente>(
      "clientes_master (listado)",
      (pedirCount, from, to) => {
        let sel = supabaseServer
          .from("clientes_master")
          .select(
            "id, codigo, nombre, razon_social, telefono, celular, email, provincia",
            pedirCount ? { count: "exact" } : {},
          )
          .eq("deleted", false);
        // La provincia SÍ se filtra en la base: es un igual exacto, no hace
        // falta normalizar nada y achica lo que viaja.
        if (provincia) sel = sel.eq("provincia", provincia);
        // Orden de PAGINACIÓN (estable y único), no el de presentación: el
        // orden que ve el usuario se aplica abajo, en español.
        return sel.order("id", { ascending: true }).range(from, to);
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/clientes] list error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Solo los clientes del GRUPO (las 6 que conviven). Los de Boston viven en su
  // pestaña de CXC y los de Multifashion en su módulo. La regla y su porqué
  // viven en UN solo lugar — `lib/clientes/mundos` — no acá.
  // Va antes de la búsqueda y del conteo, así que `total` ya sale correcto.
  const visibles = soloClientesDelGrupo(filas, await mundosDeClientes());

  const filtrados = q
    ? visibles.filter(c => coincideBusqueda(q, [c.nombre, c.razon_social, c.codigo]))
    : visibles;

  // Orden de presentación: por nombre, con collation española (ñ y acentos en
  // su lugar). Es el mismo criterio que mostraba la pantalla antes.
  filtrados.sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "", "es"));

  const from = (page - 1) * limit;
  const pagina = filtrados.slice(from, from + limit);

  return NextResponse.json({
    clientes: pagina,
    total: filtrados.length,
    page,
    limit,
  });
}
