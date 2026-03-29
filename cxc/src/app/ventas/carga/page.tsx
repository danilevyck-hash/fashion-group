"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function VentasCargaRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/upload?tab=ventas"); }, [router]);
  return null;
}
