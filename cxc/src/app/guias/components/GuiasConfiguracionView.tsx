"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS › CONFIGURACIÓN — los destinos definidos de cada cliente (4-sep-2026).
//
// 🩸 Daniel, textual: *«city shoes → Calle 19 Central, al lado de la joyería
// Super Oro. Y Nine Sport en Calle 19 Central.»* — y cada corrección así
// necesitaba un despliegue, porque los definidos vivían en una constante.
// Ahora viven en la tabla `guias_destino_cliente` y se corrigen acá.
//
// La ven y la editan **admin Y secretaria** — Daniel: *«configuraciones
// también deja a secretaria»*. El gate vive en /guias (la pestaña no se dibuja
// para bodega ni vendedor) Y en la ruta (403). Mismo molde que Comisiones ›
// Configuración: pestaña a pantalla completa, tarjeta con borde, lista
// agrupada, soft delete con confirmación.
//
// 🔴 Reglas que esta pantalla sostiene:
//   · El campo Dirección de la guía SIGUE siendo texto libre — esto define
//     atajos (botones y autollenado), jamás un candado.
//   · No se toca ni una fila de `guia_items`: el histórico solo se LEE, como
//     ayuda para promover un destino de un toque. 🔴 NUNCA se promueve solo.
//   · Quitar = SOFT DELETE firmado en la tabla. Nada se borra.
//   · El cliente se elige con `ClientePicker`, el único selector del sistema.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import ClientePicker from "@/components/ClientePicker";
import { Toast } from "@/components/ui";
import { Ayuda } from "@/components/shared/Ayuda";
import { useNombresDeClientes } from "@/lib/hooks/useBusquedaClientes";
import {
  agruparConfiguracion,
  comoSeUsa,
  filtrarGrupos,
  parsearTiendas,
  textoQuitarDestino,
  type DestinoConfigurado,
  type GrupoConfig,
} from "@/lib/guias/destinos-config";

interface RespuestaConfig {
  destinos: DestinoConfigurado[];
}

/** El modal de quitar: dice en palabras qué cambia, y que nada se borra. */
function QuitarDestinoModal({
  fila,
  quitando,
  onClose,
  onConfirm,
}: {
  fila: DestinoConfigurado | null;
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
        <p className="text-sm text-gray-600 mb-1">
          {textoQuitarDestino(fila.cliente_nombre, fila.cliente_codigo, fila.destino)}
        </p>
        <p className="text-xs text-gray-400 mb-4">Queda guardado como historial: nada se borra.</p>
        <div className="flex gap-3">
          <button
            type="button"
            data-testid="confirmar-quitar"
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

const CAMPO =
  "w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-black transition min-h-[44px] md:[@media(pointer:fine)]:min-h-0";

export default function GuiasConfiguracionView() {
  const [filas, setFilas] = useState<DestinoConfigurado[]>([]);
  const [historicos, setHistoricos] = useState<Record<string, string[]>>({});
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [toast, setToast] = useState("");
  // `true` = sesión lista (la pestaña solo se monta con sesión revisada).
  const nombresPorCodigo = useNombresDeClientes(true);

  // ── Alta ──
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [altaNombre, setAltaNombre] = useState("");
  const [altaCodigo, setAltaCodigo] = useState("");
  const [altaDestino, setAltaDestino] = useState("");
  const [altaTiendas, setAltaTiendas] = useState("");
  const [guardandoAlta, setGuardandoAlta] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  // ── Edición en la fila ──
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [edDestino, setEdDestino] = useState("");
  const [edTiendas, setEdTiendas] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  // ── Quitar ──
  const [aQuitar, setAQuitar] = useState<DestinoConfigurado | null>(null);
  const [quitando, setQuitando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const res = await fetch("/api/guias/destinos-config", { cache: "no-store" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "No se pudo cargar la lista. Intenta de nuevo en unos segundos.");
      }
      const data = (await res.json()) as RespuestaConfig;
      setFilas(Array.isArray(data.destinos) ? data.destinos : []);
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : "No se pudo cargar la lista. Intenta de nuevo en unos segundos.");
      setFilas([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    // El historial de destinos (para promover de un toque) sale de la misma
    // lectura que ya alimenta el formulario. Best-effort: sin él, la pantalla
    // lista y edita igual.
    let cancel = false;
    fetch("/api/guias/frecuencias", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { destinos?: Record<string, string[]> } | null) => {
        if (!cancel && d && d.destinos && typeof d.destinos === "object") setHistoricos(d.destinos);
      })
      .catch(() => { /* sin historial; la lista funciona igual */ });
    return () => { cancel = true; };
  }, [cargar]);

  const grupos = useMemo(
    () => agruparConfiguracion(filas, historicos, nombresPorCodigo),
    [filas, historicos, nombresPorCodigo],
  );
  const visibles = useMemo(() => filtrarGrupos(grupos, busqueda), [grupos, busqueda]);

  function cerrarAlta() {
    setAltaAbierta(false);
    setAltaNombre("");
    setAltaCodigo("");
    setAltaDestino("");
    setAltaTiendas("");
    setErrorAlta(null);
  }

  /**
   * Define un destino (el alta y el «Definir» de un histórico van por acá).
   * 🔴 Solo lo dispara un TOQUE — nunca un render ni un efecto.
   */
  async function definir(codigo: string, destino: string, tiendas: string[]): Promise<boolean> {
    const res = await fetch("/api/guias/destinos-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cliente_codigo: codigo, destino, tiendas }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error ?? "No se pudo guardar. Intenta de nuevo en unos segundos.");
    }
    return true;
  }

  async function guardarAlta() {
    setGuardandoAlta(true);
    setErrorAlta(null);
    try {
      await definir(altaCodigo, altaDestino.trim(), parsearTiendas(altaTiendas));
      setToast("Listo, guardado");
      cerrarAlta();
      void cargar();
    } catch (err) {
      setErrorAlta(err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo en unos segundos.");
    } finally {
      setGuardandoAlta(false);
    }
  }

  const [promoviendo, setPromoviendo] = useState<string | null>(null);
  async function promover(codigo: string, destino: string) {
    setPromoviendo(`${codigo}|${destino}`);
    try {
      await definir(codigo, destino, []);
      setToast("Listo, guardado");
      void cargar();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo en unos segundos.");
    } finally {
      setPromoviendo(null);
    }
  }

  function abrirEdicion(f: DestinoConfigurado) {
    setEditandoId(f.id);
    setEdDestino(f.destino);
    setEdTiendas(f.tiendas.join(", "));
    setErrorEdicion(null);
  }

  async function guardarEdicion(f: DestinoConfigurado) {
    setGuardandoEdicion(true);
    setErrorEdicion(null);
    try {
      const res = await fetch(`/api/guias/destinos-config?id=${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destino: edDestino.trim(), tiendas: parsearTiendas(edTiendas) }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "No se pudo guardar. Intenta de nuevo en unos segundos.");
      }
      setToast("Listo, guardado");
      setEditandoId(null);
      void cargar();
    } catch (err) {
      setErrorEdicion(err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo en unos segundos.");
    } finally {
      setGuardandoEdicion(false);
    }
  }

  /**
   * 🔴 «El de siempre» (4-sep-2026, Daniel: «sí correcto, con entrega Sport
   * Corner como default, que elija si quiere el otro sino»): una marca por
   * fila. El servidor garantiza a lo sumo UNA por cliente (marcar una apaga
   * las demás), por eso acá solo se manda el PATCH y se relee la lista.
   */
  const [marcandoId, setMarcandoId] = useState<number | null>(null);
  async function marcarSiempre(f: DestinoConfigurado, valor: boolean) {
    setMarcandoId(f.id);
    try {
      const res = await fetch(`/api/guias/destinos-config?id=${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elDeSiempre: valor }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "No se pudo guardar. Intenta de nuevo en unos segundos.");
      }
      setToast("Listo, guardado");
      void cargar();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo en unos segundos.");
    } finally {
      setMarcandoId(null);
    }
  }

  async function confirmarQuitar() {
    if (!aQuitar) return;
    setQuitando(true);
    try {
      // 🔴 Soft delete en el servidor (activo = false, firmado). Esta pantalla
      // jamás borra una fila.
      const res = await fetch(`/api/guias/destinos-config?id=${aQuitar.id}`, { method: "DELETE" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "No se pudo quitar. Intenta de nuevo en unos segundos.");
      }
      setToast("Listo, quitado");
      setAQuitar(null);
      void cargar();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "No se pudo quitar. Intenta de nuevo en unos segundos.");
    } finally {
      setQuitando(false);
    }
  }

  const puedeGuardarAlta = !!altaCodigo.trim() && !!altaDestino.trim() && !guardandoAlta;
  const historicosDelAlta = altaCodigo ? (historicos[altaCodigo.trim()] ?? []) : [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5" aria-labelledby="destinos-config-titulo">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="destinos-config-titulo" className="flex items-center gap-1 text-sm font-medium text-gray-900">
            Destinos por cliente
            <Ayuda titulo="Qué hace esta lista">
              <p>Al hacer una guía, el destino marcado como «el de siempre» se llena solo al elegir el cliente; los demás salen como botones. Sin ninguno marcado, no se llena nada.</p>
              <p>El campo Dirección sigue siendo libre: quien quiera puede escribir otra cosa.</p>
              <p>Quitar un destino no borra nada: queda guardado como historial.</p>
            </Ayuda>
          </h2>
          <button
            type="button"
            onClick={() => setAltaAbierta(true)}
            className="min-h-[44px] shrink-0 rounded-md bg-black px-4 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.97]"
          >
            ＋ Agregar destino
          </button>
        </div>

        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cliente por nombre o código…"
          aria-label="Buscar cliente por nombre o código"
          className={`${CAMPO} mb-4`}
        />

        {altaAbierta && (
          <div data-testid="alta-destino" className="mb-4 rounded-md border border-gray-200 bg-gray-50/60 p-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Cliente</label>
              {/* 🔴 El ÚNICO selector del sistema. Sin salida a mano: un
                  destino se define para un cliente del directorio. */}
              <ClientePicker
                value={altaNombre}
                codigo={altaCodigo}
                permitirOtro={false}
                onChange={(nombre, codigo) => {
                  setAltaNombre(nombre);
                  setAltaCodigo(codigo);
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Destino</label>
              <input
                type="text"
                value={altaDestino}
                onChange={(e) => setAltaDestino(e.target.value)}
                placeholder="Tal como debe salir en la guía"
                className={CAMPO}
              />
              {historicosDelAlta.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-gray-400">Usados en sus guías:</span>
                  {historicosDelAlta.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setAltaDestino(h)}
                      className="text-xs border border-gray-200 rounded-md px-2.5 text-gray-500 hover:text-black hover:border-gray-300 inline-flex items-center min-h-[44px] md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1 transition"
                    >
                      {h}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Tiendas <span className="normal-case font-normal">(opcional, separadas por coma)</span>
              </label>
              <input
                type="text"
                value={altaTiendas}
                onChange={(e) => setAltaTiendas(e.target.value)}
                placeholder="5, 6, 14, Mas Flow"
                className={CAMPO}
              />
            </div>
            {errorAlta && <p className="text-xs text-rose-600">{errorAlta}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void guardarAlta()}
                disabled={!puedeGuardarAlta}
                className="rounded-md bg-black px-4 text-sm font-medium text-white min-h-[44px] transition-all hover:bg-gray-800 active:scale-[0.97] disabled:opacity-40"
              >
                {guardandoAlta ? "Guardando…" : "Guardar destino"}
              </button>
              <button
                type="button"
                onClick={cerrarAlta}
                className="rounded-md border border-gray-200 px-4 text-sm text-gray-600 min-h-[44px] hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {errorCarga && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            {errorCarga}
            {/* Con la migración pendiente, que se sepa que nada está roto. */}
            {/falta correr la migración/i.test(errorCarga) && (
              <span className="block text-xs text-amber-700 mt-0.5">
                Mientras tanto, los destinos definidos siguen saliendo del código y las guías funcionan igual.
              </span>
            )}
          </div>
        )}

        {cargando ? (
          <div className="py-10 text-center text-sm text-gray-500">Cargando…</div>
        ) : visibles.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            {busqueda.trim()
              ? "Ningún cliente coincide con la búsqueda."
              : errorCarga
                ? null
                : "Todavía no hay destinos definidos. Toca «＋ Agregar destino»."}
          </div>
        ) : (
          <div className="space-y-4">
            {visibles.map((g) => (
              <GrupoDeCliente
                key={g.codigo}
                grupo={g}
                editandoId={editandoId}
                edDestino={edDestino}
                edTiendas={edTiendas}
                guardandoEdicion={guardandoEdicion}
                errorEdicion={errorEdicion}
                promoviendo={promoviendo}
                onEditar={abrirEdicion}
                onCambiaDestino={setEdDestino}
                onCambiaTiendas={setEdTiendas}
                onGuardarEdicion={guardarEdicion}
                onCancelarEdicion={() => setEditandoId(null)}
                onQuitar={setAQuitar}
                onPromover={promover}
                marcandoId={marcandoId}
                onMarcarSiempre={marcarSiempre}
              />
            ))}
          </div>
        )}
      </section>

      <QuitarDestinoModal
        fila={aQuitar}
        quitando={quitando}
        onClose={() => setAQuitar(null)}
        onConfirm={() => void confirmarQuitar()}
      />
      <Toast message={toast} />
    </div>
  );
}

function GrupoDeCliente({
  grupo: g,
  editandoId,
  edDestino,
  edTiendas,
  guardandoEdicion,
  errorEdicion,
  promoviendo,
  onEditar,
  onCambiaDestino,
  onCambiaTiendas,
  onGuardarEdicion,
  onCancelarEdicion,
  onQuitar,
  onPromover,
  marcandoId,
  onMarcarSiempre,
}: {
  grupo: GrupoConfig;
  editandoId: number | null;
  edDestino: string;
  edTiendas: string;
  guardandoEdicion: boolean;
  errorEdicion: string | null;
  promoviendo: string | null;
  onEditar: (f: DestinoConfigurado) => void;
  onCambiaDestino: (v: string) => void;
  onCambiaTiendas: (v: string) => void;
  onGuardarEdicion: (f: DestinoConfigurado) => void;
  onCancelarEdicion: () => void;
  onQuitar: (f: DestinoConfigurado) => void;
  onPromover: (codigo: string, destino: string) => void;
  marcandoId: number | null;
  onMarcarSiempre: (f: DestinoConfigurado, valor: boolean) => void;
}) {
  const n = g.filas.length;
  return (
    <div data-testid={`grupo-${g.codigo}`} className="rounded-md border border-gray-200">
      <div className="flex items-baseline justify-between gap-2 border-b border-gray-100 px-3 py-2">
        <div className="min-w-0">
          <span className="text-sm font-medium text-gray-900">{g.nombre ?? g.codigo}</span>{" "}
          <span className="text-xs text-gray-400">{g.codigo}</span>
        </div>
        <span className="shrink-0 text-xs text-gray-400">
          {n === 0 ? "Sin destinos definidos" : n === 1 ? "1 destino" : `${n} destinos`}
        </span>
      </div>

      {/* Qué hace el formulario con esta definición: se dice acá, no se adivina. */}
      {n > 0 && (
        <p className="px-3 pt-2 text-xs text-gray-500">
          {comoSeUsa(n, g.filas.some((f) => f.el_de_siempre))}
        </p>
      )}

      <div className="px-3 py-2 space-y-1.5">
        {g.filas.map((f) =>
          editandoId === f.id ? (
            <div key={f.id} data-testid={`edicion-${f.id}`} className="rounded-md border border-gray-200 bg-gray-50/60 p-2.5 space-y-2">
              <input
                type="text"
                value={edDestino}
                onChange={(e) => onCambiaDestino(e.target.value)}
                aria-label="Destino"
                className={CAMPO}
              />
              <input
                type="text"
                value={edTiendas}
                onChange={(e) => onCambiaTiendas(e.target.value)}
                aria-label="Tiendas (opcional, separadas por coma)"
                placeholder="Tiendas (opcional, separadas por coma)"
                className={CAMPO}
              />
              {errorEdicion && <p className="text-xs text-rose-600">{errorEdicion}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onGuardarEdicion(f)}
                  disabled={!edDestino.trim() || guardandoEdicion}
                  className="rounded-md bg-black px-3 text-sm font-medium text-white min-h-[44px] md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1.5 transition-all hover:bg-gray-800 active:scale-[0.97] disabled:opacity-40"
                >
                  {guardandoEdicion ? "Guardando…" : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={onCancelarEdicion}
                  className="rounded-md border border-gray-200 px-3 text-sm text-gray-600 min-h-[44px] md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1.5 hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div key={f.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-sm text-gray-900">{f.destino}</span>
                {f.tiendas.length > 0 && (
                  <span className="block text-xs text-gray-400">Tiendas: {f.tiendas.join(" · ")}</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {/* 🔴 Una marca por fila: «el de siempre». Marcarla apaga la
                    de los demás destinos del cliente (lo garantiza el
                    servidor); sin ninguna marcada, nada se llena solo. */}
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 min-h-[44px] md:[@media(pointer:fine)]:min-h-0 px-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={f.el_de_siempre}
                    disabled={marcandoId !== null}
                    onChange={() => onMarcarSiempre(f, !f.el_de_siempre)}
                    aria-label={`El de siempre: «${f.destino}» de ${g.nombre ?? g.codigo}`}
                    className="w-4 h-4 accent-black"
                  />
                  el de siempre
                </label>
                <button
                  type="button"
                  onClick={() => onEditar(f)}
                  aria-label={`Editar «${f.destino}» de ${g.nombre ?? g.codigo}`}
                  className="text-xs text-gray-500 hover:text-black min-h-[44px] min-w-[44px] md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:min-w-0 md:[@media(pointer:fine)]:px-1.5 inline-flex items-center justify-center transition"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => onQuitar(f)}
                  aria-label={`Quitar «${f.destino}» de ${g.nombre ?? g.codigo}`}
                  className="text-xs text-gray-500 hover:text-red-600 min-h-[44px] min-w-[44px] md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:min-w-0 md:[@media(pointer:fine)]:px-1.5 inline-flex items-center justify-center transition"
                >
                  Quitar
                </button>
              </div>
            </div>
          ),
        )}

        {g.historicosSinDefinir.length > 0 && (
          <div data-testid={`historicos-${g.codigo}`} className="pt-1.5 border-t border-gray-100">
            <span className="text-xs text-gray-400">Usados en guías, sin definir:</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {g.historicosSinDefinir.map((h) => (
                <span key={h} className="inline-flex items-center gap-1 text-xs border border-dashed border-gray-300 rounded-md pl-2.5 pr-1 py-0.5 text-gray-500">
                  {h}
                  {/* 🔴 Promover es un TOQUE: nada se define solo. */}
                  <button
                    type="button"
                    onClick={() => onPromover(g.codigo, h)}
                    disabled={promoviendo === `${g.codigo}|${h}`}
                    aria-label={`Definir «${h}» para ${g.nombre ?? g.codigo}`}
                    className="rounded px-1.5 min-h-[44px] md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-0.5 text-gray-600 hover:text-black hover:bg-gray-100 font-medium transition disabled:opacity-40"
                  >
                    {promoviendo === `${g.codigo}|${h}` ? "…" : "Definir"}
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
