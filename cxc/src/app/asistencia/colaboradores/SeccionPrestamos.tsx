"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * LO QUE DEBE — préstamo, daño de mercancía y terceros, desglosado.
 *
 * 🔴 SE REUSA EL MÓDULO DE PRÉSTAMOS TAL CUAL. Esta sección LEE de
 * `/api/asistencia/prestamos-deuda` —la misma ruta que ya alimenta la pestaña
 * Préstamos y la casilla de la planilla— y para ESCRIBIR manda al módulo
 * `/prestamos`, que es donde viven la ficha, el historial y las aprobaciones.
 *
 * 🔴 «+ Préstamo» NO abre un formulario acá: lleva a la pestaña Préstamos con
 * ESTA persona ya elegida (`enlaceANuevoPrestamo`, 11-sep-2026 — 🩸 antes caía
 * en la lista general y había que volver a buscarla). Un segundo lugar para
 * crear un préstamo sería un segundo camino a la misma plata — que es
 * exactamente el defecto que costó $95,00 de diferencia entre el módulo y la
 * casilla de la planilla en agosto. (La aprobación de Daniel se retiró el
 * 11-sep-2026: ya no hay nada que aprobar.)
 * ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
// 🔴 El destino lo decide el interruptor: con la pestaña prendida el módulo
// suelto ya no existe, y un enlace a una dirección que redirige es un rebote
// de más. Sigue sin haber una tercera copia: acá se MUESTRA y se enlaza.
import { enlaceANuevoPrestamo, enlaceAPrestamos } from "@/lib/prestamos-una-puerta";

import { desgloseDeuda, textoDeuda } from "@/lib/asistencia/ficha-persona";
import Seccion, { Vacio } from "./Seccion";

interface FichaDeuda {
  id: string;
  codigo: string;
  saldo: number;
  saldoPrestamo: number;
  saldoDano: number;
  saldoTerceros?: number;
  cuota: number;
  cuotaDano: number;
  cuotaTerceros?: number;
}

export default function SeccionPrestamos({ codigo, refresco }: { codigo: string; refresco: number }) {
  const [ficha, setFicha] = useState<FichaDeuda | null>(null);
  const [listo, setListo] = useState(false);

  const leer = useCallback(async () => {
    try {
      // Sin ventana: el SALDO es histórico y no se recorta por fecha.
      const r = await fetch("/api/asistencia/prestamos-deuda?desde=&hasta=", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "");
      const lista = (d.fichas ?? []) as FichaDeuda[];
      setFicha(lista.find((f) => String(f.codigo) === String(codigo)) ?? null);
    } catch {
      setFicha(null);
    } finally {
      setListo(true);
    }
  }, [codigo]);

  useEffect(() => { void leer(); }, [leer, refresco]);

  const filas = ficha
    ? desgloseDeuda({
      prestamo: ficha.saldoPrestamo,
      dano: ficha.saldoDano,
      terceros: ficha.saldoTerceros,
    })
    : [];

  return (
    <Seccion
      titulo="Préstamos"
      resumen={listo ? textoDeuda(ficha?.saldo ?? 0) : "…"}
      boton={null}
    >
      {/* 🔑 El desglose SOLO con las cuentas que tienen algo: tres ceros debajo
          de «No debe nada» es una fila de ceros que no dice nada. */}
      {filas.length > 0 ? (
        <dl className="space-y-1">
          {filas.map((f) => (
            <div key={f.clave} className="flex items-baseline justify-between gap-3">
              <dt className="text-[13px] text-gray-600">{f.etiqueta}</dt>
              <dd className="text-[13px] tabular-nums text-gray-900">{f.valor}</dd>
            </div>
          ))}
        </dl>
      ) : (
        listo && <Vacio texto="Sin nada pendiente." />
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {/* 🔴 LOS DOS BOTONES LLEVAN AL MÓDULO DE PRÉSTAMOS, no abren un
            formulario propio: ahí viven la ficha y los movimientos. El primero
            llega con ESTA persona ya elegida. */}
        <Link href={enlaceANuevoPrestamo(codigo)}
          className="inline-flex min-h-[44px] items-center rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black">
          + Préstamo
        </Link>
        {ficha && (
          <Link href={enlaceAPrestamos(ficha.id)}
            className="inline-flex min-h-[44px] items-center px-1 text-sm text-gray-500 transition hover:text-gray-900">
            Ver movimientos ›
          </Link>
        )}
      </div>
    </Seccion>
  );
}
