import { notFound, redirect } from "next/navigation";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";

// Redirect de compatibilidad: la grid canónica vive en /catalogo/[marca]
// (PR-2). Los links viejos de Reebok (/catalogo/reebok/productos, compartidos
// por WhatsApp) siguen funcionando — se preservan los query params (filtros).
export default function ProductosRedirect({
  params,
  searchParams,
}: {
  params: { marca: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v) && v.length > 0) qs.set(k, v[0]);
  }
  const q = qs.toString();
  redirect(`${theme.catalogoHref}${q ? `?${q}` : ""}`);
}
