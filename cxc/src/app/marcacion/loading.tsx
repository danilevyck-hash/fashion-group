import DelayedSkeleton from "@/components/DelayedSkeleton";
import EsqueletoMarcacion from "./EsqueletoMarcacion";

// Loading instantáneo de /marcacion mientras el SERVIDOR arma el estado (las
// marcas de la quincena de esa persona). Mismo molde que las otras seis
// pantallas de la casa: `DelayedSkeleton` para que en una carga rápida no
// aparezca ni un gris, y un esqueleto que espeja la estructura.
//
// 🔴 El esqueleto es el MISMO que usa `MarcacionClient` cuando el dato tiene
// que venir del navegador: uno solo, en `EsqueletoMarcacion.tsx`.
export default function Loading() {
  return (
    <DelayedSkeleton>
      <EsqueletoMarcacion />
    </DelayedSkeleton>
  );
}
