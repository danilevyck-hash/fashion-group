"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS › CONFIGURACIÓN — LA LISTA GENERAL DE DESTINOS (7-sep-2026).
//
// 🩸 Esa lista vivía en el `localStorage` del navegador: un destino que
// agregaba Angela NO lo veía nadie más, y **no se podía quitar desde ninguna
// pantalla** — se podía agregar, nunca borrar. Así quedó vivo para siempre un
// destino de prueba llamado «hola» en un solo navegador. Daniel, textual:
// *«lo de solo ver en mi pantalla no tiene lógica, el sistema debe de trabajar
// todo igual, que sea para todo»* y *«quítame hola»*.
//
// Ahora vive en `guias_destino_lista` y ESTA es la pantalla donde se quita.
// Mismo molde que la tarjeta de arriba (destinos por cliente): tarjeta con
// borde, lista, soft delete con confirmación, nada se borra.
//
// ⚠️ Es OTRA lista que la de arriba: aquélla son los destinos DE UN CLIENTE
// (botones y autollenado); ésta es la que el campo Dirección ofrece a todos,
// sin dueño. No se fusionan.
//
// ⚠️ Sin la migración corrida, la lista viene vacía y se dice en palabras: la
// pantalla no se rompe y el formulario de guías sigue ofreciendo los cinco de
// siempre.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { Ayuda } from "@/components/shared/Ayuda";
import {
  DESTINOS_BASE,
  textoQuitarDeLaLista,
  yaEstaEnLaLista,
  type DestinoDeLista,
} from "@/lib/guias/destinos-lista";

const CAMPO =
  "w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-black transition min-h-[44px] md:[@media(pointer:fine)]:min-h-0";

/** El modal de quitar: dice en palabras qué cambia, y que nada se borra. */
function QuitarDeLaListaModal({
  fila,
  quitando,
  onClose,
  onConfirm,
}: {
  fila: DestinoDeLista | null;
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
        <h3 className="text-base font-semibold mb-1">Quitar destino</h3>
        <p className="text-sm text-gray-600 mb-1">{textoQuitarDeLaLista(fila.destino)}</p>
        <p className="text-xs text-gray-400 mb-4">
          Las guías que ya lo usan no cambian, y queda guardado como historial: nada se borra.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            data-testid="confirmar-quitar-lista"
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

export default function DestinosListaConfig({ onAviso }: { onAviso: (m: string) => void }) {
  const [lista, setLista] = useState<DestinoDeLista[]>([]);
  const [sinTabla, setSinTabla] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [nuevo, setNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  const [aQuitar, setAQuitar] = useState<DestinoDeLista | null>(null);
  const [quitando, setQuitando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const res = await fetch("/api/guias/destinos-lista", { cache: "no-store" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "No se pudo cargar la lista. Intenta de nuevo en unos segundos.");
      }
      const b = (await res.json()) as { lista?: DestinoDeLista[]; sinTabla?: boolean };
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
    const destino = nuevo.trim();
    if (!destino) return;
    // 🔴 Repetido por CLAVE exacta, jamás por parecido: «DAVID» no entra dos
    // veces. El servidor lo vuelve a comprobar; esto solo evita el viaje.
    if (yaEstaEnLaLista(destino, lista.map((f) => f.destino))) {
      setErrorAlta("Ese destino ya está en la lista");
      return;
    }
    setGuardando(true);
    setErrorAlta(null);
    try {
      const res = await fetch("/api/guias/destinos-lista", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destino }),
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
      const res = await fetch(`/api/guias/destinos-lista?id=${aQuitar.id}`, { method: "DELETE" });
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
      aria-labelledby="destinos-lista-titulo"
      data-testid="destinos-lista-config"
    >
      <h2 id="destinos-lista-titulo" className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-900">
        Destinos que ofrece el campo Dirección
        <Ayuda titulo="Qué hace esta lista">
          <p>Es la lista que se despliega al escribir la dirección de un envío, para cualquier cliente.</p>
          <p>La ve todo el equipo: lo que agregues aquí —o desde el ＋ del campo al armar una guía— le aparece a todos.</p>
          <p>Quitar un destino no borra nada ni cambia las guías que ya lo usan.</p>
        </Ayuda>
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        La ve todo el equipo. Antes cada quien tenía la suya en su navegador.
      </p>

      <div className="mb-4 flex flex-wrap items-start gap-2">
        <div className="min-w-[180px] flex-1">
          <input
            type="text"
            value={nuevo}
            onChange={(e) => { setNuevo(e.target.value); setErrorAlta(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void agregar(); } }}
            placeholder="Ciudad o destino"
            aria-label="Destino nuevo"
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
          {guardando ? "Guardando…" : "＋ Agregar destino"}
        </button>
      </div>

      {cargando && <p className="text-sm text-gray-400">Cargando…</p>}
      {errorCarga && <p className="text-sm text-red-600">{errorCarga}</p>}

      {!cargando && !errorCarga && lista.length === 0 && (
        <p className="text-sm text-gray-500">
          {sinTabla
            ? `Todavía no está la lista compartida. Mientras tanto, el campo ofrece los de siempre: ${DESTINOS_BASE.join(" · ")}.`
            : "Todavía no hay destinos en la lista."}
        </p>
      )}

      {lista.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {lista.map((f) => (
            <span
              key={f.id}
              data-testid={`destino-lista-${f.id}`}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 py-0.5 pl-2.5 pr-1 text-sm text-gray-700"
            >
              {f.destino}
              <button
                type="button"
                onClick={() => setAQuitar(f)}
                aria-label={`Quitar «${f.destino}» de la lista`}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-1.5 text-xs text-gray-400 transition hover:bg-gray-100 hover:text-red-600 md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:min-w-0"
              >
                Quitar
              </button>
            </span>
          ))}
        </div>
      )}

      <QuitarDeLaListaModal
        fila={aQuitar}
        quitando={quitando}
        onClose={() => setAQuitar(null)}
        onConfirm={() => void confirmarQuitar()}
      />
    </section>
  );
}
