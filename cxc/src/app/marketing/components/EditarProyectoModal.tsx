"use client";

// Modal de edición del proyecto (registro de gastos). Permite cambiar
// descripción, cliente y fecha de inicio. La marca se elige por factura, no
// por proyecto, así que aquí ya no se edita el reparto de marcas.

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/ToastSystem";
import ClienteTypeahead from "@/app/guias/components/ClienteTypeahead";
import type { MkMarca, ProyectoConMarcas } from "@/lib/marketing/types";

interface Props {
  open: boolean;
  proyecto: ProyectoConMarcas;
  // Se conserva en la firma por compatibilidad con el caller; ya no se usa.
  marcasCatalogo?: MkMarca[];
  onClose: () => void;
  onSaved: () => void;
}

export default function EditarProyectoModal({
  open,
  proyecto,
  onClose,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const [nombre, setNombre] = useState(proyecto.nombre ?? "");
  const [tienda, setTienda] = useState(proyecto.tienda);
  const [tiendaCodigo, setTiendaCodigo] = useState(proyecto.tienda_codigo ?? "");
  const [fechaInicio, setFechaInicio] = useState(proyecto.fecha_inicio);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNombre(proyecto.nombre ?? "");
    setTienda(proyecto.tienda);
    setTiendaCodigo(proyecto.tienda_codigo ?? "");
    setFechaInicio(proyecto.fecha_inicio);
  }, [open, proyecto]);

  const tiendaValida = tienda.trim().length > 0;
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fechaInicio);
  const puedeGuardar = tiendaValida && fechaValida && !guardando;

  const ejecutarGuardado = async () => {
    setGuardando(true);
    const body = {
      nombre: nombre.trim().length > 0 ? nombre.trim() : null,
      tienda: tienda.trim(),
      tiendaCodigo: tiendaCodigo || null,
      fecha_inicio: fechaInicio,
    };
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

  const handleGuardar = () => {
    if (!puedeGuardar) return;
    void ejecutarGuardado();
  };

  return (
    <Modal open={open} onClose={onClose} title="Editar proyecto" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Cliente <span className="text-red-500">*</span>
          </label>
          <ClienteTypeahead
            value={tienda}
            codigo={tiendaCodigo}
            onSelect={(nombreCliente, codigo) => {
              setTienda(nombreCliente);
              setTiendaCodigo(codigo);
            }}
            onFreeText={(texto) => {
              setTienda(texto);
              setTiendaCodigo("");
            }}
            placeholder="Busca el cliente en el directorio…"
            inputClassName="w-full rounded-md border border-gray-300 px-3 py-2 pr-16 text-sm focus:border-black focus:outline-none"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Elige del directorio para vincular; si no está, se guarda como texto.
          </p>
        </div>

        <div>
          <label htmlFor="ed-nombre" className="block text-xs text-gray-500 mb-1">
            Descripción
          </label>
          <input
            id="ed-nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            disabled={guardando}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none disabled:opacity-50"
            placeholder="Opcional — ej: Remodelación tienda Abril 2026"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Opcional. Si lo dejas vacío, se genera automático.
          </p>
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
