"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { fmt } from "@/lib/format";
import PeriodoDetailHeader from "../../components/PeriodoDetailHeader";
import GastoForm, { normalizeStr } from "../../components/GastoForm";
import { CajaPeriodo, CajaResponsable } from "../../components/types";

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
    fetch("/api/caja/categorias")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: string[]) => setCategorias(Array.isArray(d) ? d : []))
      .catch(() => setCategorias([]));
    fetch("/api/caja/responsables")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: CajaResponsable[]) => setResponsablesCatalog(Array.isArray(d) ? d : []))
      .catch(() => setResponsablesCatalog([]));
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

  if (!authChecked) return null;

  if (loading && !periodo) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <p className="text-sm text-gray-400">Cargando período...</p>
      </div>
    );
  }

  if (!periodo) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <p className="text-sm text-red-500 mb-4">{error || "Período no encontrado."}</p>
        <button onClick={() => router.push("/caja")} className="text-sm text-gray-500 hover:text-black">
          ← Volver a Caja Menuda
        </button>
      </div>
    );
  }

  const saldo = periodo.fondo_inicial - totalGastado;
  const pctUsed = periodo.fondo_inicial > 0 ? (saldo / periodo.fondo_inicial) * 100 : 100;

  const canSave =
    !!gDescripcion.trim() &&
    subtotalNum > 0 &&
    !!gResponsableId &&
    !!gProveedor.trim() &&
    !addingGasto;

  const formValues = { gFecha, gDescripcion, gProveedor, gNroFactura, gSubtotal, gItbmsPct, gCategoria, gResponsableId };
  const formSetters = { setGFecha, setGDescripcion, setGProveedor, setGNroFactura, setGSubtotal, setGItbmsPct, setGCategoria, setGResponsableId };

  const backToDetail = () => router.push(`/caja?view=detail&id=${periodo.id}`);

  return (
    <div>
      <PeriodoDetailHeader
        current={periodo}
        totalGastado={totalGastado}
        saldo={saldo}
        pctUsed={pctUsed}
        onBack={backToDetail}
      />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 pb-24">
        <button
          onClick={backToDetail}
          className="text-sm text-gray-400 hover:text-black transition mb-6 block"
        >
          ← Cancelar
        </button>

        <h2 className="text-lg font-medium mb-6">Agregar gasto</h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

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

        <div className="flex flex-col sm:flex-row gap-3 mt-10">
          <button
            onClick={() => save({ andNew: false })}
            disabled={!canSave}
            className="flex-1 bg-black text-white px-6 py-3 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-40 min-h-[48px]"
          >
            {addingGasto ? "Guardando..." : "Guardar gasto"}
          </button>
          <button
            onClick={() => save({ andNew: true })}
            disabled={!canSave}
            className="flex-1 border border-gray-200 text-gray-700 px-6 py-3 rounded-md text-sm hover:border-gray-400 hover:bg-gray-50 active:bg-gray-100 transition-all disabled:opacity-40 min-h-[48px]"
          >
            Guardar y nuevo
          </button>
        </div>
      </div>

      {pendingNeg && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={cancelNeg}>
          <div className="bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-medium mb-3">¿Continuar con saldo negativo?</h3>
            <p className="text-sm text-gray-800 mb-2">
              Este gasto deja el fondo en <strong>${fmt(pendingNeg.saldoFuturo)}</strong> (fondo ${fmt(pendingNeg.fondo)}, gastos ${fmt(pendingNeg.gastado)}, nuevo ${fmt(pendingNeg.nuevo)}).
            </p>
            <p className="text-xs text-gray-500 mb-6">
              Considera solicitar reabastecimiento antes de seguir gastando.
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmNeg}
                className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] transition-all min-h-[44px]"
              >
                Sí, guardar igual
              </button>
              <button
                onClick={cancelNeg}
                className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 active:bg-gray-100 transition-all min-h-[44px]"
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
