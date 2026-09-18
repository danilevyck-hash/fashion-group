import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, HAS_SERVICE_ROLE } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { MARCA_CATALOGO, marcaKey } from "@/lib/depurador/logic";
import { TIENDA_MARCA_CATALOGO } from "@/lib/depurador/tienda";
import { normalizarEspacios } from "@/lib/depurador/veredicto";
// ⚠️ Un `route.ts` de Next solo puede exportar GET/POST/dynamic/…: el tope y el
// `origen` viven en el módulo puro, que es además el que usa el cliente. UN
// número y UN valor, no dos copias.
import { MAX_POR_ENVIO, ORIGEN_AUTOMATICA } from "@/app/productos/cargar/descripciones-que-pasan";

export const dynamic = "force-dynamic";

// Los mismos dos roles que ya podían escribir en el catálogo (`…/aprobar`).
const ALLOWED = ["admin", "secretaria"];

const MISCONFIG = NextResponse.json(
  { error: "Falta SUPABASE_SERVICE_ROLE_KEY en este entorno: no se pueden registrar descripciones." },
  { status: 503 }
);

/** Las marcas a las que se le puede colgar una descripción: las del catálogo
 *  de importación (CK/TH/KL) y las de Facturas Tienda. Es la MISMA tabla, y
 *  las dos pantallas leen de ella. Nada que no esté acá se escribe. */
const CANON = new Map<string, string>();
for (const c of [...MARCA_CATALOGO, ...TIENDA_MARCA_CATALOGO]) {
  if (!CANON.has(marcaKey(c.marca))) CANON.set(marcaKey(c.marca), c.marca);
}

interface Entrante {
  marca: string;
  descripcion: string;
}

/**
 * 🔴 REGISTRA LAS DESCRIPCIONES QUE «PASAN» (17-sep-2026).
 *
 * Daniel, 8-sep-2026: «q siga pasando pero se agregue al catalogo (para poner
 * formulas en algun momento)». El porqué completo vive en
 * `src/app/productos/cargar/descripciones-que-pasan.ts`.
 *
 * Body: `{ descripciones: [{ marca, descripcion }] }`.
 *
 * Tres reglas que no cambian:
 *  · **Idempotente**: el índice único `lower(marca), lower(descripcion)` es el
 *    que manda. Lo repetido no es un error, se cuenta como «ya estaba».
 *  · **Nunca rompe nada**: quien llama no mira la respuesta. Sin la migración
 *    del `origen` (CHECK 23514) contesta ok con 0 registradas y lo dice en el
 *    log del servidor — la descripción pasa igual y el Excel sale igual.
 *  · **No aprueba nada**: `aprobada_por` y `aprobada_at` van en NULL. Aprobar
 *    sigue siendo un acto de una persona, en `…/descripciones/aprobar`.
 */
export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED);
  if (authError) return authError;
  if (!HAS_SERVICE_ROLE) return MISCONFIG;

  let body: { descripciones?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const crudas = Array.isArray(body.descripciones) ? body.descripciones : null;
  if (!crudas) return NextResponse.json({ error: "Falta la lista de descripciones." }, { status: 400 });
  if (crudas.length > MAX_POR_ENVIO) {
    return NextResponse.json({ error: `Demasiadas descripciones (máximo ${MAX_POR_ENVIO}).` }, { status: 400 });
  }

  // Validación en el borde: marca del catálogo (forma canónica) y descripción
  // por `normalizarEspacios`, la ÚNICA normalización de espacios del catálogo
  // —la misma que refuerza el CHECK de la base—. Lo que no valida se SALTA sin
  // hacer fallar el lote: esto no lo mira nadie, y un renglón raro no puede
  // costar los 30 buenos.
  const porClave = new Map<string, Entrante>();
  for (const cruda of crudas) {
    const o = cruda as Record<string, unknown>;
    const canon = CANON.get(marcaKey(String(o?.marca ?? "")));
    const descripcion = normalizarEspacios(String(o?.descripcion ?? ""));
    if (!canon || !descripcion) continue;
    const k = `${marcaKey(canon)}|||${marcaKey(descripcion)}`;
    if (!porClave.has(k)) porClave.set(k, { marca: canon, descripcion });
  }
  const entrantes = [...porClave.values()];
  if (entrantes.length === 0) return NextResponse.json({ ok: true, registradas: 0, yaEstaban: 0 });

  // Lo que ya está, de las marcas que llegaron. Una lectura, no una por fila.
  const marcas = [...new Set(entrantes.map((e) => e.marca))];
  const { data: existentes, error: errLeer } = await supabaseServer
    .from("depurador_descripciones")
    .select("marca, descripcion")
    .in("marca", marcas);

  if (errLeer) {
    console.error("[descripciones-registrar] no se pudo leer el catálogo:", errLeer.message);
    return NextResponse.json({ ok: true, registradas: 0, yaEstaban: 0 });
  }

  const yaEstan = new Set(
    (existentes ?? []).map((r) => `${marcaKey(r.marca)}|||${marcaKey(r.descripcion)}`)
  );
  const nuevas = entrantes.filter(
    (e) => !yaEstan.has(`${marcaKey(e.marca)}|||${marcaKey(e.descripcion)}`)
  );
  const yaEstaban = entrantes.length - nuevas.length;
  if (nuevas.length === 0) return NextResponse.json({ ok: true, registradas: 0, yaEstaban });

  const filas = nuevas.map((e) => ({
    marca: e.marca,
    descripcion: e.descripcion,
    activa: true,
    origen: ORIGEN_AUTOMATICA,
    aprobada_por: null,
    aprobada_at: null,
  }));

  const { error } = await supabaseServer.from("depurador_descripciones").insert(filas);
  if (!error) return NextResponse.json({ ok: true, registradas: filas.length, yaEstaban });

  // 23505 = otra corrida la insertó entre la lectura y la escritura. El lote
  // entero se rechaza por una fila, así que se reintenta una por una y la
  // repetida se cuenta como «ya estaba».
  if (error.code === "23505") {
    let registradas = 0;
    let repetidas = 0;
    for (const fila of filas) {
      const { error: e1 } = await supabaseServer.from("depurador_descripciones").insert(fila);
      if (!e1) registradas++;
      else if (e1.code === "23505") repetidas++;
      else console.error("[descripciones-registrar] no se pudo registrar:", e1.message);
    }
    return NextResponse.json({ ok: true, registradas, yaEstaban: yaEstaban + repetidas });
  }

  // 23514 = la migración del `origen` todavía no corrió. Falla ABIERTA: ok con
  // cero, la pantalla no cambia y nadie se entera de nada raro.
  console.error("[descripciones-registrar] no se pudo registrar el lote:", error.message);
  return NextResponse.json({ ok: true, registradas: 0, yaEstaban, sinMigracion: error.code === "23514" });
}
