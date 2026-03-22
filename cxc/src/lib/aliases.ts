// Maps variant normalized names to the official canonical name.
// When uploading CSVs, after normalizing the name, check this map
// to unify clients that appear with different spellings.
// Key: variant (normalized), Value: official name (normalized)

export const NAME_ALIASES: Record<string, string> = {
  "MINERA PANAMMA": "MINERA PANAMA",
  "KAREN DUTY FREE": "KAREN DUTY FREE SA",
  "SUPER CENTRO LA COMPETENCIA": "SUPER CENTRO LA COMPETENCIA SA",
  "OUTLET DUTY FREE N2A": "OUTLET DUTY FREE N2 SA",
  "OUTLET DUTY FREE N3SA": "OUTLET DUTY FREE N3 SA",
  "BK ENTERPRISE": "BK ENTERPRISE SA",
  "DOLLAR MALL/ P CANOAS": "DOLLAR MALL/P CANOAS",
  "MAS FLOW 21": "MAS FLOW 21 OESTE SA",
  "METRO SHOES PANAMA": "METRO SHOES PANAMA SA",
  "PASOS YISE AS INC": "PASOS YISEAS INC",
  "SIXAOLA DUTTY FREE": "SIXAOLA DUTTY FREE SA",
};

export function resolveAlias(normalizedName: string): string {
  return NAME_ALIASES[normalizedName] || normalizedName;
}
