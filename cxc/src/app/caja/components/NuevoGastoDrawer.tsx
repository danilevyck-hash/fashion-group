"use client";

import { useEffect, useState } from "react";
import Drawer from "@/components/Drawer";
import { fmt } from "@/lib/format";
import GastoForm, { normalizeStr } from "./GastoForm";
import AvisoSaldoNegativo from "./AvisoSaldoNegativo";
import AvisoAntesDeGuardar from "./AvisoAntesDeGuardar";
import ZonaFotos from "./ZonaFotos";
import { useLastUsed } from "@/lib/hooks/useLastUsed";
import { useBackdropDismiss } from "@/lib/hooks/useModalDismiss";
import { centavos } from "@/lib/caja/dinero";
import { buscarGastoRepetido, mensajeGastoRepetido, type GastoComparable } from "@/lib/caja/gasto-repetido";
import { mensajeFechaFueraDelPeriodo } from "@/lib/caja/fecha-en-periodo";

/**
 * 🔴 «Alimentación» viene puesta. Es el 61% de los recibos (47 de 77 vivos), y
 * la categoría que arrancaba puesta era «Transporte», con 10. No es una regla
 * de clasificación: es cuál viene elegida, y se cambia de un toque.
 */
const CATEGORIA_POR_DEFECTO = "Alimentación";

interface PeriodoLike {
  id: string;
  numero?: number | null;
  fondo_inicial: number;
  fecha_apertura?: string | null;
  fecha_cierre?: string | null;
  /** Los recibos ya cargados: contra ellos se avisa del repetido. */
  gastos?: GastoComparable[];
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
 * de categorías al abrir. Este Drawer es el ÚNICO camino de alta desde la UI:
 * la ruta /caja/[id]/nuevo se retiró el 7-sep-2026 — 410 líneas que nada
 * enlazaba.
 */
export default function NuevoGastoDrawer({ open, onClose, periodo, totalGastado, isOwner, onSaved }: Props) {
  const [categorias, setCategorias] = useState<string[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [gFecha, setGFecha] = useState(new Date().toISOString().slice(0, 10));
  const [gDescripcion, setGDescripcion] = useState("");
  const [gProveedor, setGProveedor] = useState("");
  const [gNroFactura, setGNroFactura] = useState("");
  const [gSubtotal, setGSubtotal] = useState("");
  const [gItbmsPct, setGItbmsPct] = useState("0");
  const [gCategoria, setGCategoria] = useState(CATEGORIA_POR_DEFECTO);
  // Última categoría usada (fg_last_*): la secretaria que carga 10 comprobantes
  // de lo mismo no la re-elige 10 veces.
  const [lastCategoria, setLastCategoria] = useLastUsed("caja_categoria", CATEGORIA_POR_DEFECTO);
  const [addingGasto, setAddingGasto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManageCat, setShowManageCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [pendingNeg, setPendingNeg] = useState<{
    fondo: number; gastado: number; nuevo: number; saldoFuturo: number; andNew: boolean;
  } | null>(null);
  // 🔴 AVISA, NUNCA BLOQUEA: gasto repetido y fecha fuera del período. Los dos
  // salen con «Guardar igual».
  const [pendingAviso, setPendingAviso] = useState<{ mensajes: string[]; andNew: boolean } | null>(null);

  const subtotalNum = parseFloat(gSubtotal) || 0;
  const itbmsNum = centavos(subtotalNum * (parseFloat(gItbmsPct) / 100));
  const totalNum = centavos(subtotalNum + itbmsNum);

  // Sembrar con lo último usado al abrir.
  useEffect(() => {
    if (!open) return;
    setGCategoria(lastCategoria || CATEGORIA_POR_DEFECTO);
  }, [open, lastCategoria]);

  // Carga el catálogo de categorías al abrir.
  useEffect(() => {
    if (!open) return;
    setCatalogError(null);
    fetch("/api/caja/categorias")
      .then((r) => { if (!r.ok) throw new Error("categorias"); return r.json(); })
      .then((d: string[]) => setCategorias(Array.isArray(d) ? d : []))
      .catch(() => setCatalogError("No se pudieron cargar las categorías. Cierra y vuelve a abrir."));
  }, [open]);

  function resetForm() {
    setGDescripcion("");
    setGProveedor("");
    setGNroFactura("");
    setGSubtotal("");
    setGItbmsPct("0");
    setFotos([]);
    // Fecha y categoría NO se resetean: "Guardar y nuevo" retiene lo recién
    // usado. El caso real es la tanda: la secretaria teclea ~38 recibos de
    // semanas atrás en una sentada, y devolver la fecha a hoy la obligaba a
    // corregirla en cada gasto.
  }

  /** Lo que hay que decirle a Angela antes de guardar. Nunca frena: solo dice. */
  function avisosDeEsteGasto(): string[] {
    const mensajes: string[] = [];
    const repetido = buscarGastoRepetido(
      { fecha: gFecha, proveedor: gProveedor, nro_factura: gNroFactura, total: totalNum },
      periodo.gastos || [],
    );
    if (repetido) mensajes.push(mensajeGastoRepetido(repetido));
    const fuera = mensajeFechaFueraDelPeriodo(gFecha, periodo);
    if (fuera) mensajes.push(fuera);
    return mensajes;
  }

  async function save(opts: { andNew: boolean; skipNegativeCheck?: boolean; skipAvisos?: boolean }) {
    if (!opts.skipAvisos) {
      const mensajes = avisosDeEsteGasto();
      if (mensajes.length > 0) {
        setPendingAviso({ mensajes, andNew: opts.andNew });
        return;
      }
    }
    if (!opts.skipNegativeCheck) {
      const saldoFuturo = centavos(periodo.fondo_inicial - totalGastado - totalNum);
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
      // La foto se sube en cuanto el gasto tiene id. Si algo falla ahí, el
      // gasto ya está guardado: se dice y se sigue, nunca se pierde el recibo.
      const creado = await res.json().catch(() => null);
      if (fotos.length > 0 && creado?.id) {
        const form = new FormData();
        for (const f of fotos) form.append("archivo", f);
        const resFoto = await fetch(`/api/caja/gastos/${creado.id}/fotos`, { method: "POST", body: form });
        if (!resFoto.ok) {
          const payload = await resFoto.json().catch(() => null);
          setError((payload && typeof payload.error === "string" ? payload.error : null)
            || "El gasto se guardó, pero la foto no. Ábrelo y vuelve a adjuntarla.");
        }
      }
      setLastCategoria(resolvedCategoria);
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
    save({ andNew, skipNegativeCheck: true, skipAvisos: true });
  }
  function cancelNeg() { setPendingNeg(null); }

  function confirmAviso() {
    if (!pendingAviso) return;
    const andNew = pendingAviso.andNew;
    setPendingAviso(null);
    save({ andNew, skipAvisos: true });
  }
  function cancelAviso() { setPendingAviso(null); }

  // Clic fuera del cuadro de confirmación = Cancelar (nunca guarda).
  const negBackdrop = useBackdropDismiss(pendingNeg && !addingGasto ? cancelNeg : undefined);
  const avisoBackdrop = useBackdropDismiss(pendingAviso && !addingGasto ? cancelAviso : undefined);

  // Escape con una confirmación anidada abierta: cierra SOLO la confirmación y
  // deja el Drawer abierto. El Drawer escucha keydown en `window` en fase de
  // burbuja, así que aquí escuchamos en `document` en fase de CAPTURA: corre
  // antes y cortamos la propagación, de modo que el listener del Drawer nunca
  // ve la tecla y no se cierra el formulario de atrás.
  useEffect(() => {
    const abierta = (pendingNeg || pendingAviso) && !addingGasto;
    if (!abierta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setPendingNeg(null);
      setPendingAviso(null);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [pendingNeg, pendingAviso, addingGasto]);

  const canSave =
    !!gDescripcion.trim() &&
    subtotalNum > 0 &&
    !!gCategoria.trim() &&
    !!gProveedor.trim() &&
    !addingGasto;

  const values = { gFecha, gDescripcion, gProveedor, gNroFactura, gSubtotal, gItbmsPct, gCategoria };
  const setters = { setGFecha, setGDescripcion, setGProveedor, setGNroFactura, setGSubtotal, setGItbmsPct, setGCategoria };

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
          showManageCat={showManageCat}
          newCatName={newCatName}
          isOwner={isOwner}
          setCategorias={setCategorias}
          setShowManageCat={setShowManageCat}
          setNewCatName={setNewCatName}
          zonaFotos={<ZonaFotos pendientes={fotos} onPendientes={setFotos} />}
        />
      </div>

      {pendingAviso && (
        <AvisoAntesDeGuardar
          mensajes={pendingAviso.mensajes}
          onConfirm={confirmAviso}
          onCancel={cancelAviso}
          backdropProps={avisoBackdrop}
        />
      )}

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
