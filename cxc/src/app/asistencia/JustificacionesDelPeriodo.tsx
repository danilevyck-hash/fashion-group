"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * LAS JUSTIFICACIONES DEL PERÍODO — dentro de Reporte (10-sep-2026).
 *
 * 🔴 Daniel, corrigiendo dónde iban a parar las vistas de «todos»: *«Reporte es
 * para otra cosa»*. Ésta SÍ pertenece acá y por un motivo concreto: una
 * justificación EXPLICA una ausencia del reporte. Es la misma pregunta mirada
 * desde el otro lado.
 *
 * 🔴 PERO NO MEZCLADA ADENTRO DE LA TABLA NI COMO UN BLOQUE SUELTO: es una
 * VISTA propia, que se abre desde un enlace al lado de la tabla y se cierra.
 * Mezclarla adentro habría metido filas que no son días medidos en una tabla de
 * once columnas que sí lo son.
 *
 * 🔴 ACÁ SOLO SE MIRA Y SE QUITA. **Agregar** una justificación se hace desde la
 * página de la persona («+ Justificar», con ella ya puesta): un segundo
 * formulario con selector de persona es el campo donde se equivoca quien
 * justifica de apuro, y es justamente lo que el acomodo nuevo vino a sacar.
 * ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";
import { empresaParaPedir } from "@/lib/asistencia/empresa-para-todo";
import Link from "next/link";

import { useToast } from "@/components/ToastSystem";
import { fmtDate } from "@/lib/format";
import { etiquetaPersona, type PersonaListada } from "@/lib/asistencia/directorio";
import { capitalizarNombre } from "@/lib/nombre-en-pantalla";
import { rutaDePersona } from "@/lib/asistencia/persona-en-el-centro";
import { textoPermiso } from "@/lib/asistencia/permiso-horas";

interface Justificacion {
  id: string;
  empleado_codigo: string;
  desde: string;
  hasta: string;
  motivo: string;
  nota: string | null;
  /** Las horas de una Constancia por horas (11-sep-2026). Sin ellas, el día completo. */
  hora_desde?: string | null;
  hora_hasta?: string | null;
}

export default function JustificacionesDelPeriodo({ desde, hasta, empresa = "", refresco = 0 }: {
  empresa?: string;
  desde: string; hasta: string;
  /** Sube cuando se guardó una justificación desde la fila del día (11-sep-2026): se vuelve a leer. */
  refresco?: number;
}) {
  const { toast } = useToast();
  const [lista, setLista] = useState<Justificacion[] | null>(null);
  const [personas, setPersonas] = useState<PersonaListada[]>([]);
  // 🩸 ARRANCA PLEGADA: el enlace se ve, la lista no.
  const [abierta, setAbierta] = useState(false);

  const leer = useCallback(async () => {
    try {
      // 🔑 SE ACOTA AL PERÍODO QUE SE ESTÁ MIRANDO, con el mismo solapamiento
      // que ya sabía hacer la ruta: unas vacaciones que arrancan antes del
      // rango igual cubren días de adentro.
      const r = await fetch(
        `/api/asistencia/justificaciones?desde=${desde}&hasta=${hasta}${empresaParaPedir(empresa) ? `&empresa=${encodeURIComponent(empresaParaPedir(empresa)!)}` : ""}`,
        { cache: "no-store" },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "");
      setLista((d.justificaciones ?? []) as Justificacion[]);
      setPersonas((d.personas ?? []) as PersonaListada[]);
    } catch {
      setLista([]);
    }
  }, [desde, hasta, empresa]);

  useEffect(() => { void leer(); }, [leer, refresco]);

  async function quitar(id: string) {
    if (!window.confirm("¿Quitar esta justificación?")) return;
    try {
      const r = await fetch(`/api/asistencia/justificaciones?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("");
      toast("Listo, quitada", "success");
      await leer();
    } catch {
      toast("No se pudo quitar. Intenta de nuevo.", "error");
    }
  }

  const nombreDe = (codigo: string) => {
    const p = personas.find((x) => String(x.codigo) === String(codigo));
    // 🔴 Solo cambia cómo se MUESTRA; lo guardado sigue en mayúsculas.
    return capitalizarNombre(etiquetaPersona(codigo, p?.nombre ?? null));
  };

  // 🔴 SIN JUSTIFICACIONES NO SE DIBUJA NADA — ni el título (10-sep-2026,
  // Daniel revisó la pantalla: un título sobre nada es una palabra de más).
  // Mientras carga tampoco: un enlace que aparece y desaparece distrae.
  if (lista === null || lista.length === 0) return null;

  return (
    <>
      <button type="button" onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="min-h-[44px] text-sm text-gray-500 underline-offset-2 transition hover:text-gray-900 hover:underline">
        {abierta ? "Ocultar las justificaciones" : `Justificaciones del período (${lista.length})`}
      </button>
      {abierta && (
    <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
      {lista.map((j) => (
        <li key={j.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
          <span className="min-w-0">
            {/* El nombre LLEVA a su página: desde acá se ve algo raro y se va
                a arreglarlo donde vive. */}
            <Link href={rutaDePersona(j.empleado_codigo)}
              className="block truncate text-sm text-gray-900 underline-offset-2 hover:underline">
              {nombreDe(j.empleado_codigo)}
            </Link>
            <span className="block text-[12px] text-gray-500">
              {textoPermiso(j.motivo, j.hora_desde, j.hora_hasta)} · {fmtDate(j.desde)}
              {j.hasta !== j.desde ? ` al ${fmtDate(j.hasta)}` : ""}
              {j.nota ? ` · ${j.nota}` : ""}
            </span>
          </span>
          <button type="button" onClick={() => void quitar(j.id)}
            className="min-h-[44px] shrink-0 px-2 text-[13px] text-gray-400 transition hover:text-gray-900">
            Quitar
          </button>
        </li>
      ))}
    </ul>
      )}
    </>
  );
}
