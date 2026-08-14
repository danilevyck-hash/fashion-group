"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CREAR / CAMBIAR UNA META.
//
// 🔴 QUIÉN PARTICIPA SE ELIGE DE UNA LISTA, NUNCA SE ESCRIBE.
//
// No es comodidad: es lo único que hace que el avance mida bien. En Switch los
// nombres están cargados de dos formas —`Ana Trejos` y `ANA TREJOS` son la
// misma persona con las ventas partidas en dos— así que una meta armada
// tecleando nombres mediría la MITAD de lo que esa persona vendió, sin un solo
// error a la vista.
//
// La lista viene del servidor YA agrupada por persona (`claveVendedora`), con
// las ventas de los últimos 12 meses al lado para poder reconocer a cada una. Y
// cuando alguien está cargada de varias formas, la fila LO DICE: así, si algún
// día la agrupación juntara a dos personas distintas, se vería acá en vez de
// esconderse dentro de un total.
//
// ⚠️ La lista trae a TODO el que vendió, no "las vendedoras". El sistema no
// decide quién es vendedora — eso lo elige Daniel marcando casillas. (Por eso
// `Angel pizza` aparece: aparece y no se marca.)
//
// Modal con el patrón de la casa: `createPortal` + `inset-0` +
// `useBodyScrollLock`, y SIN `autoFocus` (en iPhone levanta el teclado y tapa
// media pantalla apenas abre).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Check } from "lucide-react";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { fmtMoney } from "@/lib/ventas/format";
import type { VendedoraAgrupada } from "@/lib/multifashion/metas-clave";
import type { MetaConAvance, TipoMeta } from "@/lib/multifashion/metas-lectura";

export interface MetaGuardar {
  id?: string;
  nombre: string;
  desde: string;
  hasta: string;
  objetivo: number;
  tipo: TipoMeta;
  premio: string | null;
  premioMonto: number | null;
  activa: boolean;
  participantes: { clave: string; nombre: string; objetivoIndividual: number | null }[];
}

interface Props {
  meta: MetaConAvance | null;
  vendedoras: VendedoraAgrupada[];
  guardando: boolean;
  onGuardar: (m: MetaGuardar) => void;
  onRetirar: (id: string) => void;
  onCerrar: () => void;
}

const CAMPO =
  "min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-teal-600";

const FMT_MES = new Intl.DateTimeFormat("es-PA", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * A partir de cuántos días sin vender se marca en ámbar.
 *
 * 45 días: más que unas vacaciones largas o una licencia, menos que un
 * trimestre. No la saca de la lista — solo la señala.
 */
const DIAS_PARA_MARCAR_INACTIVA = 45;

function diasDesde(iso: string): number {
  const hoy = Date.now();
  const d = new Date(`${iso}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((hoy - d) / 86_400_000));
}

function inactiva(ultima: string | null): boolean {
  return ultima != null && diasDesde(ultima) > DIAS_PARA_MARCAR_INACTIVA;
}

/** "Última venta: 28 mar 2026 · hace 4 meses" — o que no vendió en el año. */
function textoUltimaVenta(ultima: string | null): string {
  if (ultima == null) return "No vendió en los últimos 12 meses";
  const dias = diasDesde(ultima);
  const fecha = FMT_MES.format(new Date(`${ultima}T12:00:00Z`));
  if (dias <= DIAS_PARA_MARCAR_INACTIVA) return `Última venta: ${fecha}`;
  const meses = Math.floor(dias / 30);
  return meses >= 1
    ? `Última venta: ${fecha} · hace ${meses} ${meses === 1 ? "mes" : "meses"}`
    : `Última venta: ${fecha} · hace ${dias} días`;
}

export function MetaFormModal({
  meta,
  vendedoras,
  guardando,
  onGuardar,
  onRetirar,
  onCerrar,
}: Props) {
  useBodyScrollLock(true);

  const [nombre, setNombre] = useState(meta?.nombre ?? "");
  const [desde, setDesde] = useState(meta?.desde ?? "");
  const [hasta, setHasta] = useState(meta?.hasta ?? "");
  const [objetivo, setObjetivo] = useState(meta ? String(meta.objetivo) : "");
  const [tipo, setTipo] = useState<TipoMeta>(meta?.tipo ?? "grupal");
  const [premio, setPremio] = useState(meta?.premio ?? "");
  const [premioMonto, setPremioMonto] = useState(
    meta?.premioMonto != null ? String(meta.premioMonto) : "",
  );
  const [activa, setActiva] = useState(meta?.activa ?? true);
  const [elegidas, setElegidas] = useState<Set<string>>(
    () => new Set((meta?.participantes ?? []).map((p) => p.clave)),
  );
  const [individuales, setIndividuales] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const p of meta?.participantes ?? []) {
      if (p.objetivoIndividual != null) out[p.clave] = String(p.objetivoIndividual);
    }
    return out;
  });
  const [confirmarRetiro, setConfirmarRetiro] = useState(false);

  /**
   * 🔴 EN UNA META POR VENDEDORA, EL MONTO DEL GRUPO ES LA SUMA DE LOS MONTOS
   * ESCRITOS A MANO — nunca al revés.
   *
   * Daniel: *"las vendedoras no deberian de tener meta individual diferente
   * cuando se abre una nueva meta"* y *"Las metas personales las pongo yo a
   * mano"*. O sea que repartir el monto del grupo entre las participantes está
   * PROHIBIDO. La suma va en la dirección contraria y es solo informativa (y lo
   * que satisface el `objetivo > 0` de la base).
   */
  const sumaIndividuales = useMemo(
    () =>
      [...elegidas].reduce((a, c) => a + (Number(individuales[c]) > 0 ? Number(individuales[c]) : 0), 0),
    [elegidas, individuales],
  );

  /** A cuántas elegidas les falta su monto (solo aplica a metas por vendedora). */
  const sinMonto = useMemo(
    () => [...elegidas].filter((c) => !(Number(individuales[c]) > 0)).length,
    [elegidas, individuales],
  );

  const objetivoEfectivo = tipo === "vendedora" ? sumaIndividuales : Number(objetivo);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onCerrar]);

  const alternar = (clave: string) => {
    setElegidas((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });
  };

  // Lo que falta para poder guardar, dicho con todas las letras: un botón
  // apagado sin explicación es una trampa (regla de la casa).
  const falta = useMemo(() => {
    const f: string[] = [];
    if (nombre.trim() === "") f.push("el nombre");
    if (desde === "") f.push("desde cuándo");
    if (hasta === "") f.push("hasta cuándo");
    if (desde !== "" && hasta !== "" && hasta < desde) f.push("un fin posterior al inicio");
    if (tipo === "grupal" && !(Number(objetivo) > 0)) f.push("el monto");
    if (tipo === "vendedora") {
      if (elegidas.size === 0) f.push("al menos una vendedora");
      // Cada monto se escribe a mano: sin él no hay meta que medir, y NO se
      // rellena con el del grupo (sería inventarle un objetivo a alguien).
      else if (sinMonto > 0)
        f.push(sinMonto === 1 ? "el monto de una vendedora" : `el monto de ${sinMonto} vendedoras`);
    }
    return f;
  }, [nombre, desde, hasta, objetivo, tipo, elegidas, sinMonto]);

  const guardar = () => {
    if (falta.length > 0 || guardando) return;
    onGuardar({
      id: meta?.id,
      nombre: nombre.trim(),
      desde,
      hasta,
      objetivo: objetivoEfectivo,
      tipo,
      premio: premio.trim() === "" ? null : premio.trim(),
      premioMonto: premioMonto.trim() === "" ? null : Number(premioMonto),
      activa,
      participantes: [...elegidas].map((clave) => {
        const v = vendedoras.find((x) => x.clave === clave);
        const ind = individuales[clave];
        return {
          clave,
          nombre: v?.nombre ?? meta?.participantes.find((p) => p.clave === clave)?.nombre ?? clave,
          objetivoIndividual: tipo === "vendedora" && ind && Number(ind) > 0 ? Number(ind) : null,
        };
      }),
    });
  };

  // Al editar, alguien que participa puede no aparecer en la lista de los
  // últimos 12 meses (dejó de vender). No se la puede perder en silencio: se
  // suma al final para poder verla y, si hace falta, desmarcarla.
  const listado = useMemo(() => {
    const conocidas = new Set(vendedoras.map((v) => v.clave));
    const extras = (meta?.participantes ?? [])
      .filter((p) => !conocidas.has(p.clave))
      .map<VendedoraAgrupada>((p) => ({
        clave: p.clave,
        nombre: p.nombre,
        formas: [p.nombre],
        ventas: 0,
        documentos: 0,
        ultimaVenta: null,
      }));
    return [...vendedoras, ...extras];
  }, [vendedoras, meta]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div
        data-medir="meta-form"
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl bg-white sm:max-w-[560px] sm:rounded-xl"
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-950">
            {meta ? "Cambiar la meta" : "Nueva meta"}
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div>
            <label htmlFor="meta-nombre" className="mb-1 block text-xs font-medium text-gray-700">
              Nombre de la meta
            </label>
            <input
              id="meta-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Meta del viaje"
              className={CAMPO}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="meta-desde" className="mb-1 block text-xs font-medium text-gray-700">
                Desde
              </label>
              <input
                id="meta-desde"
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className={CAMPO}
              />
            </div>
            <div>
              <label htmlFor="meta-hasta" className="mb-1 block text-xs font-medium text-gray-700">
                Hasta
              </label>
              <input
                id="meta-hasta"
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className={CAMPO}
              />
            </div>
          </div>

          {/* 🔴 En una meta POR VENDEDORA no se pide un monto de grupo: cada
              una lleva el suyo, escrito a mano más abajo. Pedir uno acá
              invitaría justo a lo que Daniel prohibió — repartirlo entre
              ellas. Lo que se muestra es la SUMA, que va en la dirección
              contraria y es solo informativa. */}
          {tipo === "grupal" ? (
            <div>
              <label htmlFor="meta-objetivo" className="mb-1 block text-xs font-medium text-gray-700">
                Monto a alcanzar entre todas
              </label>
              <input
                id="meta-objetivo"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={objetivo}
                onChange={(e) => setObjetivo(e.target.value)}
                placeholder="420000"
                className={`${CAMPO} font-mono tabular-nums`}
              />
              <p className="mt-1 text-xs text-gray-500">
                Es la venta de mostrador sin ITBMS, con los descuentos ya aplicados y las
                devoluciones restadas — el mismo número que muestra el Resumen.
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
              <p className="text-xs font-medium text-gray-700">
                El monto de cada vendedora se pone abajo, una por una
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Entre todas suman{" "}
                <span className="font-mono tabular-nums text-gray-800">
                  {fmtMoney(sumaIndividuales)}
                </span>
                . Es la venta de mostrador sin ITBMS, con los descuentos ya aplicados y las
                devoluciones restadas.
              </p>
            </div>
          )}

          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-gray-700">Tipo de meta</legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["grupal", "Entre todas", "Se suma lo que venden todas juntas."],
                  ["vendedora", "Cada una la suya", "Cada vendedora tiene su propio monto."],
                ] as const
              ).map(([valor, rotulo, ayuda]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setTipo(valor)}
                  className={`min-h-[44px] flex-1 rounded-md border px-3 py-2 text-left text-xs transition active:scale-[0.97] ${
                    tipo === valor
                      ? "border-teal-600 bg-teal-50 text-teal-900"
                      : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                  }`}
                >
                  <span className="block font-medium">{rotulo}</span>
                  <span className="block text-gray-500">{ayuda}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="meta-premio" className="mb-1 block text-xs font-medium text-gray-700">
                Premio <span className="font-normal text-gray-400">(opcional)</span>
              </label>
              <input
                id="meta-premio"
                value={premio}
                onChange={(e) => setPremio(e.target.value)}
                placeholder="Un viaje para todas"
                className={CAMPO}
              />
            </div>
            <div>
              <label htmlFor="meta-premio-monto" className="mb-1 block text-xs font-medium text-gray-700">
                Cuánto vale <span className="font-normal text-gray-400">(opcional)</span>
              </label>
              <input
                id="meta-premio-monto"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={premioMonto}
                onChange={(e) => setPremioMonto(e.target.value)}
                placeholder="2000"
                className={`${CAMPO} font-mono tabular-nums`}
              />
            </div>
          </div>

          {/* ── Participantes: SIEMPRE de la lista ────────────────────── */}
          <div>
            <p className="mb-1 text-xs font-medium text-gray-700">
              Quiénes participan{" "}
              <span className="font-normal text-gray-500">
                ({elegidas.size} {elegidas.size === 1 ? "elegida" : "elegidas"})
              </span>
            </p>
            <p className="mb-2 text-xs text-gray-500">
              {tipo === "grupal"
                ? "Si no marcas a nadie, la meta cuenta toda la venta de la tienda."
                : "Marca a cada vendedora y ponle su monto (si lo dejas vacío, usa el monto de arriba)."}
            </p>

            <ul className="divide-y divide-gray-100 overflow-hidden rounded-md border border-gray-200">
              {listado.map((v) => {
                const marcada = elegidas.has(v.clave);
                return (
                  <li key={v.clave}>
                    <button
                      type="button"
                      onClick={() => alternar(v.clave)}
                      aria-pressed={marcada}
                      className={`flex min-h-[44px] w-full items-center gap-2.5 px-3 py-2 text-left transition ${
                        marcada ? "bg-teal-50" : "bg-white hover:bg-gray-50"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                          marcada ? "border-teal-600 bg-teal-600 text-white" : "border-gray-300 bg-white"
                        }`}
                      >
                        {marcada && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-gray-900">{v.nombre}</span>
                        {/* 🔴 DESDE CUÁNDO NO VENDE. Varias de las que aparecen
                            con ventas grandes ya no trabajan (Witney Miranda
                            vendió por última vez el 28-mar-2026). Sin esta
                            línea es facilísimo colgar en la meta del viaje a
                            alguien que ya no está. El sistema NO la filtra
                            solo: lo dice, y elige Daniel. */}
                        <span
                          className={`block text-xs ${
                            inactiva(v.ultimaVenta) ? "font-medium text-amber-700" : "text-gray-500"
                          }`}
                        >
                          {textoUltimaVenta(v.ultimaVenta)}
                        </span>
                        {/* 🔑 Cuando Switch la tiene escrita de varias formas, se
                            dice. Si la agrupación juntara a dos personas
                            distintas, se vería ACÁ en vez de esconderse. */}
                        {v.formas.length > 1 && (
                          <span className="block text-xs text-gray-500">
                            En Switch está escrita de {v.formas.length} formas: {v.formas.join(" · ")}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-gray-500">
                        {fmtMoney(v.ventas)}
                      </span>
                    </button>

                    {marcada && tipo === "vendedora" && (
                      <div className="flex items-center gap-2 border-t border-gray-100 bg-gray-50 px-3 py-2">
                        <label htmlFor={`obj-${v.clave}`} className="text-xs text-gray-600">
                          Su monto
                        </label>
                        <input
                          id={`obj-${v.clave}`}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={individuales[v.clave] ?? ""}
                          onChange={(e) =>
                            setIndividuales((p) => ({ ...p, [v.clave]: e.target.value }))
                          }
                          placeholder={objetivo || "el monto de arriba"}
                          className="min-h-[44px] w-40 rounded-md border border-gray-300 px-2 py-1 font-mono text-sm tabular-nums outline-none focus:border-teal-600"
                        />
                      </div>
                    )}
                  </li>
                );
              })}
              {listado.length === 0 && (
                <li className="px-3 py-3 text-xs text-gray-500">
                  Todavía no hay ventas con vendedora asignada en los últimos 12 meses.
                </li>
              )}
            </ul>
          </div>

          <label className="flex min-h-[44px] items-center gap-2.5 text-sm text-gray-800">
            <input
              type="checkbox"
              checked={activa}
              onChange={(e) => setActiva(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            La meta está andando
          </label>
        </div>

        <footer className="border-t border-gray-200 px-4 py-3">
          {falta.length > 0 && (
            <p className="mb-2 text-xs text-amber-800">Falta: {falta.join(", ")}.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={guardar}
              disabled={falta.length > 0 || guardando}
              className="min-h-[44px] flex-1 rounded-md bg-black px-4 text-sm font-medium text-white transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {guardando ? "Guardando…" : meta ? "Guardar cambios" : "Crear la meta"}
            </button>
            {meta &&
              (confirmarRetiro ? (
                <button
                  type="button"
                  onClick={() => onRetirar(meta.id)}
                  className="min-h-[44px] rounded-md border border-rose-300 bg-rose-50 px-3 text-sm font-medium text-rose-800 transition active:scale-[0.97]"
                >
                  Sí, retirar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmarRetiro(true)}
                  className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition active:scale-[0.97] hover:border-gray-400"
                >
                  Retirar
                </button>
              ))}
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
