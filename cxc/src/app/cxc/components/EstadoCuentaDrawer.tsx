"use client";

import { useEffect, useState } from "react";
import Drawer from "@/components/Drawer";
import type { ConsolidatedClient } from "@/lib/types";
import { fmt, fmtDate } from "@/lib/format";
import { partirDocumentos, textoDocsChicos } from "@/lib/cxc/documentos-chicos";

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
  /** El pie abre la hoja «Cobrar» — desde el papel se puede mandar el papel. */
  onCobrar?: (client: ConsolidatedClient) => void;
}

export default function EstadoCuentaDrawer({ client, companyFilter, onClose, onCobrar }: Props) {
  const [data, setData] = useState<EstadoCuenta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  /** Qué empresas tienen su bloque de documentos chicos desplegado. */
  const [chicosAbiertos, setChicosAbiertos] = useState<Set<string>>(new Set());

  // ─────────────────────────────────────────────────────────────────────────
  // 🩸 ACÁ VIVÍA EL APARATO DE ENTREGAR EL PDF (5-sep-2026).
  //
  // El pie de este cajón tenía un botón «Compartir»/«Descargar PDF» con su
  // sonda de `navigator.canShare`, su estado de ocupado y su mensaje de error.
  // Hacía UNA de las cuatro cosas que se hacen para cobrar, y desde el papel NO
  // SE PODÍA MANDAR EL PAPEL: había que cerrar el cajón, volver a la fila y
  // abrir otro menú.
  //
  // Ahora el pie dice **«Cobrar»** y abre la MISMA hoja que el botón de la fila,
  // con las cuatro salidas (correo · WhatsApp · copiar · PDF). El PDF no se
  // perdió: es una de las cuatro.
  // ─────────────────────────────────────────────────────────────────────────

  const open = !!client;
  const codigo = client ? codigoDe(client) : null;
  const nombre = client ? nombreDe(client) : "";
  const empresaScope = companyFilter === "all" ? "todas" : companyFilter;

  useEffect(() => {
    if (!open || !codigo) return;
    let cancel = false;
    setLoading(true);
    setError(false);
    setChicosAbiertos(new Set());
    setData(null);
    fetch(`/api/cxc/estado-cuenta/${encodeURIComponent(codigo)}?empresa=${encodeURIComponent(empresaScope)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))))
      .then((d: EstadoCuenta) => { if (!cancel) setData(d); })
      .catch(() => { if (!cancel) setError(true); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [open, codigo, empresaScope]);

  const totalDocs = data ? data.empresas.reduce((n, e) => n + e.documentos.length, 0) : 0;

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
            {/* 🔴 EL PIE DICE «COBRAR», NO «COMPARTIR» (5-sep-2026). Desde el
                papel no se podía mandar el papel: había que cerrar el cajón,
                volver a la fila y abrir otro menú. Abre la MISMA hoja que el
                botón de la fila; el PDF sigue estando, es una de sus cuatro
                salidas. */}
            {onCobrar && client && (
              <button
                type="button"
                onClick={() => onCobrar(client)}
                className="w-full inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md bg-black px-3 text-sm font-medium text-white transition active:scale-[0.97]"
              >
                Cobrar
              </button>
            )}
          </div>
        ) : undefined
      }
    >
      {/* ── ENCABEZADO: el total ARRIBA y grande, y una pastilla por empresa ──
          🩸 Hasta el 5-sep-2026 este cajón abría con el nombre y el código, y
          el total vivía abajo del todo, en el pie: con 110 documentos (City Mall
          Paso Canoa) había que bajar toda la lista para saber cuánto debía. Y
          los subtotales de las otras cinco empresas había que buscarlos entre
          las filas. Ahora las pastillas los dicen de un vistazo y llevan a su
          sección de un toque. */}
      <div className="mb-4">
        <p className="text-base font-medium text-gray-900">{nombre}</p>
        <p className="text-2xl font-semibold tabular-nums text-gray-900 mt-1 leading-none">
          {data ? money(data.total) : "—"}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {codigo ?? "—"}
          {data && ` · al ${fmtDate(data.generadoEn.slice(0, 10))}`}
          {data && ` · ${totalDocs} ${totalDocs === 1 ? "documento" : "documentos"} en ${data.empresas.length} ${data.empresas.length === 1 ? "empresa" : "empresas"}`}
        </p>
        {data && data.empresas.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.empresas.map((emp) => (
              <a
                key={emp.empresa_key}
                href={`#ec-${emp.empresa_key}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 hover:border-gray-400 transition"
              >
                <span className="truncate max-w-[9rem]">{emp.empresa_nombre}</span>
                <span className="tabular-nums font-medium text-gray-900">{money(emp.subtotal)}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {loading && <SkeletonDocs />}

      {error && (
        <p className="text-sm text-red-600">No se pudo cargar el estado de cuenta. Intenta de nuevo en unos segundos.</p>
      )}

      {data && !loading && totalDocs === 0 && (
        <p className="text-sm text-gray-500">Este cliente no tiene documentos con saldo pendiente.</p>
      )}

      {data && !loading && data.empresas.map((emp) => {
        // 🔴 LO CHICO SE AGRUPA POR MONTO, NUNCA POR TIPO DE DOCUMENTO. Medido:
        // City Mall Paso Canoa abre con 110 documentos y **36 valen menos de
        // $50 y suman $227,20** — un tercio de la lista para el 0,05 % del
        // saldo. Agrupar por tipo («las notas de débito son las chicas») es la
        // tentación obvia y es FALSA: hay notas de débito de $5.000
        // (Internacional Belén) y de $3.349,10 (City Mall David) que no se
        // pueden esconder. La regla vive en `lib/cxc/documentos-chicos.ts`.
        const { grandes, chicos, totalChicos } = partirDocumentos(emp.documentos);
        const abierto = chicosAbiertos.has(emp.empresa_key);
        const visibles = abierto ? [...grandes, ...chicos] : grandes;
        return (
        <section key={emp.empresa_key} id={`ec-${emp.empresa_key}`} className="mb-5 last:mb-0 scroll-mt-4">
          {data.empresas.length > 1 && (
            <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-gray-200">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{emp.empresa_nombre}</span>
              <span className="text-sm font-medium tabular-nums">{money(emp.subtotal)}</span>
            </div>
          )}

          {/* ── ENCABEZADOS DE COLUMNA ────────────────────────────────────
              🩸 No había NINGUNO. Cada documento mostraba dos números apilados
              —«$1,006.80» y debajo « de $2,978.88»— sin decir cuál era cuál:
              había que adivinar que el de arriba es lo que falta y el de abajo
              el original. Ahora son dos columnas con nombre. */}
          <div className="grid grid-cols-12 gap-2 px-1 pb-1 text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
            <div className="col-span-4">Documento</div>
            <div className="col-span-2">Fecha</div>
            <div className="col-span-1 text-right">Días</div>
            <div className="col-span-2 text-right">Original</div>
            <div className="col-span-3 text-right">Saldo</div>
          </div>

          <ul className="divide-y divide-gray-100">
            {visibles.map((doc, i) => (
              <li key={`${emp.empresa_key}-${doc.numero}-${i}`} className="grid grid-cols-12 gap-2 px-1 py-2 items-center">
                <div className="col-span-4 min-w-0">
                  <p className="text-sm text-gray-900 truncate" title={doc.numero}>{doc.numero}</p>
                  <p className="text-xs text-gray-500 truncate">{doc.tipo}</p>
                </div>
                <div className="col-span-2 text-xs text-gray-500 tabular-nums">
                  {doc.fecha ? fmtDate(doc.fecha) : "—"}
                </div>
                <div className={`col-span-1 text-right text-xs tabular-nums ${diasColor(doc.dias)}`}>
                  {doc.dias != null ? doc.dias : "—"}
                </div>
                {/* Original en gris, y «—» cuando es igual al saldo: repetir el
                    mismo número dos veces en la misma fila no dice nada. */}
                <div className="col-span-2 text-right text-xs tabular-nums text-gray-400">
                  {doc.monto === Math.abs(doc.saldo) ? "—" : `$${fmt(doc.monto)}`}
                </div>
                <div className={`col-span-3 text-right text-sm font-medium tabular-nums ${doc.saldo < 0 ? "text-emerald-600" : "text-gray-900"}`}>
                  {money(doc.saldo)}
                </div>
              </li>
            ))}
          </ul>

          {chicos.length > 0 && (
            <button
              type="button"
              onClick={() => setChicosAbiertos((previas) => {
                const siguientes = new Set(previas);
                if (siguientes.has(emp.empresa_key)) siguientes.delete(emp.empresa_key);
                else siguientes.add(emp.empresa_key);
                return siguientes;
              })}
              className="w-full text-left px-1 py-2 min-h-[44px] text-xs text-gray-500 hover:text-gray-800 transition"
            >
              {textoDocsChicos(chicos.length, money(totalChicos))} — {abierto ? "ocultar" : "ver"}
            </button>
          )}
        </section>
        );
      })}

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
