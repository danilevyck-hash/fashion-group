"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CxC (celular), MANTENER PRESIONADO UN CLIENTE (27-nov-2026,
// `MANTENER_PRESIONADO_2026_11`, mockups 02 y 05 aprobados por Daniel):
//   · arriba, la tarjeta mes a mes de siempre (`TarjetaMesAMes`) con lo que
//     PAGÓ este año contra el año pasado (`/api/cxc/pagos-mes-a-mes`, o la de
//     Boston en su cartera: solo Boston);
//   · debajo, como en Contactos del iPhone: Llamar · WhatsApp · Copiar código.
//     Los teléfonos del directorio; sin teléfono, esa opción no sale; WhatsApp
//     solo con un celular de Panamá.
// Tocar la tarjeta abre «Cobrar», como el toque del renglón.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Copy, MessageCircle, Phone } from "lucide-react";
import { ERROR_TARJETA, TarjetaMesAMes } from "@/components/shared/TarjetaMesAMes";
import { cambioConRaya, mesEnCursoDelCorte } from "@/lib/ventas/mes-a-mes";
import { notaDelCorte, type MesesContraAnioPasado } from "@/lib/mes-contra-anio-pasado";
import { esCelularPanama, telHref, waHref } from "@/lib/contact-links";
import { montoExacto } from "@/lib/cxc/lista-celular";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";

export interface PagosDelCliente extends MesesContraAnioPasado {
  telefono: string;
  celular: string;
  /** Las empresas que se sumaron (el vendedor ve solo la suya). Boston no lo manda. */
  empresas?: string[];
}

type Estado = { status: "cargando" } | { status: "listo"; datos: PagosDelCliente } | { status: "error" };

// Una lectura por cliente y visita (la tarjeta se puede abrir varias veces).
const leidas = new Map<string, PagosDelCliente>();

/** La ruta de cada cartera: el grupo y Boston NUNCA se mezclan. */
export function urlPagosMesAMes(codigo: string, cartera: "grupo" | "boston"): string {
  const c = encodeURIComponent(codigo);
  return cartera === "boston" ? `/api/cxc/boston/pagos-mes-a-mes?codigo=${c}` : `/api/cxc/pagos-mes-a-mes?codigo=${c}`;
}

/** La línea chica de abajo: de dónde sale y el corte del mes en curso. */
export function notaDePagos(d: PagosDelCliente, cartera: "grupo" | "boston"): string {
  const de = cartera === "boston"
    ? "Confecciones Boston"
    : d.empresas && d.empresas.length === 1
      ? EMPRESA_KEY_TO_NAME[d.empresas[0]] ?? d.empresas[0]
      : "Las 6 empresas";
  const corte = notaDelCorte(d.corte);
  return `${de}, sin retenciones ni recibos en cero.${corte ? ` ${corte}` : ""}`;
}

export default function TarjetaPagosCliente({
  nombre,
  codigo,
  saldo,
  cartera,
  onAbrir,
  onCerrar,
}: {
  nombre: string;
  codigo: string;
  saldo: number;
  cartera: "grupo" | "boston";
  onAbrir?: () => void;
  onCerrar: () => void;
}) {
  const url = urlPagosMesAMes(codigo, cartera);
  const [estado, setEstado] = useState<Estado>(() => {
    const ya = leidas.get(url);
    return ya ? { status: "listo", datos: ya } : { status: "cargando" };
  });
  useEffect(() => {
    if (leidas.has(url)) return;
    let vivo = true;
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as PagosDelCliente;
      })
      .then((d) => { leidas.set(url, d); if (vivo) setEstado({ status: "listo", datos: d }); })
      .catch(() => { if (vivo) setEstado({ status: "error" }); });
    return () => { vivo = false; };
  }, [url]);

  const d = estado.status === "listo" ? estado.datos : null;
  const anio = d?.anio ?? new Date().getFullYear();
  return (
    <TarjetaMesAMes
      titulo={nombre}
      subtitulo={`Saldo ${montoExacto(saldo)} · Pagos ${anio} vs ${anio - 1}`}
      meses={d?.meses ?? []}
      total={d ? d.total : null}
      rotuloTotal={`Pagado ${anio}`}
      anio={anio}
      cambio={cambioConRaya}
      mesEnCurso={d ? mesEnCursoDelCorte(d.anio, d.corte) : null}
      nota={d ? notaDePagos(d, cartera) : null}
      cargando={estado.status === "cargando"}
      error={estado.status === "error" ? ERROR_TARJETA : null}
      onAbrir={onAbrir}
      onCerrar={onCerrar}
      debajo={<MenuDelCliente codigo={codigo} telefono={d?.telefono ?? ""} celular={d?.celular ?? ""} />}
    />
  );
}

/** Llamar · WhatsApp · Copiar código. Solo lo que se puede hacer. */
export function MenuDelCliente({ codigo, telefono, celular }: { codigo: string; telefono: string; celular: string }) {
  const [copiado, setCopiado] = useState(false);
  const paraLlamar = celular || telefono;
  const llamar = telHref(paraLlamar);
  const movil = [celular, telefono].find((t) => esCelularPanama(t));
  const whatsapp = movil ? waHref(movil) : null;
  const fila = "flex min-h-[48px] w-full items-center gap-3 px-4 text-left text-[17px] text-gray-900 active:bg-gray-100";
  return (
    <ul data-menu-cliente className="mx-6 divide-y divide-gray-200 overflow-hidden rounded-2xl bg-white/95 shadow-2xl backdrop-blur animate-slideDown">
      {llamar && (
        <li>
          <a href={llamar} className={fila}>
            <span className="min-w-0 flex-1 truncate">Llamar <span className="text-[15px] text-gray-500">{paraLlamar}</span></span>
            <Phone className="h-5 w-5 shrink-0" aria-hidden />
          </a>
        </li>
      )}
      {whatsapp && (
        <li>
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={fila}>
            <span className="flex-1">WhatsApp</span>
            <MessageCircle className="h-5 w-5 shrink-0" aria-hidden />
          </a>
        </li>
      )}
      <li>
        <button
          type="button"
          className={fila}
          onClick={() => {
            void navigator.clipboard?.writeText(codigo).then(() => setCopiado(true)).catch(() => undefined);
          }}
        >
          <span className="min-w-0 flex-1 truncate">{copiado ? "Código copiado" : "Copiar código"} <span className="text-[15px] text-gray-500">{codigo}</span></span>
          <Copy className="h-5 w-5 shrink-0" aria-hidden />
        </button>
      </li>
    </ul>
  );
}
