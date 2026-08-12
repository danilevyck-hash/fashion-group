// GET /api/admin/switch-vendedores?empresa=<empresa de un catálogo> — vendedores
// EN VIVO de la instancia Switch de un catálogo. Fuente ÚNICA de la lista de
// vendedores: la usan Sistema → Usuarios (mapeo fg_user → vendedor) Y el
// selector de vendedor del pedido (detalle + checkout).
//
// 🩸 ES EL MISMO ENDPOINT A PROPÓSITO (12-ago-2026). Cuando el vendedor pasó a
// ser elegible al armar el pedido, la tentación era crear una segunda ruta bajo
// /api/catalogo/. Habrían sido dos listas con dos barridos y dos criterios de
// caché contra una API que admite UN solo login por empresa — y el día que una
// se arreglara, la otra seguiría mostrando otros nombres. Lo que cambió es a
// QUIÉN se le abre, no de dónde sale.
//
// ROLES: los que ARMAN pedidos en alguna marca (`createRoles` sin el 'cliente'
// legacy), que es la misma lista del selector de cliente. Antes era admin-only
// porque el único consumidor era la pantalla de admin. Lo que se expone es el
// nombre y el id de los vendedores de las 4 empresas de catálogo — la misma
// gente a cuyo nombre esos roles ya emiten pedidos.
//
// ⚠️ La lista se CACHEA 15 min por empresa (`vendedoresDeEmpresa`): abrir el
// selector no puede costar un login contra Switch cada vez. Solo se cierra la
// sesión cuando esta llamada realmente fue a Switch.

import { NextRequest, NextResponse } from "next/server";
import { EMPRESAS_CATALOGO, MARCAS_CONFIG } from "@/lib/catalogo/marcas";
import { clienteSwitchRoles } from "@/lib/catalogo/roles";
import { listarVendedores } from "@/lib/catalogo/vendedor-switch";
import { requireRole } from "@/lib/requireRole";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

// Empresas Switch de los catálogos — DERIVADAS de las marcas (fuente única en
// lib/catalogo/marcas.ts). Escribirlas a mano fue lo que dejó a Tommy sin
// vendedor asignable durante semanas.

/** Quien arma pedidos en CUALQUIER marca puede leer la lista de vendedores
 *  (mismo criterio que /api/catalogo/switch-clientes para el directorio). */
const ROLES = clienteSwitchRoles(
  Array.from(new Set(Object.values(MARCAS_CONFIG).flatMap((m) => m.createRoles))),
);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  const empresa = req.nextUrl.searchParams.get("empresa") || "";
  if (!EMPRESAS_CATALOGO.has(empresa)) {
    return NextResponse.json({ error: "empresa inválida" }, { status: 400 });
  }

  let abrioSesion = false;
  try {
    const lista = await listarVendedores(empresa);
    abrioSesion = lista.desdeSwitch;
    return NextResponse.json({ empresa, vendedores: lista.vendedores, fresco: lista.fresco });
  } catch (err) {
    abrioSesion = true;
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Switch no respondió: ${msg}` }, { status: 502 });
  } finally {
    // Higiene de sesión única: solo si esta llamada la abrió. En un acierto de
    // caché no se tocó Switch y desloguear sería trabajo (y riesgo) de más.
    if (abrioSesion) await logoutAllSwitchSessions();
  }
}
