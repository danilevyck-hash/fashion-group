"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Cuentas por cobrar en la computadora, «como lo haría Apple» (4-oct-2026,
// propuesta, `CXC_APPLE_2026_10`). Lo primero que se lee es la respuesta del
// día: cuánto hay por cobrar y cuánto tiene más de 90 días; a la derecha, de
// cuándo es el dato y cómo traerlo de nuevo. Los números son los MISMOS de la
// tira (mismo universo `kpiClients`): aquí solo se suman.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import type { ConsolidatedClient } from "@/lib/types";
import { fmt } from "@/lib/format";
import LineaDeFrescura from "@/components/shared/LineaDeFrescura";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { opcionesActualizarCxc, saldoMas90 } from "@/lib/cxc/apple-2026-10";

interface Props {
  clientes: ConsolidatedClient[];
  companyFilter: string;
  onSuccess: () => void;
}

export default function CabeceraCxcApple({ clientes, companyFilter, onSuccess }: Props) {
  const { total, mas90 } = useMemo(() => {
    let total = 0, mas90 = 0;
    for (const c of clientes) {
      total += c.total;
      if (c.total > 0) mas90 += saldoMas90(c);
    }
    return { total, mas90 };
  }, [clientes]);

  return (
    <div data-cabecera-cxc-apple className="mb-5 flex items-end justify-between gap-4">
      <div>
        <p className="text-[34px] font-normal leading-none tracking-tight tabular-nums text-gray-800">${fmt(total)}</p>
        <p className="pt-2 text-sm text-gray-500">
          <span className="text-red-600 tabular-nums">+90 días ${fmt(mas90)}</span>
          {" · "}
          {clientes.length} {clientes.length === 1 ? "cliente" : "clientes"}
        </p>
      </div>
      <LineaDeFrescura
        forma="computadora"
        tabla="estadocuenta"
        empresas={CXC_GRUPO_EMPRESA_KEYS}
        opciones={opcionesActualizarCxc(companyFilter)}
        secuencial={companyFilter === "all"}
        onSuccess={onSuccess}
      />
    </div>
  );
}
