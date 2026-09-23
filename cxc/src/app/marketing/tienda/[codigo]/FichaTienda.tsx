"use client";

// ============================================================================
// LA FICHA DE LA TIENDA COMO UNA SOLA LISTA (23-sep-2026, Tiendas y Marcas —
// mockup aprobado por Daniel).
//
//   ‹ Tiendas   Nova Lux, S.A. · D-170          [＋ Gasto] [Excel] [Fotos · 6]
//   TOTAL REPORTADO $12,649.97   Calvin $3,736.75   Tommy $8,913.22   7 gastos
//   [Todos 7] [Tommy 4] [Calvin 3] [Anulados 1]
//   Fecha · Gasto (línea gris: factura N° · subtotal + ITBMS) · Marca · Total · PDF ···
//   ─────────────────────────────────────────────────────────────────────────
//   7 gastos · 4 facturas $… · 3 muebles $…                       $12,649.97
//
// 🔴 UNA tabla, por fecha, con facturas + muebles + pagos de impulsadora; la
// marca es un dato del renglón. Lo NO reportado se ve en gris y no suma; lo
// ANULADO se pliega en su chip y nunca suma. Editar y anular se hacen AQUÍ
// («···»), con los formularios y rutas de siempre (`FichaTiendaAcciones`).
//
// 🔴 EL TOTAL ES SOLO DE LO REPORTADO (regla única, `periodo-estado.ts`),
// y el nombre de arriba es el del DIRECTORIO por código. Los números vienen
// de `GET /api/marketing/tienda/<código>`: acá no se calcula plata, solo se
// agrupa lo que ya llegó (`tiendas-y-marcas.ts`, puro).
//
// Contabilidad entra a mirar: sin «＋ Gasto» ni «···» (`puedeEscribirMarketing`).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { ScrollableTable } from "@/components/ui";
import OverflowMenu, { type OverflowMenuItem } from "@/components/ui/OverflowMenu";
import { useToast } from "@/components/ToastSystem";
import NotaEntregaAcciones from "@/components/marketing/NotaEntregaAcciones";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import { TIENDA_GENERAL } from "@/lib/marketing/gasto";
import { puedeEscribirMarketing, TEXTO_SOLO_LECTURA } from "@/lib/marketing/roles";
import { esCodigoGeneral, type FilaDeTienda } from "@/lib/marketing/vista-tienda";
import type { TotalesDelPeriodo } from "@/lib/marketing/periodo-estado";
import {
  FILTRO_ANULADOS,
  FILTRO_TODOS,
  chipsDeLaFicha,
  filasVisibles,
  hrefDePestana,
  lineaDelGasto,
  pieDeLaFicha,
  textoDelPie,
  totalPorMarca,
} from "@/lib/marketing/tiendas-y-marcas";
import RegistrarGastoModal from "../../components/RegistrarGastoModal";
import FotosSection from "../../components/FotosSection";
import { useMarcasCatalogo } from "../../components/useMarcaPeriodos";
import FichaTiendaAcciones, { type AccionDeFila } from "./FichaTiendaAcciones";
import { descargarExcelDeLaTienda } from "./excel-de-la-tienda";

interface Datos {
  codigo: string | null;
  nombre: string;
  enElDirectorio: boolean | null;
  totales: TotalesDelPeriodo;
  fotos: number;
  sinMigracion: boolean;
  filas: FilaDeTienda[];
  anuladas: FilaDeTienda[];
}

const ANCLA_FOTOS = "mk-fotos-de-la-tienda";

export default function FichaTienda({ codigo, role }: { codigo: string; role: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const marcas = useMarcasCatalogo();
  const escribe = puedeEscribirMarketing(role);

  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [filtro, setFiltro] = useState<string>(FILTRO_TODOS);
  const [accion, setAccion] = useState<AccionDeFila>(null);
  const [notaAbierta, setNotaAbierta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketing/tienda/${encodeURIComponent(codigo)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("No se pudo cargar la tienda.");
      setDatos((await res.json()) as Datos);
    } catch (err) {
      setDatos(null);
      setError(err instanceof Error ? err.message : "No se pudo cargar la tienda.");
    } finally {
      setCargando(false);
    }
  }, [codigo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const vivas = useMemo(() => datos?.filas ?? [], [datos]);
  const anuladas = useMemo(() => datos?.anuladas ?? [], [datos]);
  const chips = useMemo(() => chipsDeLaFicha(vivas, anuladas), [vivas, anuladas]);
  const visibles = useMemo(() => filasVisibles(vivas, anuladas, filtro), [vivas, anuladas, filtro]);
  const pie = useMemo(() => pieDeLaFicha(vivas), [vivas]);
  const porMarca = useMemo(() => totalPorMarca(vivas), [vivas]);
  const mirandoAnulados = filtro === FILTRO_ANULADOS;

  const esGeneral = esCodigoGeneral(codigo);
  const titulo = datos?.nombre ?? (esGeneral ? TIENDA_GENERAL : codigo.toUpperCase());
  const codigoVisible = esGeneral ? "" : codigo.toUpperCase();

  const abrirPdf = useCallback(
    async (fila: FilaDeTienda) => {
      try {
        const res = await fetch(`/api/marketing/facturas/${fila.id}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const f = (await res.json()) as { adjuntos?: Array<{ tipo: string; url: string }> };
        const adj = (f.adjuntos ?? []).find((a) => a.tipo === "pdf_factura" || a.tipo === "foto_factura");
        if (!adj) throw new Error();
        window.open(adj.url, "_blank", "noopener");
      } catch {
        toast("Esta factura no tiene su PDF adjunto.", "error");
      }
    },
    [toast],
  );

  const restaurar = useCallback(
    async (fila: FilaDeTienda) => {
      try {
        const res = await fetch("/api/marketing/papelera/restaurar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo: "factura", id: fila.id }),
        });
        if (!res.ok) throw new Error();
        toast("Listo, el gasto volvió", "success");
        cargar();
      } catch {
        toast("No se pudo restaurar el gasto.", "error");
      }
    },
    [cargar, toast],
  );

  const menuDe = (fila: FilaDeTienda): OverflowMenuItem[] => {
    if (fila.anulada) return [{ label: "Restaurar", onClick: () => restaurar(fila) }];
    if (fila.tipo === "mueble") {
      return [
        { label: "Editar", onClick: () => setAccion({ tipo: "editar", fila }) },
        { label: "Nota de entrega", onClick: () => setNotaAbierta(fila.id) },
        { label: "Eliminar", onClick: () => setAccion({ tipo: "eliminar-mueble", fila }), destructive: true },
      ];
    }
    if (fila.tipo === "impulsadora") {
      return [
        { label: "Ver en Impulsadoras", onClick: () => router.push(hrefDePestana("impulsadoras")) },
        { label: "Anular", onClick: () => setAccion({ tipo: "anular", fila }), destructive: true },
      ];
    }
    return [
      { label: "Editar", onClick: () => setAccion({ tipo: "editar", fila }) },
      { label: "Anular", onClick: () => setAccion({ tipo: "anular", fila }), destructive: true },
    ];
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        module="Marketing"
        breadcrumbs={[{ label: "Tiendas", onClick: () => router.push(hrefDePestana("tiendas")) }, { label: titulo }]}
      />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <button
          type="button"
          onClick={() => router.push(hrefDePestana("tiendas"))}
          className="text-sm text-gray-600 hover:text-black transition inline-flex items-center gap-1 min-h-[44px] -my-1"
        >
          ‹ Tiendas
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-gray-900 break-words">
              {titulo}
              {codigoVisible && <span className="font-normal text-gray-400"> · {codigoVisible}</span>}
            </h1>
            <p className="text-[12px] text-gray-500 mt-0.5">
              {esGeneral
                ? "Los gastos que no son de ninguna tienda."
                : datos?.enElDirectorio === false
                  ? "Este código ya no está en el directorio"
                  : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {escribe ? (
              <button
                type="button"
                onClick={() => setRegistrando(true)}
                className="rounded-md bg-black text-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition"
              >
                ＋ Gasto
              </button>
            ) : (
              <span className="text-xs text-gray-500 rounded-md border border-gray-200 px-2 inline-flex items-center">
                {TEXTO_SOLO_LECTURA}
              </span>
            )}
            <button
              type="button"
              onClick={() => datos && descargarExcelDeLaTienda(titulo, codigoVisible, vivas)}
              disabled={!datos || vivas.length === 0}
              className="rounded-md border border-gray-300 bg-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm text-gray-800 hover:border-gray-500 active:scale-[0.97] transition disabled:opacity-40"
            >
              Excel
            </button>
            <a
              href={`#${ANCLA_FOTOS}`}
              className="rounded-md border border-gray-300 bg-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm text-gray-800 hover:border-gray-500 transition"
            >
              Fotos{datos ? ` · ${datos.fotos}` : ""}
            </a>
          </div>
        </div>

        {cargando && !datos ? (
          <div className="space-y-3">
            <div className="h-20 rounded-lg bg-gray-100 animate-pulse" />
            <div className="h-40 rounded-lg bg-gray-100 animate-pulse" />
          </div>
        ) : error ? (
          <Aviso texto={error} />
        ) : !datos ? null : datos.sinMigracion ? (
          <Aviso texto="Esta pantalla necesita las columnas nuevas de Marketing. Mientras tanto, los gastos se ven como siempre desde cada marca." />
        ) : (
          <>
            <Cabecera totales={datos.totales} porMarca={porMarca} gastos={vivas.length} />

            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar los gastos">
              {chips.map((c) => (
                <button
                  key={c.clave}
                  type="button"
                  role="tab"
                  aria-selected={filtro === c.clave}
                  onClick={() => setFiltro(c.clave)}
                  className={`inline-flex min-h-[44px] items-center gap-1.5 px-3 rounded-lg text-xs font-medium border transition ${
                    filtro === c.clave
                      ? "bg-fuchsia-600 border-fuchsia-600 text-white"
                      : c.clave === FILTRO_ANULADOS
                        ? "bg-white border-gray-200 text-gray-400 hover:border-gray-400"
                        : "bg-white border-gray-200 text-gray-700 hover:border-gray-400"
                  }`}
                >
                  {c.rotulo}
                  <span className="tabular-nums opacity-70">{c.cantidad}</span>
                </button>
              ))}
            </div>

            {vivas.length === 0 && anuladas.length === 0 ? (
              <Aviso texto="Todavía no hay gastos cargados a esta tienda." />
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <ScrollableTable minWidth={760}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-left text-[12px] uppercase tracking-wider text-gray-500">
                        <th className="px-3 py-2 font-semibold">Fecha</th>
                        <th className="px-3 py-2 font-semibold">Gasto</th>
                        <th className="px-3 py-2 font-semibold">Marca</th>
                        <th className="px-3 py-2 font-semibold text-right">Total</th>
                        <th className="px-3 py-2 font-semibold text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {visibles.map((f) => (
                        <FilaDeGasto
                          key={f.id}
                          fila={f}
                          escribe={escribe}
                          menu={menuDe(f)}
                          onPdf={() => abrirPdf(f)}
                          notaAbierta={notaAbierta === f.id}
                        />
                      ))}
                    </tbody>
                    {!mirandoAnulados && (
                      <tfoot className="bg-gray-50 border-t border-gray-200">
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-[12px] text-gray-600">
                            {textoDelPie(pie)}
                            {pie.cantidadNoReportada > 0 && (
                              <span className="text-gray-400"> · no se reporta {formatearMonto(pie.noReportado)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">
                            {formatearMonto(pie.total)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </ScrollableTable>
                {anuladas.length > 0 && !mirandoAnulados && (
                  <div className="px-3 py-2 text-[12px] text-gray-500 border-t border-gray-100">
                    {anuladas.length === 1 ? "1 anulado, plegado" : `${anuladas.length} anulados, plegados`} · «···»
                    abre editar · anular · ver PDF
                  </div>
                )}
              </div>
            )}

            {/* 🔴 «General» también tiene fotos: un mueble que no es de ninguna
                tienda igual se fotografía. Se guardan bajo `GENERAL`. */}
            <div id={ANCLA_FOTOS}>
              <FotosSection tiendaCodigo={datos.codigo ?? TIENDA_GENERAL} readonly={!escribe} />
            </div>
          </>
        )}

        {registrando && datos && (
          // 🔴 La puerta «＋ Gasto» abre con ESTA tienda puesta (`tiendaCodigo`):
          // estando parado en Nova Lux no se vuelve a preguntar cuál es.
          <RegistrarGastoModal
            marcas={marcas}
            tiendaCodigo={datos.codigo}
            tiendaNombre={datos.nombre}
            onClose={() => setRegistrando(false)}
            onSaved={() => {
              setRegistrando(false);
              cargar();
            }}
          />
        )}

        <FichaTiendaAcciones
          accion={accion}
          marcas={marcas}
          tiendaNombre={titulo}
          onCerrar={() => setAccion(null)}
          onCambio={cargar}
        />
      </main>
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
      {texto}
    </div>
  );
}

/** Arriba: el total reportado, cuánto por marca, y cuántos gastos. */
function Cabecera({
  totales,
  porMarca,
  gastos,
}: {
  totales: TotalesDelPeriodo;
  porMarca: Array<{ codigo: string; nombre: string; monto: number }>;
  gastos: number;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total reportado</div>
        <div className="text-2xl font-semibold text-gray-900 tabular-nums leading-tight">
          {formatearMonto(totales.reportado)}
        </div>
      </div>
      {porMarca.map((m) => (
        <div key={m.codigo}>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{m.nombre}</div>
          <div className="text-sm text-gray-700 tabular-nums">{formatearMonto(m.monto)}</div>
        </div>
      ))}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Gastos</div>
        <div className="text-sm text-gray-700 tabular-nums">
          {gastos}
          {totales.cantidadNoReportada > 0 && (
            <span className="text-gray-400"> · {totales.cantidadNoReportada} no se reporta{totales.cantidadNoReportada === 1 ? "" : "n"} ({formatearMonto(totales.noReportado)})</span>
          )}
        </div>
      </div>
    </section>
  );
}

function FilaDeGasto({
  fila,
  escribe,
  menu,
  onPdf,
  notaAbierta,
}: {
  fila: FilaDeTienda;
  escribe: boolean;
  menu: OverflowMenuItem[];
  onPdf: () => void;
  notaAbierta: boolean;
}) {
  const { titulo, detalle } = lineaDelGasto(fila);
  const apagada = fila.anulada || !fila.seReporta;
  return (
    <tr className={apagada ? "text-gray-400" : ""} data-fg-gasto={fila.tipo}>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums align-top">
        {fila.fecha ? formatearFecha(fila.fecha) : "—"}
      </td>
      <td className="px-3 py-2 align-top">
        <div className={fila.anulada ? "line-through" : ""}>{titulo}</div>
        <div className="text-[12px] text-gray-500">
          {detalle}
          {fila.anulada && fila.anuladoMotivo && <span> · anulada: {fila.anuladoMotivo}</span>}
          {!fila.anulada && !fila.seReporta && (
            <span className="ml-2 rounded-md bg-gray-100 text-gray-500 px-1.5 py-0.5">No se reporta</span>
          )}
        </div>
        {notaAbierta && (
          <div className="mt-2">
            <NotaEntregaAcciones entregaId={fila.id} />
          </div>
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap align-top">
        <span className="inline-flex items-center rounded-md bg-gray-100 text-gray-700 text-[12px] font-medium px-1.5 py-0.5">
          {fila.marcaNombre}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap align-top">{formatearMonto(fila.monto)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap align-top">
        <div className="inline-flex items-center gap-1 justify-end">
          {fila.tipo !== "mueble" && fila.tienePdf && (
            <button
              type="button"
              onClick={onPdf}
              className="text-[12px] text-gray-600 hover:text-black border border-gray-200 rounded-md px-2 min-h-[44px] inline-flex items-center"
              title="Ver el PDF de la factura"
            >
              PDF
            </button>
          )}
          {escribe && <OverflowMenu items={menu} ariaLabel={`Más opciones de ${titulo}`} />}
        </div>
      </td>
    </tr>
  );
}
