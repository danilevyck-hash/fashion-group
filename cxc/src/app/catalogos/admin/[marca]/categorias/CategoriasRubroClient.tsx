"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGOS › REEBOK › CATEGORÍAS DEL CATÁLOGO (17-sep-2026).
//
// 🩸 El mapa `rubro de Switch → categoría del catálogo` vivía en el código, en
// DOS listas espejo. Cada vez que Reebok mandaba un rubro nuevo había que tocar
// código: el despacho de ropa del 17-sep trajo cuatro —T-SHIRTS, TOPS, BRA,
// JACKETS— y el aviso de la Plantilla Switch solo podía ofrecer «Copiar las
// categorías», porque no había ninguna pantalla a la que llevar a nadie.
//
// Ésta es esa pantalla. Daniel dijo **«sí»**.
//
// 🔴 LAS CATEGORÍAS SON TRES Y NO SE INVENTAN. Lo que se administra es a cuál de
// las tres va cada rubro: el selector no tiene «＋ nueva categoría» y el servidor
// rechaza cualquier otro valor (y el CHECK de la tabla, también). Una categoría
// nueva cambia pantallas, filtros y el bulto que se le cobra al cliente.
//
// 🔴 SOFT DELETE FIRMADO. Quitar no borra: la fila queda con quién y cuándo.
//
// ⚠️ Sin la migración corrida la lista viene vacía y se dice en palabras: la
// pantalla no se rompe y el catálogo sigue clasificando con las seis de siempre.
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { Ayuda } from "@/components/shared/Ayuda";
import { migasDeAppHeader, tramosDeCategorias } from "@/lib/catalogo/camino-de-migas";
import {
  CATEGORIAS_REEBOK,
  ROTULO_CATEGORIA,
  rubrosParaElAviso,
  rubrosPedidosEnLaUrl,
  textoQuitarRubro,
  yaEstaElRubro,
  type RubroDelCatalogo,
} from "@/lib/catalogos/reebok-rubros";
import type { CategoriaReebok } from "@/lib/reebok-clasificacion";

export const RUTA_API_RUBROS = "/api/catalogo/reebok/rubros";

const CAMPO =
  "w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-black transition min-h-[44px] md:[@media(pointer:fine)]:min-h-0";

/** El modal de quitar: dice en palabras qué cambia, y que nada se borra. */
function QuitarRubroModal({
  fila,
  quitando,
  onClose,
  onConfirm,
}: {
  fila: RubroDelCatalogo | null;
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
        <h3 className="text-base font-semibold mb-1">Quitar rubro</h3>
        <p className="text-sm text-gray-600 mb-1">{textoQuitarRubro(fila)}</p>
        <p className="text-xs text-gray-400 mb-4">Queda guardado como historial: nada se borra.</p>
        <div className="flex gap-3">
          <button
            type="button"
            data-testid="confirmar-quitar-rubro"
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

export default function CategoriasRubroClient() {
  return (
    <Suspense>
      <CategoriasRubroInner />
    </Suspense>
  );
}

function CategoriasRubroInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [lista, setLista] = useState<RubroDelCatalogo[]>([]);
  const [sinTabla, setSinTabla] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [rubro, setRubro] = useState("");
  const [categoria, setCategoria] = useState<CategoriaReebok>("apparel");
  const [guardando, setGuardando] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [aQuitar, setAQuitar] = useState<RubroDelCatalogo | null>(null);
  const [quitando, setQuitando] = useState(false);

  /* 🔴 LOS RUBROS QUE LLEGAN DE LA PLANTILLA SWITCH, listos para CONFIRMAR.
     Un enlace no escribe en la base: esto solo llena el formulario, y quien
     entra elige la categoría y toca «Agregar». */
  const pedidos = useMemo(
    () => rubrosPedidosEnLaUrl(searchParams?.get("agregar")),
    [searchParams],
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const res = await fetch(RUTA_API_RUBROS, { cache: "no-store" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "No se pudo cargar la lista. Intenta de nuevo en unos segundos.");
      }
      const b = (await res.json()) as { lista?: RubroDelCatalogo[]; sinTabla?: boolean };
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

  /** Los rubros que hoy conoce el catálogo: los de la tabla o, sin tabla, los
   *  seis del código. Misma regla que usa el aviso de la Plantilla Switch. */
  const conocidos = useMemo(() => rubrosParaElAviso(lista), [lista]);
  /** De los que vinieron por el enlace, los que TODAVÍA faltan. */
  const faltan = useMemo(
    () => pedidos.filter((r) => !yaEstaElRubro(r, conocidos)),
    [pedidos, conocidos],
  );

  async function agregar(valor: string, cat: CategoriaReebok) {
    const limpio = valor.trim();
    if (!limpio) return;
    // 🔴 Repetido por igualdad exacta normalizada, jamás por parecido. El
    // servidor lo vuelve a comprobar; esto solo evita el viaje.
    if (yaEstaElRubro(limpio, conocidos)) {
      setErrorAlta("Ese rubro ya está en la lista");
      return;
    }
    setGuardando(true);
    setErrorAlta(null);
    try {
      const res = await fetch(RUTA_API_RUBROS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubro: limpio, categoria: cat }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "No se pudo guardar. Intenta de nuevo en unos segundos.");
      }
      setRubro("");
      setAviso("Listo, guardado");
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
      const res = await fetch(`${RUTA_API_RUBROS}?id=${aQuitar.id}`, { method: "DELETE" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "No se pudo quitar. Intenta de nuevo en unos segundos.");
      }
      setAviso("Listo, quitado");
      setAQuitar(null);
      void cargar();
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "No se pudo quitar. Intenta de nuevo en unos segundos.");
    } finally {
      setQuitando(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 🔴 EL CAMINO COMPLETO (22-sep-2026), igual que Administrar: esta
          pantalla cuelga de ahí y decía «Inicio › Catálogos» a secas.
          Es de Reebok y de nadie más (ver el guard de la página). */}
      <AppHeader
        module="Catálogos"
        breadcrumbs={migasDeAppHeader(tramosDeCategorias("reebok"), (href) => router.push(href))}
      />

      {aviso && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-black px-4 py-2 text-sm text-white">
          {aviso}
        </div>
      )}

      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-1 flex items-center gap-1 text-xl font-bold text-gray-900">
          Categorías del catálogo Reebok
          <Ayuda titulo="Qué hace esta lista">
            <p>
              Switch manda un <b>rubro</b> con cada artículo (SHOES, APPAREL, BAGS…). Esta lista dice a qué
              cajón del catálogo va cada uno.
            </p>
            <p>
              Antes el <b>Department</b> del archivo (FOOTWEAR, APPAREL, HARDWARE): esta lista es el plan B,
              para cuando ese campo viene vacío. Y es la que decide si la Plantilla Switch avisa o se calla.
            </p>
            <p>Los cajones son tres y no se agregan desde aquí: cambiarlos mueve filtros, pantallas y el bulto.</p>
          </Ayuda>
        </h1>
        <p className="mb-5 text-xs text-gray-500">
          El rubro lo manda Switch. Los cajones son tres: Calzado, Ropa y Accesorios.
        </p>

        {/* 🔴 LO QUE PIDIÓ LA PLANTILLA SWITCH, listo para confirmar uno por uno.
            Nada se guarda solo: cada uno necesita que se elija su cajón. */}
        {faltan.length > 0 && (
          <section
            className="mb-5 rounded-lg border border-stone-300 bg-stone-50 p-4"
            data-testid="rubros-pedidos"
          >
            <b className="text-sm font-semibold text-stone-900">
              {faltan.length === 1 ? "Este rubro viene del archivo" : `Estos ${faltan.length} rubros vienen del archivo`}
            </b>
            <p className="mb-3 mt-0.5 text-xs text-stone-600">
              Elige a qué cajón va cada uno. Hasta que lo hagas, el catálogo no los conoce.
            </p>
            <ul className="flex flex-col gap-2">
              {faltan.map((r) => (
                <li key={r} className="flex flex-wrap items-center gap-2" data-testid={`rubro-pedido-${r}`}>
                  <span className="min-w-[120px] font-mono text-sm font-semibold text-stone-900">{r}</span>
                  {CATEGORIAS_REEBOK.map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={guardando}
                      onClick={() => void agregar(r, c)}
                      className="min-h-[44px] rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-stone-500 active:scale-[0.97] disabled:opacity-40 md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1.5"
                    >
                      {ROTULO_CATEGORIA[c]}
                    </button>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Agregar a mano */}
        <section className="mb-5 rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-medium text-gray-900">Agregar un rubro</h2>
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-[180px] flex-1">
              <input
                type="text"
                value={rubro}
                onChange={(e) => { setRubro(e.target.value); setErrorAlta(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void agregar(rubro, categoria); } }}
                placeholder="Rubro tal como llega de Switch"
                aria-label="Rubro nuevo"
                className={CAMPO}
              />
              {errorAlta && <p className="mt-1 text-xs text-red-600">{errorAlta}</p>}
            </div>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as CategoriaReebok)}
              aria-label="A qué categoría va"
              className={`${CAMPO} w-auto shrink-0`}
            >
              {CATEGORIAS_REEBOK.map((c) => (
                <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void agregar(rubro, categoria)}
              disabled={!rubro.trim() || guardando}
              className="min-h-[44px] shrink-0 rounded-md bg-black px-4 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.97] disabled:opacity-40"
            >
              {guardando ? "Guardando…" : "＋ Agregar rubro"}
            </button>
          </div>
        </section>

        {/* La lista */}
        <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5" data-testid="rubros-config">
          <h2 className="mb-3 text-sm font-medium text-gray-900">A qué cajón va cada rubro</h2>

          {cargando && <p className="text-sm text-gray-400">Cargando…</p>}
          {errorCarga && <p className="text-sm text-red-600">{errorCarga}</p>}

          {!cargando && !errorCarga && lista.length === 0 && (
            <p className="text-sm text-gray-500">
              {sinTabla
                ? `Todavía no está la lista compartida. Mientras tanto el catálogo usa las de siempre: ${conocidos.join(" · ")}.`
                : "Todavía no hay rubros en la lista."}
            </p>
          )}

          {lista.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="pb-2">Rubro de Switch</th>
                  <th className="pb-2">Va a</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {lista.map((f) => (
                  <tr key={f.id} className="border-b border-gray-100 last:border-0" data-testid={`rubro-${f.id}`}>
                    <td className="py-2 font-mono font-medium text-gray-900">{f.rubro}</td>
                    <td className="py-2 text-gray-700">{ROTULO_CATEGORIA[f.categoria]}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setAQuitar(f)}
                        aria-label={`Quitar «${f.rubro}» de la lista`}
                        className="inline-flex min-h-[44px] items-center justify-center rounded px-2 text-xs text-gray-400 transition hover:bg-gray-100 hover:text-red-600 md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <QuitarRubroModal
        fila={aQuitar}
        quitando={quitando}
        onClose={() => setAQuitar(null)}
        onConfirm={() => void confirmarQuitar()}
      />
    </div>
  );
}
