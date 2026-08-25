import { notFound, redirect } from "next/navigation";
import AdminCatalogoClient from "./AdminCatalogoClient";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";
import { TAB_COMPROBANTES_KEY } from "@/lib/catalogo/numeros-pedido";

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
export default function AdminCatalogoPage({
  params,
  searchParams,
}: {
  params: { marca: string };
  searchParams?: { tab?: string };
}) {
  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  if (searchParams?.tab === TAB_COMPROBANTES_KEY) redirect(`/catalogo/${theme.marca}/pedidos`);
  return <AdminCatalogoClient marca={theme.marca} />;
}
