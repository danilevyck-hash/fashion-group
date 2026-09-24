"use client";

// La página de UN cliente dentro de Cuentas por Cobrar. Se llega desde la hoja
// «Cobrar» del celular («Ver los documentos ›»). El cuerpo vive en su propio
// archivo para poder pintarlo en un candado sin montar la ruta.

import { Suspense } from "react";
import ClienteCxc from "./ClienteCxc";

export default function Page({ params }: { params: { codigo: string } }) {
  return (
    <Suspense>
      <ClienteCxc codigo={decodeURIComponent(params.codigo)} />
    </Suspense>
  );
}
