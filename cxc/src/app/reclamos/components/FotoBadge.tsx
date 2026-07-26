interface FotoBadgeProps {
  count: number;
  className?: string;
}

/**
 * Badge discreto con el número de fotos de un reclamo.
 * Sin fotos → no renderiza nada (evita el "0" ruidoso).
 * El dato viene de reclamo_fotos.length, ya presente en el payload de lista.
 */
export default function FotoBadge({ count, className = "" }: FotoBadgeProps) {
  if (!count) return null;
  return (
    <span
      title={`${count} foto${count === 1 ? "" : "s"} adjunta${count === 1 ? "" : "s"}`}
      className={`inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-500 text-xs font-medium leading-none px-1.5 py-0.5 tabular-nums align-middle ${className}`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
      {count}
    </span>
  );
}
