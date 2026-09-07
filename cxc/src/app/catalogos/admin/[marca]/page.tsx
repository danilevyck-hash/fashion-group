import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import AdminCatalogoClient from "./AdminCatalogoClient";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";
import { TAB_COMPROBANTES_KEY } from "@/lib/catalogo/numeros-pedido";
import { verifySession } from "@/lib/session-cookie";
import { puedeAdministrarCatalogo } from "@/lib/catalogo/roles";

// Admin de catálogos /catalogos/admin/[marca] — dinámico por marca (PR-2).
// Las URLs viejas /catalogos/admin/reebok|joybees resuelven aquí sin cambios.
//
// 🔴 `?tab=pedidos` YA NO VIVE ACÁ (25-ago-2026). Los comprobantes dejaron de
// ser una pestaña de este panel y pasaron a ser UNA pantalla propia, la misma
// para los tres roles: `/catalogo/<marca>/pedidos`. Ver `PedidosListClient`.
//
// 🩸 LA `key` NO SE TOCÓ, y por eso el marcador guardado sigue llegando: quien
// entre a `?tab=pedidos` aterriza en la pantalla nueva. Es lo mismo que se hizo
// con `/saldos-banco` y con los slugs viejos de `/g/` — se cambia a dónde
// lleva, nunca la llave con la que alguien lo tiene anotado.
//
// 🩸 ESTA PÁGINA NO COMPROBABA NINGÚN ROL (hasta el 6-sep-2026). Resolvía la
// marca y montaba el componente; el único guardia era del navegador y el
// middleware solo valida que la sesión EXISTA, así que cualquiera con sesión
// —un vendedor, bodega, David— abría la pantalla de administrar antes de que
// el cliente pudiera rebotarlo. El guard va ANTES de dibujar nada, igual que en
// `/multifashion` y `/ventas`, y la lista de roles se DERIVA de
// `CATALOGO_ADMIN_ROLES` (`src/lib/catalogo/roles.ts`), la MISMA que ya protege
// las rutas de datos. ⚠️ Administrar es de admin y secretaria: vendedor, bodega
// y `gerente_boston` solo VEN, y rebotan a su casa.
export const dynamic = "force-dynamic";

export default async function AdminCatalogoPage({
  params,
  searchParams,
}: {
  params: { marca: string };
  searchParams?: { tab?: string };
}) {
  const role = verifySession((await cookies()).get("cxc_session")?.value)?.role ?? null;
  if (!role) redirect("/");
  if (!puedeAdministrarCatalogo(role)) redirect("/home");

  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  if (searchParams?.tab === TAB_COMPROBANTES_KEY) redirect(`/catalogo/${theme.marca}/pedidos`);
  return <AdminCatalogoClient marca={theme.marca} />;
}
