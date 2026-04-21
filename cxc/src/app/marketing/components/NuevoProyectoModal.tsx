"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { ProyectoForm } from "@/components/marketing";
import type { MkMarca, MkProyecto } from "@/lib/marketing/types";

interface Props {
  marcas: MkMarca[];
  marcaPreseleccionada?: MkMarca | null;
  onClose: () => void;
  onCreated: (proyectoId: string) => void;
}

export default function NuevoProyectoModal({
  marcas,
  marcaPreseleccionada,
  onClose,
  onCreated,
}: Props) {
  const { toast } = useToast();
  const [guardando, setGuardando] = useState(false);

  const initial = marcaPreseleccionada
    ? {
        marcas: [
          {
            marca: marcaPreseleccionada,
            porcentaje: 100,
          },
        ],
      }
    : undefined;

  const handleSubmit = async (data: {
    tienda: string;
    nombre: string;
    notas: string;
    marcas: Array<{ marcaId: string; porcentaje: number }>;
  }) => {
    setGuardando(true);
    try {
      const res = await fetch("/api/marketing/proyectos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tienda: data.tienda,
          nombre: data.nombre || undefined,
          notas: data.notas || undefined,
          marcas: data.marcas,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo crear el proyecto");
      }
      const proyecto = (await res.json()) as MkProyecto;
      toast("Proyecto creado", "success");
      onCreated(proyecto.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al crear";
      toast(msg, "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={() => !guardando && onClose()}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white w-full sm:max-w-2xl sm:rounded-lg rounded-t-2xl max-h-[90vh] overflow-y-auto border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Nuevo proyecto
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="text-gray-500 hover:text-black text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-6">
          <ProyectoForm
            marcas={marcas}
            initial={initial}
            onSubmit={handleSubmit}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
