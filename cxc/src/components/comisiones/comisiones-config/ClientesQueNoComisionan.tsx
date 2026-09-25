"use client";

// «Clientes que no comisionan» — la segunda tarjeta de Comisiones › Configuración.
//
// 🩸 Daniel, 3-sep-2026: «crea configuración en comisiones para desactivar
// cálculos de clientes». Grano empresa + cliente + vendedor, y con VENTA y
// COBRO por separado: «poder quitar comisiones en ventas o comisiones sin que
// tengan que ser de los dos». Sin «motivo»: no lo pidió. Quitar = soft delete
// con confirmación. El cliente se elige con ClienteSwitchPicker, el ÚNICO
// selector de cliente de Switch del sistema.
//
// 🔴 SE FUERON LAS CASILLAS (25-sep-2026, la «5t/5u»). Daniel, textual:
// *«¿la casilla llena significa que comisiona o no?»*. Hoy la casilla marcada
// quería decir **excluido** —o sea que NO comisiona— y por eso se leía al
// revés: la columna se llamaba «VENTA» y estar marcada significaba lo contrario
// de vender. Ahora cada regla lo dice **en palabras**: «No comisiona venta ni
// cobro» / «No comisiona solo el cobro».
//
// 🩸 Y SE JUNTAN LAS FILAS. Medido: **18 filas activas que son 12 reglas**,
// porque «Multi Fashion Holding D-108 · Todos los vendedores» ocupaba SEIS
// —una por empresa— y «Millenium Sports D-104» dos. En el celular eran 18
// renglones en SEIS tablas, con el encabezado de cinco columnas repetido seis
// veces y QUITAR fuera de la pantalla en las seis (43 a 64 px afuera). Ahora
// son 12 renglones, un solo encabezado y D-108 se dice **una vez**.
//
// 🔴 «TODOS LOS VENDEDORES» (6-sep-2026). El comodín `*`: ese cliente no
// comisiona para NADIE en esa empresa. Nació porque «Multi Fashion Holding»
// (D-108, la intercompañía) vivía excluido por su NOMBRE dentro del SQL de la
// plata. En pantalla nunca se ve el `*`.
//
// 🔴 UNA DECISIÓN, VARIAS EMPRESAS (6-sep-2026). El alta pide LAS QUE SEAN. El
// servidor escribe UNA FILA POR EMPRESA (el grano de la tabla no cambia).
//
// 🔴 LA BASE NO CAMBIA NI UNA COLUMNA: `comision_exclusion`, `excluye_venta` /
// `excluye_cobro` con su CHECK de «al menos una», soft delete firmado, única
// entre activas, RLS service_role. Cambia cómo se muestra y cómo se pregunta.
//
// Nada de esto se dice «exclusión» en pantalla.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ayuda } from "@/components/shared/Ayuda";
import { ConfirmDeleteModal } from "@/components/ui";
import OverflowMenu from "@/components/ui/OverflowMenu";
import ClienteSwitchPicker, { type ClienteSwitchOpcion } from "@/components/catalogo/ClienteSwitchPicker";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";
import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";
import { estaRetirado } from "@/lib/comisiones/retirados";
import {
  AVISO_NINGUNA_CASILLA,
  ROTULO_CLIENTES_SIN_COMISION,
  ROTULO_VENDEDOR_TODOS,
  VENDEDOR_TODOS,
  type ExclusionActiva,
} from "@/lib/comisiones/exclusiones";
import {
  AVISO_AL_MENOS_UNO,
  EXPLICACION_DEL_ALTA,
  PREGUNTA_DEL_ALTA,
  ROTULO_EL_COBRO,
  ROTULO_FILTRO_EMPRESA,
  ROTULO_FILTRO_VENDEDOR,
  ROTULO_LA_VENTA,
  TODAS,
  TODOS,
  filtrarReglas,
  loQueNoComisiona,
  reglasEnPalabras,
  type ReglaEnPalabras,
} from "@/lib/comisiones/exclusiones-en-palabras";

interface ListaExclusiones {
  exclusiones: ExclusionActiva[];
  vendedores: Record<string, string[]>;
}

/** Nombre CORTO de la empresa — «Vistana», no «Vistana International» (§ 0). */
const nombreEmpresa = (k: string) => nombreCortoEmpresa(k);

/**
 * El interruptor de «¿Qué no comisiona?».
 *
 * 🔴 ES UN INTERRUPTOR Y NO UNA CASILLA, y no es cosmético: una casilla bajo un
 * encabezado que dice «VENTA» se lee «esto comisiona la venta». Un interruptor
 * bajo la pregunta «¿Qué no comisiona?» se lee al derecho.
 */
function Interruptor({
  prendido,
  etiqueta,
  onChange,
  disabled,
}: {
  prendido: boolean;
  etiqueta: string;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={prendido}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={() => onChange(!prendido)}
      className={`relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        prendido ? "bg-emerald-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-[27px] w-[27px] rounded-full bg-white shadow transition ${
          prendido ? "translate-x-[22px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

export function ClientesQueNoComisionan({ onSaved }: { onSaved: (msg: string) => void }) {
  const [datos, setDatos] = useState<ListaExclusiones | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fila de alta. VARIAS empresas de una vez.
  const [agregando, setAgregando] = useState(false);
  const [empresas, setEmpresas] = useState<string[]>([EMPRESAS_COMISIONAN[0]]);
  const [cliente, setCliente] = useState<ClienteSwitchOpcion | undefined>(undefined);
  const [vendedor, setVendedor] = useState<string>("");
  // «arranca con las dos marcadas pero yo deselecciono» — Daniel.
  const [excluyeVenta, setExcluyeVenta] = useState(true);
  const [excluyeCobro, setExcluyeCobro] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  // Los dos desplegables de arriba.
  const [filtroEmpresa, setFiltroEmpresa] = useState(TODAS);
  const [filtroVendedor, setFiltroVendedor] = useState(TODOS);

  // Cambiar qué no comisiona una regla que ya está.
  const [editando, setEditando] = useState<ReglaEnPalabras | null>(null);
  const [edVenta, setEdVenta] = useState(true);
  const [edCobro, setEdCobro] = useState(true);
  const [cambiando, setCambiando] = useState(false);
  const [avisoFila, setAvisoFila] = useState<{ llave: string; texto: string } | null>(null);

  // Quitar (soft delete) con confirmación.
  const [aQuitar, setAQuitar] = useState<ReglaEnPalabras | null>(null);
  const [quitando, setQuitando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ventas/comisiones/exclusiones", { cache: "no-store" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      setDatos((await res.json()) as ListaExclusiones);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la lista. Intenta de nuevo.");
      setDatos(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const empresaDirectorio =
    EMPRESAS_COMISIONAN.find((k) => empresas.includes(k)) ?? EMPRESAS_COMISIONAN[0];

  const alternarEmpresa = (k: string) => {
    setEmpresas((prev) => {
      const siguiente = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      const nuevoDirectorio = EMPRESAS_COMISIONAN.find((e) => siguiente.includes(e));
      if (nuevoDirectorio !== empresaDirectorio) {
        setCliente(undefined);
        setVendedor("");
      }
      return siguiente;
    });
  };

  const cancelarAlta = () => {
    setAgregando(false);
    setEmpresas([EMPRESAS_COMISIONAN[0]]);
    setCliente(undefined);
    setVendedor("");
    setExcluyeVenta(true);
    setExcluyeCobro(true);
    setErrorAlta(null);
  };

  const vendedoresDeEmpresa = (datos?.vendedores[empresaDirectorio] ?? []).filter((v) => !estaRetirado(v));
  const clienteCodigo = cliente?.codigo?.trim().toUpperCase() ?? "";
  const ningunaCasilla = !excluyeVenta && !excluyeCobro;
  const sinEmpresas = empresas.length === 0;
  const puedeGuardar = !sinEmpresas && !!clienteCodigo && !!vendedor && !ningunaCasilla && !guardando;

  async function guardar() {
    setGuardando(true);
    setErrorAlta(null);
    try {
      const res = await fetch("/api/ventas/comisiones/exclusiones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_keys: EMPRESAS_COMISIONAN.filter((k) => empresas.includes(k)),
          cliente_codigo: clienteCodigo,
          vendedor,
          excluye_venta: excluyeVenta,
          excluye_cobro: excluyeCobro,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      onSaved("Listo, guardado");
      cancelarAlta();
      void load();
    } catch (err) {
      setErrorAlta(err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo en unos segundos.");
    } finally {
      setGuardando(false);
    }
  }

  /**
   * Cambiar qué no comisiona una regla.
   *
   * 🔑 UNA REGLA PUEDE SER VARIAS FILAS (D-108 son seis): se manda un PATCH por
   * cada una, con el MISMO payload de siempre. Con las dos apagadas no viaja
   * nada y se avisa — es la misma regla que ya tiene la base.
   */
  async function cambiarLaRegla() {
    if (!editando) return;
    if (!edVenta && !edCobro) {
      setAvisoFila({ llave: editando.llave, texto: AVISO_NINGUNA_CASILLA });
      return;
    }
    setAvisoFila(null);
    setCambiando(true);
    try {
      for (const id of editando.ids) {
        const res = await fetch(`/api/ventas/comisiones/exclusiones?id=${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ excluye_venta: edVenta, excluye_cobro: edCobro }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.error ?? `HTTP ${res.status}`);
        }
      }
      onSaved("Listo, guardado");
      setEditando(null);
      void load();
    } catch (err) {
      setAvisoFila({
        llave: editando.llave,
        texto: err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo en unos segundos.",
      });
    } finally {
      setCambiando(false);
    }
  }

  async function quitar() {
    if (!aQuitar) return;
    setQuitando(true);
    try {
      for (const id of aQuitar.ids) {
        const res = await fetch(`/api/ventas/comisiones/exclusiones?id=${id}`, { method: "DELETE" });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.error ?? `HTTP ${res.status}`);
        }
      }
      onSaved("Listo, ya vuelve a comisionar");
      setAQuitar(null);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar. Intenta de nuevo en unos segundos.");
      setAQuitar(null);
    } finally {
      setQuitando(false);
    }
  }

  const reglas = useMemo(() => reglasEnPalabras(datos?.exclusiones ?? []), [datos]);
  const visibles = useMemo(
    () => filtrarReglas(reglas, { empresa: filtroEmpresa, vendedor: filtroVendedor }),
    [reglas, filtroEmpresa, filtroVendedor],
  );
  /** Los vendedores que de verdad aparecen en la lista, para el desplegable. */
  const vendedoresEnLista = useMemo(
    () => [...new Set(reglas.filter((r) => !r.vendedorEsTodos).map((r) => r.vendedor))].sort(),
    [reglas],
  );

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5" aria-labelledby="sin-comision-titulo">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 id="sin-comision-titulo" className="flex items-center gap-1 text-sm font-medium text-gray-900">
          {ROTULO_CLIENTES_SIN_COMISION}
          <Ayuda titulo="Qué hace esta lista">
            <p>Ese vendedor no cobra comisión por ese cliente en esa empresa. Cada renglón dice qué es lo que no comisiona: la venta, el cobro, o los dos.</p>
            <p>Si otro vendedor le vende o le cobra al mismo cliente, ese otro sí comisiona.</p>
          </Ayuda>
        </h3>
        {!agregando && (
          <button
            type="button"
            onClick={() => setAgregando(true)}
            disabled={loading || !datos}
            className="min-h-[44px] shrink-0 rounded-md bg-black px-3 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.97] disabled:opacity-50"
          >
            + Agregar
          </button>
        )}
      </div>

      {agregando && (
        <div className="mb-3 rounded-md border border-gray-300 bg-gray-50 p-3" data-testid="alta-sin-comision">
          {/* 🔴 LAS EMPRESAS, TODAS LAS QUE SEAN. Era un desplegable de UNA y la
              misma decisión había que repetirla empresa por empresa: 50 toques
              para cinco. */}
          <div className="mb-3">
            <span className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">Empresas</span>
            <div className="flex flex-wrap gap-1.5">
              {EMPRESAS_COMISIONAN.map((k) => {
                const marcada = empresas.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => alternarEmpresa(k)}
                    disabled={guardando}
                    aria-pressed={marcada}
                    className={`min-h-[44px] rounded-md border px-3 text-sm transition active:scale-[0.97] disabled:opacity-50 ${
                      marcada
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-black hover:text-black"
                    }`}
                  >
                    {nombreEmpresa(k)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-[1.8fr_1fr] md:items-start">
            <div>
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">Cliente</span>
              <ClienteSwitchPicker
                key={empresaDirectorio}
                api={`/api/ventas/comisiones/exclusiones/${empresaDirectorio}`}
                directorioLabel={nombreEmpresa(empresaDirectorio)}
                valor={cliente}
                onElegir={setCliente}
                disabled={guardando}
              />
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">Vendedor</span>
              <select
                value={vendedor}
                onChange={(e) => setVendedor(e.target.value)}
                disabled={guardando}
                aria-label="Vendedor"
                className="min-h-[44px] w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-black disabled:opacity-50"
              >
                <option value="">Elige el vendedor</option>
                <option value={VENDEDOR_TODOS}>{ROTULO_VENDEDOR_TODOS}</option>
                {vendedoresDeEmpresa.map((v) => (
                  <option key={v} value={v}>{nombreVendedorEnPantalla(v)}</option>
                ))}
              </select>
            </label>
          </div>

          {/* 🔴 LA PREGUNTA, AL DERECHO: lo que se prende es lo que NO comisiona,
              y el título lo dice. Es la regla que ya vive en la base (el CHECK
              de «al menos una»): con las dos apagadas el servidor no guarda. */}
          <div className="mt-3">
            <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-gray-500">
              {PREGUNTA_DEL_ALTA}
            </span>
            <div className="divide-y divide-gray-200 overflow-hidden rounded-md border border-gray-200 bg-white">
              <div className="flex min-h-[44px] items-center justify-between px-3 py-2">
                <span className="text-sm text-gray-900">{ROTULO_LA_VENTA}</span>
                <Interruptor prendido={excluyeVenta} etiqueta={ROTULO_LA_VENTA} onChange={setExcluyeVenta} disabled={guardando} />
              </div>
              <div className="flex min-h-[44px] items-center justify-between px-3 py-2">
                <span className="text-sm text-gray-900">{ROTULO_EL_COBRO}</span>
                <Interruptor prendido={excluyeCobro} etiqueta={ROTULO_EL_COBRO} onChange={setExcluyeCobro} disabled={guardando} />
              </div>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              {AVISO_AL_MENOS_UNO} {EXPLICACION_DEL_ALTA}
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={!puedeGuardar}
              className="min-h-[44px] rounded-md bg-black px-4 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.97] disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={cancelarAlta}
              disabled={guardando}
              className="min-h-[44px] rounded-md px-3 text-sm text-gray-500 transition hover:text-black disabled:opacity-40"
            >
              Cancelar
            </button>
            {!puedeGuardar && !guardando && (
              <span className={`text-xs ${ningunaCasilla ? "text-rose-600" : "text-gray-400"}`}>
                {ningunaCasilla
                  ? AVISO_NINGUNA_CASILLA
                  : sinEmpresas
                    ? "Falta elegir al menos una empresa"
                    : !clienteCodigo
                      ? "Falta elegir el cliente"
                      : "Falta elegir el vendedor"}
              </span>
            )}
          </div>
          {errorAlta && <p className="mt-2 text-xs text-rose-600">{errorAlta}</p>}
        </div>
      )}

      {/* 🔴 LOS DOS DESPLEGABLES. Con 12 reglas casi nunca hay que tocarlos, y
          sirven cuando crezcan. Vienen con «todas» y «todos» puestos. */}
      {!loading && !error && reglas.length > 0 && (
        <div data-filtros-sin-comision className="mb-3 flex flex-wrap gap-2">
          <label className="block">
            <span className="sr-only">Filtrar por empresa</span>
            <select
              value={filtroEmpresa}
              onChange={(e) => setFiltroEmpresa(e.target.value)}
              aria-label="Filtrar por empresa"
              className="min-h-[44px] rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-black"
            >
              <option value={TODAS}>{ROTULO_FILTRO_EMPRESA}</option>
              {EMPRESAS_COMISIONAN.map((k) => (
                <option key={k} value={k}>{nombreEmpresa(k)}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Vendedor</span>
            <select
              value={filtroVendedor}
              onChange={(e) => setFiltroVendedor(e.target.value)}
              aria-label="Filtrar por vendedor"
              className="min-h-[44px] rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-black"
            >
              <option value={TODOS}>{ROTULO_FILTRO_VENDEDOR}</option>
              {vendedoresEnLista.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-gray-500">Cargando…</div>
      ) : error ? (
        <div className="py-8 text-center text-sm">
          <p className="text-rose-600">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 inline-flex min-h-[44px] items-center rounded-md border border-gray-200 px-3 text-xs text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]"
          >
            Reintentar
          </button>
        </div>
      ) : reglas.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">
          Todavía no hay clientes en esta lista: todos comisionan.
        </div>
      ) : visibles.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">
          Ninguna regla con esos filtros.
        </div>
      ) : (
        /* 🔴 UNA SOLA LISTA, UN SOLO ENCABEZADO, CERO CASILLAS. */
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-lista-sin-comision>
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3.5 font-medium">Cliente</th>
                <th className="px-3.5 py-2 font-medium">Vendedor</th>
                <th className="px-3.5 py-2 font-medium">Empresas</th>
                <th className="px-3.5 py-2 font-medium">Qué no comisiona</th>
                <th className="py-2 pl-3.5"><span className="sr-only">Quitar</span></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => (
                <tr key={r.llave} className="border-b border-gray-100 last:border-0" data-regla={r.llave}>
                  <td className="py-2.5 pr-3.5 text-gray-900">
                    {r.clienteNombre}
                    {r.clienteNombre !== r.clienteCodigo && (
                      <span className="ml-1 font-mono text-xs text-gray-400">{r.clienteCodigo}</span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 text-gray-900">{r.vendedor}</td>
                  <td className="px-3.5 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {r.chipsEmpresas.map((e) => (
                        <span key={e} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{e}</span>
                      ))}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-gray-900">
                    No comisiona <b className="font-semibold">{loQueNoComisiona(r.que)}</b>
                    {avisoFila?.llave === r.llave && (
                      <span role="alert" className="mt-1 block text-[11px] text-rose-600">{avisoFila.texto}</span>
                    )}
                  </td>
                  <td className="py-2.5 pl-3.5 text-right">
                    <OverflowMenu
                      ariaLabel={`Opciones de ${r.clienteNombre}`}
                      items={[
                        {
                          label: "Cambiar qué no comisiona",
                          onClick: () => {
                            setEditando(r);
                            setEdVenta(r.que !== "solo-el-cobro");
                            setEdCobro(r.que !== "solo-la-venta");
                          },
                        },
                        { label: "Quitar", onClick: () => setAQuitar(r), destructive: true },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cambiar qué no comisiona: la MISMA pregunta del alta, al derecho. */}
      {editando && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={PREGUNTA_DEL_ALTA}
          data-editar-regla
          className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
        >
          <button type="button" aria-label="Cerrar" onClick={() => setEditando(null)} className="absolute inset-0 bg-black/30" />
          <div className="relative m-2 w-full max-w-sm rounded-2xl bg-white p-4">
            <p className="mb-1 text-sm font-medium text-gray-900">{editando.clienteNombre}</p>
            <p className="mb-3 text-xs text-gray-500">{editando.vendedor} · {editando.chipsEmpresas.join(" · ")}</p>
            <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-gray-500">{PREGUNTA_DEL_ALTA}</span>
            <div className="divide-y divide-gray-200 overflow-hidden rounded-md border border-gray-200">
              <div className="flex min-h-[44px] items-center justify-between px-3 py-2">
                <span className="text-sm text-gray-900">{ROTULO_LA_VENTA}</span>
                <Interruptor prendido={edVenta} etiqueta={`${ROTULO_LA_VENTA} de ${editando.clienteNombre}`} onChange={setEdVenta} disabled={cambiando} />
              </div>
              <div className="flex min-h-[44px] items-center justify-between px-3 py-2">
                <span className="text-sm text-gray-900">{ROTULO_EL_COBRO}</span>
                <Interruptor prendido={edCobro} etiqueta={`${ROTULO_EL_COBRO} de ${editando.clienteNombre}`} onChange={setEdCobro} disabled={cambiando} />
              </div>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">{AVISO_AL_MENOS_UNO}</p>
            {avisoFila?.llave === editando.llave && (
              <p role="alert" className="mt-1 text-xs text-rose-600">{avisoFila.texto}</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void cambiarLaRegla()}
                disabled={cambiando || (!edVenta && !edCobro)}
                className="min-h-[44px] flex-1 rounded-md bg-black px-4 text-sm font-medium text-white active:scale-[0.97] disabled:opacity-50"
              >
                {cambiando ? "Guardando…" : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setEditando(null)}
                disabled={cambiando}
                className="min-h-[44px] rounded-md px-3 text-sm text-gray-500 disabled:opacity-40"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quitar es soft delete (activa = false): la fila queda como historial. */}
      <ConfirmDeleteModal
        open={aQuitar !== null}
        title="¿Quitar de la lista?"
        description={
          aQuitar
            ? `${aQuitar.vendedor} vuelve a cobrar comisión por ${aQuitar.clienteNombre} en ${aQuitar.empresas.join(", ")}, desde el próximo cálculo.`
            : ""
        }
        confirmLabel="Quitar"
        loadingLabel="Quitando..."
        loading={quitando}
        onConfirm={() => void quitar()}
        onCancel={() => { if (!quitando) setAQuitar(null); }}
      />
    </section>
  );
}
