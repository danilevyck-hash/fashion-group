"use client";

// Faltas justificadas. La idea es de Daniel y es la que más trabajo ahorra:
// se marca el día que pasa, no al cerrar la quincena — para entonces nadie
// recuerda quién fue al doctor el día 14. También se cargan retroactivas.
//
// Se guarda por RANGO: unas vacaciones son UNA fila, no diez.

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { etiquetaPersona, type PersonaListada } from "@/lib/asistencia/directorio";
import { Ayuda } from "@/components/shared/Ayuda";
import { textoPermiso, ventanaDe } from "@/lib/asistencia/permiso-horas";

interface Justificacion {
  id: string;
  empleado_codigo: string;
  desde: string;
  hasta: string;
  motivo: string;
  nota: string | null;
  registrado_por: string | null;
  /** Opcionales, y van juntas: con las dos es un PERMISO DE HORAS. */
  hora_desde?: string | null;
  hora_hasta?: string | null;
}

const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
function bonito(d: string): string {
  const [a, m, dd] = d.split("-").map(Number);
  return `${dd} ${MESES[m - 1]} ${a}`;
}
const hoyPanama = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

export default function JustificacionesTab() {
  const { toast } = useToast();
  const [lista, setLista] = useState<Justificacion[] | null>(null);
  const [personas, setPersonas] = useState<PersonaListada[]>([]);
  const [motivos, setMotivos] = useState<string[]>([]);
  const [codigo, setCodigo] = useState("");
  const [desde, setDesde] = useState(hoyPanama());
  const [hasta, setHasta] = useState(hoyPanama());
  const [motivo, setMotivo] = useState("");
  const [nota, setNota] = useState("");
  // 🔴 El permiso de HORAS. Vacías = el día entero, que es lo de siempre.
  const [horaDesde, setHoraDesde] = useState("");
  const [horaHasta, setHoraHasta] = useState("");
  const [puedeHoras, setPuedeHoras] = useState(true);
  const [avisoHoras, setAvisoHoras] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // 🩸 UN solo pedido, y las personas vienen del DIRECTORIO. Antes esta lista
  // salía de `/api/asistencia/horarios`, que devuelve el nombre que manda el
  // reloj — vacío en las 3.287 marcaciones cargadas. De ahí salía el
  // desplegable de «15, 16, 17, 21…» que Daniel fotografió.
  const cargar = useCallback(async () => {
    const rj = await fetch("/api/asistencia/justificaciones", { cache: "no-store" });
    const dj = await rj.json();
    setLista(dj.justificaciones ?? []);
    setMotivos(dj.motivos ?? []);
    if (dj.motivos?.length && !motivo) setMotivo(dj.motivos[0]);
    setPersonas(dj.personas ?? []);
    // Sin las columnas corridas, las horas no se ofrecen y se dice de entrada,
    // no al fallar el guardado.
    setPuedeHoras(dj.puedeCargarHoras !== false);
    setAvisoHoras(dj.avisoMigracionHoras ?? null);
  }, [motivo]);
  useEffect(() => { void cargar(); }, [cargar]);

  // El nombre de quien ya tiene una justificación cargada. Si no está en la
  // lista (ficha borrada, código viejo) se muestra el código, nunca un blanco.
  const nombreDe = (cod: string) =>
    etiquetaPersona(cod, personas.find((p) => p.codigo === cod)?.nombre);

  const conNombre = personas.filter((p) => p.configurado);
  const sinNombre = personas.filter((p) => !p.configurado);

  async function agregar() {
    if (!codigo) return toast("Elige la persona", "error");
    if (!motivo) return toast("Elige el motivo", "error");
    if (hasta < desde) return toast("La fecha final es anterior a la inicial", "error");
    // La MISMA función que usa el motor decide si la ventana sirve: una regla
    // escrita dos veces es una regla que se contradice.
    const pidioHoras = horaDesde !== "" || horaHasta !== "";
    if (pidioHoras && !ventanaDe(horaDesde, horaHasta)) {
      return toast("El permiso necesita las DOS horas, y la de fin tiene que ser posterior", "error");
    }
    setGuardando(true);
    try {
      const res = await fetch("/api/asistencia/justificaciones", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, desde, hasta, motivo, nota, horaDesde, horaHasta }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");
      toast("Listo, guardado", "success");
      setNota(""); setCodigo(""); setHoraDesde(""); setHoraHasta("");
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
    } finally { setGuardando(false); }
  }

  async function borrar(id: string) {
    try {
      const res = await fetch(`/api/asistencia/justificaciones?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo borrar");
      await cargar();
    } catch (e) { toast(e instanceof Error ? e.message : "No se pudo borrar", "error"); }
  }

  const campo = "min-h-[44px] w-full rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm";

  return (
    <div className="space-y-5">
      {/* Cuándo conviene cargarlas se aprende una vez: va en el ⓘ. Lo que hay
          que hacer está en el formulario de abajo. */}
      <div className="-ml-2 -mt-2">
        <Ayuda titulo="Cuándo cargar una justificación" etiqueta="Cuándo cargarlas">
          <p>
            Márcalas el día que pasan y la quincena se cierra sola. También puedes
            cargarlas <b>hacia atrás</b>.
          </p>
        </Ayuda>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Persona</label>
            {/* Los que tienen nombre van arriba y alfabéticos; los que todavía
                no, agrupados abajo y por número de verdad (5 antes que 49).
                Siguen siendo ELEGIBLES: son gente que marca y a la que hay que
                poder justificarle un día. Solo se ven como lo que son. */}
            <select value={codigo} onChange={(e) => setCodigo(e.target.value)} className={campo}>
              <option value="">Elegir…</option>
              {conNombre.length > 0 && (
                <optgroup label="Personas">
                  {conNombre.map((p) => (
                    <option key={p.codigo} value={p.codigo}>{p.etiqueta}</option>
                  ))}
                </optgroup>
              )}
              {sinNombre.length > 0 && (
                <optgroup label="Falta ponerles nombre en Configuración">
                  {sinNombre.map((p) => (
                    <option key={p.codigo} value={p.codigo}>Código {p.etiqueta}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Motivo</label>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo}>
              {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Desde</label>
            <input type="date" value={desde} className={campo}
              onChange={(e) => { setDesde(e.target.value); if (hasta < e.target.value) setHasta(e.target.value); }} />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Hasta</label>
            <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className={campo} />
          </div>
          {/* 🔴 EL PERMISO DE HORAS. Vacías = el día entero, que es lo de
              siempre y lo que hace que nada cambie hasta que alguien las use.
              Van al lado de las fechas porque son la MISMA pregunta —¿cuándo?—
              y separarlas haría creer que es otra cosa. */}
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
              Desde qué hora <span className="normal-case text-gray-400">(opcional)</span>
            </label>
            <input type="time" value={horaDesde} disabled={!puedeHoras} className={`${campo} disabled:opacity-40`}
              onChange={(e) => setHoraDesde(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
              Hasta qué hora <span className="normal-case text-gray-400">(opcional)</span>
            </label>
            <input type="time" value={horaHasta} disabled={!puedeHoras} className={`${campo} disabled:opacity-40`}
              onChange={(e) => setHoraHasta(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Nota (opcional)</label>
            <input type="text" value={nota} onChange={(e) => setNota(e.target.value)}
              placeholder="Cita médica, permiso del gerente…" className={campo} />
          </div>
          <button type="button" onClick={() => void agregar()} disabled={guardando}
            className="min-h-[44px] rounded-md bg-black px-4 text-sm text-white transition active:scale-[0.97] disabled:opacity-50">
            {guardando ? "Guardando…" : "Agregar"}
          </button>
        </div>
        {desde !== hasta && (
          <p className="mt-2 text-[12px] text-gray-500">
            Cubre <b>del {bonito(desde)} al {bonito(hasta)}</b> — se guarda como una sola.
          </p>
        )}
        {/* 🔴 LA REGLA SE DICE ANTES DE GUARDAR, no después. La diferencia
            entre «el día entero» y «un permiso de dos horas» es ocho horas de
            sueldo, y no se puede dejar que alguien la descubra el día de pago. */}
        {ventanaDe(horaDesde, horaHasta) ? (
          <p className="mt-2 rounded bg-blue-50 px-2 py-1.5 text-[12px] text-blue-900">
            Es un <b>permiso de horas</b>: perdona los minutos de tardanza que caigan entre las{" "}
            <b>{horaDesde}</b> y las <b>{horaHasta}</b>, y nada más.{" "}
            <b>No justifica el día entero</b> — si la persona no viene, ese día se le sigue
            descontando completo.
          </p>
        ) : (
          <p className="mt-2 text-[12px] text-gray-500">
            Sin horas, se justifica <b>el día entero</b> y no se descuenta nada.
          </p>
        )}
        {avisoHoras && (
          <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[12px] text-amber-800">{avisoHoras}</p>
        )}
      </div>

      {lista === null && <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>}
      {lista?.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-500">Todavía no hay ninguna justificación.</p>
      )}
      {!!lista?.length && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 text-[10.5px] uppercase tracking-wide text-gray-400">
              <th className="px-3 py-2.5 text-left font-medium">Persona</th>
              <th className="px-3 py-2.5 text-left font-medium">Días</th>
              <th className="px-3 py-2.5 text-left font-medium">Motivo</th>
              <th className="px-3 py-2.5 text-left font-medium">Nota</th>
              <th className="px-3 py-2.5 text-left font-medium">Registró</th>
              <th></th>
            </tr></thead>
            <tbody>
              {lista.map((j) => (
                <tr key={j.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 text-gray-900">{nombreDe(j.empleado_codigo)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                    {j.desde === j.hasta ? bonito(j.desde) : `${bonito(j.desde)} — ${bonito(j.hasta)}`}
                  </td>
                  {/* El MISMO texto que usa el reporte (`textoPermiso`): el
                      papel y la pantalla no pueden decir cosas distintas del
                      mismo permiso. */}
                  <td className="px-3 py-2 text-gray-700">
                    {textoPermiso(j.motivo, j.hora_desde, j.hora_hasta)}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{j.nota ?? ""}</td>
                  <td className="px-3 py-2 text-gray-400">{j.registrado_por ?? ""}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => void borrar(j.id)}
                      className="min-h-[44px] rounded-md px-2 text-[13px] text-gray-500 transition hover:bg-red-50 hover:text-red-600">
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
