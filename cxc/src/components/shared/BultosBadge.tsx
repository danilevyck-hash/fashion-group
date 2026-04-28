interface BultosBadgeProps {
  stock: number;
  bultoSize: number;
}

export default function BultosBadge({ stock, bultoSize }: BultosBadgeProps) {
  if (!stock || stock <= 0 || !bultoSize || bultoSize <= 0) return null;
  const bultos = Math.ceil(stock / bultoSize);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--color-text-secondary)" }}>
      <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#0F766E" }} />
      {bultos}
    </span>
  );
}
