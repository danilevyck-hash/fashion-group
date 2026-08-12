"use client";

// ============================================================================
// Inicio de Marketing — NIVEL 1 de los tres niveles (12-ago-2026).
//
//   /marketing                        → este archivo (las marcas)
//   /marketing/[marca]                → nivel 2: SUS períodos
//   /marketing/[marca]/[periodo]      → nivel 3: el detalle del período
//
// 🔑 EL MODELO, en palabras de Daniel: *"ellos facturan a mi bajo compañia
// diferentes. una por marca. cada marca tiene su encargado"*. Y sobre esta
// portada: cada marca es UNA FILA (nombre · cuántos períodos · lo abierto),
// y las herramientas van en el MISMO estilo de lista bajo su propio título —
// Daniel, sobre el pie viejo: *"se siente separado"*.
//
// 🔴 ACÁ NO HAY ACCIONES DE PERÍODO. Cerrar, ZIP y Excel viven en los niveles
// 2 y 3 (la página de la marca y la del período) — esta pantalla solo dice
// dónde está la plata y lleva a cada marca. La única acción es Registrar
// gasto. El atajo "Cerrar las tres" sigue muerto (11-ago-2026, Daniel: *"que
// sea por separado mejor no?"*).
//
// 🩸 NO SE HACE NINGUNA CUENTA EN ESTE ARCHIVO. Todos los montos vienen ya
// sumados de `GET /api/marketing/inicio`. Sumar acá "para redondear la
// pantalla" sería tener dos verdades sobre la misma plata.
//
// 🔴 LAS MARCAS CON GASTO VAN PRIMERO (mockup aprobado) y, adentro de cada
// grupo, en el orden canónico del módulo puro. Una marca sin gasto no se
// esconde: *"entran igual"*, con su "—".
//
// ⚠️ DEGRADA LIMPIO. Sin la migración de períodos (`conPeriodos: false`) las
// filas se dibujan igual; solo el contador de períodos deja de sumar la fila
// del abierto que todavía no existe en la base.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { formatearMonto } from "@/lib/marketing/normalizar";
import {
  MARCAS_BLOQUE,
  MULTIFASHION_KEY,
  SIN_BLOQUE,
  nombreDeBloque,
} from "@/lib/marketing/bloques";
import PorClienteModal from "./PorClienteModal";
import PorMarcaModal from "./PorMarcaModal";
import { FilaNivel, ListaCard } from "./FilaNivel";

export interface MontoInicio {
  count: number;
  total: number;
}

export interface BloqueResumen {
  key: string;
  nombre: string;
  periodoAbierto: { id: string | null; nombre: string } | null;
  facturas: MontoInicio;
  muebles: MontoInicio;
  total: number;
  proyectos: number;
  /** Gastos sin el papel que respalda la plata. Los lleva TODO gasto. */
  sinComprobante?: number;
  /** Gastos sin foto de instalación. Solo los que tienen cliente. */
  sinFoto?: number;
}

export interface PeriodoCerradoResumen {
  id: string | null;
  bloqueKey: string;
  bloqueNombre: string;
  nombre: string;
  cerradoEn: string | null;
  facturas: MontoInicio;
  muebles: MontoInicio;
  total: number;
}

export interface FilaClienteInicio {
  cliente: string;
  clienteCodigo: string | null;
  porBloque: Record<string, number>;
  total: number;
}

export interface MarcaInicio {
  id: string;
  nombre: string;
  codigo: string;
}

export interface DatosInicio {
  bloques: BloqueResumen[];
  cerrados: PeriodoCerradoResumen[];
  resumen: { total: number; proyectos: number; clientes: number };
  porCliente: FilaClienteInicio[];
  porMarca: Record<string, number>;
  marcas: MarcaInicio[];
  conPeriodos: boolean;
  mobiliario: { entregas: number; total: number };
  impulsadoras: { count: number | null; montoMensual: number | null };
}

interface Props {
  /** Abre la página de la marca (nivel 2: sus períodos). */
  onSelectBloque: (key: string) => void;
  /** La única puerta para meter plata: el modal de "Registrar gasto". */
  onRegistrarGasto: () => void;
  onOpenImpulsadoras: () => void;
  onOpenInventario: () => void;
  /**
   * Reportes vive ACÁ desde la poda del 11-ago-2026: su fila en Herramientas
   * es su única puerta. No quitarla sin darle otra.
   */
  onOpenReportes: () => void;
  refreshKey: number;
}

/** Bloques que NO se le reportan a nadie: sin período y sin cierre. */
const SIN_REPORTE = new Set<string>([MULTIFASHION_KEY, SIN_BLOQUE]);

/** Orden canónico de los bloques: el del módulo puro, y lo demás al final. */
const ORDEN_BLOQUE = new Map<string, number>(
  MARCAS_BLOQUE.map((m, i) => [m.key, i] as const),
);

function ordenDe(key: string): number {
  const i = ORDEN_BLOQUE.get(String(key ?? "").trim().toUpperCase());
  if (i !== undefined) return i;
  if (key === MULTIFASHION_KEY) return 90;
  if (key === SIN_BLOQUE) return 91;
  return 80;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

export default function InicioMarketing({
  onSelectBloque,
  onRegistrarGasto,
  onOpenImpulsadoras,
  onOpenInventario,
  onOpenReportes,
  refreshKey,
}: Props) {
  const [datos, setDatos] = useState<DatosInicio | null>(null);
  const [loading, setLoading] = useState(true);
  const [verPorCliente, setVerPorCliente] = useState(false);
  const [verPorMarca, setVerPorMarca] = useState(false);
  const [recargar, setRecargar] = useState(0);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/marketing/inicio", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as DatosInicio;
        if (!cancelado) setDatos(data);
      } catch {
        if (!cancelado) setDatos(null);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [refreshKey, recargar]);

  // Cuántos períodos CERRADOS tiene cada marca (el abierto se suma aparte).
  const cerradosPorBloque = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of datos?.cerrados ?? []) {
      m.set(c.bloqueKey, (m.get(c.bloqueKey) ?? 0) + 1);
    }
    return m;
  }, [datos]);

  // Las filas de marcas: CON GASTO primero (mockup aprobado), y adentro de
  // cada grupo el orden canónico. Nada salta de lugar por gastar más o menos
  // dentro del mismo grupo.
  const bloques = useMemo(() => {
    const lista = [...(datos?.bloques ?? [])].sort(
      (a, b) => ordenDe(a.key) - ordenDe(b.key),
    );
    const sinGasto = (b: BloqueResumen) =>
      b.facturas.count === 0 && b.muebles.count === 0;
    return [...lista.filter((b) => !sinGasto(b)), ...lista.filter(sinGasto)];
  }, [datos]);

  const mobiliario = datos?.mobiliario;
  const impulsadoras = datos?.impulsadoras;

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------------ */}
      {/* Cabecera: el título y la ÚNICA acción principal del módulo.         */}
      {/* ------------------------------------------------------------------ */}
      {/* Sin título grande: "Marketing" ya lo dicen la barra sticky (celular) y
          el breadcrumb (escritorio). Queda sr-only para no dejar la página sin
          encabezado, y la fila pasa a `justify-end` para que "Registrar gasto"
          —la única acción principal— no se corra a la izquierda al quedar
          sola. */}
      <div className="flex items-center justify-end gap-4">
        <h1 className="sr-only">Marketing</h1>
        <button
          type="button"
          onClick={onRegistrarGasto}
          className="rounded-md bg-black text-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition shrink-0"
        >
          + Registrar gasto
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-24 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-64 rounded-lg bg-gray-100 animate-pulse" />
        </div>
      ) : !datos ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-600">
            No se pudo cargar el resumen. Revisa tu conexión e intenta de nuevo.
          </p>
          <button
            type="button"
            onClick={() => setRecargar((n) => n + 1)}
            className="mt-3 rounded-md border border-gray-300 bg-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm hover:border-gray-500 active:scale-[0.97] transition"
          >
            Intentar de nuevo
          </button>
        </div>
      ) : (
        <>
          {/* -------------------------------------------------------------- */}
          {/* RESUMEN — lo gastado hoy, y las dos maneras de mirarlo.         */}
          {/* -------------------------------------------------------------- */}
          <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
            {/* `sr-only`: cada cifra de abajo lleva su propio pie ("gastado en
                el período actual", "clientes"…). El rótulo "Resumen" no decía
                nada que no estuviera ya en la tarjeta. */}
            <h2 className="sr-only">Resumen</h2>
            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
              <div>
                <div className="text-2xl sm:text-[28px] font-semibold text-gray-900 tabular-nums leading-none">
                  {formatearMonto(datos.resumen.total)}
                </div>
                <div className="text-xs text-gray-500 mt-1">gastado en el período actual</div>
              </div>
              <div>
                <div className="text-2xl sm:text-[28px] font-semibold text-gray-900 tabular-nums leading-none">
                  {datos.resumen.clientes}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {datos.resumen.clientes === 1 ? "cliente" : "clientes"}
                </div>
              </div>
              <div className="flex items-center gap-4 sm:ml-auto -my-1">
                <button
                  type="button"
                  onClick={() => setVerPorCliente(true)}
                  className="text-sm text-teal-700 hover:text-teal-900 transition min-h-[44px] inline-flex items-center"
                >
                  Por cliente
                </button>
                <button
                  type="button"
                  onClick={() => setVerPorMarca(true)}
                  className="text-sm text-teal-700 hover:text-teal-900 transition min-h-[44px] inline-flex items-center"
                >
                  Por marca
                </button>
              </div>
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* MARCAS — una fila por marca. Tocarla abre SUS períodos.         */}
          {/* -------------------------------------------------------------- */}
          <ListaCard titulo="Marcas">
            {bloques.map((b) => {
              const sinReporte = SIN_REPORTE.has(b.key);
              const sinGasto = b.facturas.count === 0 && b.muebles.count === 0;
              const nombre = b.nombre || nombreDeBloque(b.key, datos.marcas);
              const cerradosCount = cerradosPorBloque.get(b.key) ?? 0;
              // El abierto cuenta como período aunque la DDL no haya corrido:
              // conceptualmente siempre hay un período en curso.
              const nPeriodos = (sinReporte ? 0 : 1) + cerradosCount;
              const subtitulo =
                b.key === MULTIFASHION_KEY
                  ? "Tienda propia · sin período"
                  : b.key === SIN_BLOQUE
                    ? "Falta decidir a qué marca se le reporta este gasto"
                    : sinGasto && cerradosCount === 0
                      ? "Sin gasto este período"
                      : plural(nPeriodos, "período", "períodos");
              return (
                <FilaNivel
                  key={b.key}
                  titulo={nombre}
                  subtitulo={subtitulo}
                  monto={
                    sinGasto ? (
                      <span className="text-gray-300 text-sm">—</span>
                    ) : (
                      formatearMonto(b.total)
                    )
                  }
                  onClick={() => onSelectBloque(b.key)}
                  ariaLabel={`Abrir ${nombre}`}
                />
              );
            })}
          </ListaCard>

          {/* -------------------------------------------------------------- */}
          {/* HERRAMIENTAS — el mismo estilo de fila, bajo su título.         */}
          {/* Reportes vive acá desde la poda del 11-ago-2026: es su ÚNICA    */}
          {/* puerta (el enlace de la lista de marca se retiró).              */}
          {/* -------------------------------------------------------------- */}
          <ListaCard titulo="Herramientas">
            <FilaNivel
              titulo="Mobiliario"
              subtitulo={
                mobiliario
                  ? `${plural(mobiliario.entregas, "entrega", "entregas")} · ${formatearMonto(mobiliario.total)} entregados`
                  : "Inventario y entregas de muebles"
              }
              onClick={onOpenInventario}
            />
            <FilaNivel
              titulo="Impulsadoras"
              subtitulo={
                impulsadoras && impulsadoras.count !== null
                  ? `${plural(impulsadoras.count, "impulsadora", "impulsadoras")}${
                      impulsadoras.montoMensual
                        ? ` · ${formatearMonto(impulsadoras.montoMensual)} al mes`
                        : ""
                    }`
                  : "Pagos mensuales de las impulsadoras"
              }
              onClick={onOpenImpulsadoras}
            />
            <FilaNivel
              titulo="Reportes"
              subtitulo="Por marca, por tienda y por proyecto"
              onClick={onOpenReportes}
            />
          </ListaCard>
        </>
      )}

      {datos && verPorCliente && (
        <PorClienteModal
          bloques={datos.bloques}
          filas={datos.porCliente}
          onClose={() => setVerPorCliente(false)}
        />
      )}

      {datos && verPorMarca && (
        <PorMarcaModal
          porMarca={datos.porMarca}
          marcas={datos.marcas}
          onClose={() => setVerPorMarca(false)}
        />
      )}
    </div>
  );
}
