"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import { fmt } from "@/lib/format";

interface ChartDataPoint {
  name: string;
  ventas: number;
  prev: number;
}

interface VentasChartProps {
  data: ChartDataPoint[];
  isNarrow: boolean;
}

export default function VentasChart({ data, isNarrow }: VentasChartProps) {
  return (
    <ResponsiveContainer width="100%" height={isNarrow ? 160 : 220}>
      <BarChart data={data} barCategoryGap="20%">
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
          tickFormatter={(v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
          width={40} />
        <RTooltip formatter={(v) => [`$${fmt(Number(v))}`, ""]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Bar dataKey="ventas" fill="#1a1a1a" radius={[3, 3, 0, 0]} />
        <Bar dataKey="prev" fill="#e5e7eb" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
