"use client";

import { useEffect, useState } from "react";
import Drawer from "@/components/Drawer";
import { fmt } from "@/lib/format";
import GastoForm, { normalizeStr } from "./GastoForm";
import { CajaResponsable } from "./types";
import { useLastUsed } from "@/lib/hooks/useLastUsed";

interface PeriodoLike {
  id: string;
  fondo_inicial: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  periodo: PeriodoLike;
  totalGastado: number;
  isOwner: boolean;
  /** keepOpen=true tras "Guardar y nuevo" (resetea y queda abierto); false tras
   *  "Guardar gasto" (cierra). En ambos el padre recarga el detalle. */
  onSaved: (opts: { keepOpen: boolean }) => void;
}

/**
 * Alta de gasto INLINE en un Drawer (reusa GastoForm). Carga su propio catálogo
 * de categorías/responsables al abrir. La ruta /caja/[id]/nuevo sigue viva para
 * deep-links (smart-suggestions con prefill); este Drawer es el camino normal
 * desde el detalle, sin navegación de página.
 */
export default function NuevoGastoDrawer({ open, onClose, periodo, totalGastado, isOwner, onSaved }: Props) {
  const [categorias, setCategorias] = useState<string[]>([]);
  const [responsablesCatalog, setResponsablesCatalog] = useState<CajaResponsable[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [gFecha, setGFecha] = useState(new Date().toISOString().slice(0, 10));
  const [gDescripcion, setGDescripcion] = useState("");
  const [gProveedor, setGProveedor] = useState("");
  const [gNroFactura, setGNroFactura] = useState("");
  const [gSubtotal, setGSubtotal] = useState("");
  const [gItbmsPct, setGItbmsPct] = useState("0");
  const [gCategoria, setGCategoria] = useState("Transporte");
  const [gResponsableId, setGResponsableId] = useState("");
  // Última categoría/responsable usados (fg_last_*): la secretaria que carga
  // 10 comprobantes del mismo responsable no lo re-elige 10 veces.
  const [lastCategoria, setLastCategoria] = useLastUsed("caja_categoria", "Transporte");
  const [lastResponsable, setLastResponsable] = useLastUsed("caja_responsable", "");
  const [addingGasto, setAddingGasto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManageCat, setShowManageCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [pendingNeg, setPendingNeg] = useState<{
    fondo: number; gastado: number; nuevo: number; saldoFuturo: number; andNew: boolean;
  } | null>(null);

  const subtotalNum = parseFloat(gSubtotal) || 0;
  const itbmsNum = Math.round(subtotalNum * (parseFloat(gItbmsPct) / 100) * 100) / 100;
  const totalNum = Math.round((subtotalNum + itbmsNum) * 100) / 100;

  // Sembrar con lo último usado al abrir (la categoría directo; el responsable
  // solo si sigue existiendo en el catálogo ya cargado).
  useEffect(() => {
    if (!open) return;
    setGCategoria(lastCategoria || "Transporte");
  }, [open, lastCategoria]);
  useEffect(() => {
    if (!open || !lastResponsable) return;
    if (responsablesCatalog.some((r) => String(r.id) === lastResponsable)) {
      setGResponsableId((prev) => prev || lastResponsable);
    }
  }, [open, lastResponsable, responsablesCatalog]);

  // Carga catálogos al abrir.
  useEffect(() => {
    if (!open) return;
    setCatalogError(null);
    fetch("/api/caja/categorias")
      .then((r) => { if (!r.ok) throw new Error("categorias"); return r.json(); })
      .then((d: string[]) => setCategorias(Array.isArray(d) ? d : []))
      .catch(() => setCatalogError("No se pudieron cargar las categorías. Cierra y vuelve a abrir."));
    fetch("/api/caja/responsables")
      .then((r) => { if (!r.ok) throw new Error("responsables"); return r.json(); })
      .then((d: CajaResponsable[]) => setResponsablesCatalog(Array.isArray(d) ? d : []))
      .catch(() => setCatalogError("No se pudieron cargar las categorías o responsables. Cierra y vuelve a abrir."));
  }, [open]);

  function resetForm() {
    setGFecha(new Date().toISOString().slice(0, 10));
    setGDescripcion("");
    setGProveedor("");
    setGNroFactura("");
    setGSubtotal("");
    setGItbmsPct("0");
    // Categoría y responsable NO se resetean: "Guardar y nuevo" retiene lo
    // recién usado (el caso real es cargar varios comprobantes seguidos del
    // mismo responsable).
  }

  async function save(opts: { andNew: boolean; skipNegativeCheck?: boolean }) {
    if (!opts.skipNegativeCheck) {
      const saldoFuturo = Math.round((periodo.fondo_inicial - totalGastado - totalNum) * 100) / 100;
      if (saldoFuturo < 0) {
        setPendingNeg({ fondo: periodo.fondo_inicial, gastado: totalGastado, nuevo: totalNum, saldoFuturo, andNew: opts.andNew });
        return;
      }
    }

    setAddingGasto(true);
    setError(null);
    const resolvedCategoria = normalizeStr(gCategoria) || "Otros";
    try {
      const res = await fetch("/api/caja/gastos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodo_id: periodo.id,
          fecha: gFecha,
          descripcion: gDescripcion,
          proveedor: gProveedor,
          nro_factura: gNroFactura,
          responsable_id: gResponsableId,
          categoria: resolvedCategoria,
          subtotal: subtotalNum,
          itbms: itbmsNum,
          total: totalNum,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError((payload && typeof payload.error === "string" ? payload.error : null) || "Error al agregar gasto. Intenta de nuevo.");
        return;
      }
      setLastCategoria(resolvedCategoria);
      setLastResponsable(gResponsableId);
      if (opts.andNew) {
        resetForm();
        onSaved({ keepOpen: true });
      } else {
        onSaved({ keepOpen: false });
      }
    } catch {
      setError("Error al agregar gasto. Intenta de nuevo.");
    } finally {
      setAddingGasto(false);
    }
  }

  function confirmNeg() {
    if (!pendingNeg) return;
    const andNew = pendingNeg.andNew;
    setPendingNeg(null);
    save({ andNew, skipNegativeCheck: true });
  }
  function cancelNeg() { setPendingNeg(null); }

  const canSave =
    !!gDescripcion.trim() &&
    subtotalNum > 0 &&
    !!gResponsableId &&
    !!gCategoria.trim() &&
    !!gProveedor.trim() &&
    !addingGasto;

  const values = { gFecha, gDescripcion, gProveedor, gNroFactura, gSubtotal, gItbmsPct, gCategoria, gResponsableId };
  const setters = { setGFecha, setGDescripcion, setGProveedor, setGNroFactura, setGSubtotal, setGItbmsPct, setGCategoria, setGResponsableId };

  const footer = (
    <div className="skin-caja flex items-center justify-between gap-2">
      <div className="text-xs" style={{ color: "var(--caja-fg-muted)" }}>
        {canSave ? (
          <>Total: <span className="caja-mono" style={{ color: "var(--caja-fg-strong)", fontWeight: 600 }}>${fmt(totalNum)}</span></>
        ) : "Completa los campos obligatorios."}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => save({ andNew: true })}
          disabled={!canSave}
          className="text-sm font-medium px-3 h-9 rounded-md transition-colors disabled:opacity-40"
          style={{ background: "#fff", color: "var(--caja-fg-default)", border: "1px solid var(--caja-border-default)" }}
        >
          Guardar y nuevo
        </button>
        <button
          onClick={() => save({ andNew: false })}
          disabled={!canSave}
          className="text-sm font-medium px-3 h-9 rounded-md transition-transform active:scale-[0.97] disabled:opacity-40"
          style={{ background: "var(--caja-accent)", color: "#fff" }}
        >
          {addingGasto ? "Guardando..." : "Guardar gasto"}
        </button>
      </div>
    </div>
  );

  return (
    <Drawer open={open} onClose={onClose} title="Nuevo gasto" footer={footer}>
      <div className="skin-caja px-5 py-5">
        {error && (
          <p className="text-sm mb-4 px-3 py-2 rounded-md" style={{ color: "var(--caja-danger-onSoft)", background: "var(--caja-danger-soft)", border: "1px solid var(--caja-danger-border)" }}>
            {error}
          </p>
        )}
        {catalogError && (
          <p className="text-sm mb-4 px-3 py-2 rounded-md" style={{ color: "var(--caja-danger-onSoft)", background: "var(--caja-danger-soft)", border: "1px solid var(--caja-danger-border)" }}>
            {catalogError}
          </p>
        )}
        <GastoForm
          values={values}
          setters={setters}
          subtotalNum={subtotalNum}
          totalNum={totalNum}
          categorias={categorias}
          responsablesCatalog={responsablesCatalog}
          showManageCat={showManageCat}
          newCatName={newCatName}
          isOwner={isOwner}
          setCategorias={setCategorias}
          setShowManageCat={setShowManageCat}
          setNewCatName={setNewCatName}
        />
      </div>

      {pendingNeg && (
        <div className="skin-caja fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60]" onClick={cancelNeg}>
          <div className="bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4" style={{ border: "1px solid var(--caja-border-default)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-medium mb-3" style={{ color: "var(--caja-fg-strong)" }}>¿Continuar con saldo negativo?</h3>
            <p className="text-sm mb-2" style={{ color: "var(--caja-fg-default)" }}>
              Este gasto deja el fondo en <strong className="caja-mono">${fmt(pendingNeg.saldoFuturo)}</strong> (fondo <span className="caja-mono">${fmt(pendingNeg.fondo)}</span>, gastos <span className="caja-mono">${fmt(pendingNeg.gastado)}</span>, nuevo <span className="caja-mono">${fmt(pendingNeg.nuevo)}</span>).
            </p>
            <p className="text-xs mb-6" style={{ color: "var(--caja-fg-muted)" }}>Considera solicitar reabastecimiento antes de seguir gastando.</p>
            <div className="flex gap-3">
              <button onClick={confirmNeg} className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium text-white active:scale-[0.97] transition-all min-h-[44px]" style={{ background: "var(--caja-danger)" }}>Sí, guardar igual</button>
              <button onClick={cancelNeg} className="flex-1 px-4 py-2.5 rounded-md text-sm transition-all min-h-[44px]" style={{ background: "#fff", color: "var(--caja-fg-default)", border: "1px solid var(--caja-border-default)" }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
