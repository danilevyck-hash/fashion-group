"use client";

// Modal de edición libre del proyecto. Permite cambiar nombre, tienda,
// fecha_inicio y reparto de marcas (bulk a todas las facturas + mk_proyecto_marcas).
// No edita facturas individuales — esas se eliminan y vuelven a subir.

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/ToastSystem";
import type {
  MarcaPorcentajeInput,
  MkMarca,
  ProyectoConMarcas,
} from "@/lib/marketing/types";

interface Props {
  open: boolean;
  proyecto: ProyectoConMarcas;
  marcasCatalogo: MkMarca[];
  onClose: () => void;
  onSaved: () => void;
}

export default function EditarProyectoModal({
  open,
  proyecto,
  marcasCatalogo,
  onClose,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const [nombre, setNombre] = useState(proyecto.nombre ?? "");
  const [tienda, setTienda] = useState(proyecto.tienda);
  const [fechaInicio, setFechaInicio] = useState(proyecto.fecha_inicio);
  const [marcasSel, setMarcasSel] = useState<Set<string>>(
    new Set(proyecto.marcas.map((m) => m.marca.id)),
  );
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNombre(proyecto.nombre ?? "");
    setTienda(proyecto.tienda);
    setFechaInicio(proyecto.fecha_inicio);
    setMarcasSel(new Set(proyecto.marcas.map((m) => m.marca.id)));
  }, [open, proyecto]);

  const tipoActivo = useMemo<"externa" | "interna" | null>(() => {
    const tipos = new Set<"externa" | "interna">();
    for (const id of marcasSel) {
      const m = marcasCatalogo.find((x) => x.id === id);
      if (m) tipos.add(m.tipo ?? "externa");
    }
    return tipos.size === 1 ? Array.from(tipos)[0] : null;
  }, [marcasSel, marcasCatalogo]);

  const toggleMarca = (id: string) => {
    setMarcasSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tiendaValida = tienda.trim().length > 0;
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fechaInicio);
  const marcasValidas = marcasSel.size > 0;
  const puedeGuardar =
    tiendaValida && fechaValida && marcasValidas && !guardando;

  const handleGuardar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);

    const marcasOriginales = new Set(proyecto.marcas.map((m) => m.marca.id));
    const cambioMarcas =
      marcasOriginales.size !== marcasSel.size ||
      Array.from(marcasSel).some((id) => !marcasOriginales.has(id));

    const marcasPayload: MarcaPorcentajeInput[] = Array.from(marcasSel).map(
      (marcaId) => ({ marcaId, porcentaje: 50 }), // ignorado server-side
    );

    const body: Record<string, unknown> = {
      nombre: nombre.trim().length > 0 ? nombre.trim() : null,
      tienda: tienda.trim(),
      fecha_inicio: fechaInicio,
    };
    if (cambioMarcas) {
      body.marcas = marcasPayload;
    }

    try {
      const res = await fetch(`/api/marketing/proyectos/${proyecto.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo guardar");
      }
      toast("Proyecto actualizado", "success");
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al guardar";
      toast(msg, "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Editar proyecto" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div>
          <label htmlFor="ed-nombre" className="block text-xs text-gray-500 mb-1">
            Nombre
          </label>
          <input
            id="ed-nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            disabled={guardando}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none disabled:opacity-50"
            placeholder="Ej: Albrook · TH+CK · Abr 2026"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Opcional. Si lo dejas vacío, se genera automático.
          </p>
        </div>

        <div>
          <label htmlFor="ed-tienda" className="block text-xs text-gray-500 mb-1">
            Tienda <span className="text-red-500">*</span>
          </label>
          <input
            id="ed-tienda"
            type="text"
            value={tienda}
            onChange={(e) => setTienda(e.target.value)}
            disabled={guardando}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none disabled:opacity-50"
            placeholder="Ej: Albrook"
          />
        </div>

        <div>
          <label htmlFor="ed-fecha" className="block text-xs text-gray-500 mb-1">
            Fecha de inicio <span className="text-red-500">*</span>
          </label>
          <input
            id="ed-fecha"
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            disabled={guardando}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none disabled:opacity-50"
          />
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1">
            Marcas asignadas <span className="text-red-500">*</span>
          </div>
          <p className="text-[11px] text-gray-400 mb-2">
            Externas (Tommy, Calvin, Reebok) cubren 50%. Internas (Joybees) 100%.
            Cambiar el reparto sobreescribe TODAS las facturas del proyecto.
          </p>
          <div className="space-y-1.5">
            {marcasCatalogo.map((m) => {
              const checked = marcasSel.has(m.id);
              const tipoMarca = m.tipo ?? "externa";
              const deshabilitada =
                tipoActivo !== null && tipoActivo !== tipoMarca;
              const labelPct = tipoMarca === "interna" ? "100%" : "50%";
              return (
                <label
                  key={m.id}
                  className={`flex items-center justify-between gap-3 px-3 py-2 rounded-md border transition ${
                    deshabilitada
                      ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                      : checked
                        ? "border-black bg-gray-50 cursor-pointer"
                        : "border-gray-200 hover:border-gray-300 cursor-pointer"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={deshabilitada || guardando}
                      onChange={() => toggleMarca(m.id)}
                      className="accent-black w-4 h-4 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm text-gray-800">{m.nombre}</span>
                    <span className="text-[11px] text-gray-400">{labelPct}</span>
                    {tipoMarca === "interna" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                        Interna
                      </span>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
          {!marcasValidas && (
            <p className="text-xs text-red-600 mt-1">Selecciona al menos una marca.</p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleGuardar}
            disabled={!puedeGuardar}
            className="flex-1 rounded-md bg-black text-white px-4 py-2.5 text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition disabled:opacity-50 min-h-[44px]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}
