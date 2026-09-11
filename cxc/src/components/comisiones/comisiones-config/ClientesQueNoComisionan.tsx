"use client";

// «Clientes que no comisionan» — la segunda tarjeta de Comisiones › Configuración.
//
// 🩸 Daniel, 3-sep-2026: «crea configuración en comisiones para desactivar
// cálculos de clientes». Grano empresa + cliente + vendedor, y con VENTA y
// COBRO por separado: «poder quitar comisiones en ventas o comisiones sin que
// tengan que ser de los dos». Agrupado POR EMPRESA. Sin «motivo»: no lo pidió.
// «+ Agregar» abre una fila encima (Empresa → Cliente → Vendedor → las dos
// casillas MARCADAS → Guardar: «arranca con las dos marcadas pero yo
// deselecciono»); con las dos apagadas no se guarda y se dice. Quitar = soft
// delete con confirmación. El cliente se elige con ClienteSwitchPicker, el
// ÚNICO selector de cliente de Switch del sistema.
//
// 🔴 «TODOS LOS VENDEDORES» (6-sep-2026). El desplegable ofrece esa opción
// arriba de la lista de personas: es el comodín `*`, y significa que ese
// cliente no comisiona para NADIE en esa empresa. Nació porque «Multi Fashion
// Holding» (D-108, la intercompañía) vivía excluido por su NOMBRE dentro del
// SQL de la plata —203 facturas y 21 recibos de 2026 atados a un texto que
// Switch puede cambiar—; Daniel: «debe de ser por código, ¿no?». Enumerar los
// vendedores de hoy no servía: el día que uno nuevo le facture, esa factura
// vuelve a pagar comisión en silencio. En pantalla nunca se ve el `*`.
//
// 🔴 UNA DECISIÓN, VARIAS EMPRESAS (6-sep-2026). El alta ya no pide UNA empresa:
// pide LAS QUE SEAN, con pastillas. 🩸 Medido: dar de alta costaba **~10 toques**
// y la misma decisión hay que tomarla una vez por empresa — para cinco, **50
// toques**. Y ya estaba pasando: **D-104 está cargado dos veces**, en Active
// Shoes y en Active Wear, por una sola decisión. Ahora son **12**. El servidor
// escribe UNA FILA POR EMPRESA (el grano de la tabla no cambia) y la que ya
// existía no tira a las demás.
//
// El cliente y el vendedor se eligen del directorio de la PRIMERA empresa
// marcada: son listas por empresa, y el código del cliente es el mismo en las
// seis (invariante de la casa: la identidad del cliente es el CÓDIGO).
//
// 🩸 SE FUE LA COLUMNA «DESDE» (6-sep-2026). Decía «3 sept 2026» en TODAS las
// filas: es el día en que se cargaron, no una fecha de vigencia. Un dato que
// vale lo mismo en todas las filas no distingue nada. La columna `creado_en` de
// la base NO se toca — sigue siendo la firma de quién y cuándo.
//
// Nada de esto se dice «exclusión» en pantalla.

import { useCallback, useEffect, useState } from "react";
import { Ayuda } from "@/components/shared/Ayuda";
import { ConfirmDeleteModal } from "@/components/ui";
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

interface ListaExclusiones {
  exclusiones: ExclusionActiva[];
  vendedores: Record<string, string[]>;
}

/** Nombre CORTO de la empresa — «Vistana», no «Vistana International» (§ 0). */
const nombreEmpresa = (k: string) => nombreCortoEmpresa(k);

/** Una casilla de la lista (Venta / Cobro), con su nombre accesible. */
function Casilla({
  marcada, etiqueta, onChange, disabled,
}: { marcada: boolean; etiqueta: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <input
      type="checkbox"
      checked={marcada}
      disabled={disabled}
      aria-label={etiqueta}
      onChange={(e) => onChange(e.target.checked)}
      className="h-5 w-5 cursor-pointer rounded border-gray-300 accent-black disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

/** Qué vuelve a comisionar al quitar una fila, según sus casillas. */
const queVuelve = (f: ExclusionActiva): string =>
  f.excluye_venta && f.excluye_cobro ? "en venta y en cobro" : f.excluye_venta ? "en venta" : "en cobro";

export function ClientesQueNoComisionan({ onSaved }: { onSaved: (msg: string) => void }) {
  const [datos, setDatos] = useState<ListaExclusiones | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fila de alta (encima de las tablas). VARIAS empresas de una vez.
  const [agregando, setAgregando] = useState(false);
  const [empresas, setEmpresas] = useState<string[]>([EMPRESAS_COMISIONAN[0]]);
  const [cliente, setCliente] = useState<ClienteSwitchOpcion | undefined>(undefined);
  const [vendedor, setVendedor] = useState<string>("");
  // «arranca con las dos marcadas pero yo deselecciono» — Daniel.
  const [excluyeVenta, setExcluyeVenta] = useState(true);
  const [excluyeCobro, setExcluyeCobro] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  // Cambiar las casillas de una fila que ya está: se manda al momento.
  const [cambiando, setCambiando] = useState<number | null>(null);
  const [avisoFila, setAvisoFila] = useState<{ id: number; texto: string } | null>(null);

  // Quitar (soft delete) con confirmación.
  const [aQuitar, setAQuitar] = useState<ExclusionActiva | null>(null);
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

  // La PRIMERA marcada (en el orden de las 6) es la que manda el directorio de
  // clientes y la lista de vendedores. Si deja de estar marcada, cliente y
  // vendedor se limpian: eran de ESA empresa.
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

  // Los retirados de Comisiones tampoco se ofrecen en el desplegable: no existen.
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
          // UNA fila por empresa: el servidor las escribe todas y avisa cuál ya
          // estaba, sin tirar a las demás.
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

  /** Una casilla de una fila existente. Dejar las dos apagadas no se guarda: se avisa. */
  async function cambiarCasilla(f: ExclusionActiva, cual: "venta" | "cobro", valor: boolean) {
    const venta = cual === "venta" ? valor : f.excluye_venta;
    const cobro = cual === "cobro" ? valor : f.excluye_cobro;
    if (!venta && !cobro) {
      setAvisoFila({ id: f.id, texto: AVISO_NINGUNA_CASILLA });
      return;
    }
    setAvisoFila(null);
    setCambiando(f.id);
    try {
      const res = await fetch(`/api/ventas/comisiones/exclusiones?id=${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excluye_venta: venta, excluye_cobro: cobro }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      // Optimista, pero solo después del OK: sin red no se dibuja una casilla que la base no tiene.
      setDatos((prev) => prev && {
        ...prev,
        exclusiones: prev.exclusiones.map((e) => (e.id === f.id ? { ...e, excluye_venta: venta, excluye_cobro: cobro } : e)),
      });
      onSaved("Listo, guardado");
    } catch (err) {
      setAvisoFila({ id: f.id, texto: err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo en unos segundos." });
    } finally {
      setCambiando(null);
    }
  }

  async function quitar() {
    if (!aQuitar) return;
    setQuitando(true);
    try {
      const res = await fetch(`/api/ventas/comisiones/exclusiones?id=${aQuitar.id}`, { method: "DELETE" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
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

  const filas = datos?.exclusiones ?? [];
  // Agrupado POR EMPRESA, en el orden de las 6: una empresa sin filas no se dibuja.
  const grupos = EMPRESAS_COMISIONAN
    .map((k) => ({ empresa: k, filas: filas.filter((f) => f.empresa_key === k) }))
    .filter((g) => g.filas.length > 0);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5" aria-labelledby="sin-comision-titulo">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 id="sin-comision-titulo" className="flex items-center gap-1 text-sm font-medium text-gray-900">
          {ROTULO_CLIENTES_SIN_COMISION}
          <Ayuda titulo="Qué hace esta lista">
            <p>Ese vendedor no cobra comisión por ese cliente en esa empresa. Con «Venta» marcada, no comisiona lo que le vende; con «Cobro», no comisiona los recibos que le registra.</p>
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
          <div className="grid gap-3 md:grid-cols-[1.8fr_1fr_auto] md:items-start">
            <div>
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">Cliente</span>
              {/* El ÚNICO selector de cliente de Switch del sistema. El
                  directorio es el de la PRIMERA empresa marcada; el código del
                  cliente es el mismo en las seis (la identidad es el CÓDIGO). */}
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
                {/* El comodín va PRIMERO y con su nombre en palabras: es la
                    opción que cubre a todos, incluidos los que todavía no
                    existen en Switch. Nunca se muestra el `*`. */}
                <option value={VENDEDOR_TODOS}>{ROTULO_VENDEDOR_TODOS}</option>
                {vendedoresDeEmpresa.map((v) => (
                  <option key={v} value={v}>{nombreVendedorEnPantalla(v)}</option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-4 md:min-h-[44px] md:pt-5">
              <label className="flex items-center gap-1.5 text-sm text-gray-700">
                <Casilla marcada={excluyeVenta} etiqueta="Venta" onChange={setExcluyeVenta} disabled={guardando} />
                Venta
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-700">
                <Casilla marcada={excluyeCobro} etiqueta="Cobro" onChange={setExcluyeCobro} disabled={guardando} />
                Cobro
              </label>
            </div>
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
      ) : grupos.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">
          Todavía no hay clientes en esta lista: todos comisionan.
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map((g) => (
            <div key={g.empresa} data-grupo-empresa={g.empresa}>
              <div className="mb-2 flex items-center gap-2">
                <h4 className="text-sm font-medium text-gray-900">{nombreEmpresa(g.empresa)}</h4>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500" aria-label={`${g.filas.length} en ${nombreEmpresa(g.empresa)}`}>
                  {g.filas.length}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="py-2 pr-3.5 font-medium">Cliente</th>
                      <th className="px-3.5 py-2 font-medium">Vendedor</th>
                      <th className="px-3.5 py-2 text-center font-medium">Venta</th>
                      <th className="px-3.5 py-2 text-center font-medium">Cobro</th>
                      <th className="py-2 pl-3.5"><span className="sr-only">Quitar</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.filas.map((f) => {
                      const nombreCliente = f.cliente_nombre ?? f.cliente_codigo;
                      const nombreVendedor = nombreVendedorEnPantalla(f.vendedor);
                      return (
                        <tr key={f.id} className="border-b border-gray-100 last:border-0" data-exclusion-id={f.id}>
                          <td className="py-2.5 pr-3.5 text-gray-900">
                            {nombreCliente}
                            {f.cliente_nombre && (
                              <span className="ml-1 font-mono text-xs text-gray-400">{f.cliente_codigo}</span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-gray-900">{nombreVendedor}</td>
                          <td className="px-3.5 py-2.5 text-center">
                            <Casilla
                              marcada={f.excluye_venta}
                              etiqueta={`Venta de ${nombreCliente} para ${nombreVendedor}`}
                              onChange={(v) => void cambiarCasilla(f, "venta", v)}
                              disabled={cambiando === f.id}
                            />
                          </td>
                          <td className="px-3.5 py-2.5 text-center">
                            <Casilla
                              marcada={f.excluye_cobro}
                              etiqueta={`Cobro de ${nombreCliente} para ${nombreVendedor}`}
                              onChange={(v) => void cambiarCasilla(f, "cobro", v)}
                              disabled={cambiando === f.id}
                            />
                            {avisoFila?.id === f.id && (
                              <span role="alert" className="mt-1 block whitespace-nowrap text-[11px] text-rose-600">{avisoFila.texto}</span>
                            )}
                          </td>
                          <td className="py-2.5 pl-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => setAQuitar(f)}
                              aria-label={`Quitar a ${nombreCliente} de la lista de ${nombreVendedor}`}
                              title="Quitar de la lista"
                              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-lg text-gray-300 transition hover:text-rose-600 active:scale-[0.97]"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quitar es soft delete (activa = false): la fila queda como historial. */}
      <ConfirmDeleteModal
        open={aQuitar !== null}
        title="¿Quitar de la lista?"
        description={
          aQuitar
            ? `${nombreVendedorEnPantalla(aQuitar.vendedor)} vuelve a cobrar comisión por ${aQuitar.cliente_nombre ?? aQuitar.cliente_codigo} en ${nombreEmpresa(aQuitar.empresa_key)}, ${queVuelve(aQuitar)}, desde el próximo cálculo.`
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
