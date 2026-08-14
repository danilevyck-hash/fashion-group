// ─────────────────────────────────────────────────────────────────────────────
// /api/multifashion/metas — las metas de la tienda y su avance.
//
// ── 🔴 ESTA RUTA NO ACEPTA NI UNA FECHA DEL NAVEGADOR ───────────────────────
//
// El período sale de la fila de la meta (`multifashion_metas`), que está en la
// base y la escribe un admin. No se lee ni un `searchParams` de fecha, así que
// no hay nada del cliente que acotar.
//
// 🔑 EL CÁLCULO Y EL PERMISO ESTÁN SEPARADOS, y eso se probó en la práctica.
// `avanceDeMeta` calcula siempre el período ENTERO y no mira ni un rol; acá se
// decide QUIÉN lo recibe (`metas-permiso.ts`). Cuando Daniel contestó que
// Jennifer podía ver Multifashion completo, habilitarla fue agregar un rol a
// una lista — no rehacer ninguna cuenta. Si el permiso hubiera estado metido
// dentro de la aritmética, habría sido un rediseño.
//
// Quién entra hoy: admin y secretaria (lectura), gerente_acs (lectura, desde el
// 13-ago-2026) y solo admin edita. Ver `metas-permiso.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { esTablaAusente } from "@/lib/contable/tabla-ausente";
import {
  puedeVerMetas,
  puedeEditarMetas,
  rolesQueEntranAMetas,
} from "@/lib/multifashion/metas-permiso";
import {
  avanceDeMeta,
  leerMetas,
  leerVendedorasCandidatas,
  type MetaConAvance,
} from "@/lib/multifashion/metas-lectura";
import { claveVendedora, esClaveDeSistema } from "@/lib/multifashion/metas-clave";
import { hoyPanama } from "@/lib/fecha-panama";

export const dynamic = "force-dynamic";

const NO_INSTALADO = {
  instalado: false as const,
  metas: [],
  vendedoras: [],
  aviso:
    "Las metas todavía no están instaladas. Pídele a Daniel que corra el archivo " +
    "20260813170000_multifashion_metas.sql en Supabase.",
};


// ═════════════════════════════════════════════════════════════════════════════
// GET — las metas vivas con su avance + las personas entre las que se elige
// ═════════════════════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  const auth = requireRole(req, rolesQueEntranAMetas());
  if (auth instanceof NextResponse) return auth;

  if (!puedeVerMetas(auth.role)) {
    return NextResponse.json({ error: "Sin acceso a las metas." }, { status: 403 });
  }

  const hoy = hoyPanama();

  try {
    const metas = await leerMetas();
    if (metas == null) return NextResponse.json(NO_INSTALADO);

    // Secuencial y no en paralelo: son varias lecturas por meta contra una base
    // en compute Micro, y hoy hay UNA meta. Dispararlas todas juntas convierte
    // una pantalla en una ráfaga.
    const conAvance: MetaConAvance[] = [];
    for (const meta of metas) conAvance.push(await avanceDeMeta(meta, hoy));

    // La lista de candidatas solo la necesita quien puede editar.
    const vendedoras = puedeEditarMetas(auth.role)
      ? await leerVendedorasCandidatas(hoy)
      : [];

    return NextResponse.json({
      instalado: true,
      hoy,
      puedeEditar: puedeEditarMetas(auth.role),
      metas: conAvance,
      vendedoras,
    });
  } catch (e) {
    if (esTablaAusente(e)) return NextResponse.json(NO_INSTALADO);
    console.error("[multifashion/metas] GET", e);
    return NextResponse.json(
      { error: "No se pudieron cargar las metas. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Validación del cuerpo — compartida por POST y PUT
// ═════════════════════════════════════════════════════════════════════════════

interface CuerpoMeta {
  nombre?: unknown;
  desde?: unknown;
  hasta?: unknown;
  objetivo?: unknown;
  tipo?: unknown;
  premio?: unknown;
  premioMonto?: unknown;
  activa?: unknown;
  participantes?: unknown;
}

interface ParticipanteEntrada {
  clave: string;
  nombre: string;
  objetivoIndividual: number | null;
}

interface MetaValidada {
  nombre: string;
  desde: string;
  hasta: string;
  objetivo: number;
  tipo: "grupal" | "vendedora";
  premio: string | null;
  premioMonto: number | null;
  activa: boolean;
  participantes: ParticipanteEntrada[];
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** ¿La fecha existe de verdad? `2026-02-31` cumple el patrón y no es un día. */
function fechaReal(iso: string): boolean {
  if (!ES_FECHA.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

function validar(body: CuerpoMeta): MetaValidada | string {
  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  if (nombre === "") return "Ponle un nombre a la meta.";
  if (nombre.length > 120) return "El nombre es demasiado largo.";

  const desde = String(body.desde ?? "");
  const hasta = String(body.hasta ?? "");
  if (!fechaReal(desde)) return "La fecha de inicio no es válida.";
  if (!fechaReal(hasta)) return "La fecha de fin no es válida.";
  if (hasta < desde) return "La fecha de fin no puede ser anterior a la de inicio.";

  const objetivo = Number(body.objetivo);
  if (!Number.isFinite(objetivo) || objetivo <= 0) return "El monto de la meta tiene que ser mayor que cero.";
  // Tope de sanidad. La tienda vende ~700.000 al año: un objetivo de nueve
  // cifras es un tecleo, y una barra de avance contra un número imposible se
  // queda pegada en 0% para siempre sin decir por qué.
  if (objetivo > 100_000_000) return "Ese monto parece un error de tecleo. Revísalo.";

  const tipo = body.tipo === "vendedora" ? "vendedora" : "grupal";

  const premio =
    typeof body.premio === "string" && body.premio.trim() !== "" ? body.premio.trim() : null;
  let premioMonto: number | null = null;
  if (body.premioMonto != null && body.premioMonto !== "") {
    const n = Number(body.premioMonto);
    if (!Number.isFinite(n) || n < 0) return "El monto del premio no es válido.";
    premioMonto = n;
  }

  const activa = body.activa === undefined ? true : Boolean(body.activa);

  const crudos = Array.isArray(body.participantes) ? body.participantes : [];
  if (crudos.length > 60) return "Demasiadas participantes.";

  const participantes: ParticipanteEntrada[] = [];
  const vistas = new Set<string>();
  for (const p of crudos) {
    const obj = p as { clave?: unknown; nombre?: unknown; objetivoIndividual?: unknown };
    // 🔑 La clave se NORMALIZA otra vez en el servidor. Guardar lo que mandó el
    // navegador dejaría entrar `Ana Trejos` sin normalizar, que al sumar el
    // avance no pegaría con ninguna venta y la persona mostraría 0 para siempre.
    const clave = claveVendedora(String(obj.clave ?? ""));
    if (clave == null) return "Hay una participante sin nombre.";
    if (esClaveDeSistema(clave)) return "DEFAULT no es una vendedora.";
    if (vistas.has(clave)) continue; // repetida: se ignora, no es un error
    vistas.add(clave);

    let objetivoIndividual: number | null = null;
    if (obj.objetivoIndividual != null && obj.objetivoIndividual !== "") {
      const n = Number(obj.objetivoIndividual);
      if (!Number.isFinite(n) || n <= 0) return "Un objetivo por vendedora no es válido.";
      objetivoIndividual = n;
    }

    participantes.push({
      clave,
      nombre: typeof obj.nombre === "string" && obj.nombre.trim() !== "" ? obj.nombre.trim() : clave,
      objetivoIndividual,
    });
  }

  return { nombre, desde, hasta, objetivo, tipo, premio, premioMonto, activa, participantes };
}

async function guardarParticipantes(metaId: string, participantes: ParticipanteEntrada[]) {
  // Reemplazo completo: la lista de participantes ES la definición de la meta,
  // no un histórico. Borrar e insertar solo toca ESTA meta (`.eq("meta_id")`).
  const { error: errDel } = await supabaseServer
    .from("multifashion_meta_participantes")
    .delete()
    .eq("meta_id", metaId);
  if (errDel) throw new Error(errDel.message);

  if (participantes.length === 0) return;

  const { error } = await supabaseServer.from("multifashion_meta_participantes").insert(
    participantes.map((p) => ({
      meta_id: metaId,
      vendedora_clave: p.clave,
      vendedora_nombre: p.nombre,
      objetivo_individual: p.objetivoIndividual,
    })),
  );
  if (error) throw new Error(error.message);
}

// ═════════════════════════════════════════════════════════════════════════════
// POST — crear
// ═════════════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const auth = requireRole(req, rolesQueEntranAMetas());
  if (auth instanceof NextResponse) return auth;
  if (!puedeEditarMetas(auth.role)) {
    return NextResponse.json({ error: "Sin permiso para crear metas." }, { status: 403 });
  }

  const v = validar((await req.json().catch(() => ({}))) as CuerpoMeta);
  if (typeof v === "string") return NextResponse.json({ error: v }, { status: 400 });

  try {
    const { data, error } = await supabaseServer
      .from("multifashion_metas")
      .insert({
        nombre: v.nombre,
        desde: v.desde,
        hasta: v.hasta,
        objetivo: v.objetivo,
        tipo: v.tipo,
        premio: v.premio,
        premio_monto: v.premioMonto,
        activa: v.activa,
        // Sale de la SESIÓN, nunca del cuerpo: si la firma la mandara el
        // navegador, cualquiera podría crear una meta a nombre de otro.
        creada_por: auth.userName ?? null,
      })
      .select("id")
      .single();

    if (error) {
      if (esTablaAusente(error)) return NextResponse.json(NO_INSTALADO, { status: 503 });
      throw new Error(error.message);
    }

    await guardarParticipantes(data.id as string, v.participantes);
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    if (esTablaAusente(e)) return NextResponse.json(NO_INSTALADO, { status: 503 });
    console.error("[multifashion/metas] POST", e);
    return NextResponse.json({ error: "No se pudo guardar la meta." }, { status: 500 });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PUT — editar
// ═════════════════════════════════════════════════════════════════════════════
export async function PUT(req: NextRequest) {
  const auth = requireRole(req, rolesQueEntranAMetas());
  if (auth instanceof NextResponse) return auth;
  if (!puedeEditarMetas(auth.role)) {
    return NextResponse.json({ error: "Sin permiso para editar metas." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as CuerpoMeta & { id?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  if (id === "") return NextResponse.json({ error: "Falta la meta a editar." }, { status: 400 });

  const v = validar(body);
  if (typeof v === "string") return NextResponse.json({ error: v }, { status: 400 });

  try {
    const { error } = await supabaseServer
      .from("multifashion_metas")
      .update({
        nombre: v.nombre,
        desde: v.desde,
        hasta: v.hasta,
        objetivo: v.objetivo,
        tipo: v.tipo,
        premio: v.premio,
        premio_monto: v.premioMonto,
        activa: v.activa,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("deleted", false);

    if (error) {
      if (esTablaAusente(error)) return NextResponse.json(NO_INSTALADO, { status: 503 });
      throw new Error(error.message);
    }

    await guardarParticipantes(id, v.participantes);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (esTablaAusente(e)) return NextResponse.json(NO_INSTALADO, { status: 503 });
    console.error("[multifashion/metas] PUT", e);
    return NextResponse.json({ error: "No se pudo guardar la meta." }, { status: 500 });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// DELETE — retirar (SOFT: la fila queda)
// ═════════════════════════════════════════════════════════════════════════════
export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, rolesQueEntranAMetas());
  if (auth instanceof NextResponse) return auth;
  if (!puedeEditarMetas(auth.role)) {
    return NextResponse.json({ error: "Sin permiso para retirar metas." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  if (id === "") return NextResponse.json({ error: "Falta la meta a retirar." }, { status: 400 });

  try {
    // 🔴 SOFT DELETE. Una meta anunciada al personal no se borra: se retira. La
    // fila queda como evidencia de que existió y con qué número.
    const { error } = await supabaseServer
      .from("multifashion_metas")
      .update({ deleted: true, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      if (esTablaAusente(error)) return NextResponse.json(NO_INSTALADO, { status: 503 });
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (esTablaAusente(e)) return NextResponse.json(NO_INSTALADO, { status: 503 });
    console.error("[multifashion/metas] DELETE", e);
    return NextResponse.json({ error: "No se pudo retirar la meta." }, { status: 500 });
  }
}
