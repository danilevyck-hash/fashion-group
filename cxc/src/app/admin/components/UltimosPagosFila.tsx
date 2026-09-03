"use client";

import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import UltimosPagos from "@/components/cxc/UltimosPagos";
import { useUltimosPagosGrupo } from "../hooks/useUltimosPagosGrupo";

/**
 * Los últimos 3 pagos de UN cliente del CXC DEL GRUPO, un bloque POR EMPRESA.
 * Es el ÚNICO lugar donde se dibujan en el grupo: lo montan la sub-fila de
 * escritorio (`ClientTable`) y la tarjeta de celular (`PanelCxcMobile`),
 * debajo del botón «Últimos pagos ›» de la fila CERRADA.
 *
 * Daniel (3-sep-2026): *"no me interesa saber qué factura pagó, solo ver sus
 * últimos 3 pagos y fecha"* y, al verlo adentro del panel expandido: *"lo
 * quiero ahí mismo pero con un botón para expandir, no solo al expandir el
 * card, tendría que hacer dos expandir para verlo"*. Por eso el bloque salió
 * del panel expandido (`ContactPanel` / `MobileClientExpanded`): dos lugares
 * eran dos estados del mismo dato, y con los dos abiertos se veían los mismos
 * tres pagos dos veces.
 *
 * Se pide SOLO cuando `abierto` es verdadero (el clic en el botón): en
 * escritorio esta sub-fila vive montada para los 211 clientes aunque esté
 * cerrada, y pedir los pagos de todos de golpe se acercaría al tope de 1.000
 * filas que corta en silencio. Una vez leído se queda: cerrar y volver a abrir
 * no vuelve a pedir.
 *
 * No se mezclan en una sola lista: un cliente con tres empresas ve tres
 * bloques, cada uno con sus tres.
 *
 * 🔴 Es la lectura del GRUPO (`useUltimosPagosGrupo` → `/api/cxc/ultimos-pagos`).
 * Boston tiene la suya y no comparten ni una función de consulta.
 */
export default function UltimosPagosFila({
  client,
  companyFilter,
  roleCompanies,
  abierto,
  apilado = false,
}: {
  client: ConsolidatedClient;
  companyFilter: string;
  roleCompanies: Company[];
  /** El botón de la fila está abierto: recién ahí se piden los pagos. */
  abierto: boolean;
  /** En celular los bloques van uno debajo del otro, no en fila. */
  apilado?: boolean;
}) {
  // Las empresas donde el cliente EXISTE (con saldo cero también: el que pagó
  // todo la semana pasada es justo el caso interesante), respetando el filtro.
  const visibleCompanies = companyFilter !== "all"
    ? roleCompanies.filter((co) => co.key === companyFilter && client.companies[co.key])
    : roleCompanies.filter((co) => client.companies[co.key]);

  // Código del cliente (mismo D-XXX en todas las empresas).
  const codigo = Object.values(client.companies).find((c) => c?.codigo)?.codigo ?? null;

  const ultimosPagos = useUltimosPagosGrupo(codigo, abierto);

  if (visibleCompanies.length === 0) return null;

  return (
    <div className={apilado ? "flex flex-col gap-2" : "flex flex-wrap gap-2"}>
      {visibleCompanies.map((co) => (
        <UltimosPagos
          key={co.key}
          empresa={roleCompanies.length > 1 ? co.name : undefined}
          pagos={ultimosPagos.de(co.key)}
        />
      ))}
    </div>
  );
}
