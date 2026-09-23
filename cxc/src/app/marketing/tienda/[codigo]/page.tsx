import { notFound } from "next/navigation";
import { Suspense } from "react";
import { VISTA_TIENDA } from "@/lib/marketing/vista-tienda";
import VistaTienda from "./VistaTienda";

export const dynamic = "force-dynamic";

export default function PaginaDeLaTienda({
  params,
}: {
  params: { codigo: string };
}) {
  // 🔴 Con el interruptor apagado la pantalla NO EXISTE: 404 propio del
  // sistema, igual que cualquier dirección que no existe.
  if (!VISTA_TIENDA) notFound();
  return (
    <Suspense>
      <VistaTienda codigo={decodeURIComponent(params.codigo)} />
    </Suspense>
  );
}
