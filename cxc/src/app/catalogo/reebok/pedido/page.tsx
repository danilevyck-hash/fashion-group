"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function OldPedidoRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/catalogo/reebok/pedidos"); }, [router]);
  return null;
}
