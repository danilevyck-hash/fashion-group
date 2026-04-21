"use client";

import { useMemo, useState } from "react";
import type {
  MkMarca,
  ProyectoConMarcas,
  MarcaPorcentajeInput,
} from "@/lib/marketing/types";
import { useToast } from "@/components/ToastSystem";
import { AutocompleteInput } from "./AutocompleteInput";
import { PasoInstruccion } from "./PasoInstruccion";

interface ProyectoFormValues {
  tienda: string;
  nombre: string;
  notas: string;
  marcas: MarcaPorcentajeInput[];
}

interface ProyectoFormProps {
  marcas: MkMarca[];
  initial?: Partial<ProyectoConMarcas>;
  onSubmit: (data: ProyectoFormValues) => Promise<void>;
  onCancel?: () => void;
}

// TODO(Fase 3): conectar a /api/marketing/autocomplete?tabla=mk_proyectos&campo=tienda&q=…
async function fetchTiendaSuggestions(_q: string): Promise<string[]> {
  return [];
}

export function ProyectoForm({
  marcas,
  initial,
  onSubmit,
  onCancel,
}: ProyectoFormProps) {
  const { toast } = useToast();

  const marcasIniciales: MarcaPorcentajeInput[] = useMemo(() => {
    if (initial?.marcas && initial.marcas.length > 0) {
      return initial.marcas.map((m) => ({
        marcaId: m.marca.id,
        porcentaje: m.porcentaje,
      }));
    }
    return [{ marcaId: marcas[0]?.id ?? "", porcentaje: 100 }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [tienda, setTienda] = useState<string>(initial?.tienda ?? "");
  const [nombre, setNombre] = useState<string>(initial?.nombre ?? "");
  const [notas, setNotas] = useState<string>(initial?.notas ?? "");
  const [filas, setFilas] = useState<MarcaPorcentajeInput[]>(marcasIniciales);
  const [enviando, setEnviando] = useState(false);

  const suma = filas.reduce((acc, f) => acc + (Number(f.porcentaje) || 0), 0);
  const sumaOk = Math.abs(suma - 100) < 0.0001;
  const tiendaOk = tienda.trim().length > 0;
  const marcasOk =
    filas.length > 0 &&
    filas.every((f) => f.marcaId && Number(f.porcentaje) > 0);

  const puedeGuardar = tiendaOk && marcasOk && sumaOk && !enviando;

  const agregarFila = () => {
    const usadas = new Set(filas.map((f) => f.marcaId));
    const disponible = marcas.find((m) => !usadas.has(m.id));
    setFilas([
      ...filas,
      { marcaId: disponible?.id ?? marcas[0]?.id ?? "", porcentaje: 0 },
    ]);
  };

  const quitarFila = (idx: number) => {
    if (filas.length === 1) return;
    setFilas(filas.filter((_, i) => i !== idx));
  };

  const actualizarFila = (
    idx: number,
    campo: keyof MarcaPorcentajeInput,
    valor: string
  ) => {
    setFilas(
      filas.map((f, i) => {
        if (i !== idx) return f;
        if (campo === "porcentaje") {
          const n = Number(valor);
          return { ...f, porcentaje: Number.isFinite(n) ? n : 0 };
        }
        return { ...f, marcaId: valor };
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeGuardar) return;
    try {
      setEnviando(true);
      await onSubmit({ tienda, nombre, notas, marcas: filas });
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
      <PasoInstruccion
        numero={1}
        titulo="Registra el proyecto"
        descripcion="Define tienda y qué marcas participan. La suma de porcentajes debe ser 100%."
      />

      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
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
            placeholder="Auto-generado si lo dejas vacío"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm text-gray-600">
              Marcas y porcentajes
            </label>
            <div
              className={`text-xs font-medium tabular-nums ${
                sumaOk ? "text-emerald-700" : "text-red-600"
              }`}
              aria-live="polite"
            >
              {sumaOk
                ? `Suma: ${suma}% ✓`
                : `Suma: ${suma}% — ${
                    suma < 100
                      ? `falta ${(100 - suma).toFixed(0)}%`
                      : `sobra ${(suma - 100).toFixed(0)}%`
                  }`}
            </div>
          </div>

          <div className="space-y-2">
            {filas.map((f, idx) => {
              const idMarca = `fila-marca-${idx}`;
              const idPct = `fila-pct-${idx}`;
              return (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1">
                    <label
                      htmlFor={idMarca}
                      className="block text-xs text-gray-500 mb-1"
                    >
                      Marca
                    </label>
                    <select
                      id={idMarca}
                      value={f.marcaId}
                      onChange={(e) =>
                        actualizarFila(idx, "marcaId", e.target.value)
                      }
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none bg-white"
                    >
                      {marcas.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-24">
                    <label
                      htmlFor={idPct}
                      className="block text-xs text-gray-500 mb-1"
                    >
                      %
                    </label>
                    <input
                      id={idPct}
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={f.porcentaje}
                      onChange={(e) =>
                        actualizarFila(idx, "porcentaje", e.target.value)
                      }
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-black focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => quitarFila(idx)}
                    disabled={filas.length === 1}
                    aria-label="Quitar marca"
                    className="rounded-md border border-gray-300 bg-white text-gray-600 w-10 h-10 flex items-center justify-center hover:bg-gray-50 disabled:opacity-40"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={agregarFila}
            disabled={filas.length >= marcas.length}
            className="mt-3 text-sm text-gray-700 hover:text-black disabled:opacity-40"
          >
            + Agregar marca
          </button>
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
            rows={3}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
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
          {enviando ? "Guardando…" : "Guardar proyecto"}
        </button>
      </div>
    </form>
  );
}

export default ProyectoForm;
