"use client";

// Los ÚLTIMOS 5 PAGOS de un cliente en UNA empresa, al tocar el monto de
// «Últ. pago» (propuesta 18-nov-2026, mismo estilo que el detalle de la compra).
// 🔴 Se lee SOLO al tocar: este componente se monta al abrirse. La ruta es la de
// siempre (`/api/cxc/ultimos-pagos`, la que alimenta `pagos-por-fecha.ts`): sin
// retenciones ni recibos en cero, empresa por empresa, Boston afuera.
// ⚠️ Switch no da el N.º de recibo en el reporte que se sincroniza
// (`sync-recibos.ts`): la línea es fecha · monto.
import { useEffect, useState } from "react";
import Link from "next/link";
import { fmt, fmtDate } from "@/lib/format";
import { ERROR_PAGOS, CARGANDO_PAGOS, SIN_PAGOS, type PagoReciente } from "@/lib/cxc/ultimos-pagos";

export function ListaPagosEmpresa({ codigo, empresa }: { codigo: string; empresa: string }) {
  const [pagos, setPagos] = useState<PagoReciente[] | null | "error">(null);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/cxc/ultimos-pagos?codigo=${encodeURIComponent(codigo)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const body = (await r.json()) as { porEmpresa?: Record<string, PagoReciente[]> };
        if (vivo) setPagos(body.porEmpresa?.[empresa] ?? []);
      })
      .catch(() => { if (vivo) setPagos("error"); });
    return () => { vivo = false; };
  }, [codigo, empresa]);

  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-[12px] tabular-nums">
      <p className="mb-1 font-semibold text-gray-700">Últimos pagos</p>
      {pagos === null ? (
        <p className="py-1 text-gray-500">{CARGANDO_PAGOS}</p>
      ) : pagos === "error" ? (
        <p className="py-1 text-red-600">{ERROR_PAGOS}</p>
      ) : pagos.length === 0 ? (
        <p className="py-1 text-gray-500">{SIN_PAGOS}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {pagos.map((p, i) => (
            <li key={`${p.fecha}-${i}`} className="flex justify-between gap-4 py-1">
              <span className="text-gray-600">{fmtDate(p.fecha)}</span>
              <span className="text-gray-900">${fmt(p.monto)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 border-t border-gray-300 pt-1 text-right">
        <Link href={`/clientes/${encodeURIComponent(codigo)}`} className="text-blue-600 hover:underline">
          Ver todos en la ficha ›
        </Link>
      </p>
    </div>
  );
}
