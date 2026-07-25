// Grid canónica del catálogo con sesión: /catalogo/[marca].
// (Estructura unificada PR-2: antes Reebok tenía la grid en /productos con
// redirect desde la raíz y Joybees al revés — ahora la grid vive en la raíz
// para todas las marcas y /productos redirige aquí, sin romper ningún link.)

import { notFound } from "next/navigation";
import CatalogoVendedorPage from "@/components/catalogo/CatalogoVendedorPage";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";

export default function CatalogoMarcaPage({ params }: { params: { marca: string } }) {
  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  return <CatalogoVendedorPage marca={theme.marca} />;
}
