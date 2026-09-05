"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EL CAJÓN DE DOCUMENTOS DE UN CLIENTE DE CONFECCIONES BOSTON.
//
// 🔴 ES SU PROPIO CAJÓN, con su propia ruta (`/api/cxc/boston/estado-cuenta`).
// No reusa el del grupo: ese recibe una lista de empresas y bastaría con
// pasarle Boston para mezclar los dos mundos por descuido.
//
// 🔑 Boston es UNA sola empresa, así que no hay desglose por empresa ni panel
// intermedio: tocar un cliente lleva DIRECTO a sus documentos. Lo demás es
// igual que el del grupo, a propósito: mismos encabezados de columna, misma
// separación de «Original» y «Saldo», y lo chico agrupado por MONTO con el
// mismo módulo puro (`lib/cxc/documentos-chicos.ts`).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Drawer from "@/components/Drawer";
import { fmt, fmtDate } from "@/lib/format";
import { partirDocumentos, textoDocsChicos } from "@/lib/cxc/documentos-chicos";
import UltimosPagos from "@/components/cxc/UltimosPagos";
import { useUltimosPagosBoston } from "@/components/cxc/useUltimosPagosBoston";

interface DocumentoBoston {
  numero: string;
  fecha: string | null;
  tipo: string;
  monto: number;
  saldo: number;
  dias: number | null;
}

interface Respuesta {
  codigo: string;
  documentos: DocumentoBoston[];
  total: number;
  generadoEn: string;
}

function money(n: number): string {
  return n < 0 ? `-$${fmt(Math.abs(n))}` : `$${fmt(n)}`;
}

function diasColor(dias: number | null): string {
  if (dias == null) return "text-gray-400";
  if (dias <= 90) return "text-emerald-600";
  if (dias <= 120) return "text-amber-600";
  return "text-red-600";
}

export default function BostonDocumentosDrawer({
  codigo,
  nombre,
  clienteSwitchId,
  onClose,
}: {
  codigo: string | null;
  nombre: string;
  /** Id de Switch — los recibos de Boston se cruzan por id, no por código. */
  clienteSwitchId: number | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [chicosAbiertos, setChicosAbiertos] = useState(false);

  const abierto = !!codigo;

  useEffect(() => {
    if (!abierto || !codigo) return;
    let cancelado = false;
    setCargando(true);
    setError(false);
    setChicosAbiertos(false);
    setData(null);
    fetch(`/api/cxc/boston/estado-cuenta?codigo=${encodeURIComponent(codigo)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))))
      .then((d: Respuesta) => { if (!cancelado) setData(d); })
      .catch(() => { if (!cancelado) setError(true); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [abierto, codigo]);

  // Los últimos 3 pagos de ESTE cliente, de la cartera de Boston y de nadie
  // más. 🩸 Vivían detrás de un botón «Últimos pagos ›» en la fila cerrada; con
  // el rediseño del 5-sep-2026 la fila lleva a los documentos y los pagos viven
  // acá, junto a lo que se está cobrando. La ruta (`/api/cxc/boston/ultimos-pagos`)
  // y el hook NO cambiaron: siguen siendo los de Boston y no comparten consulta
  // con los del grupo.
  const pagos = useUltimosPagosBoston(abierto ? clienteSwitchId : null);

  const { grandes, chicos, totalChicos } = partirDocumentos(data?.documentos ?? []);
  const visibles = chicosAbiertos ? [...grandes, ...chicos] : grandes;

  return (
    <Drawer open={abierto} onClose={onClose} title="Estado de cuenta">
      <div className="mb-4">
        <p className="text-base font-medium text-gray-900">{nombre}</p>
        <p className="text-2xl font-semibold tabular-nums text-gray-900 mt-1 leading-none">
          {data ? money(data.total) : "—"}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Confecciones Boston
          {codigo && ` · ${codigo}`}
          {data && ` · al ${fmtDate(data.generadoEn.slice(0, 10))}`}
          {data && ` · ${data.documentos.length} ${data.documentos.length === 1 ? "documento" : "documentos"}`}
        </p>
      </div>

      <div className="mb-4 rounded-lg bg-gray-50 px-3 py-2">
        <UltimosPagos pagos={pagos} compacto />
      </div>

      {cargando && <p className="text-sm text-gray-400">Cargando documentos…</p>}
      {error && (
        <p className="text-sm text-red-600">No se pudo cargar el estado de cuenta. Intenta de nuevo en unos segundos.</p>
      )}
      {data && !cargando && data.documentos.length === 0 && (
        <p className="text-sm text-gray-500">Este cliente no tiene documentos con saldo pendiente.</p>
      )}

      {data && !cargando && data.documentos.length > 0 && (
        <>
          <div className="grid grid-cols-12 gap-2 px-1 pb-1 text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
            <div className="col-span-4">Documento</div>
            <div className="col-span-2">Fecha</div>
            <div className="col-span-1 text-right">Días</div>
            <div className="col-span-2 text-right">Original</div>
            <div className="col-span-3 text-right">Saldo</div>
          </div>
          <ul className="divide-y divide-gray-100">
            {visibles.map((doc, i) => (
              <li key={`${doc.numero}-${i}`} className="grid grid-cols-12 gap-2 px-1 py-2 items-center">
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
              onClick={() => setChicosAbiertos((a) => !a)}
              className="w-full text-left px-1 py-2 min-h-[44px] text-xs text-gray-500 hover:text-gray-800 transition"
            >
              {textoDocsChicos(chicos.length, money(totalChicos))} — {chicosAbiertos ? "ocultar" : "ver"}
            </button>
          )}
        </>
      )}
    </Drawer>
  );
}
