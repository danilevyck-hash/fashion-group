// GET /api/cheques/frecuencias
//
// Los "más usados" del selector de cliente de Cheques.
//
// Por qué no se reusa `/api/guias/frecuencias`: ese cuenta GUÍAS, y quién
// recibe más despachos no es quién entrega más cheques. Daniel pidió los más
// usados en el formulario de cheques, así que la frecuencia sale de la tabla
// `cheques`. Es el mismo contrato de salida (`{ clientes: [{codigo, nombre}] }`)
// para que el selector compartido no tenga que saber de dónde vino la lista.
//
// ⚠️ `cheques` NO tiene columna `cliente_codigo` — guarda `cliente` como texto
// suelto. Así que se cuenta por NOMBRE NORMALIZADO y recién al final se resuelve
// contra `clientes_master` para conseguir el código que el selector necesita.
// Un cliente escrito a mano que no esté en el directorio simplemente no llega a
// los chips (no tiene código con el cual elegirlo), pero se sigue pudiendo
// escribir a mano con la opción "Otro". Ninguna de las dos cosas se rompe si la
// resolución falla: los chips quedan vacíos y el buscador sigue funcionando.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/require-auth";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const CHEQUES_ROLES = ["admin", "secretaria"];

/** Cuántos chips como máximo. Igual que guías. */
const TOP_N = 12;

// Normalizador canónico (idéntico a clientes_master.nombre_normalized):
// upper + quitar [.,] + colapsar espacios. Es lo que permite parear el
// "PLAZA LOS ANGELES" guardado en un cheque con el "Plaza Los Angeles" del
// directorio — el mismo cliente escrito distinto.
function norm(s: string): string {
  return (s || "").toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
}

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session || !CHEQUES_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const { data, error } = await supabaseServer
      .from("cheques")
      .select("cliente, created_at")
      .eq("deleted", false);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{ cliente: string | null; created_at: string | null }>;

    // Contar por nombre normalizado. Se guarda además el último uso para
    // desempatar: con pocos cheques los conteos empatan casi siempre, y ante un
    // empate el más reciente es el que el usuario tiene en la cabeza.
    const cuenta = new Map<string, { n: number; ultimo: string }>();
    for (const r of rows) {
      const clave = norm(r.cliente ?? "");
      if (!clave) continue;
      const previo = cuenta.get(clave);
      const ultimo = r.created_at ?? "";
      if (previo) {
        previo.n += 1;
        if (ultimo > previo.ultimo) previo.ultimo = ultimo;
      } else {
        cuenta.set(clave, { n: 1, ultimo });
      }
    }

    const topNombres = [...cuenta.entries()]
      .sort((a, b) => b[1].n - a[1].n || (a[1].ultimo < b[1].ultimo ? 1 : -1))
      .slice(0, TOP_N)
      .map(([clave]) => clave);

    if (topNombres.length === 0) return NextResponse.json({ clientes: [] });

    // Resolver nombre → código contra el directorio vivo. Se traen los clientes
    // y se parean en memoria por nombre normalizado: PostgREST no tiene un
    // "IN sobre una expresión", y son 149 filas vivas (medido) — muy por debajo
    // del tope de 1000 de `db-max-rows`, así que no hace falta paginar.
    const { data: cmData, error: cmErr } = await supabaseServer
      .from("clientes_master")
      .select("codigo, nombre")
      .eq("deleted", false);
    if (cmErr) throw new Error(cmErr.message);

    const porNombre = new Map<string, { codigo: string; nombre: string }>();
    for (const c of (cmData ?? []) as Array<{ codigo: string; nombre: string }>) {
      const clave = norm(c.nombre);
      if (clave && !porNombre.has(clave)) porNombre.set(clave, c);
    }

    // Conserva el orden por frecuencia; descarta los que no están en el
    // directorio (sin código no se pueden ofrecer como opción de la lista).
    const clientes = topNombres
      .map((clave) => porNombre.get(clave))
      .filter((c): c is { codigo: string; nombre: string } => Boolean(c));

    return NextResponse.json({ clientes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[api/cheques/frecuencias] GET:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
