"use client";

// Fase 2: ProyectoForm simplificado — sin selector de marcas.
// Las marcas se asignan a nivel FACTURA (mk_factura_marcas).
// Proyectos viejos con mk_proyecto_marcas siguen funcionando como legacy.

import { useState } from "react";
import type {
  MkMarca,
  ProyectoConMarcas,
  MarcaPorcentajeInput,
} from "@/lib/marketing/types";
import { useToast } from "@/components/ToastSystem";
import { AutocompleteInput } from "./AutocompleteInput";

export interface ProyectoFormValues {
  tienda: string;
  nombre: string;
  notas: string;
  // Siempre vacío en el flow nuevo. El tipo se preserva por compatibilidad
  // con callers que esperan CreateProyectoInput completo.
  marcas: MarcaPorcentajeInput[];
}

interface ProyectoFormProps {
  // marcas se mantiene en props por compatibilidad; ya no se usa.
  marcas?: MkMarca[];
  initial?: Partial<ProyectoConMarcas>;
  onSubmit: (data: ProyectoFormValues) => Promise<void>;
  onCancel?: () => void;
}

async function fetchTiendaSuggestions(_q: string): Promise<string[]> {
  return [];
}

export function ProyectoForm({
  initial,
  onSubmit,
  onCancel,
}: ProyectoFormProps) {
  const { toast } = useToast();

  const [tienda, setTienda] = useState<string>(initial?.tienda ?? "");
  const [nombre, setNombre] = useState<string>(initial?.nombre ?? "");
  const [notas, setNotas] = useState<string>(initial?.notas ?? "");
  const [enviando, setEnviando] = useState(false);

  const tiendaOk = tienda.trim().length > 0;
  const puedeGuardar = tiendaOk && !enviando;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeGuardar) return;
    try {
      setEnviando(true);
      await onSubmit({ tienda, nombre, notas, marcas: [] });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo guardar el proyecto. Intenta de nuevo.";
      toast(message, "error");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            Nuevo proyecto
          </h2>
          <p className="text-xs text-gray-500">
            Las marcas se asignan a cada factura al subirla, no al proyecto.
          </p>
        </div>

        <AutocompleteInput
          label="Tienda"
          value={tienda}
          onChange={setTienda}
          fetchSuggestions={fetchTiendaSuggestions}
          placeholder="Ej: Albrook Mall"
          required
        />

        <div>
          <label
            htmlFor="proyecto-nombre"
            className="block text-sm text-gray-600 mb-1"
          >
            Nombre
          </label>
          <input
            id="proyecto-nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Tienda nueva — Abril 2026"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="proyecto-notas"
            className="block text-sm text-gray-600 mb-1"
          >
            Notas
          </label>
          <textarea
            id="proyecto-notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Opcional — contexto, referencias, período"
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none resize-y"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={enviando}
            className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={!puedeGuardar}
          className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition disabled:opacity-50"
        >
          {enviando ? "Creando…" : "Crear proyecto"}
        </button>
      </div>
    </form>
  );
}

export default ProyectoForm;
