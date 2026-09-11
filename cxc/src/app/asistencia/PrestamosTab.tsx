"use client";

// PRÉSTAMOS, ADENTRO DE PLANILLA.
//
// Daniel, textual: *«asistencia se ingresa la info y prestamos seria para como
// ver la info y hacer pagos extraordinarios como abonos etc»*.
//
// O sea, esta pantalla hace estas cosas y ninguna más:
//   1. VER cuánto debe cada quien, en sus cuentas.
//   2. Anotar un abono EXTRAORDINARIO — un pago que no salió de la quincena.
//   3. 🔴 Crear un préstamo nuevo (11-sep-2026, Daniel: *«sí, arregla lo de
//      préstamos»*, con el mockup aprobado) — el MISMO formulario del módulo de
//      Préstamos, elegido de las fichas activas, con concepto, monto y cuota.
//   4. 🔴 Tocar el nombre abre SUS MOVIMIENTOS (`/prestamos/<id>`, la página del
//      módulo de siempre, con «← Préstamos» de vuelta a esta pestaña).
//
// 🩸 Del 10 al 11-sep-2026, con la «una sola puerta» prendida, esta pestaña
// tenía SOLO «Anotar abono»: no se podía crear un préstamo, ver los
// movimientos de nadie ni llegar a la ficha, porque todo lo que colgaba de
// `/prestamos/` rebotaba acá. Se reusa lo del módulo viejo en vez de dibujar copias.
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
// (`cerrarPlanillaRoles()`); acá solo se dibujan o no los botones y el enlace a
// los movimientos, para no ofrecer algo que va a contestar 403.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { filtrarPorEmpresa } from "@/lib/asistencia/empresa-para-todo";
import { useToast } from "@/components/ToastSystem";
import { NOMBRE_CUENTA, type CuentaPrestamo } from "@/lib/prestamos-saldo";
import { ORIGENES_ABONO } from "@/lib/asistencia/abono-extra";
import { hoyPanama } from "@/lib/fecha-panama";
import { capitalizarNombre } from "@/lib/nombre-en-pantalla";
import { quincenasHasta } from "@/lib/asistencia/planilla";
import { PARAM_NUEVO_PRESTAMO, enlaceAPrestamos } from "@/lib/prestamos-una-puerta";
import type { Colaborador, DatosPrestamos } from "@/lib/prestamos-lista-server";
import ElegirPersonaModal from "@/app/prestamos/components/ElegirPersonaModal";
import NuevoMovimientoModal from "@/app/prestamos/components/NuevoMovimientoModal";
import { useMovimientoForm } from "@/app/prestamos/components/useMovimientoForm";

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
  cuotaTerceros?: number;
  yaDescontado: number;
}

/** Plata con centavos y menos tipográfico, como en todo el sistema. */
function money(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `−$${abs}` : `$${abs}`;
}

/** 🔴 Los ceros van con guion (11-sep-2026, mockup): un $0.00 en una columna de plata se lee como dato. */
function plataOGuion(n: number | undefined) {
  const v = n ?? 0;
  return v > 0 || v < 0 ? money(v) : <span className="text-gray-400">—</span>;
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

  // ── «+ Nuevo préstamo»: la misma elección y el mismo formulario del módulo ──
  // Los colaboradores (las fichas activas de Asistencia) y las filas con saldo
  // se piden al TOCAR el botón, no al abrir la pestaña: esta lista se lee
  // muchas más veces de las que se crea un préstamo.
  const [datosModulo, setDatosModulo] = useState<DatosPrestamos | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [personaElegida, setPersonaElegida] = useState<Colaborador | null>(null);

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

  const movForm = useMovimientoForm({
    onSuccess: () => { setPersonaElegida(null); setDatosModulo(null); void cargar(); },
    // 🔴 El TIPO lo dice el hook, no el texto (11-sep-2026): el aviso del tope
    // sale en ámbar y por 8 s. Antes se clasificaba por `startsWith("Error")`.
    showToast: (m, tipo) => toast(m, tipo ?? "success"),
  });

  async function leerColaboradores(): Promise<DatosPrestamos | null> {
    try {
      const r = await fetch("/api/prestamos/empleados", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as DatosPrestamos;
      setDatosModulo(d);
      return d;
    } catch {
      toast("No se pudo abrir la lista de colaboradores. Intenta de nuevo.", "error");
      return null;
    }
  }

  async function abrirNuevoPrestamo() {
    if (await leerColaboradores()) setEligiendo(true);
  }

  // ── 🔴 SE LLEGA DESDE LA FICHA, CON LA PERSONA YA ELEGIDA (11-sep-2026) ────
  // «+ Préstamo» de la ficha trae `?nuevo=<código>`: se abre el MISMO formulario
  // como si se la hubiera tocado en la lista. Una vez por montaje.
  const sp = useSearchParams();
  const nuevoDeUrl = (sp?.get(PARAM_NUEVO_PRESTAMO) ?? "").trim();
  const abiertoDesdeUrl = useRef(false);
  useEffect(() => {
    if (!nuevoDeUrl || !puedeAnotar || abiertoDesdeUrl.current) return;
    abiertoDesdeUrl.current = true;
    void (async () => {
      const d = await leerColaboradores();
      const c = d?.colaboradores.find((x) => String(x.codigo) === nuevoDeUrl);
      if (c) void elegirPersona(c);
      else toast("No encontré a esa persona entre los colaboradores activos.", "error");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nuevoDeUrl, puedeAnotar]);

  /** Elegir a la persona crea (o encuentra) su ficha y abre el formulario — igual que el módulo. */
  async function elegirPersona(c: Colaborador) {
    setEligiendo(false);
    if (c.fichaId) { setPersonaElegida({ ...c }); return; }
    try {
      const res = await fetch("/api/prestamos/empleados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empleado_codigo: c.codigo }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { toast(json?.error || "No se pudo abrir la ficha", "error"); return; }
      setPersonaElegida({ ...c, fichaId: json.id });
    } catch { toast("Sin conexión. Intenta de nuevo.", "error"); }
  }

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

  const botonNuevo = puedeAnotar && (
    <button type="button" onClick={() => void abrirNuevoPrestamo()}
      className="min-h-[44px] rounded-md bg-black px-4 text-sm text-white transition active:scale-[0.97]">
      + Nuevo préstamo
    </button>
  );

  const filaDelModulo = personaElegida?.fichaId
    ? datosModulo?.filas.find((f) => f.id === personaElegida.fichaId) ?? null
    : null;

  const modales = (
    <>
      {/* 🔴 SOLO LOS DE LA EMPRESA ELEGIDA ARRIBA (11-sep-2026): la lista y el
          total ya filtraban, el alta ofrecía a las 4. Con «Todas», todos. */}
      <ElegirPersonaModal
        open={eligiendo}
        colaboradores={filtrarPorEmpresa(datosModulo?.colaboradores ?? [], props.empresa)}
        onClose={() => setEligiendo(false)}
        onElegir={(c) => void elegirPersona(c)}
      />
      {personaElegida?.fichaId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPersonaElegida(null)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <NuevoMovimientoModal
              nombre={personaElegida.nombre}
              empleadoId={personaElegida.fichaId}
              saldoPrestamo={filaDelModulo?.saldoPrestamo ?? 0}
              saldoDano={filaDelModulo?.saldoDano ?? 0}
              cuentaMasVieja={filaDelModulo?.cuentaMasVieja ?? null}
              salarioMensual={personaElegida.salarioMensual}
              hoy={hoyPanama()}
              cuotaActual={{ prestamo: filaDelModulo?.cuotaPrestamo ?? 0, terceros: filaDelModulo?.cuotaTerceros ?? 0 }}
              onCancelar={() => setPersonaElegida(null)}
              onGuardar={async (payload) => { await movForm.crear(payload); }}
            />
          </div>
        </div>
      )}
    </>
  );

  if (!fichas.length) {
    // 🔑 Nunca un «$0.00» grande: se dice con palabras qué pasa.
    return (
      <div className="space-y-4">
        {botonNuevo && <div className="flex justify-end">{botonNuevo}</div>}
        <p className="rounded-lg border border-gray-200 px-4 py-6 text-center text-sm text-gray-600">
          Nadie debe nada en este momento.
        </p>
        {modales}
      </div>
    );
  }

  /** El nombre: enlace a sus movimientos para quien puede escribir; texto para quien solo mira. */
  const nombre = (f: FichaDeuda, clase: string) =>
    puedeAnotar
      ? (
        <Link href={enlaceAPrestamos(f.id)} className={`${clase} underline-offset-2 hover:underline`}>
          {capitalizarNombre(f.nombre)} <span className="text-gray-400">›</span>
        </Link>
      )
      : <span className={clase}>{capitalizarNombre(f.nombre)}</span>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          {fichas.length === 1 ? "1 colaborador con deuda" : `${fichas.length} colaboradores con deuda`}
          <span className="text-gray-400"> · </span>
          <span className="text-gray-500">Total </span>
          <span className="font-medium tabular-nums text-gray-900">{money(total)}</span>
        </p>
        {botonNuevo}
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
                  {nombre(f, "text-gray-900")}
                  {/* 🔴 SIN CÓDIGO NO HAY A QUIÉN DESCONTARLE, y se DICE. El
                      amarre es por código y nunca por parecido de nombre. */}
                  {!f.codigo && (
                    <span className="ml-2 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-sm text-amber-800">
                      sin atar a nadie
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{plataOGuion(f.saldoPrestamo)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{plataOGuion(f.saldoDano)}</td>
                {hayTerceros && (
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                    {(f.saldoTerceros ?? 0) > 0 ? money(f.saldoTerceros ?? 0) : <span className="text-gray-400">—</span>}
                  </td>
                )}
                <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">{money(f.saldo)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{plataOGuion(f.cuota + (f.cuotaTerceros ?? 0))}</td>
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
              <p className="text-sm font-medium text-gray-900">{nombre(f, "text-gray-900")}</p>
              <p className="text-sm tabular-nums font-medium text-gray-900">{money(f.saldo)}</p>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {NOMBRE_CUENTA.prestamo} {money(f.saldoPrestamo)} · {NOMBRE_CUENTA.dano} {money(f.saldoDano)}
              {(f.saldoTerceros ?? 0) > 0 && ` · ${NOMBRE_CUENTA.terceros} ${money(f.saldoTerceros ?? 0)}`}
            </p>
            <p className="mt-0.5 text-sm text-gray-500">
              Cuota {money(f.cuota + (f.cuotaTerceros ?? 0))}
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
        El descuento de la quincena lo anota el cierre de la planilla. Aquí van los
        abonos que no salieron del sueldo y los préstamos nuevos; tocando el nombre
        se ven todos los movimientos.
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

      {modales}
    </div>
  );
}

/**
 * Anotar un abono. Cuatro campos: de qué cuenta, cuánto, cuándo y de dónde salió.
 *
 * 🔴 «Quincena» NO está entre los orígenes, y el servidor lo rechaza aunque
 * alguien lo mande a mano: ese origen lo escribe el cierre y solo el cierre.
 * Un abono anotado como Quincena se leería como «ya descontado» y esa quincena
 * no se le descontaría nada a la persona.
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
