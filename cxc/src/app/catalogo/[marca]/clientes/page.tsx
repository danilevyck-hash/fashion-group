import { notFound } from "next/navigation";
import ClientesClient from "@/components/catalogo/ClientesClient";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";

export default function ClientesPage({ params }: { params: { marca: string } }) {
  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  return <ClientesClient marca={theme.marca} />;
}
