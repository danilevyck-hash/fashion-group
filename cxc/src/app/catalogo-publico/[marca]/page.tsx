import { notFound } from "next/navigation";
import CatalogoPublicoPage from "@/components/catalogo/CatalogoPublicoPage";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";

// Catálogo PÚBLICO compartible /catalogo-publico/[marca] — sin login. Los
// links vivos de WhatsApp (/catalogo-publico/reebok|joybees) resuelven aquí.
export default function CatalogoPublicoMarcaPage({ params }: { params: { marca: string } }) {
  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  return <CatalogoPublicoPage marca={theme.marca} />;
}
