"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { fmt } from "@/lib/format";
import AppHeader from "@/components/AppHeader";
import PeriodoDetailHeader from "../../components/PeriodoDetailHeader";
import GastoForm, { normalizeStr } from "../../components/GastoForm";
import { useEscapeClose, useBackdropDismiss } from "@/lib/hooks/useModalDismiss";
import { CajaPeriodo, CajaResponsable } from "../../components/types";
import "../../skin.css";

export default function NuevoGastoPageWrapper() {
  return (
    <Suspense>
      <NuevoGastoPage />
    </Suspense>
  );
}

function NuevoGastoPage() {
  const params = useParams();
  const periodoId = (params?.periodoId as string) || "";
  const router = useRouter();
  const searchParams = useSearchParams();

  const { authChecked, isOwner } = useAuth({
    moduleKey: "caja",
    allowedRoles: ["admin", "secretaria"],
  });

  const [periodo, setPeriodo] = useState<CajaPeriodo | null>(null);
  const [totalGastado, setTotalGastado] = useState(0);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [responsablesCatalog, setResponsablesCatalog] = useState<CajaResponsable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Form state
  const prefillDescripcion = searchParams.get("descripcion") || "";
  const prefillTotal = searchParams.get("total") || "";
  const prefillCategoria = searchParams.get("categoria") || "Transporte";

  const [gFecha, setGFecha] = useState(new Date().toISOString().slice(0, 10));
  const [gDescripcion, setGDescripcion] = useState(prefillDescripcion);
  const [gProveedor, setGProveedor] = useState("");
  const [gNroFactura, setGNroFactura] = useState("");
  const [gSubtotal, setGSubtotal] = useState(prefillTotal);
  const [gItbmsPct, setGItbmsPct] = useState("0");
  const [gCategoria, setGCategoria] = useState(prefillCategoria);
  const [gResponsableId, setGResponsableId] = useState("");
  const [addingGasto, setAddingGasto] = useState(false);
  const [showManageCat, setShowManageCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  const [pendingNeg, setPendingNeg] = useState<{
    fondo: number; gastado: number; nuevo: number; saldoFuturo: number; andNew: boolean;
  } | null>(null);

  const subtotalNum = parseFloat(gSubtotal) || 0;
  const itbmsNum = Math.round(subtotalNum * (parseFloat(gItbmsPct) / 100) * 100) / 100;
  const totalNum = Math.round((subtotalNum + itbmsNum) * 100) / 100;

  const loadPeriodo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/caja/periodos/${periodoId}`);
      if (!res.ok) {
        setError("No se pudo cargar el período.");
        return;
      }
      const data: CajaPeriodo = await res.json();
      setPeriodo(data);
      const gastos = data.caja_gastos || [];
      setTotalGastado(gastos.reduce((s: number, g: { total: number }) => s + (Number(g.total) || 0), 0));
    } catch {
      setError("No se pudo cargar el período.");
    } finally {
      setLoading(false);
    }
  }, [periodoId]);

  useEffect(() => {
    if (!periodoId) return;
    loadPeriodo();
    setCatalogError(null);
    fetch("/api/caja/categorias")
      .then((r) => { if (!r.ok) throw new Error("categorias"); return r.json(); })
      .then((d: string[]) => setCategorias(Array.isArray(d) ? d : []))
      .catch(() => setCatalogError("No se pudieron cargar las categorías. Recarga la página."));
    fetch("/api/caja/responsables")
      .then((r) => { if (!r.ok) throw new Error("responsables"); return r.json(); })
      .then((d: CajaResponsable[]) => setResponsablesCatalog(Array.isArray(d) ? d : []))
      .catch(() => setCatalogError("No se pudieron cargar las categorías o responsables. Recarga la página."));
  }, [periodoId, loadPeriodo]);

  function resetForm() {
    setGFecha(new Date().toISOString().slice(0, 10));
    setGDescripcion("");
    setGProveedor("");
    setGNroFactura("");
    setGSubtotal("");
    setGItbmsPct("0");
    setGCategoria("Transporte");
    setGResponsableId("");
  }

  async function save(opts: { andNew: boolean; skipNegativeCheck?: boolean }) {
    if (!periodo) return;

    if (!opts.skipNegativeCheck) {
      const saldoFuturo = Math.round((periodo.fondo_inicial - totalGastado - totalNum) * 100) / 100;
      if (saldoFuturo < 0) {
        setPendingNeg({
          fondo: periodo.fondo_inicial,
          gastado: totalGastado,
          nuevo: totalNum,
          saldoFuturo,
          andNew: opts.andNew,
        });
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
      if (opts.andNew) {
        resetForm();
        await loadPeriodo();
        // Scroll to top so user sees the updated header + empty form
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        router.push(`/caja?view=detail&id=${periodo.id}`);
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

  // Confirmación de saldo negativo: Escape y clic fuera = Cancelar (nunca
  // guardan). Los hooks van antes del return condicional de abajo.
  useEscapeClose(!!pendingNeg, cancelNeg, !addingGasto);
  const negBackdrop = useBackdropDismiss(pendingNeg && !addingGasto ? cancelNeg : undefined);

  if (!authChecked) return null;

  const headerBreadcrumbs = [
    { label: "Caja Menuda", onClick: () => router.push("/caja") },
    { label: "Nuevo gasto" },
  ];

  if (loading && !periodo) {
    return (
      <div>
        <AppHeader module="Caja Menuda" breadcrumbs={headerBreadcrumbs} />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
          <p className="text-sm text-gray-400">Cargando período...</p>
        </div>
      </div>
    );
  }

  if (!periodo) {
    return (
      <div>
        <AppHeader module="Caja Menuda" breadcrumbs={headerBreadcrumbs} />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
          <p className="text-sm text-red-500">{error || "Período no encontrado."}</p>
        </div>
      </div>
    );
  }

  const saldo = periodo.fondo_inicial - totalGastado;
  const pctUsed = periodo.fondo_inicial > 0 ? (saldo / periodo.fondo_inicial) * 100 : 100;

  const canSave =
    !!gDescripcion.trim() &&
    subtotalNum > 0 &&
    !!gResponsableId &&
    !!gCategoria.trim() &&
    !!gProveedor.trim() &&
    !addingGasto;

  const formValues = { gFecha, gDescripcion, gProveedor, gNroFactura, gSubtotal, gItbmsPct, gCategoria, gResponsableId };
  const formSetters = { setGFecha, setGDescripcion, setGProveedor, setGNroFactura, setGSubtotal, setGItbmsPct, setGCategoria, setGResponsableId };

  const backToDetail = () => router.push(`/caja?view=detail&id=${periodo.id}`);

  return (
    <div>
      <AppHeader module="Caja Menuda" breadcrumbs={headerBreadcrumbs} />
      <div className="skin-caja min-h-screen">
        <PeriodoDetailHeader
          current={periodo}
          totalGastado={totalGastado}
          saldo={saldo}
          pctUsed={pctUsed}
          onBack={backToDetail}
        />

        <div className="max-w-3xl mx-auto px-5 sm:px-9 pt-6 pb-28">
          <button
            onClick={backToDetail}
            className="inline-flex items-center gap-1 text-xs mb-5 transition-colors"
            style={{ color: "var(--caja-fg-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--caja-fg-strong)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--caja-fg-muted)")}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Cancelar
          </button>

          <div
            className="rounded-xl"
            style={{
              background: "var(--caja-bg-surface)",
              border: "1px solid var(--caja-border-subtle)",
            }}
          >
            <div
              className="px-6 py-5 sm:px-7 sm:py-5"
              style={{ borderBottom: "1px solid var(--caja-border-subtle)" }}
            >
              <div className="caja-eyebrow mb-1.5">
                Período Nº {periodo.numero} · Caja Menuda
              </div>
              <h2
                className="caja-display-sm"
                style={{ fontSize: 24, margin: 0 }}
              >
                Nuevo gasto
              </h2>
              <p
                className="text-sm mt-1.5"
                style={{ color: "var(--caja-fg-muted)" }}
              >
                Registra un comprobante del fondo fijo. Los campos con * son obligatorios.
              </p>
            </div>

            <div className="px-6 py-7 sm:px-7 sm:py-7">
              {error && (
                <p
                  className="text-sm mb-4 px-3 py-2 rounded-md"
                  style={{
                    color: "var(--caja-danger-onSoft)",
                    background: "var(--caja-danger-soft)",
                    border: "1px solid var(--caja-danger-border)",
                  }}
                >
                  {error}
                </p>
              )}
              {catalogError && (
                <p
                  className="text-sm mb-4 px-3 py-2 rounded-md"
                  style={{
                    color: "var(--caja-danger-onSoft)",
                    background: "var(--caja-danger-soft)",
                    border: "1px solid var(--caja-danger-border)",
                  }}
                >
                  {catalogError}
                </p>
              )}

              <GastoForm
                values={formValues}
                setters={formSetters}
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

            <div
              className="px-6 py-4 sm:px-7 flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-3"
              style={{
                background: "var(--caja-bg-page)",
                borderTop: "1px solid var(--caja-border-subtle)",
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 12,
              }}
            >
              <div
                className="text-xs"
                style={{ color: "var(--caja-fg-muted)" }}
              >
                {canSave ? (
                  <>
                    Total a registrar:{" "}
                    <span
                      className="caja-mono caja-money-strong"
                      style={{ color: "var(--caja-fg-strong)", fontWeight: 600 }}
                    >
                      ${fmt(totalNum)}
                    </span>
                  </>
                ) : (
                  "Completa los campos obligatorios."
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={backToDetail}
                  className="text-sm font-medium px-3.5 h-9 rounded-md transition-colors"
                  style={{
                    background: "#fff",
                    color: "var(--caja-fg-default)",
                    border: "1px solid var(--caja-border-default)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--caja-bg-page)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => save({ andNew: true })}
                  disabled={!canSave}
                  className="text-sm font-medium px-3.5 h-9 rounded-md transition-colors disabled:opacity-40"
                  style={{
                    background: "#fff",
                    color: "var(--caja-fg-default)",
                    border: "1px solid var(--caja-border-default)",
                  }}
                  onMouseEnter={(e) => {
                    if (canSave) e.currentTarget.style.background = "var(--caja-bg-page)";
                  }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                >
                  Guardar y nuevo
                </button>
                <button
                  onClick={() => save({ andNew: false })}
                  disabled={!canSave}
                  className="text-sm font-medium px-3.5 h-9 rounded-md transition-transform active:scale-[0.97] disabled:opacity-40"
                  style={{ background: "var(--caja-accent)", color: "#fff" }}
                >
                  {addingGasto ? "Guardando..." : "Guardar gasto"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {pendingNeg && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" {...negBackdrop}>
          {/* Sin stopPropagation: el hook del fondo solo cierra si el mousedown Y
              el click cayeron sobre el fondo mismo. */}
          <div className="skin-caja bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4" style={{ border: "1px solid var(--caja-border-default)" }}>
            <h3 className="text-base font-medium mb-3" style={{ color: "var(--caja-fg-strong)" }}>¿Continuar con saldo negativo?</h3>
            <p className="text-sm mb-2" style={{ color: "var(--caja-fg-default)" }}>
              Este gasto deja el fondo en <strong className="caja-mono">${fmt(pendingNeg.saldoFuturo)}</strong> (fondo <span className="caja-mono">${fmt(pendingNeg.fondo)}</span>, gastos <span className="caja-mono">${fmt(pendingNeg.gastado)}</span>, nuevo <span className="caja-mono">${fmt(pendingNeg.nuevo)}</span>).
            </p>
            <p className="text-xs mb-6" style={{ color: "var(--caja-fg-muted)" }}>
              Considera solicitar reabastecimiento antes de seguir gastando.
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmNeg}
                className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium text-white active:scale-[0.97] transition-all min-h-[44px]"
                style={{ background: "var(--caja-danger)" }}
              >
                Sí, guardar igual
              </button>
              <button
                onClick={cancelNeg}
                className="flex-1 px-4 py-2.5 rounded-md text-sm transition-all min-h-[44px]"
                style={{
                  background: "#fff",
                  color: "var(--caja-fg-default)",
                  border: "1px solid var(--caja-border-default)",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
