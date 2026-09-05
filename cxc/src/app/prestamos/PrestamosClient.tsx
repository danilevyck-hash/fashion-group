"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { fmt } from "@/lib/format";
import { useAuth } from "@/lib/hooks/useAuth";
import { useLastUsed } from "@/lib/hooks/useLastUsed";
import { Toast, SkeletonTable, EmptyState, AnimatedNumber } from "@/components/ui";
import OverflowMenu from "@/components/ui/OverflowMenu";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";
import { PRESTAMOS_ROLES } from "@/lib/prestamos-roles";
import { hoyPanamaYmd, getQuincenaRangePanama } from "@/lib/prestamos-quincena";
import type { Colaborador, DatosPrestamos, FilaPrestamo } from "@/lib/prestamos-lista-server";
import AplicarQuincenaModal from "./components/AplicarQuincenaModal";
import NuevoMovimientoModal from "./components/NuevoMovimientoModal";
import ElegirPersonaModal from "./components/ElegirPersonaModal";

export type PrestamosInitialData = DatosPrestamos;

// ─────────────────────────────────────────────────────────────────────────────
// LA LISTA: SOLO QUIEN DEBE.
//
// 🩸 QUÉ SE FUE Y POR QUÉ. La bandera `activo` y los botones «Archivar» /
// «Reactivar» desaparecieron el 5-sep-2026. Nunca significaron «trabaja acá»
// sino «tiene algo abierto» — medido: a ESMER CRUZ le archivaron la ficha al
// terminar de pagar sus $600 y **sigue trabajando**; a KENNER HERNANDEZ igual
// tras pagar $3,13. El saldo ya dice lo que la bandera intentaba decir, así que
// quien llega a cero sale solo y no hay nada que archivar.
//
// 🔴 Y QUIEN YA NO TRABAJA PERO DEBE **SÍ APARECE**, marcado. Sacarlo de la
// lista sería perder la plata de vista, que es exactamente lo que este módulo
// no puede hacer.
//
// El BUSCADOR de arriba encuentra a las 37 personas activas de Asistencia,
// deban o no: es de donde se elige a alguien para prestarle, y es la única
// forma de abrir la ficha de quien ya terminó de pagar.
// ─────────────────────────────────────────────────────────────────────────────

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function progressColor(pct: number) {
  if (pct >= 75) return "bg-green-500";
  if (pct >= 25) return "bg-amber-500";
  return "bg-red-500";
}

/** La quincena vigente, con la MISMA regla del servidor (UTC−5 fijo). */
function quincenaVigente(hoy: string) {
  const { start, end } = getQuincenaRangePanama();
  const [, m] = hoy.split("-").map(Number);
  const [y] = hoy.split("-").map(Number);
  const dFin = Number(end.slice(8, 10));
  const dIni = Number(start.slice(8, 10));
  return { start, end, label: `${dIni} al ${dFin} de ${MESES[m]} ${y}` };
}

export default function PrestamosClient({ initialData }: { initialData: PrestamosInitialData }) {
  const router = useRouter();
  const { authChecked } = useAuth({ moduleKey: "prestamos", allowedRoles: [...PRESTAMOS_ROLES] });
  const [datos, setDatos] = useState<DatosPrestamos>(initialData);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [filterEmpresa, setFilterEmpresa] = useLastUsed("prestamos_empresa", "all");
  const [search, setSearch] = useState("");

  const [showElegirPersona, setShowElegirPersona] = useState(false);
  const [personaElegida, setPersonaElegida] = useState<Colaborador | null>(null);
  const [showMovModal, setShowMovModal] = useState(false);
  const [confirmAplicarQ, setConfirmAplicarQ] = useState(false);
  const [aplicandoQ, setAplicandoQ] = useState(false);
  const [preguntaExcel, setPreguntaExcel] = useState(false);
  const [exportando, setExportando] = useState(false);

  const cerrarMovModal = useCallback(() => setShowMovModal(false), []);
  const movModal = useFormModalDismiss(showMovModal, cerrarMovModal, true);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const recargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/prestamos/empleados");
      if (res.ok) setDatos(await res.json());
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
    setLoading(false);
  }, []);

  const initialLoadRef = useRef(true);
  useEffect(() => {
    if (!authChecked) return;
    if (initialLoadRef.current) { initialLoadRef.current = false; return; }
    recargar();
  }, [authChecked, recargar]);

  const hoy = hoyPanamaYmd();
  const quincena = useMemo(() => quincenaVigente(hoy), [hoy]);

  const filas = datos.filas;
  const totalSaldo = filas.reduce((s, f) => s + f.saldo, 0);
  const totalPendiente = filas.reduce((s, f) => s + f.pendiente, 0);

  // A quién le toca el descuento de esta quincena, y a quién ya se le hizo.
  const conCuota = filas.filter((f) => f.trabaja && f.saldo > 0 && (f.cuotaPrestamo > 0 || f.cuotaDano > 0));
  const deducidas = conCuota.filter((f) => f.deducidaQuincena);
  const deduccionesAplicadas = deducidas.length;
  const deduccionesTotal = conCuota.length;
  const deduccionesCompletas = deduccionesTotal > 0 && deduccionesAplicadas === deduccionesTotal;
  const quincenaPendientesN = deduccionesTotal - deduccionesAplicadas;

  const personasQuincena = conCuota.map((f) => ({
    nombre: f.nombre,
    deduccion: f.cuotaPrestamo + f.cuotaDano,
    saldo: f.saldo,
    fechasPagos: f.fechasPagosQuincena ?? [],
  }));

  const empresas = useMemo(
    () => [...new Set(filas.map((f) => f.empresa ?? "Sin empresa"))].sort((a, b) => a.localeCompare(b, "es")),
    [filas],
  );

  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  const filtered = filas.filter((f) => {
    if (filterEmpresa !== "all" && (f.empresa ?? "Sin empresa") !== filterEmpresa) return false;
    if (search && !norm(f.nombre).includes(norm(search))) return false;
    return true;
  });

  // 🔴 El buscador también encuentra a quien NO debe: las 37 personas activas de
  // Asistencia. Antes solo se podía llegar a la ficha de quien tenía saldo.
  const otrosResultados: Colaborador[] = search.trim()
    ? datos.colaboradores.filter(
        (c) => norm(c.nombre).includes(norm(search)) && !filas.some((f) => f.empleadoCodigo === c.codigo),
      )
    : [];

  const porEmpresa = useMemo(() => {
    const m = new Map<string, FilaPrestamo[]>();
    for (const f of filtered) {
      const k = f.empresa ?? "Sin empresa";
      const l = m.get(k);
      if (l) l.push(f); else m.set(k, [f]);
    }
    return [...m.entries()];
  }, [filtered]);

  async function aplicarQuincena(fechaPago: string) {
    setAplicandoQ(true);
    try {
      const res = await fetch("/api/prestamos/aplicar-quincena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: fechaPago }),
      });
      const json = await res.json();
      if (res.ok) {
        const ok = json.count_aplicados ?? 0;
        const om = json.count_omitidos ?? 0;
        const total = json.total ?? 0;
        showToast(
          `Aplicada${ok !== 1 ? "s" : ""} ${ok} deducción${ok !== 1 ? "es" : ""} ($${fmt(total)})`
          + (om ? ` · ${om} omitida${om !== 1 ? "s" : ""}` : ""),
        );
        recargar();
      } else {
        showToast(json.error || "Error al aplicar la quincena");
      }
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
    setAplicandoQ(false);
    setConfirmAplicarQ(false);
  }

  // 🔴 «¿Solo los que deben o todos?» — Daniel: «que esté la opción después de
  // apretar descargar». La pregunta va DESPUÉS del clic, no antes: elegir un
  // alcance que no se va a usar es un paso de más en la tarea habitual.
  async function descargarHistorial(ambito: "deben" | "todos") {
    setPreguntaExcel(false);
    setExportando(true);
    try {
      const emp = filterEmpresa && filterEmpresa !== "all" ? `&empresa=${encodeURIComponent(filterEmpresa)}` : "";
      const res = await fetch(`/api/prestamos/export-excel?ambito=${ambito}${emp}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const ymd = hoy.replace(/-/g, "");
        const slug = filterEmpresa && filterEmpresa !== "all"
          ? filterEmpresa.toLowerCase().replace(/\s+/g, "_")
          : "todas_las_empresas";
        link.download = `historial_prestamos_${ambito}_${slug}_${ymd}.xlsx`;
        link.click();
        URL.revokeObjectURL(url);
      } else { showToast("Error al descargar"); }
    } catch { showToast("Error al descargar"); }
    setExportando(false);
  }

  async function crearMovimiento(payload: Record<string, unknown>) {
    const res = await fetch("/api/prestamos/movimientos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    if (res.ok) {
      showToast(json?.pendiente ? "Se mandó a aprobación de Daniel" : "Movimiento registrado");
      setShowMovModal(false);
      setPersonaElegida(null);
      recargar();
    } else {
      showToast(json?.error || "Error al guardar");
    }
  }

  /** Elegir a la persona crea (o encuentra) su ficha y abre el formulario. */
  async function elegirPersona(c: Colaborador) {
    setShowElegirPersona(false);
    if (c.fichaId) {
      setPersonaElegida({ ...c });
      setShowMovModal(true);
      return;
    }
    try {
      const res = await fetch("/api/prestamos/empleados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empleado_codigo: c.codigo }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { showToast(json?.error || "No se pudo abrir la ficha"); return; }
      setPersonaElegida({ ...c, fichaId: json.id });
      setShowMovModal(true);
    } catch { showToast("Sin conexión. Intenta de nuevo."); }
  }

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Préstamos" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <h1 className="sr-only">Préstamos</h1>

        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2">
            <div className="text-xs text-gray-400 uppercase tracking-wide">Saldo pendiente total</div>
            <div className={`text-lg font-semibold tabular-nums ${totalSaldo > 0 ? "text-red-600" : "text-gray-400"}`}>$<AnimatedNumber value={totalSaldo} formatter={(n: number) => fmt(n)} /></div>
          </div>
          <div className={`rounded-lg border px-3.5 py-2 ${deduccionesCompletas ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="text-xs text-gray-400 uppercase tracking-wide">Quincena · {quincena.label}</div>
            <div className={`text-lg font-semibold tabular-nums ${deduccionesCompletas ? "text-green-600" : "text-amber-600"}`}>{deduccionesAplicadas} / {deduccionesTotal}</div>
          </div>
          {quincenaPendientesN > 0 && (
            <button
              onClick={() => setConfirmAplicarQ(true)}
              className="sm:ml-auto inline-flex min-h-[44px] items-center justify-center bg-emerald-600 text-white px-5 rounded-md text-sm font-medium hover:bg-emerald-700 active:scale-[0.97] transition"
            >
              Aplicar quincena ({quincenaPendientesN})
            </button>
          )}
        </div>

        {/* 🔴 LO QUE ESPERA APROBACIÓN SE VE. No suma al saldo —no se entregó—
            pero esconderlo es exactamente cómo se perdieron los $700 de Luis
            Arroyo durante 22 días. */}
        {totalPendiente > 0 && (
          <button
            onClick={() => router.push("/prestamos/aprobaciones")}
            className="mb-5 flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3.5 text-left text-sm text-gray-600 transition hover:border-gray-400"
          >
            <span className="font-medium text-gray-900">Esperando aprobación ${fmt(totalPendiente)}</span>
            <span className="text-gray-500">· no suma al saldo hasta que Daniel lo apruebe</span>
          </button>
        )}

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button onClick={() => setShowElegirPersona(true)} className="inline-flex min-h-[44px] items-center justify-center bg-black text-white px-5 rounded-md text-sm hover:bg-gray-800 transition">+ Nuevo préstamo</button>
          <OverflowMenu
            align="left"
            items={[
              { label: exportando ? "Descargando…" : "Descargar historial", onClick: () => setPreguntaExcel(true), disabled: exportando },
              { label: "Préstamos por aprobar", onClick: () => router.push("/prestamos/aprobaciones") },
            ]}
          />

          <div className="flex-1" />

          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar empleado..."
            className="min-h-[44px] border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition w-40"
          />
          <select
            value={filterEmpresa}
            onChange={e => setFilterEmpresa(e.target.value)}
            className="min-h-[44px] border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition"
          >
            <option value="all">Todas las empresas</option>
            {empresas.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>

        {loading ? (
          <SkeletonTable rows={5} cols={4} />
        ) : filtered.length === 0 && otrosResultados.length === 0 ? (
          <EmptyState title={search ? "No se encontró a nadie con ese nombre" : "Nadie debe nada ahora mismo"} actionLabel="+ Nuevo préstamo" onAction={() => setShowElegirPersona(true)} />
        ) : (
          <div className="space-y-6">
            {porEmpresa.map(([empresa, items]) => (
              <section key={empresa}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="text-xs uppercase tracking-wide text-gray-400">{empresa}</h2>
                  <span className="text-xs tabular-nums text-gray-400">
                    {items.length} {items.length === 1 ? "persona" : "personas"} · ${fmt(items.reduce((s, f) => s + f.saldo, 0))}
                  </span>
                </div>
                <ul className="space-y-2">
                  {items.map((emp) => {
                    const deducida = emp.deducidaQuincena;
                    const pendienteDed = emp.trabaja && !deducida && emp.saldo > 0 && (emp.cuotaPrestamo + emp.cuotaDano) > 0;
                    const cuota = emp.cuotaPrestamo + emp.cuotaDano;

                    const badges = [
                      !emp.trabaja ? <span key="notrabaja" className="shrink-0 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-md">Ya no trabaja · no se descuenta</span> : null,
                      emp.pendiente > 0 ? <span key="pendiente" className="shrink-0 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md">Esperando ${fmt(emp.pendiente)}</span> : null,
                    ].filter(Boolean);

                    const chipQuincena = !emp.trabaja || cuota <= 0 ? null
                      : deducida ? <span className="shrink-0 text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md">✓ Deducida</span>
                      : pendienteDed ? <span className="shrink-0 text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md">⚠ Pendiente</span>
                      : null;

                    return (
                      <li
                        key={emp.id}
                        data-empleado-fila={emp.id}
                        onClick={() => router.push(`/prestamos/${emp.id}`)}
                        className="flex items-center gap-2 sm:gap-4 rounded-lg border p-3 sm:px-4 cursor-pointer hover:bg-gray-50 active:bg-gray-50 transition-colors border-gray-200"
                      >
                        {/* 1 · Nombre + cuenta/cuota (+ chips en mobile) */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span data-empleado-campo="nombre" className="font-medium truncate tracking-tight">{emp.nombre}</span>
                            {badges.length > 0 && <div className="hidden shrink-0 items-center gap-2 lg:flex">{badges}</div>}
                          </div>
                          <div className="flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
                            <span className="truncate">
                              {emp.saldoDano > 0
                                ? `Préstamo $${fmt(emp.saldoPrestamo)} · Daño $${fmt(emp.saldoDano)}`
                                : cuota > 0 ? `$${fmt(cuota)} por quincena` : "Sin cuota"}
                            </span>
                            {(badges.length > 0 || chipQuincena) && (
                              <div className="flex shrink-0 items-center gap-1.5 lg:hidden">{badges}{chipQuincena}</div>
                            )}
                          </div>
                        </div>

                        {/* 2 · Progreso (fino) — desktop */}
                        <div className="hidden lg:flex items-center gap-2 w-36 shrink-0">
                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full ${progressColor(emp.pct)} rounded-full`} style={{ width: `${Math.min(emp.pct, 100)}%` }} />
                          </div>
                          <span className="text-xs text-gray-400 tabular-nums w-8 text-right">{emp.pct.toFixed(0)}%</span>
                        </div>

                        {/* 3 · Chip quincena — columna propia solo en desktop */}
                        <div className="hidden shrink-0 text-center lg:block lg:w-24">
                          {chipQuincena}
                        </div>

                        {/* 4 · SALDO héroe */}
                        <div className="shrink-0 text-right min-w-[72px]">
                          <div className={`text-base sm:text-lg font-semibold tabular-nums ${emp.saldo > 0 ? "text-gray-900" : emp.saldo < 0 ? "text-blue-600" : "text-gray-400"}`}>${fmt(Math.abs(emp.saldo))}</div>
                          {emp.saldo < 0 && <div className="text-xs text-blue-500 -mt-0.5">a favor</div>}
                        </div>

                        {/* Acciones */}
                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                          <OverflowMenu
                            items={[
                              { label: "Ver ficha", onClick: () => router.push(`/prestamos/${emp.id}`) },
                            ]}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            {otrosResultados.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs uppercase tracking-wide text-gray-400">No deben nada</h2>
                <ul className="space-y-2">
                  {otrosResultados.map((c) => (
                    <li
                      key={c.codigo}
                      onClick={() => (c.fichaId ? router.push(`/prestamos/${c.fichaId}`) : elegirPersona(c))}
                      className="flex min-h-[44px] items-center gap-3 rounded-lg border border-gray-200 p-3 text-sm cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{c.nombre}</span>
                      <span className="shrink-0 text-xs text-gray-400">{c.empresaNombre ?? "Sin empresa"}</span>
                      <span className="shrink-0 tabular-nums text-gray-400">$0.00</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

      <ElegirPersonaModal
        open={showElegirPersona}
        colaboradores={datos.colaboradores}
        onClose={() => setShowElegirPersona(false)}
        onElegir={elegirPersona}
      />

      {showMovModal && personaElegida?.fichaId && (
        <div {...movModal.backdrop} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div ref={movModal.panelRef} className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <NuevoMovimientoModal
              nombre={personaElegida.nombre}
              empleadoId={personaElegida.fichaId}
              saldoPrestamo={filas.find((f) => f.id === personaElegida.fichaId)?.saldoPrestamo ?? 0}
              saldoDano={filas.find((f) => f.id === personaElegida.fichaId)?.saldoDano ?? 0}
              cuentaMasVieja={filas.find((f) => f.id === personaElegida.fichaId)?.cuentaMasVieja ?? null}
              salarioMensual={personaElegida.salarioMensual}
              hoy={hoy}
              onCancelar={() => { setShowMovModal(false); setPersonaElegida(null); }}
              onGuardar={crearMovimiento}
            />
          </div>
        </div>
      )}

      {/* 🔴 «¿Solo los que deben o todos?» — Daniel: «que esté la opción después
          de apretar descargar». Dos botones y ninguno por defecto: son dos
          papeles distintos y elegir por él sería adivinar. */}
      {preguntaExcel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPreguntaExcel(false)}>
          <div className="bg-white rounded-lg p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-medium mb-1">¿Qué quieres bajar?</h2>
            <p className="mb-5 text-sm text-gray-500">Solo quien debe algo, o todos los colaboradores con su historial completo.</p>
            <div className="space-y-2">
              <button onClick={() => descargarHistorial("deben")} className="w-full inline-flex min-h-[44px] items-center justify-center bg-black text-white rounded-md text-sm hover:bg-gray-800 transition">Solo los que deben</button>
              <button onClick={() => descargarHistorial("todos")} className="w-full inline-flex min-h-[44px] items-center justify-center border border-gray-200 rounded-md text-sm hover:border-gray-400 transition">Todos</button>
              <button onClick={() => setPreguntaExcel(false)} className="w-full inline-flex min-h-[44px] items-center justify-center text-sm text-gray-500 hover:text-black transition">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <AplicarQuincenaModal
        open={confirmAplicarQ}
        onClose={() => setConfirmAplicarQ(false)}
        onAplicar={aplicarQuincena}
        aplicando={aplicandoQ}
        personas={personasQuincena}
      />

      <Toast message={toast} />
    </div>
  );
}
