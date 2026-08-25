"use client";

import { useEffect, useState } from "react";
import Drawer from "@/components/Drawer";
import type { ConsolidatedClient } from "@/lib/types";
import { fmt, fmtDate } from "@/lib/format";

export interface EstadoDocumento {
  numero: string;
  fecha: string | null;
  tipo: string;
  monto: number;
  saldo: number; // con signo (crédito negativo)
  dias: number | null;
}
export interface EstadoEmpresa {
  empresa_key: string;
  empresa_nombre: string;
  documentos: EstadoDocumento[];
  subtotal: number;
}
export interface EstadoCuenta {
  codigo: string;
  empresas: EstadoEmpresa[];
  total: number;
  generadoEn: string;
}

/** El código Switch (D-XXX) es el mismo en todas las empresas del cliente. */
function codigoDe(client: ConsolidatedClient): string | null {
  return Object.values(client.companies).find((c) => c?.codigo)?.codigo ?? null;
}
function nombreDe(client: ConsolidatedClient): string {
  return Object.values(client.companies).find((c) => c?.nombre)?.nombre ?? client.nombre_normalized;
}

/** Dinero con signo legible: crédito → "-$1,234.00". */
export function money(n: number): string {
  return n < 0 ? `-$${fmt(Math.abs(n))}` : `$${fmt(n)}`;
}

function diasColor(dias: number | null): string {
  if (dias == null) return "text-gray-400";
  if (dias <= 90) return "text-emerald-600";
  if (dias <= 120) return "text-amber-600";
  return "text-red-600";
}

interface Props {
  client: ConsolidatedClient | null;
  companyFilter: string;
  onClose: () => void;
}

export default function EstadoCuentaDrawer({ client, companyFilter, onClose }: Props) {
  const [data, setData] = useState<EstadoCuenta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);

  // 🔴 UN SOLO BOTÓN, Y EL RÓTULO DICE LO QUE VA A PASAR (24-ago-2026)
  //
  // 🩸 Eran dos botones que prometían cosas distintas y hacían la misma. En la
  // computadora, cuando el navegador no sabe compartir archivos, «Compartir»
  // terminaba DESCARGANDO el mismo PDF que el botón «PDF» — dos caminos, un
  // solo resultado. Y si el archivo no se podía armar, el `catch` solo escribía
  // en la consola: el botón volvía a la normalidad, no pasaba NADA visible, y
  // la persona tocaba de nuevo esperando otra cosa.
  //
  // Ahora se PREGUNTA ANTES si este navegador puede compartir un archivo y el
  // botón se rotula con lo que de verdad hará: «Compartir» (hoja del sistema,
  // celular) o «Descargar PDF» (computadora). El error se ve en pantalla.
  //
  // La prueba usa un File de verdad — `canShare({ files })` mira el TIPO del
  // archivo, así que preguntar solo por `navigator.share` daría un falso sí en
  // navegadores que comparten texto pero no archivos.
  const [puedeCompartir, setPuedeCompartir] = useState(false);
  useEffect(() => {
    try {
      const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
      if (typeof nav.share !== "function" || typeof nav.canShare !== "function") return;
      const sonda = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "sonda.pdf", {
        type: "application/pdf",
      });
      setPuedeCompartir(nav.canShare({ files: [sonda] }));
    } catch {
      // Ante la duda: descargar, que funciona en todas partes.
    }
  }, []);

  const open = !!client;
  const codigo = client ? codigoDe(client) : null;
  const nombre = client ? nombreDe(client) : "";
  const empresaScope = companyFilter === "all" ? "todas" : companyFilter;

  useEffect(() => {
    if (!open || !codigo) return;
    let cancel = false;
    setLoading(true);
    setError(false);
    setErrorPdf(null);
    setData(null);
    fetch(`/api/cxc/estado-cuenta/${encodeURIComponent(codigo)}?empresa=${encodeURIComponent(empresaScope)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))))
      .then((d: EstadoCuenta) => { if (!cancel) setData(d); })
      .catch(() => { if (!cancel) setError(true); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [open, codigo, empresaScope]);

  const totalDocs = data ? data.empresas.reduce((n, e) => n + e.documentos.length, 0) : 0;

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Arma el PDF y lo entrega por el ÚNICO camino que este navegador tiene: la
  // hoja de compartir del sistema, o la descarga.
  async function handleEntregarPdf() {
    if (!data) return;
    setBusy(true);
    setErrorPdf(null);
    try {
      const { buildEstadoCuentaPDF } = await import("@/lib/pdf-estado-cuenta");
      const { doc, filename } = buildEstadoCuentaPDF(data, nombre);
      const blob = doc.output("blob");

      if (puedeCompartir) {
        const file = new File([blob], filename, { type: "application/pdf" });
        const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
        // Se vuelve a preguntar con el archivo REAL: la sonda dice que el
        // navegador puede, no que pueda con ESTE archivo.
        if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
          await nav.share({ files: [file], title: "Estado de cuenta", text: `Estado de cuenta — ${nombre}` });
          return;
        }
      }
      downloadBlob(blob, filename);
    } catch (e) {
      // AbortError = la persona cerró la hoja de compartir → no es un error.
      if ((e as Error)?.name === "AbortError") return;
      console.error("[estado-cuenta] entregar PDF:", e);
      setErrorPdf("No se pudo preparar el PDF. Intenta de nuevo en unos segundos.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Estado de cuenta"
      footer={
        data && totalDocs > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{totalDocs} documento{totalDocs === 1 ? "" : "s"} con saldo</span>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Total</p>
                <p className="text-lg font-semibold tabular-nums leading-tight">{money(data.total)}</p>
              </div>
            </div>
            {errorPdf && (
              <p role="alert" className="text-sm text-red-600">{errorPdf}</p>
            )}
            <button
              type="button"
              onClick={handleEntregarPdf}
              disabled={busy}
              className="w-full inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md bg-black px-3 text-sm font-medium text-white transition active:scale-[0.97] disabled:opacity-60"
            >
              {puedeCompartir ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              )}
              {busy ? "Preparando…" : puedeCompartir ? "Compartir" : "Descargar PDF"}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="mb-4">
        <p className="text-base font-medium text-gray-900">{nombre}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {codigo ?? "—"}
          {data && ` · al ${fmtDate(data.generadoEn.slice(0, 10))}`}
        </p>
      </div>

      {loading && <SkeletonDocs />}

      {error && (
        <p className="text-sm text-red-600">No se pudo cargar el estado de cuenta. Intenta de nuevo en unos segundos.</p>
      )}

      {data && !loading && totalDocs === 0 && (
        <p className="text-sm text-gray-500">Este cliente no tiene documentos con saldo pendiente.</p>
      )}

      {data && !loading && data.empresas.map((emp) => (
        <section key={emp.empresa_key} className="mb-5 last:mb-0">
          {data.empresas.length > 1 && (
            <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-gray-200">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{emp.empresa_nombre}</span>
              <span className="text-sm font-medium tabular-nums">{money(emp.subtotal)}</span>
            </div>
          )}
          <ul className="divide-y divide-gray-100">
            {emp.documentos.map((doc, i) => (
              <li key={`${emp.empresa_key}-${doc.numero}-${i}`} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 truncate">{doc.numero}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {doc.tipo}
                    {doc.fecha && <> · {fmtDate(doc.fecha)}</>}
                    {doc.dias != null && <> · <span className={diasColor(doc.dias)}>{doc.dias}d</span></>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-medium tabular-nums ${doc.saldo < 0 ? "text-emerald-600" : "text-gray-900"}`}>{money(doc.saldo)}</p>
                  {doc.monto !== Math.abs(doc.saldo) && (
                    <p className="text-xs text-gray-400 tabular-nums">de ${fmt(doc.monto)}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Drawer>
  );
}

function SkeletonDocs() {
  return (
    <div className="space-y-3 animate-pulse">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex justify-between py-2">
          <div className="space-y-1.5">
            <div className="h-3.5 w-32 bg-gray-200 rounded" />
            <div className="h-3 w-40 bg-gray-100 rounded" />
          </div>
          <div className="h-3.5 w-16 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}
