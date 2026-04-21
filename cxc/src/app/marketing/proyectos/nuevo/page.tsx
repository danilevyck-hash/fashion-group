"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { useToast } from "@/components/ToastSystem";
import { ProyectoForm } from "@/components/marketing";
import type { MkMarca, MarcaPorcentajeInput } from "@/lib/marketing/types";

export default function NuevoProyectoPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { authChecked } = useAuth({
    moduleKey: "marketing",
    allowedRoles: ["admin", "secretaria", "director"],
  });
  const [marcas, setMarcas] = useState<MkMarca[]>([]);
  const [cargandoMarcas, setCargandoMarcas] = useState(true);

  const cargarMarcas = useCallback(async () => {
    try {
      const res = await fetch("/api/marketing/marcas");
      if (!res.ok) throw new Error("No se pudieron cargar las marcas");
      const data = (await res.json()) as MkMarca[];
      setMarcas(Array.isArray(data) ? data : []);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Sin conexión. Verifica tu internet e intenta de nuevo.";
      toast(msg, "error");
    } finally {
      setCargandoMarcas(false);
    }
  }, [toast]);

  useEffect(() => {
    if (authChecked) cargarMarcas();
  }, [authChecked, cargarMarcas]);

  const handleSubmit = async (data: {
    tienda: string;
    nombre: string;
    notas: string;
    marcas: MarcaPorcentajeInput[];
  }) => {
    const res = await fetch("/api/marketing/proyectos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error ?? "No se pudo crear el proyecto");
    }
    const proyecto = (await res.json()) as { id: string };
    toast("Proyecto creado", "success");
    router.push(`/marketing/proyectos/${proyecto.id}`);
  };

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        module="Marketing"
        breadcrumbs={[{ label: "Nuevo proyecto" }]}
      />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-gray-900">
            Nuevo proyecto
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Registra una tienda o remodelación y define cómo se reparte el gasto entre marcas.
          </p>
        </div>

        {cargandoMarcas ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="h-4 w-40 bg-gray-100 rounded animate-pulse mb-3" />
            <div className="h-24 bg-gray-100 rounded animate-pulse" />
          </div>
        ) : marcas.length === 0 ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            No hay marcas registradas. Contacta al administrador.
          </div>
        ) : (
          <ProyectoForm
            marcas={marcas}
            onSubmit={handleSubmit}
            onCancel={() => router.push("/marketing")}
          />
        )}
      </main>
    </div>
  );
}
