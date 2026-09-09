"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS › CONFIGURACIÓN — LOS TRANSPORTISTAS (9-sep-2026).
//
// Daniel, textual: *«Ponme opción en configuración de guía para poder agregar
// un transportista nuevo.»*
//
// 🩸 Los SEIS de la lista se sembraron el 26-may-2026 y desde entonces nadie
// pudo agregar uno: no había pantalla, ni botón, ni ruta de alta. Y por eso se
// escribieron A MANO en el campo de texto de la guía, saltándose la lista:
// «NUÑEZ GLOBAL SOLUTIONS», «CITY MODA», «SPORTING SHOES», «LUTY LUI» y uno que
// dice «no». Es el mismo cuento del destino «hola» que vivía en un solo
// navegador.
//
// Mismo molde que las dos tarjetas de arriba (destinos): tarjeta con borde,
// campo + «Agregar», lista con «Quitar», soft delete con confirmación, nada se
// borra.
//
// 🔴 Cada fila dice CUÁNTAS GUÍAS lleva: es el dato que dice si se puede quitar
// sin dudar.
//
// ⚠️ Agregar también se puede desde la guía misma, con el ＋ al lado del
// desplegable — ahí es donde está bodega, que no ve esta pantalla.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { Ayuda } from "@/components/shared/Ayuda";
import {
  textoGuiasDelTransportista,
  textoQuitarTransportista,
  yaEsUnTransportista,
  type TransportistaConfigurado,
} from "@/lib/guias/transportistas";

const CAMPO =
  "w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-black transition min-h-[44px] md:[@media(pointer:fine)]:min-h-0";

/** El modal de quitar: dice en palabras qué cambia, y que nada se borra. */
function QuitarTransportistaModal({
  fila,
  quitando,
  onClose,
  onConfirm,
}: {
  fila: TransportistaConfigurado | null;
  quitando: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!fila) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-1">Quitar transportista</h3>
        <p className="text-sm text-gray-600 mb-1">
          {textoQuitarTransportista(fila.nombre, fila.guias)}
        </p>
        <p className="text-xs text-gray-400 mb-4">
          Queda guardado como historial: nada se borra. Si vuelve, lo agregas de nuevo.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            data-testid="confirmar-quitar-transportista"
            onClick={onConfirm}
            disabled={quitando}
            className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-all bg-black text-white hover:bg-gray-800 active:scale-[0.97] disabled:opacity-40 min-h-[44px]"
          >
            {quitando ? "Quitando…" : "Quitar"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 active:bg-gray-100 transition-all min-h-[44px]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TransportistasConfig({ onAviso }: { onAviso: (m: string) => void }) {
  const [lista, setLista] = useState<TransportistaConfigurado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [nuevo, setNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  const [aQuitar, setAQuitar] = useState<TransportistaConfigurado | null>(null);
  const [quitando, setQuitando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const res = await fetch("/api/transportistas?config=1", { cache: "no-store" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "No se pudo cargar la lista. Intenta de nuevo en unos segundos.");
      }
      const b = (await res.json()) as { lista?: TransportistaConfigurado[] };
      setLista(Array.isArray(b.lista) ? b.lista : []);
    } catch (err) {
      setErrorCarga(
        err instanceof Error ? err.message : "No se pudo cargar la lista. Intenta de nuevo en unos segundos.",
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function agregar() {
    const nombre = nuevo.trim();
    if (!nombre) return;
    // 🔴 Repetido por CLAVE exacta y normalizada, jamás por parecido:
    // «RedNblue» no entra dos veces. El servidor lo vuelve a comprobar; esto
    // solo evita el viaje.
    if (yaEsUnTransportista(nombre, lista.map((f) => f.nombre))) {
      setErrorAlta("Ese transportista ya está en la lista");
      return;
    }
    setGuardando(true);
    setErrorAlta(null);
    try {
      const res = await fetch("/api/transportistas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "No se pudo guardar. Intenta de nuevo en unos segundos.");
      }
      setNuevo("");
      onAviso("Listo, guardado");
      void cargar();
    } catch (err) {
      setErrorAlta(err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo en unos segundos.");
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarQuitar() {
    if (!aQuitar) return;
    setQuitando(true);
    try {
      // 🔴 Soft delete en el servidor (activo = false, firmado). Esta pantalla
      // jamás borra una fila.
      const res = await fetch(`/api/transportistas?id=${encodeURIComponent(aQuitar.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "No se pudo quitar. Intenta de nuevo en unos segundos.");
      }
      onAviso("Listo, quitado");
      setAQuitar(null);
      void cargar();
    } catch (err) {
      onAviso(err instanceof Error ? err.message : "No se pudo quitar. Intenta de nuevo en unos segundos.");
    } finally {
      setQuitando(false);
    }
  }

  return (
    <section
      className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5"
      aria-labelledby="transportistas-titulo"
      data-testid="transportistas-config"
    >
      <h2 id="transportistas-titulo" className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-900">
        Transportistas
        <Ayuda titulo="Qué hace esta lista">
          <p>Son los que ofrece el desplegable «Transportista» al armar una guía.</p>
          <p>La ve todo el equipo: lo que agregues aquí —o desde el ＋ del desplegable, al armar la guía— le aparece a todos.</p>
          <p>Quitar uno no borra nada: las guías que ya lo usan siguen diciendo su nombre.</p>
        </Ayuda>
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        La ve todo el equipo. También puedes agregar uno desde la guía misma.
      </p>

      <div className="mb-4 flex flex-wrap items-start gap-2">
        <div className="min-w-[180px] flex-1">
          <input
            type="text"
            value={nuevo}
            onChange={(e) => { setNuevo(e.target.value); setErrorAlta(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void agregar(); } }}
            placeholder="Nombre del transportista"
            aria-label="Transportista nuevo"
            className={CAMPO}
          />
          {errorAlta && <p className="mt-1 text-xs text-red-600">{errorAlta}</p>}
        </div>
        <button
          type="button"
          onClick={() => void agregar()}
          disabled={!nuevo.trim() || guardando}
          className="min-h-[44px] shrink-0 rounded-md bg-black px-4 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.97] disabled:opacity-40"
        >
          {guardando ? "Guardando…" : "＋ Agregar transportista"}
        </button>
      </div>

      {cargando && <p className="text-sm text-gray-400">Cargando…</p>}
      {errorCarga && <p className="text-sm text-red-600">{errorCarga}</p>}

      {!cargando && !errorCarga && lista.length === 0 && (
        <p className="text-sm text-gray-500">Todavía no hay transportistas en la lista.</p>
      )}

      {lista.length > 0 && (
        <div className="divide-y divide-gray-100">
          {lista.map((f) => (
            <div
              key={f.id}
              data-testid={`transportista-${f.id}`}
              className="flex items-center justify-between gap-2 py-1"
            >
              <div className="min-w-0">
                <span className="text-sm text-gray-900">{f.nombre}</span>
                {/* 🔴 Cuántas guías lleva: el dato que dice si se puede quitar
                    sin dudar. Nunca un «0» pelado. */}
                <span className="block text-xs text-gray-400">{textoGuiasDelTransportista(f.guias)}</span>
              </div>
              <button
                type="button"
                onClick={() => setAQuitar(f)}
                aria-label={`Quitar «${f.nombre}» de la lista`}
                className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded px-1.5 text-xs text-gray-500 transition hover:bg-gray-100 hover:text-red-600 md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:min-w-0"
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}

      <QuitarTransportistaModal
        fila={aQuitar}
        quitando={quitando}
        onClose={() => setAQuitar(null)}
        onConfirm={() => void confirmarQuitar()}
      />
    </section>
  );
}
