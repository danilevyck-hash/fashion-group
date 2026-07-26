"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { ProyectoForm } from "@/components/marketing";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";
import type { MkMarca, MkProyecto } from "@/lib/marketing/types";

interface Props {
  marcas: MkMarca[];
  onClose: () => void;
  onCreated: (proyectoId: string) => void;
}

export default function NuevoProyectoModal({
  marcas,
  onClose,
  onCreated,
}: Props) {
  const { toast } = useToast();
  const [guardando, setGuardando] = useState(false);

  // Clic fuera + Escape. El modal solo existe mientras está abierto, así que
  // `open` es siempre true. Si ya escribió algo, no cierra (sale con Cancelar).
  const { panelRef, backdrop } = useFormModalDismiss(true, onClose, !guardando);

  const handleSubmit = async (data: {
    tienda: string;
    tiendaCodigo?: string;
    nombre: string;
    notas: string;
  }) => {
    setGuardando(true);
    try {
      const res = await fetch("/api/marketing/proyectos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tienda: data.tienda,
          tiendaCodigo: data.tiendaCodigo || null,
          nombre: data.nombre || undefined,
          notas: data.notas || undefined,
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" {...backdrop} />
      <div
        ref={panelRef}
        className="relative bg-white w-full sm:max-w-4xl lg:max-w-5xl sm:rounded-lg rounded-t-2xl max-h-[90vh] overflow-y-auto border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 pl-6 pr-3 py-2.5 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">
            Nuevo proyecto
          </h2>
          {/* Era texto suelto sin caja (13.2×20 px): el target más chico de toda
              la app. Ahora 44×44 como manda la regla de la casa. */}
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            aria-label="Cerrar"
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-md text-gray-500 hover:text-black active:scale-[0.97] transition disabled:opacity-40"
          >
            <span aria-hidden="true" className="text-xl leading-none">&times;</span>
          </button>
        </div>
        <div className="p-6">
          <ProyectoForm
            marcas={marcas}
            onSubmit={handleSubmit}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
