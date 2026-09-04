#!/usr/bin/env bash
# Mutaciones sobre la línea «🎯 Meta» del resumen ACS (3-sep-2026).
# Cada una tiene que poner en ROJO src/__tests__/lib/acs-resumen-meta-ritmo.test.ts
# (o los candados vecinos). Restaura los archivos al terminar.
set -u
cd "$(dirname "$0")/.."
T=src/__tests__/lib/acs-resumen-meta-ritmo.test.ts
PURO=src/lib/multifashion/meta-ritmo.ts
LECT=src/lib/multifashion/meta-ritmo-lectura.ts
RES=src/lib/acs-resumen-diario.ts
cazadas=0; total=0
corre() { # nombre archivo perl-expr
  total=$((total+1))
  cp "$2" "$2.bak"
  perl -0pi -e "$3" "$2"
  if ! cmp -s "$2" "$2.bak"; then
    if npx vitest run "$T" src/__tests__/lib/acs-resumen-diario.test.ts src/__tests__/lib/acs-resumen-canal-privado.test.ts >/dev/null 2>&1; then
      echo "❌ NO cazada: $1"
    else
      echo "✅ cazada:    $1"; cazadas=$((cazadas+1))
    fi
  else
    echo "⚠️  mutación no aplicó (patrón no encontrado): $1"
  fi
  mv "$2.bak" "$2"
}
corre "quitar el factor (ritmo = año pasado a secas)"        "$PURO" 's/\* factor\)/* 1)/'
corre "factor = objetivo ÷ hasta corte (en vez del rango)"    "$PURO" 's/objetivo \/ prevRango/objetivo \/ (Number(e.ventaPrevHastaCorte) || 1)/'
corre "% = ritmo ÷ vendido (al revés)"                        "$PURO" 's/variacionPct\(vendido, ritmo\)/variacionPct(ritmo, vendido)/'
corre "ritmo < \$100 devuelve igual"                          "$PURO" 's/if \(pct == null\) return null;/if (pct == null) return { vendido, factor, ritmo, pct: 0 };/'
corre "sumar desde el 1 del mes en vez de desde"              "$LECT" 's/ventaRetail\(meta\.desde, corte\)/ventaRetail(corte.slice(0, 7) + "-01", corte)/'
corre "año pasado hasta corte = rango completo"               "$LECT" 's/unAnioAntes\(meta\.desde\), unAnioAntes\(corte\)/unAnioAntes(meta.desde), unAnioAntes(meta.hasta)/'
corre "unAnioAntes a pelo (29-feb inexistente)"               "$LECT" 's/import \{ unAnioAntes \} from "\@\/lib\/ventas\/clientes-corte-comparativo";/const unAnioAntes = (f: string) => String(Number(f.slice(0, 4)) - 1) + f.slice(4);/'
corre "no filtrar por activa"                                 "$LECT" 's/\.eq\("activa", true\)\n//'
corre "no filtrar por tipo grupal"                            "$LECT" 's/\.eq\("tipo", "grupal"\)\n//'
corre "no filtrar por deleted"                                "$LECT" 's/\.eq\("deleted", false\)\n//'
corre "meta que no cubre el corte (sin lte desde)"            "$LECT" 's/\.lte\("desde", corte\)\n//'
corre "meta que no cubre el corte (sin gte hasta)"            "$LECT" 's/\.gte\("hasta", corte\)\n//'
corre "la más vieja en vez de la más reciente"                "$LECT" 's/ascending: false/ascending: true/'
corre "falla cerrado (relanza)"                               "$LECT" 's/return null;\n  \}\n\}/throw err;\n  }\n}/'
corre "la línea sale sin meta"                                "$RES"  's/if \(r\.meta\) lineas\.push\(SEPARADOR, fmtLineaMeta\(r\.meta\)\);/lineas.push(SEPARADOR, r.meta ? fmtLineaMeta(r.meta) : "🎯 Meta  sin meta");/'
corre "la línea va antes del bloque Año pasado"               "$RES"  's/if \(pasado\.length > 0\) lineas\.push\(SEPARADOR, "Año pasado", \.\.\.pasado\.map\(fila\)\);\n  \/\/[^\n]*\n  if \(r\.meta\) lineas\.push\(SEPARADOR, fmtLineaMeta\(r\.meta\)\);/if (r.meta) lineas.push(SEPARADOR, fmtLineaMeta(r.meta));\n  if (pasado.length > 0) lineas.push(SEPARADOR, "Año pasado", ...pasado.map(fila));/'
corre "sin separador propio"                                  "$RES"  's/lineas\.push\(SEPARADOR, fmtLineaMeta\(r\.meta\)\)/lineas.push(fmtLineaMeta(r.meta))/'
corre "1 decimal en vez de 0"                                 "$RES"  's/DECIMALES_META = 0/DECIMALES_META = 1/'
corre "abajo dice arriba"                                     "$RES"  's/\? "abajo del ritmo"/? "arriba del ritmo"/'
corre "la meta usa fecha y no corte"                          "$RES"  's/leerRitmoMeta\(corte\)/leerRitmoMeta(fecha)/'
corre "usar total en vez de subtotal (lectura paginada)"      "src/lib/multifashion/metas-lectura.ts" 's/\.select\("fecha,vendedor,subtotal"/.select("fecha,vendedor,subtotal,total"/; s/Number\(f\.subtotal\) \|\| 0;\n    prev\.documentos/Number((f as unknown as { total: number }).total) || 0;\n    prev.documentos/'
corre "incluir el mayoreo (lectura paginada)"                 "src/lib/multifashion/metas-lectura.ts" 's/(\.select\("fecha,vendedor,subtotal"[^\n]*\n[^\n]*)\.eq\("is_wholesale", false\)\n/$1/'
echo
echo "cazadas $cazadas / $total"
