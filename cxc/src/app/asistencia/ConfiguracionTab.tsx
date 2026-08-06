"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN — quién es cada código del reloj y con qué números se calcula.
//
// Es la pantalla que DESBLOQUEA la planilla quincenal, y son dos cosas:
//
// 1. PERSONAS. El reloj manda códigos numéricos (1, 5, 6, 7… hasta 53) con el
//    nombre en blanco. Acá el código 6 se vuelve una persona con sueldo,
//    jornada y EMPRESA. La empresa es lo que más pesa: Confecciones Boston,
//    Vistana y Fashion Wear comparten el mismo reloj, así que sin ese dato los
//    minutos de las tres salen en un solo montón y no hay planilla posible.
//
// 2. REGLAS. Daniel: *"todos los calculos deben de ser configurables en caso de
//    que algo cambie"*. Todos los números del cálculo se editan acá.
//
// Los 37 códigos que ya marcan aparecen SIEMPRE, configurados o no, y los que
// faltan van primero: la pantalla tiene que mostrar el trabajo pendiente, no
// esconderlo detrás de una lista vacía.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import {
  EMPRESAS_ASISTENCIA,
  JORNADAS,
  etiquetaEmpresa,
  type ReglasAsistencia,
} from "@/lib/asistencia/config";

interface Persona {
  codigo: string;
  nombre: string | null;
  salarioMensual: number | null;
  jornadaSemanal: number;
  empresa: string | null;
  configurado: boolean;
  faltaSalario: boolean;
  marcaciones: number;
  ultimaMarca: string | null;
  rataHora: number | null;
  valorMinuto: number | null;
}

interface Resumen {
  total: number;
  sinConfigurar: number;
  sinSalario: number;
  conMarcaciones: number;
}

interface Datos {
  personas: Persona[];
  reglas: ReglasAsistencia;
  resumen: Resumen;
  faltaMigracion: boolean;
  avisoMigracion: string | null;
}

/** El formulario guarda TEXTO: hay que poder borrar un campo para reescribirlo.
 *  La conversión y el rango los decide el servidor, nunca esta pantalla. */
type FormReglas = Record<keyof ReglasAsistencia, string>;

const CAMPO =
  "min-h-[44px] w-full rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm";
const PILL_BASE =
  "min-h-[44px] rounded-md border px-3 text-sm transition active:scale-[0.97]";
const PILL_ON = "border-black bg-black text-white";
const PILL_OFF = "border-gray-200 text-gray-600 hover:border-gray-400";

const money = (n: number | null, dec = 2) =>
  n === null ? "—" : `$${n.toLocaleString("es-PA", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;

function reglasAForm(r: ReglasAsistencia): FormReglas {
  return {
    toleranciaTardanzaMin: String(r.toleranciaTardanzaMin),
    extraMinimoMin: String(r.extraMinimoMin),
    almuerzoDefaultMin: String(r.almuerzoDefaultMin),
    recargoExtraDiurno: String(r.recargoExtraDiurno),
    recargoExtraNocturno: String(r.recargoExtraNocturno),
    horaCorteNocturno: r.horaCorteNocturno,
    recargoDomingoFeriado: String(r.recargoDomingoFeriado),
    divisor40: String(r.divisor40),
    divisor48: String(r.divisor48),
    seguroSocialPct: String(r.seguroSocialPct),
    seguroEducativoPct: String(r.seguroEducativoPct),
    excedenteHorasDia: String(r.excedenteHorasDia),
    recargoExcedenteNocturnaMixta: String(r.recargoExcedenteNocturnaMixta),
  };
}

export default function ConfiguracionTab() {
  const { toast } = useToast();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "faltan" | string>("todos");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  // Borrador de la persona que se está editando.
  const [bNombre, setBNombre] = useState("");
  const [bSalario, setBSalario] = useState("");
  const [bJornada, setBJornada] = useState<number>(48);
  const [bEmpresa, setBEmpresa] = useState<string>("");

  const [form, setForm] = useState<FormReglas | null>(null);
  const [guardandoReglas, setGuardandoReglas] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/asistencia/configuracion", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudo cargar");
      setDatos(d as Datos);
      setForm(reglasAForm(d.reglas));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setDatos(null);
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  function abrir(p: Persona) {
    if (abierta === p.codigo) {
      setAbierta(null);
      return;
    }
    setAbierta(p.codigo);
    setBNombre(p.nombre ?? "");
    setBSalario(p.salarioMensual === null ? "" : String(p.salarioMensual));
    setBJornada(p.jornadaSemanal);
    setBEmpresa(p.empresa ?? "");
  }

  async function guardarPersona(codigo: string) {
    setGuardando(codigo);
    try {
      const res = await fetch("/api/asistencia/configuracion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo,
          nombre: bNombre,
          // Se manda el texto TAL CUAL: el servidor decide qué es un salario
          // válido. Convertir acá con Number() haría que un campo vacío viajara
          // como 0 y un 0 no puede entrar.
          salarioMensual: bSalario,
          jornadaSemanal: bJornada,
          empresa: bEmpresa,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");
      toast("Listo, guardado", "success");
      setAbierta(null);
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
    } finally {
      setGuardando(null);
    }
  }

  async function guardarReglas() {
    if (!form) return;
    setGuardandoReglas(true);
    try {
      const res = await fetch("/api/asistencia/configuracion/reglas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");
      toast("Listo, las reglas quedaron guardadas", "success");
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
    } finally {
      setGuardandoReglas(false);
    }
  }

  const visibles = useMemo(() => {
    const lista = datos?.personas ?? [];
    if (filtro === "todos") return lista;
    if (filtro === "faltan") return lista.filter((p) => !p.configurado || p.faltaSalario);
    return lista.filter((p) => p.empresa === filtro);
  }, [datos, filtro]);

  const set = (k: keyof ReglasAsistencia, v: string) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="space-y-6">
      {datos?.faltaMigracion && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900">
          <b>Falta un paso antes de poder guardar.</b>
          <p className="mt-1">{datos.avisoMigracion}</p>
          <p className="mt-1 text-amber-800">
            Mientras tanto puedes ver la lista de gente que marca, pero lo que escribas
            no se va a guardar.
          </p>
        </div>
      )}

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {datos === null && !error && (
        <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>
      )}

      {datos && (
        <>
          {/* ── PERSONAS ─────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Personas</h2>
              <p className="mt-1 text-sm text-gray-500">
                El reloj solo manda un número por persona. Acá le pones nombre, sueldo y
                <b> a qué empresa pertenece</b> — eso último es lo que separa la planilla de
                Boston, la de Vistana y la de Fashion Wear, que comparten el mismo reloj.
              </p>
            </div>

            {datos.resumen.sinConfigurar > 0 && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                <b>{datos.resumen.sinConfigurar}</b> de {datos.resumen.total}{" "}
                {datos.resumen.sinConfigurar === 1 ? "persona marca" : "personas marcan"} en el
                reloj y todavía no {datos.resumen.sinConfigurar === 1 ? "está" : "están"}{" "}
                configurada{datos.resumen.sinConfigurar === 1 ? "" : "s"}. Sin esto no sale su planilla.
              </p>
            )}
            {datos.resumen.sinSalario > 0 && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                <b>{datos.resumen.sinSalario}</b> sin salario. Ya tienen empresa, pero les falta
                el sueldo para poder calcular.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setFiltro("todos")}
                className={`${PILL_BASE} ${filtro === "todos" ? PILL_ON : PILL_OFF}`}>
                Todos ({datos.resumen.total})
              </button>
              <button type="button" onClick={() => setFiltro("faltan")}
                className={`${PILL_BASE} ${filtro === "faltan" ? PILL_ON : PILL_OFF}`}>
                Falta configurar ({datos.resumen.sinConfigurar + datos.resumen.sinSalario})
              </button>
              {EMPRESAS_ASISTENCIA.map((e) => (
                <button key={e} type="button" onClick={() => setFiltro(e)}
                  className={`${PILL_BASE} ${filtro === e ? PILL_ON : PILL_OFF}`}>
                  {etiquetaEmpresa(e)} ({datos.personas.filter((p) => p.empresa === e).length})
                </button>
              ))}
            </div>

            {visibles.length === 0 && (
              <p className="py-10 text-center text-sm text-gray-500">
                No hay nadie en este filtro.
              </p>
            )}

            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              {visibles.map((p) => (
                <div key={p.codigo} className="border-b border-gray-100 last:border-0">
                  <button type="button" onClick={() => abrir(p)}
                    className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-gray-50">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-gray-900">
                        {p.nombre ?? <span className="text-gray-400">Sin nombre</span>}
                        <span className="ml-1.5 text-xs text-gray-400">código {p.codigo}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-gray-500">
                        {p.empresa ? (
                          <span>{etiquetaEmpresa(p.empresa)}</span>
                        ) : (
                          <span className="font-medium text-amber-700">Falta la empresa</span>
                        )}
                        <span>{p.jornadaSemanal} h/semana</span>
                        {p.salarioMensual !== null ? (
                          <span className="tabular-nums">{money(p.salarioMensual)} al mes</span>
                        ) : (
                          <span className="font-medium text-amber-700">Falta el salario</span>
                        )}
                        {p.rataHora !== null && (
                          <span className="tabular-nums text-gray-400">
                            {money(p.rataHora, 4)} la hora
                          </span>
                        )}
                        <span className="text-gray-400">
                          {p.marcaciones} marcaciones
                          {p.ultimaMarca ? ` · última ${p.ultimaMarca}` : ""}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 text-[12px]">
                      {!p.configurado ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
                          Falta
                        </span>
                      ) : (
                        <span className="text-gray-300">Listo</span>
                      )}
                    </span>
                  </button>

                  {abierta === p.codigo && (
                    <div className="border-t border-gray-100 bg-gray-50 px-3 py-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
                            Nombre
                          </label>
                          <input type="text" value={bNombre} onChange={(e) => setBNombre(e.target.value)}
                            placeholder="Ángela García" className={CAMPO} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
                            Salario mensual
                          </label>
                          <input type="text" inputMode="decimal" value={bSalario}
                            onChange={(e) => setBSalario(e.target.value)}
                            placeholder="850.00" className={`${CAMPO} tabular-nums`} />
                          <p className="mt-1 text-[11px] text-gray-400">
                            Déjalo vacío si todavía no lo sabes.
                          </p>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
                            Jornada por semana
                          </label>
                          <div className="flex gap-2">
                            {JORNADAS.map((j) => (
                              <button key={j} type="button" onClick={() => setBJornada(j)}
                                className={`${PILL_BASE} tabular-nums ${bJornada === j ? PILL_ON : PILL_OFF}`}>
                                {j} horas
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
                            Empresa
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {EMPRESAS_ASISTENCIA.map((e) => (
                              <button key={e} type="button" onClick={() => setBEmpresa(e)}
                                className={`${PILL_BASE} ${bEmpresa === e ? PILL_ON : PILL_OFF}`}>
                                {etiquetaEmpresa(e)}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void guardarPersona(p.codigo)}
                          disabled={guardando === p.codigo}
                          className="min-h-[44px] rounded-md bg-black px-4 text-sm text-white transition active:scale-[0.97] disabled:opacity-50">
                          {guardando === p.codigo ? "Guardando…" : "Guardar esta persona"}
                        </button>
                        <button type="button" onClick={() => setAbierta(null)}
                          className="min-h-[44px] rounded-md border border-gray-300 px-4 text-sm text-gray-700 transition hover:border-black active:scale-[0.97]">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ── REGLAS ───────────────────────────────────────────────────── */}
          {form && (
            <section className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Reglas del cálculo</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Todos los números con los que se calcula. Si la ley o un acuerdo cambia,
                  se cambia acá y el reporte lo usa de inmediato — no hay que tocar el sistema.
                </p>
              </div>

              <Bloque titulo="Tardanzas, almuerzo y horas extra">
                <Campo label="Tolerancia de tardanza" ayuda="Minutos de gracia a la entrada. Pasados, la tardanza se cuenta desde las 8:00."
                  sufijo="minutos" valor={form.toleranciaTardanzaMin}
                  onChange={(v) => set("toleranciaTardanzaMin", v)} />
                <Campo label="Mínimo para contar hora extra" ayuda="Quedarse menos de esto no cuenta como extra."
                  sufijo="minutos" valor={form.extraMinimoMin}
                  onChange={(v) => set("extraMinimoMin", v)} />
                <Campo label="Almuerzo por defecto" ayuda="Se usa para quien no tenga uno propio en Horarios."
                  sufijo="minutos" valor={form.almuerzoDefaultMin}
                  onChange={(v) => set("almuerzoDefaultMin", v)} />
              </Bloque>

              <Bloque titulo="Recargos">
                <Campo label="Hora extra de día" ayuda="Se escribe como factor: 1.25 es la hora y cuarto."
                  valor={form.recargoExtraDiurno} onChange={(v) => set("recargoExtraDiurno", v)} />
                <Campo label="Hora extra de noche" ayuda="Aplica pasada la hora de corte de abajo."
                  valor={form.recargoExtraNocturno} onChange={(v) => set("recargoExtraNocturno", v)} />
                <Campo label="Hora de corte de la tarde"
                  ayuda="Hasta esta hora la extra va al recargo de día; desde el minuto siguiente al de noche. Es la misma frontera que marca la jornada nocturna."
                  valor={form.horaCorteNocturno} onChange={(v) => set("horaCorteNocturno", v)} />
                <Campo label="Domingos y feriados" ayuda="También es un factor."
                  valor={form.recargoDomingoFeriado} onChange={(v) => set("recargoDomingoFeriado", v)} />
              </Bloque>

              {/* 🩸 ANTES DECÍA "Divisores" Y LA CONTABLE NO LO ENTENDIÓ. Revisó el
                  cuadro entero, validó todo y se trabó justo acá: *"no sé a qué se
                  refiere eso de divisores"*. Ella es una de las tres personas que
                  usa esta pantalla (contabilidad tiene el módulo), así que la
                  etiqueta estaba mal, no ella. Y la lógica ya la tiene —dijo *"la
                  rata de hora depende de la cantidad de horas laborables a la
                  semana"*—, solo faltaba decirlo en su idioma.

                  ⚠️ El nombre TÉCNICO sigue siendo `divisor40` / `divisor48`, en el
                  código y en las columnas `divisor_40` / `divisor_48` de la base.
                  Se deja a propósito: renombrar la columna pediría otra migración a
                  mano y no cambiaría nada de lo que la contable lee. Lo que importa
                  es la etiqueta. */}
              <Bloque
                titulo="Horas que se trabajan al mes"
                ayuda="El salario mensual se divide entre estas horas para sacar la rata por hora."
              >
                <Campo label="40 horas por semana" ayuda="Total de horas al mes de quien trabaja 40 horas por semana."
                  sufijo="al mes" valor={form.divisor40} onChange={(v) => set("divisor40", v)} />
                <Campo label="48 horas por semana" ayuda="Total de horas al mes de quien trabaja 48 horas por semana."
                  sufijo="al mes" valor={form.divisor48} onChange={(v) => set("divisor48", v)} />
              </Bloque>

              <Bloque titulo="Descuentos de ley">
                <Campo label="Seguro social" ayuda="En por ciento." sufijo="%"
                  valor={form.seguroSocialPct} onChange={(v) => set("seguroSocialPct", v)} />
                <Campo label="Seguro educativo" ayuda="En por ciento." sufijo="%"
                  valor={form.seguroEducativoPct} onChange={(v) => set("seguroEducativoPct", v)} />
              </Bloque>

              <Bloque
                titulo="Excedente en jornada nocturna o mixta"
                nota="Se guarda, pero TODAVÍA NO SE USA para calcular nada. Aplica a partir de la cuarta hora extra del día y solo pasada la hora de corte de arriba — las dos condiciones a la vez. La hora es la MISMA de arriba, por eso no se pide otra vez. Ojo: no es lo mismo que la columna &quot;Exedente de 9 horas&quot; del Excel viejo."
              >
                <Campo label="Desde cuántas horas extra al día" ayuda="3 quiere decir que aplica desde la cuarta hora extra."
                  sufijo="horas" valor={form.excedenteHorasDia}
                  onChange={(v) => set("excedenteHorasDia", v)} />
                <Campo label="Recargo del excedente" ayuda="Factor confirmado por la contable: 2.625, que es 1.5 × 1.75."
                  valor={form.recargoExcedenteNocturnaMixta}
                  onChange={(v) => set("recargoExcedenteNocturnaMixta", v)} />
              </Bloque>

              {/* ⛔ Se dice en la pantalla para que nadie lo pida como campo: son
                  la FORMA del cálculo, no números sueltos. Ver `config.ts`. */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h3 className="text-sm font-medium text-gray-900">Esto no se cambia desde acá</h3>
                <ul className="mt-1 space-y-1 text-[12px] leading-relaxed text-gray-600">
                  <li>· La ausencia se descuenta como horas × valor de la hora.</li>
                  <li>· La quincena va del 1 al 15 y del 16 al 30.</li>
                  <li>· El día 31 no se paga, pero sí se descuenta si se falta.</li>
                </ul>
                <p className="mt-1.5 text-[12px] text-gray-500">
                  No son números: es la forma del cálculo. Si alguna vez cambia, se cambia
                  en el sistema — así nadie rompe la planilla sin querer.
                </p>
              </div>

              <button type="button" onClick={() => void guardarReglas()} disabled={guardandoReglas}
                className="min-h-[44px] rounded-md bg-black px-4 text-sm text-white transition active:scale-[0.97] disabled:opacity-50">
                {guardandoReglas ? "Guardando…" : "Guardar las reglas"}
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Bloque({
  titulo, ayuda, nota, children,
}: { titulo: string; ayuda?: string; nota?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-medium text-gray-900">{titulo}</h3>
      {/* `ayuda` explica; `nota` advierte. Van en colores distintos a propósito:
          si todo fuera ámbar, nada llamaría la atención. */}
      {ayuda && <p className="mt-1 text-[12px] leading-relaxed text-gray-500">{ayuda}</p>}
      {nota && <p className="mt-1 text-[12px] text-amber-800">{nota}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Campo({
  label, ayuda, sufijo, valor, onChange,
}: {
  label: string;
  ayuda: string;
  sufijo?: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">{label}</label>
      <div className="flex items-center gap-2">
        <input type="text" inputMode="decimal" value={valor}
          onChange={(e) => onChange(e.target.value)} className={`${CAMPO} tabular-nums`} />
        {sufijo && <span className="shrink-0 text-[12px] text-gray-400">{sufijo}</span>}
      </div>
      <p className="mt-1 text-[11px] text-gray-400">{ayuda}</p>
    </div>
  );
}
