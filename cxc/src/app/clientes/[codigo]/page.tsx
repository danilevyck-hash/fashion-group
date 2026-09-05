// ─────────────────────────────────────────────────────────────────────────────
// /clientes/[codigo] — LA FICHA DEL CLIENTE.
//
// 🔴 UNA SOLA PÁGINA DEL CLIENTE, TRES LISTAS DISTINTAS (5-sep-2026). Cuentas
// por Cobrar y Ventas › Clientes no se tocan: cada lista es un trabajo distinto
// (cobrar · analizar la venta · arreglar los datos). Lo que se unifica es la
// página a la que se llega al tocar el nombre de un cliente — ésta, la ÚNICA
// superficie sobre un cliente que pueden abrir TODOS los roles.
//
// 🔴 BOSTON CONTESTA 404, no 403. `soloClientesDelGrupo` decide, y el 404 es el
// MISMO que un código inexistente: un 403 sería un oráculo de qué clientes
// tiene Boston.
//
// ⚠️ Este render arma TODO en el servidor y en PARALELO. La ficha ya la montan
// enlaces desde el CXC y desde Ventas › Clientes: se puede abrir con un código
// pegado a mano, así que nada puede depender de haber pasado por otra pantalla.
// ─────────────────────────────────────────────────────────────────────────────

import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { mundosDeClientes, soloClientesDelGrupo } from "@/lib/clientes/mundos";
import { supabaseServer } from "@/lib/supabase-server";
import { verifySession } from "@/lib/session-cookie";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { comprasDelCliente, pagosDelCliente } from "@/lib/clientes/ficha-datos";
import ClienteDetail, { type ClienteDetailData, type FilaAging } from "./ClienteDetail";

const ALLOWED_ROLES = ["admin", "secretaria", "vendedor", "bodega"];

export const dynamic = "force-dynamic";

interface SessionPayload {
  role?: string;
  sessionToken?: string;
}

function parseSession(raw: string | undefined): SessionPayload | null {
  return verifySession(raw);
}

async function isSessionValid(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const { data } = await supabaseServer
    .from("user_sessions")
    .select("id")
    .eq("session_token", token)
    .eq("revoked", false)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/** Las columnas de `clientes_master` que la ficha muestra.
 *  `direccion_switch` puede no existir todavía (migración 20260930120000, la
 *  corre Daniel): se pide aparte y, si el select la rechaza, se reintenta sin
 *  ella. La ficha entera no puede caerse por una columna nueva. */
const COLUMNAS_BASE =
  "id, codigo, nombre, razon_social, identificacion, dv, provincia, contacto, telefono, celular, email, notas, last_synced_at, updated_at, created_at, ausente_desde";

type FilaMaster = ClienteDetailData["cliente"];

async function leerCliente(codigo: string): Promise<FilaMaster | null> {
  const pedir = (conDireccion: boolean) =>
    supabaseServer
      .from("clientes_master")
      .select(COLUMNAS_BASE + (conDireccion ? ", direccion_switch" : ""))
      .eq("codigo", codigo)
      .eq("deleted", false)
      .maybeSingle();

  const conDir = await pedir(true);
  if (!conDir.error) return (conDir.data ?? null) as FilaMaster | null;
  const sinDir = await pedir(false);
  return (sinDir.data ?? null) as FilaMaster | null;
}

export default async function ClienteDetailPage({ params }: { params: Promise<{ codigo: string }> }) {
  const cookieStore = await cookies();
  const session = parseSession(cookieStore.get("cxc_session")?.value);
  if (!session || !ALLOWED_ROLES.includes(session.role || "")) redirect("/");
  if (!(await isSessionValid(session.sessionToken)))           redirect("/");

  const { codigo: rawCodigo } = await params;
  const codigo = decodeURIComponent(rawCodigo);

  // Todo lo que solo depende del código va EN PARALELO. Ninguna lectura
  // depende de otra: encadenarlas son cinco esperas de red una detrás de otra.
  const [cliente, compras, pagos, cxcRes, docsRes, guiaItemRows] = await Promise.all([
    leerCliente(codigo),
    comprasDelCliente(codigo),
    pagosDelCliente(codigo),
    // 🔴 `switch_estadocuenta_aging` es la vista del GRUPO. Boston tiene la
    // SUYA (`switch_estadocuenta_aging_boston`, buckets distintos) y no se
    // mezclan ni acá ni en ningún lado. ⚠️ La columna es `company_key`, no
    // `empresa_key`: es la trampa transversal de las vistas de aging.
    supabaseServer
      .from("switch_estadocuenta_aging")
      .select("company_key, nombre, total, d0_30, d31_60, d61_90, d91_120, d121_180, d181_270, d271_365, mas_365")
      .eq("codigo", codigo),
    // Cuántos documentos con saldo tiene — el texto del enlace «Ver los N
    // documentos ›». Solo el conteo: los documentos los trae el cajón.
    // 🔴 Las 6 del grupo por INCLUSIÓN, en la misma cadena: Boston comparte
    // tabla y un código de cliente no es único entre empresas.
    supabaseServer
      .from("switch_estadocuenta")
      .select("id", { count: "exact", head: true })
      .in("empresa_key", [...B2B_EMPRESA_KEYS])
      .eq("cliente_codigo", codigo)
      .neq("saldo", 0),
    supabaseServer
      .from("guia_items")
      .select("guia_id")
      .eq("cliente_codigo", codigo)
      .eq("deleted", false),
  ]);
  if (!cliente) notFound();

  // Un cliente que no se lista en el Directorio tampoco se abre por URL
  // directa. Mismo criterio y mismo lugar que la lista — `lib/clientes/mundos`.
  // ⚠️ Esto NO es lo mismo que `ausente_desde`: el ausente de Switch SÍ abre su
  // ficha (sus guías viejas apuntan a él), solo deja de ofrecerse en las listas.
  if (soloClientesDelGrupo([cliente], await mundosDeClientes()).length === 0) notFound();

  // Saldo por empresa, ya acotado a las 6 del grupo: la vista `..._aging` es
  // solo del grupo por construcción, pero se filtra igual para que traer una
  // empresa nueva a esa vista no pueda colarse en la ficha.
  const aging = ((cxcRes.data ?? []) as FilaAging[]).filter((r) =>
    (B2B_EMPRESA_KEYS as readonly string[]).includes(r.company_key),
  );
  const debePorEmpresa = new Map<string, number>();
  for (const r of aging) {
    debePorEmpresa.set(
      r.company_key,
      (debePorEmpresa.get(r.company_key) ?? 0) + Number(r.total ?? 0),
    );
  }

  const empresas = compras.porEmpresa.map((e) => ({
    empresa: e.empresa,
    compras: e.compras,
    comprasAnterior: e.comprasAnterior,
    debe: Math.round((debePorEmpresa.get(e.empresa) ?? 0) * 100) / 100,
  }));

  // Lo FACTURADO sin restar las notas de crédito: es lo único que distingue
  // «nunca compró» de «compró y se le acreditó todo». Ver la 🩸 de `ficha.ts`.
  const comprasBrutas =
    compras.porEmpresa.reduce((s, e) => s + Math.round(e.comprasBrutas * 100), 0) / 100;

  // La última compra del GRUPO es la más reciente de sus empresas.
  let ultimaCompra: string | null = null;
  for (const e of compras.porEmpresa) {
    if (e.ultimaCompra && (!ultimaCompra || e.ultimaCompra > ultimaCompra)) {
      ultimaCompra = e.ultimaCompra;
    }
  }

  // Últimas guías del cliente. Dedupe por guía (un cliente puede tener varias
  // líneas en la misma guía) y las 3 más recientes.
  const guiaIds = [...new Set(
    (guiaItemRows.data ?? [])
      .map(r => (r as { guia_id: string | null }).guia_id)
      .filter((x): x is string => !!x),
  )];
  let ultimasGuias: { id: string; numero: number; fecha: string }[] = [];
  if (guiaIds.length > 0) {
    const { data: gts } = await supabaseServer
      .from("guia_transporte")
      .select("id, numero, fecha")
      .in("id", guiaIds)
      .eq("deleted", false)
      .order("fecha", { ascending: false })
      .order("numero", { ascending: false })
      .limit(3);
    ultimasGuias = (gts ?? []) as { id: string; numero: number; fecha: string }[];
  }

  const data: ClienteDetailData = {
    cliente,
    anio: compras.anio,
    empresas,
    compras_brutas: comprasBrutas,
    ultima_compra: ultimaCompra,
    ultimo_pago: pagos.ultimoPago,
    pagos_por_fecha: pagos.porFecha,
    documentos_con_saldo: docsRes.count ?? 0,
    ultimas_guias: ultimasGuias,
    aging,
  };

  return <ClienteDetail initialData={data} />;
}
