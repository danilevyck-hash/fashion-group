"use client";

// UNA FILA POR EMPRESA. SIN fila de TOTAL GRUPO — Daniel: "deberiamos de ver los
// gastos o la info por empresa no total del grupo".
//
// Cuatro números por empresa: Vendí · Utilidad · Gastos · Me quedó. Hoy sólo
// GASTOS tiene dato; los otros tres viven en otro lado del sistema y se muestran
// como "—" con su leyenda. NO se estiman ni se derivan: un número inventado en
// una pantalla de plata es peor que un guion.
//
// Dos formas del MISMO modelo (`filas`), para que no puedan decir cosas
// distintas: tarjetas por debajo de `lg` y tabla desde `lg`. El corte es `lg`
// (1024) y no `sm`/`md` porque a 834 (iPad) la barra lateral se lleva 224 px y
// quedan ~610 útiles — más angosto que un iPhone acostado.

import type { EstadoMes } from "@/lib/mayor/gastos";
import type { EmpresaResumen } from "./tipos";
import { SIN_DATO, usd } from "./tipos";
import EstadoMesTag, { explicacionDe, muestraMonto } from "./EstadoMesTag";
import AvisosDelMes from "./AvisosDelMes";
import { ETIQUETA_ESTADO } from "@/lib/mayor/gastos";

export const NOTA_NO_CONECTADO =
  "Vendí, Utilidad y Me quedó todavía no están conectados: por ahora sólo se ve el gasto.";

interface Fila {
  empresa: EmpresaResumen;
  estado: EstadoMes;
  /** Lo que se pinta en la columna Gastos: el monto, o la etiqueta del estado. */
  gastosTexto: string;
  /** ¿Ese texto es un monto de verdad? Si no, va en gris y sin `tabular-nums`. */
  esMonto: boolean;
  explicacion: string;
}

function armarFilas(empresas: EmpresaResumen[]): Fila[] {
  return empresas.map((empresa) => {
    const estado = empresa.resumen.estado;
    const esMonto = muestraMonto(estado);
    return {
      empresa,
      estado,
      esMonto,
      gastosTexto: esMonto ? usd(empresa.resumen.totalCent) : ETIQUETA_ESTADO[estado],
      explicacion: explicacionDe(estado, empresa.ultimoMesCerrado),
    };
  });
}

function Monto({ texto, esMonto }: { texto: string; esMonto: boolean }) {
  return (
    <span
      className={
        esMonto
          ? "text-base font-semibold tabular-nums text-gray-900"
          : "text-sm font-medium text-gray-500"
      }
    >
      {texto}
    </span>
  );
}

function Pendiente() {
  return <span className="text-base text-gray-300">{SIN_DATO}</span>;
}

// ── Tarjetas (hasta lg) ──────────────────────────────────────────────────────

function CeldaTarjeta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Tarjeta({ fila, onAbrir }: { fila: Fila; onAbrir: (key: string) => void }) {
  const { empresa } = fila;
  // Un mes sin contabilidad NO se puede abrir: adentro no hay nada que ver, y
  // una tarjeta que promete "ver en qué se gastó" y no muestra nada es peor que
  // una que se ve quieta.
  const Contenedor = fila.esMonto ? "button" : "div";
  return (
    <Contenedor
      {...(fila.esMonto
        ? { type: "button" as const, onClick: () => onAbrir(empresa.empresaKey) }
        : {})}
      className={`w-full rounded-lg border border-gray-200 bg-white p-3 text-left ${
        fila.esMonto ? "transition active:scale-[0.99]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-gray-900">{empresa.nombre}</span>
        <EstadoMesTag estado={fila.estado} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <CeldaTarjeta label="Vendí">
          <Pendiente />
        </CeldaTarjeta>
        <CeldaTarjeta label="Utilidad">
          <Pendiente />
        </CeldaTarjeta>
        <CeldaTarjeta label="Gastos">
          <Monto texto={fila.gastosTexto} esMonto={fila.esMonto} />
        </CeldaTarjeta>
        <CeldaTarjeta label="Me quedó">
          <Pendiente />
        </CeldaTarjeta>
      </div>

      {/* El mes cerrado devuelve "" (ya lo dice la etiqueta): sin el guard
          quedaría un <p> vacío con su margen y un hueco en la tarjeta. */}
      {fila.explicacion && <p className="mt-3 text-sm text-gray-600">{fila.explicacion}</p>}

      {empresa.avisos.length > 0 && (
        <div className="mt-2">
          <AvisosDelMes avisos={empresa.avisos} />
        </div>
      )}

      {fila.esMonto && (
        <span className="mt-3 inline-flex min-h-[44px] items-center text-sm font-medium text-gray-900">
          Ver en qué se gastó
          <svg viewBox="0 0 20 20" fill="none" className="ml-1 h-4 w-4" aria-hidden="true">
            <path d="M7.5 4L13 10l-5.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </Contenedor>
  );
}

// ── Tabla (desde lg) ─────────────────────────────────────────────────────────

function FilaTabla({ fila, onAbrir }: { fila: Fila; onAbrir: (key: string) => void }) {
  const { empresa } = fila;
  return (
    <>
      <tr
        {...(fila.esMonto ? { onClick: () => onAbrir(empresa.empresaKey) } : {})}
        className={`border-t border-gray-200 ${fila.esMonto ? "cursor-pointer hover:bg-gray-50" : ""}`}
      >
        <td className="px-3 py-3 align-top">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{empresa.nombre}</span>
            <EstadoMesTag estado={fila.estado} />
          </div>
          {/* max-w-sm y no más: en tabla, el ancho natural de esta explicación es
              lo que decide si las 4 columnas entran. Con `max-w-xl` la tabla
              pedía 94 px de arrastre justo a 1024. */}
          {fila.explicacion && (
            <p className="mt-1 max-w-sm text-sm text-gray-600">{fila.explicacion}</p>
          )}
        </td>
        <td className="px-3 py-3 text-right align-top">
          <Pendiente />
        </td>
        <td className="px-3 py-3 text-right align-top">
          <Pendiente />
        </td>
        <td className="px-3 py-3 text-right align-top">
          <Monto texto={fila.gastosTexto} esMonto={fila.esMonto} />
        </td>
        <td className="px-3 py-3 text-right align-top">
          <Pendiente />
        </td>
        <td className="px-3 py-3 text-right align-top text-gray-400">
          {fila.esMonto && (
            <svg viewBox="0 0 20 20" fill="none" className="ml-auto h-4 w-4" aria-hidden="true">
              <path d="M7.5 4L13 10l-5.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </td>
      </tr>
      {empresa.avisos.length > 0 && (
        <tr>
          <td colSpan={6} className="px-3 pb-3">
            <AvisosDelMes avisos={empresa.avisos} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Público ──────────────────────────────────────────────────────────────────

interface Props {
  empresas: EmpresaResumen[];
  onAbrir: (empresaKey: string) => void;
}

export default function ResumenEmpresas({ empresas, onAbrir }: Props) {
  const filas = armarFilas(empresas);

  return (
    <div>
      <p className="mb-3 text-sm text-gray-600">{NOTA_NO_CONECTADO}</p>

      {/* Tarjetas: iPhone (390) e iPad (834 → ~610 útiles). */}
      <div className="space-y-2.5 lg:hidden">
        {filas.map((f) => (
          <Tarjeta key={f.empresa.empresaKey} fila={f} onAbrir={onAbrir} />
        ))}
      </div>

      {/* Tabla: sólo desde 1024, donde las 4 columnas entran de verdad. */}
      <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white lg:block">
        {/* 720 y no más: a 1024 la barra lateral se lleva 224 px y adentro del
            recuadro quedan 766 útiles. Con `min-w-[860px]` la tabla pedía 94 px
            de arrastre en el ancho donde justamente aparece. */}
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="bg-gray-50 text-sm text-gray-600">
              <th className="px-3 py-2 text-left font-medium">Empresa</th>
              <th className="px-3 py-2 text-right font-medium">Vendí</th>
              <th className="px-3 py-2 text-right font-medium">Utilidad</th>
              <th className="px-3 py-2 text-right font-medium">Gastos</th>
              <th className="px-3 py-2 text-right font-medium">Me quedó</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <FilaTabla key={f.empresa.empresaKey} fila={f} onAbrir={onAbrir} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
