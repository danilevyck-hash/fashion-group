"use client";

// ============================================================================
// LA PORTADA DE MARKETING: TIENDAS · MARCAS · IMPULSADORAS · MOBILIARIO
// (23-sep-2026, Tiendas y Marcas — mockup aprobado por Daniel).
//
//   TIENDAS      — dónde se gasta. Abre acá. Cada fila lleva a su ficha.
//   MARCAS       — a quién se le pasa: la portada Abiertos | Cerrados que ya
//                  existía, sin la tarjeta «Herramientas».
//   IMPULSADORAS — la pantalla de siempre, adentro de la pestaña.
//   MOBILIARIO   — es una página propia: la pestaña LLEVA ahí.
//
// 🩸 «Reportes» desapareció de la pantalla: por tienda ES la pestaña Tiendas,
// por marca ES la página de la marca. Patrón `mayor_lineas`: las vistas
// (`ReportePorMarcaView`, `ReportePorTiendaView`) y su ruta se quedan, sin
// puerta. Un `?vista=reportes` viejo cae en Tiendas.
//
// La pestaña vive en la URL (`?tab=`) y es un filtro del MISMO nivel:
// `replace`, para que Atrás no cicle entre pestañas. Un botón «＋ Gasto»
// arriba, y nada más: solo quien ESCRIBE lo ve (`puedeEscribirMarketing`).
// ============================================================================

import { useRouter } from "next/navigation";
import { useUrlState } from "@/lib/hooks/useUrlState";
import type { MkMarca } from "@/lib/marketing/types";
import { puedeEscribirMarketing, TEXTO_SOLO_LECTURA } from "@/lib/marketing/roles";
import {
  HREF_MOBILIARIO,
  PESTANAS_TIENDAS_Y_MARCAS,
  PESTANA_INICIAL,
  ROTULO_PESTANA_TM,
  esPestanaTiendasYMarcas,
  type PestanaTiendasYMarcas,
} from "@/lib/marketing/tiendas-y-marcas";
import { MARKETING_CELULAR } from "@/lib/marketing/celular";
import PortadaTiendas from "./PortadaTiendas";
import PortadaAbiertosCerrados from "./PortadaAbiertosCerrados";
import ImpulsadorasView from "./ImpulsadorasView";

interface Props {
  role: string;
  marcas: MkMarca[];
  refreshKey: number;
  onRegistrarGasto: () => void;
  /** Abre una marca (nivel 2). */
  onSelectBloque: (key: string) => void;
  /** Abre un período cerrado (nivel 3). */
  onSelectCerrado: (bloqueKey: string, periodoId: string) => void;
}

export default function PortadaTiendasYMarcas({
  role,
  marcas,
  refreshKey,
  onRegistrarGasto,
  onSelectBloque,
  onSelectCerrado,
}: Props) {
  const router = useRouter();
  const [tabRaw, setTab] = useUrlState<PestanaTiendasYMarcas>("tab", PESTANA_INICIAL);
  const tab: PestanaTiendasYMarcas = esPestanaTiendasYMarcas(tabRaw) ? tabRaw : PESTANA_INICIAL;
  const escribe = puedeEscribirMarketing(role);

  const elegir = (p: PestanaTiendasYMarcas) => {
    // Mobiliario es otra página: drill-down con push, Atrás vuelve acá.
    if (p === "mobiliario") {
      router.push(HREF_MOBILIARIO);
      return;
    }
    setTab(p);
  };

  // 🔴 EN EL CELULAR LA PORTADA ES TIENDAS, Y LAS OTRAS TRES SON RENGLONES AL
  // FINAL (24-sep-2026, 1a): ni barra de pestañas ni botón suelto arriba. La
  // pestaña sigue viviendo en `?tab=`, así que Atrás se porta igual que hoy.
  const cel = MARKETING_CELULAR;
  const hrefVolverACelular = "/marketing";

  return (
    <div className="space-y-5">
      <div className={`flex items-center justify-end gap-4${cel ? " hidden sm:flex" : ""}`}>
        <h1 className="sr-only">Marketing</h1>
        {escribe ? (
          <button
            type="button"
            onClick={onRegistrarGasto}
            className="rounded-md bg-black text-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition shrink-0"
          >
            ＋ Gasto
          </button>
        ) : (
          <span className="text-xs text-gray-500 rounded-md border border-gray-200 px-2 py-1">
            {TEXTO_SOLO_LECTURA}
          </span>
        )}
      </div>

      <div
        className={`flex items-center gap-1 border-b border-gray-200 overflow-x-auto${cel ? " hidden sm:flex" : ""}`}
        role="tablist"
      >
        {PESTANAS_TIENDAS_Y_MARCAS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={tab === p}
            onClick={() => elegir(p)}
            className={`inline-flex min-h-[44px] items-center px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === p
                ? "border-fuchsia-500 text-fuchsia-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {ROTULO_PESTANA_TM[p]}
          </button>
        ))}
      </div>

      {tab === "tiendas" && (
        <PortadaTiendas
          refreshKey={refreshKey}
          celular={cel ? { escribe, onRegistrarGasto } : null}
        />
      )}
      {tab === "marcas" && (
        <PortadaAbiertosCerrados
          onSelectBloque={onSelectBloque}
          onSelectCerrado={onSelectCerrado}
          onRegistrarGasto={onRegistrarGasto}
          refreshKey={refreshKey}
          sinHerramientas
          sinBotonDeGasto
          celular={cel ? { escribe, hrefVolver: hrefVolverACelular } : null}
        />
      )}
      {tab === "impulsadoras" && (
        <ImpulsadorasView
          marcas={marcas}
          escribe={escribe}
          celular={cel ? { hrefVolver: hrefVolverACelular } : null}
        />
      )}
    </div>
  );
}
