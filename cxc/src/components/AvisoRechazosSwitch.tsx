/**
 * LA LÍNEA que dice qué documento se quedó afuera del total.
 *
 * El texto lo arma UN solo lugar (`src/lib/rechazos-de-switch.ts`); acá solo se
 * dibuja. Si cada pantalla escribiera su mensaje, la que quedara vieja diría
 * otra cosa — y son varias superficies.
 *
 * **En ÁMBAR, no en rojo.** No se rompió nada: el total de arriba es correcto y
 * está protegido. El rojo se lee como "algo falló acá", y el problema está EN
 * SWITCH. Mismo criterio que el aviso de la migración pendiente de Recordatorios.
 *
 * **Si no hay nada rechazado, no se dibuja NADA** (`texto === null`). Un cartel
 * permanente se deja de leer a la semana.
 */
export default function AvisoRechazosSwitch({
  texto,
  className = "",
}: {
  texto: string | null | undefined;
  className?: string;
}) {
  if (!texto) return null;
  return (
    <p
      data-aviso="rechazos-switch"
      className={`flex items-start gap-1.5 text-sm text-amber-700 ${className}`}
    >
      <span aria-hidden="true">⚠️</span>
      <span>{texto}</span>
    </p>
  );
}
