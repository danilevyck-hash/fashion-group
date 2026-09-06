"use client";

// «Descuentos» — la tercera tarjeta de Comisiones › Configuración.
//
// 🩸 POR QUÉ NACE (6-sep-2026). `comision_descuentos_fijos` no tenía POST, ni
// PUT, ni DELETE en NINGUNA parte de la aplicación: las dos filas vivas se
// escribieron directo en la base y solo asomaban dentro del modal de detalle de
// un vendedor. La palanca que más plata mueve del módulo —$14.157,72 en 2026,
// más que toda la comisión de Edwin en el año— era la única que no se podía ver
// ni administrar desde el sistema. Daniel: «sí, minimalista».
//
// MINIMALISTA quiere decir esto y nada más: vendedor · empresa · concepto ·
// monto · desde · hasta. Sin explicaciones alrededor, sin totales al pie, sin
// chips. El mismo molde que las otras dos tarjetas.
//
// 🔴 «Desde» es el primer mes que lo lleva y «Hasta» el último, INCLUSIVE
// (mismo criterio que el «Hasta…» de Recordatorios). Vacíos = sin límite, que
// es como se comportaban las filas hasta hoy. La regla vive en un módulo puro
// (`src/lib/comisiones/vigencia.ts`), no acá.
//
// 🔴 EL «HASTA» ES OPCIONAL, Y DEJARLO VACÍO ES LO NORMAL. Daniel, 6-sep-2026,
// textual: **«pero el descuento es indefinido. No hay hasta.»** Un descuento sin
// fin es la REGLA, no la excepción: por eso el campo dice «opcional» en su
// rótulo, la columna de la tabla dice «Sin fin» (no «—», que se lee como dato
// faltante), y guardar sin él **no pide nada ni avisa nada**. Lo único que se
// exige es vendedor, concepto y monto.
//
// 🔑 Y el «Desde» no está para esta fila —la de Reynaldo va desde enero y no
// mueve un centavo— sino para el PRÓXIMO descuento: el que se cargue en octubre
// no puede aparecer restado en marzo, que es el defecto que esto vino a cerrar.
//
// 🔴 En pantalla NO se dice «descuento fijo»: se dice «Descuentos», que es la
// palabra que usa Daniel. Y quitar es SOFT DELETE (`activo = false`): es
// historial de decisiones sobre plata.

import { useCallback, useEffect, useState } from "react";
import { ConfirmDeleteModal } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";
import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";
import { estaRetirado } from "@/lib/comisiones/retirados";
import { sePagaComision } from "@/lib/comisiones/sin-pago";
import { fmtMoney } from "@/lib/ventas/format";

/** Rótulo único de la sección. Nunca «descuento fijo». */
export const ROTULO_DESCUENTOS = "Descuentos";

interface DescuentoFila {
  id: string;
  vendedor_nombre: string;
  empresa_key: string;
  concepto: string;
  monto: number;
  desde: string | null;
  hasta: string | null;
}

interface Borrador {
  vendedor_nombre: string;
  empresa_key: string;
  concepto: string;
  monto: string;
  desde: string;
  hasta: string;
}

const VACIO: Borrador = {
  vendedor_nombre: "",
  empresa_key: EMPRESAS_COMISIONAN[0],
  concepto: "",
  monto: "",
  desde: "",
  hasta: "",
};

/** Nombre CORTO de la empresa — «Vistana», no «Vistana International» (§ 0). */
const nombreEmpresa = (k: string) => nombreCortoEmpresa(k);

/** «2026-01-01» → «ene 2026». Vacío → «—». El grano es el mes, no el día. */
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function mesEnPalabras(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? "");
  if (!m) return "—";
  return `${MESES[Number(m[2]) - 1]} ${m[1]}`;
}

/** El «Hasta» de la tabla. Vacío es «Sin fin», no «—»: un descuento indefinido
 *  es lo NORMAL y un guion se lee como un dato que falta. */
export function hastaEnPalabras(iso: string | null): string {
  return iso ? mesEnPalabras(iso) : "Sin fin";
}

const CAJA =
  "min-h-[44px] w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-black disabled:opacity-50";

export function Descuentos({ onSaved }: { onSaved: (msg: string) => void }) {
  const [filas, setFilas] = useState<DescuentoFila[]>([]);
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [agregando, setAgregando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  const [aQuitar, setAQuitar] = useState<DescuentoFila | null>(null);
  const [quitando, setQuitando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Los vendedores salen de la MISMA lista que «Tasas por vendedor»: los
      // que de verdad cobran comisión. Una segunda lista sería otra forma de
      // ofrecer un nombre que no existe.
      const [resD, resV] = await Promise.all([
        fetch("/api/ventas/comisiones/descuentos-fijos", { cache: "no-store" }),
        fetch("/api/ventas/comisiones/config", { cache: "no-store" }),
      ]);
      if (!resD.ok) {
        const b = await resD.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${resD.status}`);
      }
      const datos = (await resD.json()) as { descuentos: DescuentoFila[] };
      setFilas(datos.descuentos ?? []);
      if (resV.ok) {
        const cfg = (await resV.json()) as { vendedores: { vendedor_nombre: string }[] };
        setVendedores(
          (cfg.vendedores ?? [])
            .map((v) => v.vendedor_nombre)
            .filter((v) => sePagaComision(v) && !estaRetirado(v)),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la lista. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const cerrarForm = () => {
    setAgregando(false);
    setEditando(null);
    setBorrador(VACIO);
    setErrorAlta(null);
  };

  const abrirEdicion = (f: DescuentoFila) => {
    setAgregando(false);
    setEditando(f.id);
    setErrorAlta(null);
    setBorrador({
      vendedor_nombre: f.vendedor_nombre,
      empresa_key: f.empresa_key,
      concepto: f.concepto,
      monto: String(f.monto),
      desde: f.desde ?? "",
      hasta: f.hasta ?? "",
    });
  };

  const puedeGuardar =
    !!borrador.vendedor_nombre &&
    !!borrador.concepto.trim() &&
    Number(borrador.monto) > 0 &&
    !guardando;

  async function guardar() {
    setGuardando(true);
    setErrorAlta(null);
    try {
      const url = editando
        ? `/api/ventas/comisiones/descuentos-fijos?id=${editando}`
        : "/api/ventas/comisiones/descuentos-fijos";
      const res = await fetch(url, {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendedor_nombre: borrador.vendedor_nombre,
          empresa_key: borrador.empresa_key,
          concepto: borrador.concepto.trim(),
          monto: Number(borrador.monto),
          desde: borrador.desde || null,
          hasta: borrador.hasta || null,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      onSaved("Listo, guardado");
      cerrarForm();
      void load();
    } catch (err) {
      setErrorAlta(err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo en unos segundos.");
    } finally {
      setGuardando(false);
    }
  }

  async function quitar() {
    if (!aQuitar) return;
    setQuitando(true);
    try {
      const res = await fetch(`/api/ventas/comisiones/descuentos-fijos?id=${aQuitar.id}`, { method: "DELETE" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      onSaved("Listo, ya no se descuenta");
      setAQuitar(null);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar. Intenta de nuevo en unos segundos.");
      setAQuitar(null);
    } finally {
      setQuitando(false);
    }
  }

  const formulario = (
    <div className="mb-3 rounded-md border border-gray-300 bg-gray-50 p-3" data-testid="alta-descuento">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">Vendedor</span>
          <select
            value={borrador.vendedor_nombre}
            onChange={(e) => setBorrador((b) => ({ ...b, vendedor_nombre: e.target.value }))}
            disabled={guardando}
            aria-label="Vendedor"
            className={CAJA}
          >
            <option value="">Elige el vendedor</option>
            {vendedores.map((v) => (
              <option key={v} value={v}>{nombreVendedorEnPantalla(v)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">Empresa</span>
          <Select
            value={borrador.empresa_key}
            onValueChange={(k) => setBorrador((b) => ({ ...b, empresa_key: k }))}
          >
            <SelectTrigger className="min-h-[44px] w-full bg-white" aria-label="Empresa"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EMPRESAS_COMISIONAN.map((k) => (
                <SelectItem key={k} value={k}>{nombreEmpresa(k)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">Concepto</span>
          <input
            type="text"
            value={borrador.concepto}
            onChange={(e) => setBorrador((b) => ({ ...b, concepto: e.target.value }))}
            disabled={guardando}
            aria-label="Concepto"
            className={CAJA}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">Monto por mes</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={borrador.monto}
            onChange={(e) => setBorrador((b) => ({ ...b, monto: e.target.value }))}
            disabled={guardando}
            aria-label="Monto por mes"
            className={`${CAJA} text-right tabular-nums`}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">Desde</span>
          <input
            type="date"
            value={borrador.desde}
            onChange={(e) => setBorrador((b) => ({ ...b, desde: e.target.value }))}
            disabled={guardando}
            aria-label="Desde"
            className={CAJA}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">
            Hasta <span className="normal-case tracking-normal text-gray-400">(opcional)</span>
          </span>
          <input
            type="date"
            value={borrador.hasta}
            onChange={(e) => setBorrador((b) => ({ ...b, hasta: e.target.value }))}
            disabled={guardando}
            aria-label="Hasta"
            className={CAJA}
          />
        </label>
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
          onClick={cerrarForm}
          disabled={guardando}
          className="min-h-[44px] rounded-md px-3 text-sm text-gray-500 transition hover:text-black disabled:opacity-40"
        >
          Cancelar
        </button>
        {!puedeGuardar && !guardando && (
          <span className="text-xs text-gray-400">
            {!borrador.vendedor_nombre
              ? "Falta elegir el vendedor"
              : !borrador.concepto.trim()
                ? "Falta el concepto"
                : "Falta el monto"}
          </span>
        )}
      </div>
      {errorAlta && <p className="mt-2 text-xs text-rose-600">{errorAlta}</p>}
    </div>
  );

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5" aria-labelledby="descuentos-titulo">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 id="descuentos-titulo" className="text-sm font-medium text-gray-900">
          {ROTULO_DESCUENTOS}
        </h3>
        {!agregando && !editando && (
          <button
            type="button"
            onClick={() => { setBorrador(VACIO); setAgregando(true); }}
            disabled={loading}
            className="min-h-[44px] shrink-0 rounded-md bg-black px-3 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.97] disabled:opacity-50"
          >
            + Agregar
          </button>
        )}
      </div>

      {(agregando || editando) && formulario}

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
      ) : filas.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">
          Todavía no hay descuentos.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3.5 font-medium">Vendedor</th>
                <th className="px-3.5 py-2 font-medium">Empresa</th>
                <th className="px-3.5 py-2 font-medium">Concepto</th>
                <th className="px-3.5 py-2 text-right font-medium">Monto</th>
                <th className="px-3.5 py-2 font-medium">Desde</th>
                <th className="px-3.5 py-2 font-medium">Hasta</th>
                <th className="py-2 pl-3.5"><span className="sr-only">Quitar</span></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-gray-100 last:border-0" data-descuento-id={f.id}>
                  <td className="py-2.5 pr-3.5 text-gray-900">{nombreVendedorEnPantalla(f.vendedor_nombre)}</td>
                  <td className="px-3.5 py-2.5 text-gray-700">{nombreEmpresa(f.empresa_key)}</td>
                  <td className="px-3.5 py-2.5 text-gray-700">
                    <button
                      type="button"
                      onClick={() => abrirEdicion(f)}
                      className="text-left underline decoration-gray-300 underline-offset-2 transition hover:decoration-black"
                      aria-label={`Cambiar ${f.concepto}`}
                    >
                      {f.concepto}
                    </button>
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-gray-900">{fmtMoney(f.monto)}</td>
                  <td className="px-3.5 py-2.5 text-xs text-gray-500">{mesEnPalabras(f.desde)}</td>
                  <td className="px-3.5 py-2.5 text-xs text-gray-500">{hastaEnPalabras(f.hasta)}</td>
                  <td className="py-2.5 pl-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => setAQuitar(f)}
                      aria-label={`Quitar ${f.concepto} de ${nombreVendedorEnPantalla(f.vendedor_nombre)}`}
                      title="Quitar"
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-lg text-gray-300 transition hover:text-rose-600 active:scale-[0.97]"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Quitar es soft delete (activo = false): la fila queda como historial. */}
      <ConfirmDeleteModal
        open={aQuitar !== null}
        title="¿Quitar este descuento?"
        description={
          aQuitar
            ? `A ${nombreVendedorEnPantalla(aQuitar.vendedor_nombre)} deja de restársele ${fmtMoney(aQuitar.monto)} por mes en ${nombreEmpresa(aQuitar.empresa_key)}, desde el próximo cálculo.`
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
