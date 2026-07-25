import { notFound } from "next/navigation";
import AdminCatalogoClient from "./AdminCatalogoClient";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";

// Admin de catálogos /catalogos/admin/[marca] — dinámico por marca (PR-2).
// Las URLs viejas /catalogos/admin/reebok|joybees resuelven aquí sin cambios.
export default function AdminCatalogoPage({ params }: { params: { marca: string } }) {
  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  return <AdminCatalogoClient marca={theme.marca} />;
}
