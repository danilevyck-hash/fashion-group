"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * LOS DÍAS LIBRES DE LA EMPRESA — lo que debe y de qué días salió.
 *
 * 🔴 NO ES UN PRÉSTAMO Y POR ESO ESTÁ APARTE. Un préstamo es plata que la
 * empresa entregó y se descuenta del sueldo; esto es un día que la empresa
 * REGALÓ, y las 8 horas que quedó debiendo se pagan SOLO con horas extra —
 * nunca del sueldo, y no se descuentan de la liquidación (Daniel dijo «no»,
 * explícito). Juntarlas en la misma sección haría que alguien las descuente.
 *
 * 🔑 Solo se DIBUJA cuando debe algo o cuando tiene días cargados: una sección
 * que dice «no debe nada» en las 49 fichas es una sección que se deja de leer.
 *
 * La regla entera vive en `lib/asistencia/dia-libre-empresa.ts`.
 * ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";

import {
  ROTULO_SALDO,
  textoSaldoDiaLibre,
  TITULO_DIA_LIBRE,
  type DeudaDiaLibre,
  type SaldoDiaLibre,
} from "@/lib/asistencia/dia-libre-empresa";
import { fechaCorta } from "@/lib/asistencia/planilla";
import Seccion from "./Seccion";

const plata = (n: number): string => `$${Number(n ?? 0).toFixed(2)}`;

export default function SeccionDiaLibre({ codigo, refresco }: { codigo: string; refresco: number }) {
  const [saldo, setSaldo] = useState<SaldoDiaLibre | null>(null);
  const [dias, setDias] = useState<DeudaDiaLibre[]>([]);

  const leer = useCallback(async () => {
    try {
      const r = await fetch("/api/asistencia/dia-libre", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "");
      const lista = (d.saldos ?? []) as SaldoDiaLibre[];
      setSaldo(lista.find((s) => String(s.codigo) === String(codigo)) ?? null);
      setDias(((d.deudas ?? []) as DeudaDiaLibre[])
        .filter((x) => String(x.empleado_codigo) === String(codigo)));
    } catch {
      // 🔴 Falla ABIERTA: sin la migración corrida —o sin red— la sección no se
      // dibuja y la ficha queda exactamente como estaba. Nunca un «$0.00».
      setSaldo(null);
      setDias([]);
    }
  }, [codigo]);

  useEffect(() => { void leer(); }, [leer, refresco]);

  if (!saldo && dias.length === 0) return null;
  const texto = textoSaldoDiaLibre(saldo);

  return (
    <Seccion
      titulo={ROTULO_SALDO}
      resumen={<span title={TITULO_DIA_LIBRE}>{texto ?? "Ya saldó las horas de sus días libres."}</span>}
      boton={null}
    >
      {dias.length > 0 && (
        <dl className="space-y-1">
          {dias.map((d) => (
            <div key={`${d.fecha}-${d.monto}`} className="flex items-baseline justify-between gap-3">
              <dt className="text-[13px] text-gray-600">{fechaCorta(d.fecha)}</dt>
              <dd className="text-[13px] tabular-nums text-gray-900">{plata(d.monto)}</dd>
            </div>
          ))}
          {saldo && saldo.pagado > 0 && (
            <div className="flex items-baseline justify-between gap-3 border-t border-gray-100 pt-1">
              <dt className="text-[13px] text-gray-600">Ya pagado con horas extra</dt>
              <dd className="text-[13px] tabular-nums text-gray-900">−{plata(saldo.pagado)}</dd>
            </div>
          )}
        </dl>
      )}
    </Seccion>
  );
}
