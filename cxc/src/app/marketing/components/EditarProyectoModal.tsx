"use client";

// Modal de edición del proyecto (registro de gastos). Permite cambiar
// descripción, cliente y fecha de inicio. La marca se elige por factura, no
// por proyecto, así que aquí ya no se edita el reparto de marcas.

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/ToastSystem";
import ClientePicker from "@/components/ClientePicker";
import { AyudaClienteVinculado } from "@/components/marketing/AyudaClienteVinculado";
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
          <div className="flex items-center gap-1 mb-1">
            <label className="block text-xs text-gray-500">
              Cliente <span className="text-red-500">*</span>
            </label>
            <AyudaClienteVinculado />
          </div>
          {/* 🔑 EL MISMO SELECTOR QUE EL RESTO DEL SISTEMA (ago-2026). Acá vivía
              `ClienteTypeahead`, el typeahead LIBRE: tecleando cualquier cosa y
              saliéndose, el proyecto quedaba con `tienda` escrita a mano y
              `tienda_codigo` vacío. Era la segunda forma de elegir cliente que
              quedaba en pie, y contradecía la regla del sistema —el campo de
              cliente amarra al directorio (D-XXX)— justo en el MISMO campo que
              "Registrar gasto" ya amarraba con `permitirOtro={false}`.

              ⚠️ Un proyecto VIEJO con la tienda escrita a mano NO se rompe: el
              selector solo cambia el valor cuando alguien ELIGE, así que el
              texto que ya estaba se conserva y se puede guardar igual. Lo que
              se cierra es escribir uno NUEVO a mano. */}
          <ClientePicker
            value={tienda}
            codigo={tiendaCodigo}
            onChange={(nombreCliente, codigo) => {
              setTienda(nombreCliente);
              setTiendaCodigo(codigo);
            }}
            permitirOtro={false}
            placeholder="Busca el cliente en el directorio…"
            inputClassName="w-full rounded-md border border-gray-300 px-3 py-2 min-h-[44px] pr-16 text-base sm:text-sm focus:border-black focus:outline-none"
          />
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
            placeholder="Opcional — si lo dejas vacío se genera solo"
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
