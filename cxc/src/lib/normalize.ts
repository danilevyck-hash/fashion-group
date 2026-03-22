export function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
