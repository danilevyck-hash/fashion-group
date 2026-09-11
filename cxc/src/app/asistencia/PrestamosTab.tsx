"use client";

// PRÉSTAMOS, ADENTRO DE PLANILLA.
//
// Daniel, textual: *«asistencia se ingresa la info y prestamos seria para como
// ver la info y hacer pagos extraordinarios como abonos etc»*.
//
// O sea, esta pantalla hace DOS cosas y ninguna más:
//   1. VER cuánto debe cada quien, en sus dos cuentas.
//   2. Anotar un abono EXTRAORDINARIO — un pago que no salió de la quincena.
//
// ── 🔴 LO QUE SALE DE LA QUINCENA YA NO SE TECLEA ───────────────────────────
//
// Lo escribe el cierre de la planilla. 🩸 Medido en la quincena del 1 al 15 de
// agosto de 2026: el módulo de Préstamos tenía 9 descuentos por $360,00 y la
// casilla de la planilla decía 7 por $265,00 — KEVIN LUBO, LUIS PARAJON y
// YULICAR CORONA con el pago anotado y la casilla en cero (se les bajó la deuda
// por plata que nunca se les quitó del sueldo), y LUIS ARROYO al revés. Los dos
// errores son el mismo: la plata se tecleaba dos veces, en dos pantallas.
//
// ⚠️ PRÉSTAMOS NO DESAPARECE, Y ESTÁ MEDIDO: de 337 pagos, **53 (el 42 % de la
// plata, $8.834,22) NO salieron de la quincena**. Para esos es esta pestaña.
//
// ── 🔴 LA SECRETARIA SOLO MIRA ──────────────────────────────────────────────
//
// Daniel: *«La secretaria entra a Préstamos solo a VER»*. Lo decide el SERVIDOR
// (`cerrarPlanillaRoles()`); acá solo se dibuja o no el botón, para no ofrecer
// algo que va a contestar 403.

import { useCallback, useEffect, useMemo, useState } from "react";
import { filtrarPorEmpresa } from "@/lib/asistencia/empresa-para-todo";
import { useToast } from "@/components/ToastSystem";
import { NOMBRE_CUENTA, type CuentaPrestamo } from "@/lib/prestamos-saldo";
import { ORIGENES_ABONO } from "@/lib/asistencia/abono-extra";
import { hoyPanama } from "@/lib/fecha-panama";
import { capitalizarNombre } from "@/lib/nombre-en-pantalla";
import { quincenasHasta } from "@/lib/asistencia/planilla";

interface FichaDeuda {
  id: string;
  codigo: string | null;
  nombre: string;
  saldo: number;
  saldoPrestamo: number;
  saldoDano: number;
  /** Lo que debe por «Descuento a terceros». Opcional: un payload viejo no lo trae. */
  saldoTerceros?: number;
  /** La empresa de la persona atada (10-sep-2026): por ella filtra el selector de arriba. */
  empresa?: string | null;
  cuota: number;
  cuotaDano: number;
  yaDescontado: number;
}

/** Plata con centavos y menos tipográfico, como en todo el sistema. */
function money(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `−$${abs}` : `$${abs}`;
}

export default function PrestamosTab(props: { desde?: string; hasta?: string; empresa?: string } = {}) {
  const { toast } = useToast();
  // 🔑 Sin período dado, la quincena EN CURSO — y el «hoy» es el de PANAMÁ, no
  // el del navegador. Solo decide la columna «esta quincena»: el SALDO es
  // histórico y no se recorta por fecha.
  const { desde, hasta } = useMemo(() => {
    if (props.desde && props.hasta) return { desde: props.desde, hasta: props.hasta };
    const q = quincenasHasta(hoyPanama(), 1)[0];
    return { desde: q.desde, hasta: q.hasta };
  }, [props.desde, props.hasta]);
  const [fichas, setFichas] = useState<FichaDeuda[] | null>(null);
  const [puedeAnotar, setPuedeAnotar] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [abonando, setAbonando] = useState<FichaDeuda | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const q = new URLSearchParams({ desde, hasta });
      const r = await fetch(`/api/asistencia/prestamos-deuda?${q}`, { cache: "no-store" });
      const j = (await r.json()) as { fichas?: FichaDeuda[]; puedeAnotar?: boolean; error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo leer la deuda");
      // 🔴 Filtrado por la empresa de arriba: la lista y el total (10-sep-2026).
      setFichas(filtrarPorEmpresa(j.fichas ?? [], props.empresa));
      setPuedeAnotar(!!j.puedeAnotar);
    } catch {
      toast("No se pudo leer la deuda. Intenta de nuevo.", "error");
      setFichas([]);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, toast, props.empresa]);

  useEffect(() => { void cargar(); }, [cargar]);

  const total = useMemo(
    () => (fichas ?? []).reduce((a, f) => a + f.saldo, 0),
    [fichas],
  );

  if (fichas === null) {
    return <p className="text-sm text-gray-500">Leyendo la deuda…</p>;
  }

  // 🔴 LA COLUMNA «Descuento a terceros» SOLO CUANDO ALGUIEN LO TIENE (10-sep-2026,
  // Daniel: *«que aparezca solo cuando alguien lo tenga»*). Una columna de ceros
  // es una columna que no dice nada.
  const hayTerceros = fichas.some((f) => (f.saldoTerceros ?? 0) > 0);

  if (!fichas.length) {
    // 🔑 Nunca un «$0.00» grande: se dice con palabras qué pasa.
    return (
      <p className="rounded-lg border border-gray-200 px-4 py-6 text-center text-sm text-gray-600">
        Nadie debe nada en este momento.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-gray-600">
          {fichas.length === 1 ? "1 colaborador con deuda" : `${fichas.length} colaboradores con deuda`}
        </p>
        <p className="text-sm tabular-nums text-gray-900">
          <span className="text-gray-500">Total </span>
          <span className="font-medium">{money(total)}</span>
        </p>
      </div>

      {/* 🔴 EL DESLIZAMIENTO VIVE ADENTRO DE LA TABLA, nunca en la página: en el
          iPhone la pantalla entera no se puede mover de lado. */}
      <div className="hidden overflow-x-auto rounded-lg border border-gray-200 lg:block">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Colaborador</th>
              <th className="px-3 py-2 text-right font-medium">Préstamo</th>
              <th className="px-3 py-2 text-right font-medium">Daño de mercancía</th>
              {hayTerceros && <th className="px-3 py-2 text-right font-medium">{NOMBRE_CUENTA.terceros}</th>}
              <th className="px-3 py-2 text-right font-medium">Debe</th>
              <th className="px-3 py-2 text-right font-medium">Cuota</th>
              <th className="px-3 py-2 text-right font-medium">Esta quincena</th>
              {puedeAnotar && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {fichas.map((f) => (
              <tr key={f.id} className="border-b border-gray-100 last:border-0">
                <td className="px-3 py-2">
                  <span className="text-gray-900">{capitalizarNombre(f.nombre)}</span>
                  {/* 🔴 SIN CÓDIGO NO HAY A QUIÉN DESCONTARLE, y se DICE. El
                      amarre es por código y nunca por parecido de nombre. */}
                  {!f.codigo && (
                    <span className="ml-2 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-sm text-amber-800">
                      sin atar a nadie
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{money(f.saldoPrestamo)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{money(f.saldoDano)}</td>
                {hayTerceros && (
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                    {(f.saldoTerceros ?? 0) > 0 ? money(f.saldoTerceros ?? 0) : <span className="text-gray-400">—</span>}
                  </td>
                )}
                <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">{money(f.saldo)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{money(f.cuota + f.cuotaDano)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                  {f.yaDescontado > 0 ? money(f.yaDescontado) : <span className="text-gray-400">—</span>}
                </td>
                {puedeAnotar && (
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => setAbonando(f)}
                      className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]">
                      Anotar abono
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* En el celular, tarjetas: una tabla de 7 columnas en 390 px pide 200 px
          de arrastre lateral y nadie la lee. */}
      <div className="space-y-2 lg:hidden">
        {fichas.map((f) => (
          <div key={f.id} className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-gray-900">{capitalizarNombre(f.nombre)}</p>
              <p className="text-sm tabular-nums font-medium text-gray-900">{money(f.saldo)}</p>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {NOMBRE_CUENTA.prestamo} {money(f.saldoPrestamo)} · {NOMBRE_CUENTA.dano} {money(f.saldoDano)}
              {(f.saldoTerceros ?? 0) > 0 && ` · ${NOMBRE_CUENTA.terceros} ${money(f.saldoTerceros ?? 0)}`}
            </p>
            <p className="mt-0.5 text-sm text-gray-500">
              Cuota {money(f.cuota + f.cuotaDano)}
              {f.yaDescontado > 0 && ` · esta quincena ${money(f.yaDescontado)}`}
            </p>
            {!f.codigo && (
              <p className="mt-1 text-sm text-amber-800">No está atado a nadie del reloj: la planilla no le puede descontar.</p>
            )}
            {puedeAnotar && (
              <button type="button" onClick={() => setAbonando(f)}
                className="mt-2 min-h-[44px] w-full rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]">
                Anotar abono
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="text-sm text-gray-500">
        El descuento de la quincena lo anota el cierre de la planilla. Aquí solo van los
        abonos que no salieron del sueldo.
      </p>

      {abonando && (
        <AbonoModal
          ficha={abonando}
          hasta={hasta}
          cerrando={cargando}
          onCerrar={() => setAbonando(null)}
          onListo={() => { setAbonando(null); void cargar(); }}
        />
      )}
    </div>
  );
}

/**
 * Anotar un abono. Cuatro campos: de qué cuenta, cuánto, cuándo y de dónde salió.
 *
 * 🔴 «Quincena» NO está entre los orígenes, y el servidor lo rechaza aunque
 * alguien lo mande a mano: ese origen lo escribe el cierre. Un abono anotado
 * así lo leería la casilla como «ya descontado» y esa quincena no le
 * descontaría nada a la persona.
 */
function AbonoModal(props: {
  ficha: FichaDeuda;
  hasta: string;
  cerrando: boolean;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const { toast } = useToast();
  const { ficha } = props;
  const debeLasDos = ficha.saldoPrestamo > 0 && ficha.saldoDano > 0;
  const [cuenta, setCuenta] = useState<CuentaPrestamo>(
    // Viene puesta la que de verdad debe. Con las dos, la de préstamo.
    ficha.saldoPrestamo > 0 ? "prestamo" : "dano",
  );
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(props.hasta);
  const [origen, setOrigen] = useState<string>(ORIGENES_ABONO[0]);
  const [guardando, setGuardando] = useState(false);

  const tope = cuenta === "prestamo" ? ficha.saldoPrestamo : ficha.saldoDano;

  async function guardar() {
    setGuardando(true);
    try {
      const r = await fetch("/api/asistencia/prestamos-deuda", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fichaId: ficha.id, cuenta, monto: Number(monto), fecha, origen,
        }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || j.ok === false) throw new Error(j.error ?? "No se pudo anotar el abono");
      toast("Listo, anotado", "success");
      props.onListo();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo anotar el abono", "error");
    } finally {
      setGuardando(false);
    }
  }

  const montoNum = Number(monto);
  const sirve = Number.isFinite(montoNum) && montoNum > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog" aria-modal="true" aria-label={`Anotar abono de ${capitalizarNombre(ficha.nombre)}`}>
      <div className="w-full max-w-md rounded-t-lg border border-gray-200 bg-white p-4 sm:rounded-lg">
        <h2 className="text-base font-medium text-gray-900">Anotar un abono</h2>
        <p className="mt-0.5 text-sm text-gray-500">{capitalizarNombre(ficha.nombre)}</p>

        <div className="mt-4 space-y-3">
          {debeLasDos && (
            <label className="block text-sm">
              <span className="text-gray-600">¿De qué cuenta baja?</span>
              <select value={cuenta} onChange={(e) => setCuenta(e.target.value as CuentaPrestamo)}
                className="mt-1 min-h-[44px] w-full rounded-md border border-gray-300 px-3 text-sm">
                <option value="prestamo">{NOMBRE_CUENTA.prestamo} — debe {money(ficha.saldoPrestamo)}</option>
                <option value="dano">{NOMBRE_CUENTA.dano} — debe {money(ficha.saldoDano)}</option>
              </select>
            </label>
          )}

          <label className="block text-sm">
            <span className="text-gray-600">¿Cuánto abonó?</span>
            <input type="number" inputMode="decimal" step="0.01" min="0" value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-md border border-gray-300 px-3 text-sm tabular-nums" />
            {/* ⚠️ Se AVISA que pasa el saldo; no se bloquea. Un abono de más es
                un saldo a favor, y eso puede ser correcto. */}
            {sirve && montoNum > tope + 0.004 && (
              <span className="mt-1 block text-sm text-amber-800">
                Es más de lo que debe en esa cuenta ({money(tope)}). Le quedaría saldo a favor.
              </span>
            )}
          </label>

          <label className="block text-sm">
            <span className="text-gray-600">¿Cuándo?</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-md border border-gray-300 px-3 text-sm" />
          </label>

          <label className="block text-sm">
            <span className="text-gray-600">¿De dónde salió?</span>
            <select value={origen} onChange={(e) => setOrigen(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-md border border-gray-300 px-3 text-sm">
              {ORIGENES_ABONO.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={props.onCerrar} disabled={guardando}
            className="min-h-[44px] flex-1 rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:opacity-40">
            Cancelar
          </button>
          <button type="button" onClick={() => void guardar()} disabled={!sirve || guardando}
            className="min-h-[44px] flex-1 rounded-md bg-black px-3 text-sm text-white transition active:scale-[0.97] disabled:opacity-40">
            {guardando ? "Guardando…" : "Guardar abono"}
          </button>
        </div>
      </div>
    </div>
  );
}
