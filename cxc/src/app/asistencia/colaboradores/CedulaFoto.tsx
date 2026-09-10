"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * LA FOTO DE LA CÉDULA — subir, ver, descargar y quitar.
 *
 * Daniel: *«cédula que se pueda ver o descargar la foto»*.
 *
 * 🔴 SE SUBE SOLA, SIN BOTÓN DE GUARDAR. Es la regla de la casa para adjuntos
 * (Caja, Reclamos, Marketing): el archivo se sube apenas cae. Un «Guardar» de
 * más es una promesa que hay que cumplir.
 *
 * 🔴 EL ENLACE ES FIRMADO Y VENCE. Nunca una dirección pública: es un documento
 * de identidad. Abrirlo en otra pestaña es a la vez el «ver» y el «descargar»
 * — el mismo patrón que la foto del recibo de Caja.
 * ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/components/ToastSystem";
import {
  ACCEPT_CEDULA,
  textoBotonCedula,
  validarArchivoCedula,
} from "@/lib/asistencia/cedula-foto";

export default function CedulaFoto({
  codigo, puedeCambiar, onCambio,
}: {
  codigo: string;
  puedeCambiar: boolean;
  /** Avisa que la foto cambió, por si la página de arriba quiere releer algo. */
  onCambio?: () => void;
}) {
  const { toast } = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [tiene, setTiene] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  const leer = useCallback(async () => {
    try {
      const r = await fetch(`/api/asistencia/cedula-foto?codigo=${encodeURIComponent(codigo)}`, {
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "");
      setUrl(d.url ?? null);
      setTiene(!!d.path);
    } catch {
      // Falla abierta: sin foto la ficha se sigue usando.
      setUrl(null);
      setTiene(false);
    }
  }, [codigo]);

  useEffect(() => { void leer(); }, [leer]);

  async function subir(f: File) {
    // 🔴 LA MISMA FUNCIÓN QUE USA EL SERVIDOR. Una segunda regla de «qué
    // archivo entra» es cómo se llega a un error que solo aparece al soltarlo.
    const malo = validarArchivoCedula({ nombre: f.name, tipo: f.type, bytes: f.size });
    if (malo) { toast(malo, "error"); return; }

    setOcupado(true);
    try {
      const form = new FormData();
      form.append("codigo", codigo);
      form.append("archivo", f);
      const r = await fetch("/api/asistencia/cedula-foto", { method: "POST", body: form });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar la foto");
      toast("Listo, guardada", "success");
      await leer();
      onCambio?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar la foto", "error");
    } finally {
      setOcupado(false);
      if (input.current) input.current.value = "";
    }
  }

  async function quitar() {
    if (!window.confirm("¿Quitar la foto de la cédula? La ficha y la cédula escrita no se tocan.")) return;
    setOcupado(true);
    try {
      const r = await fetch(`/api/asistencia/cedula-foto?codigo=${encodeURIComponent(codigo)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "No se pudo quitar");
      toast("Listo, quitada", "success");
      await leer();
      onCambio?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo quitar la foto", "error");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wide text-gray-400">Foto de la cédula</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {tiene && url && (
          <>
            {/* Ver y descargar son la MISMA dirección firmada: el navegador
                abre la imagen y desde ahí se guarda. */}
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black">
              Ver la foto
            </a>
            <a href={url} download
              className="inline-flex min-h-[44px] items-center rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black">
              Descargar
            </a>
          </>
        )}
        {!tiene && (
          <span className="text-sm text-gray-300">Todavía no se cargó</span>
        )}

        {puedeCambiar && (
          <>
            <button type="button" disabled={ocupado} onClick={() => input.current?.click()}
              className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:opacity-50">
              {ocupado ? "Subiendo…" : textoBotonCedula(tiene)}
            </button>
            {tiene && (
              <button type="button" disabled={ocupado} onClick={() => void quitar()}
                className="min-h-[44px] rounded-md px-2 text-sm text-gray-500 transition hover:text-gray-900 disabled:opacity-50">
                Quitar
              </button>
            )}
            <input
              ref={input}
              type="file"
              accept={ACCEPT_CEDULA}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void subir(f);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
