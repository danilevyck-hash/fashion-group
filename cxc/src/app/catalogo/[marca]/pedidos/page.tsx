import { notFound } from "next/navigation";
import PedidosListClient from "@/components/catalogo/PedidosListClient";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";

export default function PedidosPage({ params }: { params: { marca: string } }) {
  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  return <PedidosListClient marca={theme.marca} />;
}
