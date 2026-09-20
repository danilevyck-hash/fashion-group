"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS › CONFIGURACIÓN — QUIÉN DESPACHA (19-sep-2026).
//
// Daniel, textual: *«el + para agregar nombre debe de guardarse para todos los
// navegadores, o más fácil ponlo en configuraciones nada más y quita la opción
// de que sea en la creación de la guía»*.
//
// 🩸 La lista del desplegable «Despachado por» vivía mitad en una constante del
// código y mitad en el `localStorage` del navegador (`fg_entregadores`): un
// nombre que agregaba Angela con el ＋ NO lo veía Andrea, y no se podía quitar
// desde ninguna pantalla. El mismo cuento del destino «hola».
//
// Mismo molde que las tarjetas de arriba: tarjeta con borde, campo +
// «Agregar», lista con «Quitar», soft delete con confirmación, nada se borra.
//
// 🔴 Cada fila dice CUÁNTAS GUÍAS despachó: es el dato que dice si se puede
// quitar sin dudar.
//
// ⚠️ Y acá se agrega, en ningún otro lado: el formulario de la guía se quedó
// con el desplegable pelado, que es justo lo que Daniel pidió.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { Ayuda } from "@/components/shared/Ayuda";
import {
  DESPACHADORES_BASE,
  textoGuiasDelDespachador,
  textoQuitarDespachador,
  yaEsUnDespachador,
  type DespachadorConfigurado,
} from "@/lib/guias/despachadores";

const CAMPO =
  "w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-black transition min-h-[44px] md:[@media(pointer:fine)]:min-h-0";

/** El modal de quitar: dice en palabras qué cambia, y que nada se borra. */
function QuitarDespachadorModal({
  fila,
  quitando,
  onClose,
  onConfirm,
}: {
  fila: DespachadorConfigurado | null;
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
        <h3 className="text-base font-semibold mb-1">Quitar de la lista</h3>
        <p className="text-sm text-gray-600 mb-1">
          {textoQuitarDespachador(fila.nombre, fila.guias)}
        </p>
        <p className="text-xs text-gray-400 mb-4">
          Queda guardado como historial: nada se borra. Si vuelve, lo agregas de nuevo.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            data-testid="confirmar-quitar-despachador"
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

export default function DespachadoresConfig({ onAviso }: { onAviso: (m: string) => void }) {
  const [lista, setLista] = useState<DespachadorConfigurado[]>([]);
  const [sinTabla, setSinTabla] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [nuevo, setNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  const [aQuitar, setAQuitar] = useState<DespachadorConfigurado | null>(null);
  const [quitando, setQuitando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const res = await fetch("/api/guias/despachadores?config=1", { cache: "no-store" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "No se pudo cargar la lista. Intenta de nuevo en unos segundos.");
      }
      const b = (await res.json()) as { lista?: DespachadorConfigurado[]; sinTabla?: boolean };
      setLista(Array.isArray(b.lista) ? b.lista : []);
      setSinTabla(b.sinTabla === true);
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
    // 🔴 Repetido por CLAVE exacta y normalizada, jamás por parecido: «Julio»
    // no entra dos veces. El servidor lo vuelve a comprobar; esto solo evita
    // el viaje.
    if (yaEsUnDespachador(nombre, lista.map((f) => f.nombre))) {
      setErrorAlta("Ese nombre ya está en la lista");
      return;
    }
    setGuardando(true);
    setErrorAlta(null);
    try {
      const res = await fetch("/api/guias/despachadores", {
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
      const res = await fetch(`/api/guias/despachadores?id=${aQuitar.id}`, { method: "DELETE" });
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
      aria-labelledby="despachadores-titulo"
      data-testid="despachadores-config"
    >
      <h2 id="despachadores-titulo" className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-900">
        Quién despacha
        <Ayuda titulo="Qué hace esta lista">
          <p>Son los nombres que ofrece el desplegable «Despachado por» al armar una guía.</p>
          <p>La ve todo el equipo, y solo se agrega aquí: en la guía quedó únicamente el desplegable.</p>
          <p>Quitar uno no borra nada: las guías que ya lo dicen siguen con su nombre.</p>
        </Ayuda>
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        Los nombres que ofrece «Despachado por» al armar una guía. La ve todo el equipo.
      </p>

      <div className="mb-4 flex flex-wrap items-start gap-2">
        <div className="min-w-[180px] flex-1">
          <input
            type="text"
            value={nuevo}
            onChange={(e) => { setNuevo(e.target.value); setErrorAlta(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void agregar(); } }}
            placeholder="Nombre de quien despacha"
            aria-label="Nombre nuevo"
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
          {guardando ? "Guardando…" : "＋ Agregar nombre"}
        </button>
      </div>

      {cargando && <p className="text-sm text-gray-400">Cargando…</p>}
      {errorCarga && <p className="text-sm text-red-600">{errorCarga}</p>}

      {!cargando && !errorCarga && lista.length === 0 && (
        <p className="text-sm text-gray-500">
          {sinTabla
            ? `Todavía no está la lista compartida. Mientras tanto, el desplegable ofrece los de siempre: ${DESPACHADORES_BASE.join(" · ")}.`
            : "Todavía no hay nombres en la lista."}
        </p>
      )}

      {lista.length > 0 && (
        <div className="divide-y divide-gray-100">
          {lista.map((f) => (
            <div
              key={f.id}
              data-testid={`despachador-${f.id}`}
              className="flex items-center justify-between gap-2 py-1"
            >
              <div className="min-w-0">
                <span className="text-sm text-gray-900">{f.nombre}</span>
                {/* 🔴 Cuántas guías despachó: el dato que dice si se puede
                    quitar sin dudar. Nunca un «0» pelado. */}
                <span className="block text-xs text-gray-400">{textoGuiasDelDespachador(f.guias)}</span>
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

      <QuitarDespachadorModal
        fila={aQuitar}
        quitando={quitando}
        onClose={() => setAQuitar(null)}
        onConfirm={() => void confirmarQuitar()}
      />
    </section>
  );
}
