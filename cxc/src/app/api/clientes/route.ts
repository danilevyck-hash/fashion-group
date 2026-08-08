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
// POR QUÉ EL FILTRO ES EN MEMORIA Y NO EN SQL. La regla de mundos (qué cliente
// es del grupo y cuál de Boston/Multifashion) se calcula en TypeScript, así que
// no se puede empujar a la base sin una migración.
//
// 🩸 ACÁ DECÍA QUE `clientes_master` TENÍA "149 filas vivas" Y ERA FALSO
// (3-ago-2026). 149 es lo que queda DESPUÉS de filtrar por mundos, no el tamaño
// de la tabla. Medido contra producción: **5.062 filas vivas** en
// `clientes_master` y **6.667** en `switch_clientes` → cada llamada leía
// **11.729 filas en 13 viajes** a Supabase para devolver ~149. Con el número
// equivocado la lectura completa parecía barata y por eso nadie la tocó.
//
// La lectura ahora pasa por `lib/clientes/directorio-cache`, que la guarda en
// memoria 60 s: el resultado solo cambia cuando corre un sync o alguien edita
// una ficha, nunca entre dos tecleos. Sigue usando `leerTodoPaginado` (pagina y
// VERIFICA contra el COUNT), así que si la tabla crece no se rompe en silencio.
//
// Query params: q · provincia · page (1-indexed) · limit (default 50, max 200)
// Devuelve: { clientes, total, page, limit }
//   (las provincias del dropdown las entrega el SSR una sola vez, no este route)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { coincideBusqueda } from "@/lib/buscar-normalizado";
import { leerClientesDelGrupo, type FilaCliente } from "@/lib/clientes/directorio-cache";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["admin", "secretaria", "vendedor", "bodega"];

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED_ROLES);
  if (authError) return authError;

  const url = req.nextUrl;
  const q = (url.searchParams.get("q") ?? "").trim();
  const provincia = (url.searchParams.get("provincia") ?? "").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "50", 10) || 50;
  const limit = Math.min(200, Math.max(1, limitRaw));

  // Lectura + filtro de mundos, cacheados 60 s por instancia. La provincia SÍ
  // se filtra en la base (igual exacto), por eso es parte de la clave.
  //
  // Solo los clientes del GRUPO (las 6 que conviven). Los de Boston viven en su
  // pestaña de CXC y los de Multifashion en su módulo. La regla y su porqué
  // viven en UN solo lugar — `lib/clientes/mundos` — no acá.
  // Va antes de la búsqueda y del conteo, así que `total` ya sale correcto.
  let visibles: FilaCliente[];
  try {
    visibles = await leerClientesDelGrupo(provincia);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/clientes] list error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // ⚠️ `.slice()` OBLIGATORIO cuando no hay búsqueda: sin él, `filtrados` sería
  // el MISMO array que guarda el caché y el `sort` de abajo lo ordenaría en el
  // lugar, mutando estado compartido entre llamadas. Antes del caché cada
  // llamada traía un array recién creado y mutarlo no tenía consecuencia; ahora
  // sí. (`filter` ya devuelve uno nuevo, por eso solo la otra rama lo necesita.)
  const filtrados = q
    ? visibles.filter(c => coincideBusqueda(q, [c.nombre, c.razon_social, c.codigo]))
    : visibles.slice();

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
