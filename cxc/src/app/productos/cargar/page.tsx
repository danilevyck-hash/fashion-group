"use client";

import { Suspense } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import DepuradorClient from "./DepuradorClient";

export default function CargarProductosPage() {
  return (
    <Suspense>
      <CargarInner />
    </Suspense>
  );
}

function CargarInner() {
  const { authChecked } = useAuth({ moduleKey: "cargar", allowedRoles: ["admin", "secretaria"] });
  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-stone-50">
      <AppHeader module="Cargar Productos" />
      <DepuradorClient />
    </div>
  );
}
