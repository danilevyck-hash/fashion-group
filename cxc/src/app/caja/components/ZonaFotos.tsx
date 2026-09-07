"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACCEPT_FOTO,
  quitarArchivo,
  sumarArchivos,
  validarArchivoFoto,
  type ArchivoDeRecibo,
} from "@/lib/caja/fotos";

/**
 * LA FOTO DEL RECIBO — un solo cuadro, se arrastra y se toca (7-sep-2026).
 *
 * Daniel: «que sea opcional y también que se pueda hacer drop».
 *
 * Regla 3 de la casa, entera:
 *   · UN cuadro, no uno por tipo de archivo;
 *   · arrastrar Y tocar, siempre las dos (en el celular, la cámara);
 *   · la lista SUMA — volver a elegir agrega, y el mismo archivo dos veces no
 *     entra dos veces;
 *   · se quita uno sin perder los demás;
 *   · sin botón de guardar: sube solo apenas cae.
 *
 * Dos modos, el MISMO cuadro:
 *   · con `gastoId` → sube al momento y lista lo que ya está guardado;
 *   · sin `gastoId` (el gasto todavía no existe, se está creando) → guarda los
 *     archivos en memoria y se los pasa al padre, que los sube en cuanto el
 *     gasto tiene id.
 */

interface FotoGuardada {
  id: string;
  nombre: string;
  tipo: string;
  bytes: number;
  url: string | null;
}

interface Props {
  /** Gasto ya guardado. Sin él, los archivos esperan en memoria. */
  gastoId?: string | null;
  /** Archivos pendientes (modo alta). El padre los sube tras crear el gasto. */
  pendientes?: File[];
  onPendientes?: (archivos: File[]) => void;
  /** Solo lectura: período cerrado. */
  soloVer?: boolean;
}

function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ZonaFotos({ gastoId, pendientes = [], onPendientes, soloVer = false }: Props) {
  const [guardadas, setGuardadas] = useState<FotoGuardada[]>([]);
  const [encima, setEncima] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    if (!gastoId) return;
    try {
      const res = await fetch(`/api/caja/gastos/${gastoId}/fotos`);
      if (!res.ok) return;
      const data = await res.json();
      setGuardadas(Array.isArray(data.fotos) ? data.fotos : []);
    } catch { /* sin fotos: la pantalla se comporta como si no hubiera */ }
  }, [gastoId]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function subir(archivos: File[]) {
    if (!gastoId || archivos.length === 0) return;
    setSubiendo(true);
    setError(null);
    try {
      const form = new FormData();
      for (const a of archivos) form.append("archivo", a);
      const res = await fetch(`/api/caja/gastos/${gastoId}/fotos`, { method: "POST", body: form });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError((payload && typeof payload.error === "string" ? payload.error : null)
          || "No se pudo guardar la foto. Intenta de nuevo en unos segundos.");
        return;
      }
      await cargar();
    } catch {
      setError("No se pudo guardar la foto. Revisa la conexión e intenta de nuevo.");
    } finally {
      setSubiendo(false);
    }
  }

  function recibir(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    const entrantes = Array.from(lista);
    for (const a of entrantes) {
      const problema = validarArchivoFoto({ nombre: a.name, tipo: a.type, bytes: a.size });
      if (problema) { setError(problema); return; }
    }
    setError(null);

    if (gastoId) { void subir(entrantes); return; }

    // 🔴 La lista SUMA: se agregan a los que ya estaban, sin repetir.
    const comoRecibo = (a: File): ArchivoDeRecibo & { archivo: File } =>
      ({ nombre: a.name, tipo: a.type, bytes: a.size, archivo: a });
    const suma = sumarArchivos(pendientes.map(comoRecibo), entrantes.map(comoRecibo));
    onPendientes?.(suma.map((s) => s.archivo));
  }

  async function quitarGuardada(id: string) {
    if (!gastoId) return;
    setError(null);
    const res = await fetch(`/api/caja/gastos/${gastoId}/fotos?foto=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      setError((payload && typeof payload.error === "string" ? payload.error : null) || "No se pudo quitar la foto.");
      return;
    }
    await cargar();
  }

  const hayAlgo = guardadas.length > 0 || pendientes.length > 0;

  return (
    <div>
      {!soloVer && (
        <div
          onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
          onDragLeave={() => setEncima(false)}
          onDrop={(e) => { e.preventDefault(); setEncima(false); recibir(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Foto del recibo"
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
          className="w-full rounded-md text-center cursor-pointer transition-colors"
          style={{
            minHeight: 44,
            padding: "14px 12px",
            border: `1px dashed ${encima ? "var(--caja-accent)" : "var(--caja-border-default)"}`,
            background: encima ? "var(--caja-accent-soft)" : "#fff",
          }}
        >
          <span className="text-xs" style={{ color: "var(--caja-fg-muted)" }}>
            {subiendo
              ? "Guardando…"
              : "Arrastra la foto del recibo aquí, o tócalo para elegirla o sacarla. Es opcional."}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_FOTO}
            multiple
            className="hidden"
            onChange={(e) => { recibir(e.target.files); e.target.value = ""; }}
          />
        </div>
      )}

      {error && (
        <p className="text-xs mt-2" style={{ color: "var(--caja-danger-onSoft)" }}>{error}</p>
      )}

      {hayAlgo && (
        <ul className="mt-2 space-y-1.5">
          {guardadas.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 text-xs">
              {f.url ? (
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate underline"
                  style={{ color: "var(--caja-fg-default)" }}
                >
                  {f.nombre}
                </a>
              ) : (
                <span className="truncate" style={{ color: "var(--caja-fg-default)" }}>{f.nombre}</span>
              )}
              <span className="shrink-0 caja-mono" style={{ color: "var(--caja-fg-subtle)" }}>
                {pesoLegible(f.bytes)}
              </span>
              {!soloVer && (
                <button
                  type="button"
                  onClick={() => quitarGuardada(f.id)}
                  aria-label={`Quitar ${f.nombre}`}
                  className="shrink-0 inline-flex h-11 w-11 items-center justify-center -my-2 transition-colors"
                  style={{ color: "var(--caja-fg-subtle)" }}
                >
                  ×
                </button>
              )}
            </li>
          ))}
          {pendientes.map((a, i) => (
            <li key={`${a.name}-${a.size}-${i}`} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate" style={{ color: "var(--caja-fg-default)" }}>{a.name}</span>
              <span className="shrink-0 caja-mono" style={{ color: "var(--caja-fg-subtle)" }}>
                {pesoLegible(a.size)}
              </span>
              <button
                type="button"
                onClick={() => onPendientes?.(quitarArchivo(
                  pendientes.map((p) => ({ nombre: p.name, tipo: p.type, bytes: p.size, archivo: p })), i,
                ).map((s) => s.archivo))}
                aria-label={`Quitar ${a.name}`}
                className="shrink-0 inline-flex h-11 w-11 items-center justify-center -my-2 transition-colors"
                style={{ color: "var(--caja-fg-subtle)" }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
