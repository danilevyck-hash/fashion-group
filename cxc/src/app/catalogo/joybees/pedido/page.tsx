"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function OldPedidoRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/catalogo/joybees/pedidos"); }, [router]);
  return null;
}
