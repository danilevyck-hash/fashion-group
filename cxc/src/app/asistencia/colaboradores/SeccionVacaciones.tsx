"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * SUS VACACIONES — los días que le corresponden, las cargadas y «+ Vacación».
 *
 * 🔴 EL MISMO ENDPOINT DE SIEMPRE (`/api/asistencia/vacaciones`), con la
 * persona ya puesta. El número sale del MISMO motor que lo calcula en la
 * pestaña: dos motores para el mismo número es cómo nacen dos números.
 *
 * 🔴 NO ES UN SALDO (17-sep-2026). Es lo que le corresponde por antigüedad —30
 * días por cada 11 meses desde su fecha de ingreso— menos lo REGISTRADO acá. El
 * sistema no sabe qué se tomó antes, y por eso el número va SIEMPRE con la
 * línea gris que lo dice. 🔴 No se usa para pagar nada.
 *
 * 🔑 SIN FECHA DE INGRESO NO SE INVENTA UN CERO: se dice qué falta.
 * ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ToastSystem";
import RangoFechas from "@/components/ui/RangoFechas";
import { hoyPanama } from "@/lib/fecha-panama";
import { fmtDate } from "@/lib/format";
import {
  NO_INCLUYE_ANTES,
  textoCorresponden,
  textoDetalle,
  type DiasCorresponden,
} from "@/lib/asistencia/vacaciones-corresponden";
import {
  efectoDelInterruptor,
  PREGUNTA_YA_COBRADAS,
} from "@/lib/asistencia/vacaciones";
import Seccion, { Vacio } from "./Seccion";

interface VacacionFila {
  id: string;
  empleado_codigo: string;
  desde: string;
  hasta: string;
  ya_pagadas: boolean;
}

export default function SeccionVacaciones({ codigo, refresco }: {
  codigo: string; refresco: number;
}) {
  const { toast } = useToast();
  const [lista, setLista] = useState<VacacionFila[]>([]);
  const [corresponden, setCorresponden] = useState<DiasCorresponden | null>(null);
  const [puedeCargar, setPuedeCargar] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const hoy = hoyPanama();
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [yaPagadas, setYaPagadas] = useState(false);

  const leer = useCallback(async () => {
    try {
      const r = await fetch("/api/asistencia/vacaciones", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "");
      const todas = (d.vacaciones ?? []) as VacacionFila[];
      setLista(todas.filter((v) => String(v.empleado_codigo) === String(codigo)));
      const lista = (d.corresponden ?? []) as DiasCorresponden[];
      setCorresponden(lista.find((s) => String(s.codigo) === String(codigo)) ?? null);
      setPuedeCargar(d.puedeCargar !== false);
    } catch {
      setLista([]);
      setCorresponden(null);
    }
  }, [codigo]);

  useEffect(() => { void leer(); }, [leer, refresco]);

  async function agregar() {
    setGuardando(true);
    try {
      const r = await fetch("/api/asistencia/vacaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, desde, hasta, yaPagadas }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar");
      toast("Listo, guardado", "success");
      setAbierto(false);
      setYaPagadas(false);
      await leer();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(id: string) {
    if (!window.confirm("¿Quitar estas vacaciones?")) return;
    try {
      const r = await fetch(`/api/asistencia/vacaciones?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("");
      toast("Listo, quitadas", "success");
      await leer();
    } catch {
      toast("No se pudo quitar. Intenta de nuevo.", "error");
    }
  }

  const detalle = corresponden ? textoDetalle(corresponden) : null;
  const falta = !corresponden || corresponden.dias === null;

  return (
    <Seccion
      titulo="Vacaciones"
      resumen={
        <>
          <span className={falta ? "text-amber-800" : undefined}>
            {corresponden ? textoCorresponden(corresponden) : "Falta la fecha de ingreso"}
            {detalle && <span className="ml-1 text-gray-400">· {detalle}</span>}
          </span>
          {/* 🔴 LA LÍNEA QUE NO SE PUEDE SACAR: sin ella el número se lee como
              un saldo, y nadie sabe qué se tomó antes. En gris, como dato. */}
          {!falta && (
            <span className="mt-0.5 block text-[12px] text-gray-400">{NO_INCLUYE_ANTES}</span>
          )}
        </>
      }
      boton={abierto ? "Cerrar" : "+ Vacación"}
      onBoton={() => setAbierto((v) => !v)}
    >
      {abierto && (
        <div className="mb-3 grid gap-3 rounded-md border border-gray-200 bg-gray-50 p-3">
          <RangoFechas desde={desde} hasta={hasta} label="Días de vacaciones"
            onChange={(d, h) => { setDesde(d); setHasta(h); }} />
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={yaPagadas} className="mt-1 h-4 w-4"
              onChange={(e) => setYaPagadas(e.target.checked)} />
            <span>
              <span className="block text-sm text-gray-900">{PREGUNTA_YA_COBRADAS}</span>
              {/* 🔴 La consecuencia se ve SOLO al marcarla: es lo único que
                  mueve plata, y explicarla siempre era lo que enredaba. */}
              {efectoDelInterruptor(yaPagadas) && (
                <span className="block text-[12px] text-amber-800">
                  {efectoDelInterruptor(yaPagadas)}
                </span>
              )}
            </span>
          </label>
          <div>
            <button type="button" disabled={guardando || !puedeCargar} onClick={() => void agregar()}
              className="min-h-[44px] rounded-md bg-black px-4 text-sm text-white transition active:scale-[0.97] disabled:opacity-40">
              {guardando ? "Guardando…" : "Agregar"}
            </button>
          </div>
        </div>
      )}

      {lista.length === 0 ? (
        <Vacio texto="Todavía no tiene vacaciones cargadas." />
      ) : (
        <ul className="divide-y divide-gray-100">
          {lista.map((v) => (
            <li key={v.id} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm text-gray-900">
                  {fmtDate(v.desde)}{v.hasta !== v.desde ? ` al ${fmtDate(v.hasta)}` : ""}
                </span>
                {v.ya_pagadas && (
                  <span className="block text-[12px] text-amber-800">Ya las había cobrado</span>
                )}
              </span>
              <button type="button" onClick={() => void quitar(v.id)}
                className="min-h-[44px] shrink-0 px-2 text-[13px] text-gray-400 transition hover:text-gray-900">
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  );
}
