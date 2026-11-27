"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Proveedores (celular), MANTENER PRESIONADA UNA EMPRESA (27-nov-2026,
// `MANTENER_PRESIONADO_2026_11`, mockup 03): lo que ENTRÓ de mercancía cada
// mes (costo CIF) contra el año pasado. 🔴 Flechas en GRIS: comprar más o
// menos no es bueno ni malo. Nunca «vencido». Un mes sin costo CIF en Switch
// se dibuja «—», nunca $0 (Fashion Shoes antes de jul-2026).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { ERROR_TARJETA, TarjetaMesAMes } from "@/components/shared/TarjetaMesAMes";
import { cambioEnGris, mesEnCursoDelCorte } from "@/lib/ventas/mes-a-mes";
import { notaDelCorte, type MesesContraAnioPasado } from "@/lib/mes-contra-anio-pasado";
import { montoDeLaTabla } from "@/lib/ventas/celular";

type Datos = MesesContraAnioPasado & { sinDatos?: boolean };
type Estado = { status: "cargando" } | { status: "listo"; datos: Datos } | { status: "error" };

export const SIN_INGRESOS = "Esta empresa no trae sus ingresos de mercancía al sistema.";

const leidas = new Map<string, Datos>();

/** La línea chica: qué se suma, el corte y, si falta, que Switch no trae el costo. */
export function notaDeCompras(d: MesesContraAnioPasado): string {
  const sinCosto = d.meses.some((m) => m.actual == null || m.previo == null);
  const corte = notaDelCorte(d.corte);
  return [
    "Ingresos de mercancía a costo CIF.",
    corte,
    sinCosto ? "«—» = Switch no trae el costo CIF de ese mes." : null,
  ].filter(Boolean).join(" ");
}

export default function TarjetaComprasEmpresa({
  empresaKey,
  nombre,
  porPagar,
  onAbrir,
  onCerrar,
}: {
  empresaKey: string;
  nombre: string;
  /** «Por pagar $1,207,531», el mismo texto de la fila. */
  porPagar: string;
  onAbrir: () => void;
  onCerrar: () => void;
}) {
  const url = `/api/proveedores/compras-mes-a-mes?empresa=${encodeURIComponent(empresaKey)}`;
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
        return (await r.json()) as Datos;
      })
      .then((d) => { leidas.set(url, d); if (vivo) setEstado({ status: "listo", datos: d }); })
      .catch(() => { if (vivo) setEstado({ status: "error" }); });
    return () => { vivo = false; };
  }, [url]);
  const sinDatos = estado.status === "listo" && !!estado.datos.sinDatos;
  const d = estado.status === "listo" && !sinDatos ? estado.datos : null;
  const anio = d?.anio ?? new Date().getFullYear();
  return (
    <TarjetaMesAMes
      titulo={nombre}
      subtitulo={`Por pagar ${porPagar} · Compras ${anio} vs ${anio - 1}`}
      meses={d?.meses ?? []}
      total={d ? d.total : null}
      rotuloTotal={`Comprado ${anio}`}
      anio={anio}
      formato={montoDeLaTabla}
      cambio={cambioEnGris}
      mesEnCurso={d ? mesEnCursoDelCorte(d.anio, d.corte) : null}
      nota={d ? notaDeCompras(d) : null}
      cargando={estado.status === "cargando"}
      error={estado.status === "error" ? ERROR_TARJETA : sinDatos ? SIN_INGRESOS : null}
      onAbrir={onAbrir}
      onCerrar={onCerrar}
    />
  );
}
