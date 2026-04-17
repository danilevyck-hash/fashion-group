/**
 * Groups items by time period relative to today (Apple Reminders style).
 * Returns only non-empty groups.
 */

import { addDaysISO } from "./cheques-dates";

export interface TimeGroup<T> {
  key: string;
  label: string;
  items: T[];
  color: string;          // tailwind text color for header
  bgColor: string;        // tailwind bg color for header row
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday = start
  const r = new Date(d);
  r.setDate(r.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfWeek(d: Date): Date {
  const s = startOfWeek(d);
  s.setDate(s.getDate() + 6);
  return s;
}

type PresetMode = "pendiente" | "depositado" | "guias";

const GROUP_DEFS: Record<PresetMode, {
  key: string;
  label: string;
  color: string;
  bgColor: string;
  match: (dateStr: string, today: string, weekStart: string, weekEnd: string, nextWeekStart: string, nextWeekEnd: string, monthStart: string, monthEnd: string, yesterday: string) => boolean;
}[]> = {
  pendiente: [
    {
      key: "vencidos",
      label: "Vencidos",
      color: "text-red-600",
      bgColor: "bg-red-50",
      match: (d, today) => d < today,
    },
    {
      key: "hoy",
      label: "Hoy",
      color: "text-amber-600",
      bgColor: "bg-amber-50",
      match: (d, today) => d === today,
    },
    {
      key: "esta_semana",
      label: "Esta semana",
      color: "text-gray-700",
      bgColor: "bg-gray-50",
      // Rolling 7d desde hoy (criterio unificado bug #5 audit). Excluye hoy porque tiene bucket propio.
      match: (d, today) => d > today && d <= addDaysISO(today, 7),
    },
    {
      key: "proxima_semana",
      label: "Próxima semana",
      color: "text-gray-700",
      bgColor: "bg-gray-50",
      match: (d, today) => d > addDaysISO(today, 7) && d <= addDaysISO(today, 14),
    },
    {
      key: "mas_adelante",
      label: "Más adelante",
      color: "text-gray-400",
      bgColor: "bg-gray-50/50",
      match: (d, today) => d > addDaysISO(today, 14),
    },
  ],
  depositado: [
    {
      key: "hoy",
      label: "Hoy",
      color: "text-gray-700",
      bgColor: "bg-gray-50",
      match: (d, today) => d === today,
    },
    {
      key: "esta_semana",
      label: "Esta semana",
      color: "text-gray-700",
      bgColor: "bg-gray-50",
      match: (d, today, weekStart) => d < today && d >= weekStart,
    },
    {
      key: "este_mes",
      label: "Este mes",
      color: "text-gray-700",
      bgColor: "bg-gray-50",
      match: (d, today, weekStart, _we, _nws, _nwe, monthStart) => d < weekStart && d >= monthStart,
    },
    {
      key: "anteriores",
      label: "Anteriores",
      color: "text-gray-400",
      bgColor: "bg-gray-50/50",
      match: (d, _today, _ws, _we, _nws, _nwe, monthStart) => d < monthStart,
    },
  ],
  guias: [
    {
      key: "hoy",
      label: "Hoy",
      color: "text-gray-700",
      bgColor: "bg-gray-50",
      match: (d, today) => d === today,
    },
    {
      key: "ayer",
      label: "Ayer",
      color: "text-gray-700",
      bgColor: "bg-gray-50",
      match: (d, _today, _ws, _we, _nws, _nwe, _ms, _me, yesterday) => d === yesterday,
    },
    {
      key: "esta_semana",
      label: "Esta semana",
      color: "text-gray-700",
      bgColor: "bg-gray-50",
      match: (d, today, weekStart, _we, _nws, _nwe, _ms, _me, yesterday) => d < yesterday && d >= weekStart,
    },
    {
      key: "anteriores",
      label: "Anteriores",
      color: "text-gray-400",
      bgColor: "bg-gray-50/50",
      match: (d, _today, weekStart) => d < weekStart,
    },
  ],
};

export function groupByTimePeriod<T>(
  items: T[],
  dateField: keyof T,
  mode: PresetMode,
): TimeGroup<T>[] {
  const now = new Date();
  const today = toDateStr(now);

  const ws = startOfWeek(now);
  const we = endOfWeek(now);
  const weekStart = toDateStr(ws);
  const weekEnd = toDateStr(we);

  const nws = new Date(ws);
  nws.setDate(nws.getDate() + 7);
  const nwe = new Date(we);
  nwe.setDate(nwe.getDate() + 7);
  const nextWeekStart = toDateStr(nws);
  const nextWeekEnd = toDateStr(nwe);

  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd = toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const yd = new Date(now);
  yd.setDate(yd.getDate() - 1);
  const yesterday = toDateStr(yd);

  const defs = GROUP_DEFS[mode];
  const groups: TimeGroup<T>[] = defs.map((def) => ({
    key: def.key,
    label: def.label,
    color: def.color,
    bgColor: def.bgColor,
    items: [],
  }));

  for (const item of items) {
    const dateVal = String(item[dateField] ?? "").slice(0, 10);
    for (const [i, def] of defs.entries()) {
      if (def.match(dateVal, today, weekStart, weekEnd, nextWeekStart, nextWeekEnd, monthStart, monthEnd, yesterday)) {
        groups[i].items.push(item);
        break;
      }
    }
  }

  // Return only non-empty groups
  return groups.filter((g) => g.items.length > 0);
}
