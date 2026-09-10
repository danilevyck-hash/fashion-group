"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * SUS VACACIONES — el saldo, las cargadas y «+ Vacación».
 *
 * 🔴 EL MISMO ENDPOINT DE SIEMPRE (`/api/asistencia/vacaciones`), con la
 * persona ya puesta. El saldo sale del MISMO motor que lo calculaba en la
 * pestaña: dos motores para el mismo saldo es cómo nacen dos números.
 *
 * 🔑 SIN SALDO NO SE INVENTA UN CERO. El saldo lo carga contabilidad junto con
 * su fecha de corte; sin los dos, la sección dice qué falta y lleva a cargarlo,
 * nunca «0 días» — que sería afirmar que ya se las gastó.
 * ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ToastSystem";
import RangoFechas from "@/components/ui/RangoFechas";
import { hoyPanama } from "@/lib/fecha-panama";
import { fmtDate } from "@/lib/format";
import {
  textoDetalle,
  textoSaldo,
  type SaldoVacaciones,
} from "@/lib/asistencia/saldo-vacaciones";
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
  const [saldo, setSaldo] = useState<SaldoVacaciones | null>(null);
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
      const saldos = (d.saldos ?? []) as SaldoVacaciones[];
      setSaldo(saldos.find((s) => String(s.codigo) === String(codigo)) ?? null);
      setPuedeCargar(d.puedeCargar !== false);
    } catch {
      setLista([]);
      setSaldo(null);
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

  const detalle = saldo ? textoDetalle(saldo) : null;
  const falta = !saldo || saldo.saldo === null || saldo.falta !== null;

  return (
    <Seccion
      titulo="Vacaciones"
      resumen={
        <span className={falta ? "text-amber-800" : undefined}>
          {saldo ? textoSaldo(saldo) : "Falta el saldo"}
          {detalle && <span className="ml-1 text-gray-400">· {detalle}</span>}
        </span>
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
