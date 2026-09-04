"use client";

import { useEffect, useState } from "react";
import Drawer from "@/components/Drawer";
import { fmt } from "@/lib/format";
import GastoForm, { normalizeStr } from "./GastoForm";
import AvisoSaldoNegativo from "./AvisoSaldoNegativo";
import { CajaResponsable } from "./types";
import { useLastUsed } from "@/lib/hooks/useLastUsed";
import { useBackdropDismiss } from "@/lib/hooks/useModalDismiss";

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
 * de categorías/responsables al abrir. Este Drawer es el ÚNICO camino de alta
 * desde la UI: la ruta /caja/[id]/nuevo quedó huérfana (nada enlaza a ella;
 * ver la nota en su cabecera).
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
    setGDescripcion("");
    setGProveedor("");
    setGNroFactura("");
    setGSubtotal("");
    setGItbmsPct("0");
    // Fecha, categoría y responsable NO se resetean: "Guardar y nuevo" retiene
    // lo recién usado. El caso real es la tanda: la secretaria teclea ~38
    // recibos de semanas atrás en una sentada, y devolver la fecha a hoy la
    // obligaba a corregirla en cada gasto.
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
    // Mismo respaldo que el servidor ("Varios"): antes aquí decía "Otros" y la
    // misma falta de categoría producía dos valores basura distintos.
    const resolvedCategoria = normalizeStr(gCategoria) || "Varios";
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

  // Clic fuera del cuadro de confirmación = Cancelar (nunca guarda).
  const negBackdrop = useBackdropDismiss(pendingNeg && !addingGasto ? cancelNeg : undefined);

  // Escape con la confirmación anidada abierta: cierra SOLO la confirmación y
  // deja el Drawer abierto. El Drawer escucha keydown en `window` en fase de
  // burbuja, así que aquí escuchamos en `document` en fase de CAPTURA: corre
  // antes y cortamos la propagación, de modo que el listener del Drawer nunca
  // ve la tecla y no se cierra el formulario de atrás.
  useEffect(() => {
    if (!pendingNeg || addingGasto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setPendingNeg(null);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [pendingNeg, addingGasto]);

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
          className="inline-flex items-center justify-center text-sm font-medium px-3 min-h-[44px] rounded-md transition-colors disabled:opacity-40"
          style={{ background: "#fff", color: "var(--caja-fg-default)", border: "1px solid var(--caja-border-default)" }}
        >
          Guardar y nuevo
        </button>
        <button
          onClick={() => save({ andNew: false })}
          disabled={!canSave}
          className="inline-flex items-center justify-center text-sm font-medium px-3 min-h-[44px] rounded-md transition-transform active:scale-[0.97] disabled:opacity-40"
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
        <AvisoSaldoNegativo
          fondo={pendingNeg.fondo}
          gastado={pendingNeg.gastado}
          nuevo={pendingNeg.nuevo}
          saldoFuturo={pendingNeg.saldoFuturo}
          onConfirm={confirmNeg}
          onCancel={cancelNeg}
          backdropProps={negBackdrop}
          sobreDrawer
        />
      )}
    </Drawer>
  );
}
