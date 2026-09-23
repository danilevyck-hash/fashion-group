"use client";

// ============================================================================
// EDITAR Y ANULAR DESDE LA FICHA DE LA TIENDA (23-sep-2026, Tiendas y Marcas).
//
// 🩸 Hasta hoy la ÚNICA pantalla donde se podía editar o anular un gasto era
// la ficha del PROYECTO vieja, a la que se llegaba por la marca. Daniel:
// *«el proyecto se va — basta la tienda»*. Acá viven las mismas acciones,
// con los MISMOS formularios y las MISMAS rutas de la pieza «remates»:
//
//   · Factura: `FacturaForm` con `editarDatosDelGasto` → PATCH
//     /api/marketing/facturas/[id] + PUT …/marcas (idéntico a
//     `FacturasSection.handleEditar`). Anular → POST …/anular con motivo.
//     Restaurar una anulada → POST /api/marketing/papelera/restaurar.
//   · Mueble: `EntregaForm` con `initial` → PATCH /api/marketing/inventario/
//     entregas/[id] (el formulario ya lo manda). Eliminar → DELETE, que
//     devuelve el stock (marketing-mobiliario.md).
//   · Pago de impulsadora: se anula acá (es una factura); se edita desde
//     Impulsadoras, que es donde vive su historial.
//
// Misma validación y mismo freno de duplicados por tienda: el servidor.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { ModalOverlay } from "@/components/ui";
import { FacturaForm } from "@/components/marketing";
import EntregaForm from "@/components/marketing/EntregaForm";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";
import { MARKETING_PUERTA_GASTO } from "@/lib/marketing/puerta-gasto";
import type {
  EntregaConItems,
  FacturaConAdjuntos,
  MarcaConPorcentaje,
  MarcaPorcentajeInput,
  MkInventarioProducto,
  MkMarca,
} from "@/lib/marketing/types";
import type { FacturaFormValues } from "@/components/marketing/FacturaForm";
import type { FilaDeTienda } from "@/lib/marketing/vista-tienda";

/** Qué acción está abierta sobre qué fila. */
export type AccionDeFila =
  | { tipo: "editar"; fila: FilaDeTienda }
  | { tipo: "anular"; fila: FilaDeTienda }
  | { tipo: "eliminar-mueble"; fila: FilaDeTienda }
  | null;

interface Props {
  accion: AccionDeFila;
  marcas: MkMarca[];
  tiendaNombre: string;
  onCerrar: () => void;
  /** Se guardó / anuló / eliminó: la ficha vuelve a leer. */
  onCambio: () => void;
}

export default function FichaTiendaAcciones({ accion, marcas, tiendaNombre, onCerrar, onCambio }: Props) {
  if (!accion) return null;
  if (accion.tipo === "anular") {
    return <AnularFactura fila={accion.fila} onCerrar={onCerrar} onCambio={onCambio} />;
  }
  if (accion.tipo === "eliminar-mueble") {
    return <EliminarMueble fila={accion.fila} onCerrar={onCerrar} onCambio={onCambio} />;
  }
  if (accion.fila.tipo === "mueble") {
    return (
      <EditarMueble fila={accion.fila} tiendaNombre={tiendaNombre} onCerrar={onCerrar} onCambio={onCambio} />
    );
  }
  return <EditarFactura fila={accion.fila} marcas={marcas} onCerrar={onCerrar} onCambio={onCambio} />;
}

// ─── EDITAR UNA FACTURA ──────────────────────────────────────────────────────

function EditarFactura({
  fila,
  marcas,
  onCerrar,
  onCambio,
}: {
  fila: FilaDeTienda;
  marcas: MkMarca[];
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const { toast } = useToast();
  const [factura, setFactura] = useState<FacturaConAdjuntos | null>(null);
  const [marcasIniciales, setMarcasIniciales] = useState<MarcaPorcentajeInput[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [fRes, mRes] = await Promise.all([
          fetch(`/api/marketing/facturas/${fila.id}`, { cache: "no-store" }),
          fetch(`/api/marketing/facturas/${fila.id}/marcas`, { cache: "no-store" }),
        ]);
        if (!fRes.ok) throw new Error("No se pudo abrir la factura.");
        const f = (await fRes.json()) as FacturaConAdjuntos;
        const m = mRes.ok ? ((await mRes.json()) as MarcaConPorcentaje[]) : [];
        if (cancelado) return;
        setFactura(f);
        setMarcasIniciales(m.map((x) => ({ marcaId: x.marca.id, porcentaje: x.porcentaje })));
      } catch (err) {
        if (!cancelado) setError(err instanceof Error ? err.message : "No se pudo abrir la factura.");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [fila.id]);

  // Lo MISMO que `FacturasSection.handleEditar`: el PATCH con las tres del
  // rediseño solo si la pantalla las preguntó, y después las marcas.
  const guardar = useCallback(
    async (data: FacturaFormValues) => {
      const { marcasSeleccionadas, gasto, permitirDuplicado: _p, ...payload } = data;
      void _p;
      const res = await fetch(`/api/marketing/facturas/${fila.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gasto ? { ...payload, ...gasto } : payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo actualizar la factura");
      }
      const mRes = await fetch(`/api/marketing/facturas/${fila.id}/marcas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marcas: marcasSeleccionadas }),
      });
      if (!mRes.ok) {
        const err = await mRes.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudieron actualizar las marcas");
      }
      toast("Factura actualizada", "success");
      onCambio();
      onCerrar();
    },
    [fila.id, onCambio, onCerrar, toast],
  );

  return (
    <ModalOverlay onBackdropClick={onCerrar} align="start">
      <div
        className="relative bg-white sm:rounded-lg rounded-t-2xl p-5 max-w-2xl w-full mx-0 sm:mx-4 border border-gray-200 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900">
            Editar factura {factura?.numero_factura ?? fila.numero ?? ""}
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            className="text-sm text-gray-500 hover:text-black min-h-[44px] px-2"
          >
            Cancelar
          </button>
        </div>
        {error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : !factura || marcasIniciales === null ? (
          <div className="h-40 rounded-lg bg-gray-100 animate-pulse" />
        ) : (
          <FacturaForm
            key={factura.id}
            proyecto={{ id: factura.proyecto_id ?? "", marcas: [] }}
            marcasCatalogo={marcas}
            initial={factura}
            initialMarcas={marcasIniciales}
            editarDatosDelGasto={MARKETING_PUERTA_GASTO}
            onSubmit={guardar}
            onCancel={onCerrar}
          />
        )}
      </div>
    </ModalOverlay>
  );
}

// ─── EDITAR UN MUEBLE ────────────────────────────────────────────────────────

function EditarMueble({
  fila,
  tiendaNombre,
  onCerrar,
  onCambio,
}: {
  fila: FilaDeTienda;
  tiendaNombre: string;
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const { toast } = useToast();
  const [entrega, setEntrega] = useState<EntregaConItems | null>(null);
  const [productos, setProductos] = useState<MkInventarioProducto[]>([]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [eRes, pRes] = await Promise.all([
          fetch(`/api/marketing/inventario/entregas/${fila.id}`, { cache: "no-store" }),
          fetch("/api/marketing/inventario/productos", { cache: "no-store" }),
        ]);
        if (!eRes.ok) throw new Error("No se pudo abrir la entrega.");
        const e = (await eRes.json()) as EntregaConItems;
        const p = pRes.ok ? ((await pRes.json()) as MkInventarioProducto[]) : [];
        if (cancelado) return;
        setProductos(Array.isArray(p) ? p : []);
        setEntrega(e);
      } catch (err) {
        if (!cancelado) {
          toast(err instanceof Error ? err.message : "No se pudo abrir la entrega.", "error");
          onCerrar();
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [fila.id, onCerrar, toast]);

  if (!entrega) return null;
  return (
    <EntregaForm
      open
      proyectoId={entrega.proyecto_id ?? null}
      proyectoNombre={tiendaNombre}
      marcasProyecto={[]}
      productos={productos}
      initial={entrega}
      onClose={onCerrar}
      onSaved={() => {
        onCambio();
        onCerrar();
      }}
    />
  );
}

// ─── ANULAR UNA FACTURA (o un pago de impulsadora) ───────────────────────────

function AnularFactura({
  fila,
  onCerrar,
  onCambio,
}: {
  fila: FilaDeTienda;
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const { toast } = useToast();
  const [motivo, setMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);
  const dismiss = useFormModalDismiss(true, onCerrar, !anulando);

  const anular = async () => {
    if (!motivo.trim()) return;
    setAnulando(true);
    try {
      const res = await fetch(`/api/marketing/facturas/${fila.id}/anular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo anular");
      }
      toast(fila.tipo === "impulsadora" ? "Pago anulado" : "Factura anulada", "success");
      onCambio();
      onCerrar();
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo anular", "error");
    } finally {
      setAnulando(false);
    }
  };

  const que = fila.tipo === "impulsadora" ? "este pago de impulsadora" : `la factura ${fila.numero ?? ""}`.trim();
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" {...dismiss.backdrop} />
      <div
        ref={dismiss.panelRef}
        className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-1">Anular {que}</h3>
        <p className="text-sm text-gray-500 mb-4">
          Queda plegada en «Anulados», no suma y no va al ZIP. Se puede restaurar.
        </p>
        <label htmlFor="mk-ficha-motivo-anular" className="block text-sm text-gray-600 mb-1">
          Motivo<span className="text-red-500 ml-0.5">*</span>
        </label>
        <textarea
          id="mk-ficha-motivo-anular"
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Explica qué pasó"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-base sm:text-sm focus:border-black focus:outline-none mb-4"
        />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={anular}
            disabled={anulando || motivo.trim().length === 0}
            className="flex-1 px-4 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] disabled:opacity-50 transition"
          >
            {anulando ? "Anulando…" : "Anular"}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            disabled={anulando}
            className="flex-1 border border-gray-200 text-gray-600 px-4 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ELIMINAR UN MUEBLE (devuelve el stock) ──────────────────────────────────

function EliminarMueble({
  fila,
  onCerrar,
  onCambio,
}: {
  fila: FilaDeTienda;
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const { toast } = useToast();
  const [borrando, setBorrando] = useState(false);
  const dismiss = useFormModalDismiss(true, onCerrar, !borrando);

  const eliminar = async () => {
    setBorrando(true);
    try {
      const res = await fetch(`/api/marketing/inventario/entregas/${fila.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo eliminar la entrega");
      }
      toast("Entrega eliminada; los muebles volvieron a la bodega", "success");
      onCambio();
      onCerrar();
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo eliminar", "error");
    } finally {
      setBorrando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" {...dismiss.backdrop} />
      <div
        ref={dismiss.panelRef}
        className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-1">Eliminar esta entrega de muebles</h3>
        <p className="text-sm text-gray-500 mb-4">
          Los muebles vuelven a la bodega y el gasto deja de sumar. Esto no se puede deshacer.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={eliminar}
            disabled={borrando}
            className="flex-1 px-4 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] disabled:opacity-50 transition"
          >
            {borrando ? "Eliminando…" : "Eliminar"}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            disabled={borrando}
            className="flex-1 border border-gray-200 text-gray-600 px-4 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
