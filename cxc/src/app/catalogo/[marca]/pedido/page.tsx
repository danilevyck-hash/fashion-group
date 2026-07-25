"use client";

// Redirect viejo /catalogo/[marca]/pedido → lista de pedidos (client replace,
// patrón heredado de ambas marcas).

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function OldPedidoRedirect() {
  const router = useRouter();
  const { marca } = useParams<{ marca: string }>();
  useEffect(() => { router.replace(`/catalogo/${marca}/pedidos`); }, [router, marca]);
  return null;
}
