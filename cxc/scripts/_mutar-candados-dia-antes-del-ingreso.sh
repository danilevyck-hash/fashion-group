#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Verificación por mutación de los candados del 15-sep-2026:
# «un día anterior al ingreso —o posterior a la salida— no es una ausencia».
#
# Rompe la regla de 13 maneras distintas, corre los dos candados y comprueba
# que cada rotura los pone ROJOS. Restaura todo al terminar. No toca la base.
#
#   bash scripts/_mutar-candados-dia-antes-del-ingreso.sh
# ─────────────────────────────────────────────────────────────────────────────
cd "$(dirname "$0")/.." || exit 1
T1=src/__tests__/lib/asistencia-dia-antes-del-ingreso.test.ts
T2=src/__tests__/components/asistencia-dia-antes-del-ingreso.test.tsx
V=src/lib/asistencia/vigencia.ts
R=src/lib/asistencia/reporte.ts
P=src/app/api/asistencia/planilla/route.ts
A=src/app/api/asistencia/reporte/route.ts
F=src/app/asistencia/ReporteTab.tsx
TMP=$(mktemp -d)
cp $V $TMP/v; cp $R $TMP/r; cp $P $TMP/p; cp $A $TMP/a; cp $F $TMP/f
restaurar() { cp $TMP/v $V; cp $TMP/r $R; cp $TMP/p $P; cp $TMP/a $A; cp $TMP/f $F; }
trap 'restaurar; rm -rf $TMP' EXIT
ok=0; total=0
probar() {
  total=$((total+1))
  if npx vitest run $T1 $T2 >/dev/null 2>&1; then echo "  🔴 NO CAZADA: $1"
  else ok=$((ok+1)); echo "  ✅ cazada: $1"; fi
  restaurar
}
control() {
  total=$((total+1))
  if npx vitest run $T1 $T2 >/dev/null 2>&1; then ok=$((ok+1)); echo "  ✅ CONTROL: $1"
  else echo "  🔴 CONTROL FALLÓ: $1"; fi
  restaurar
}

# ── LA REGLA ────────────────────────────────────────────────────────────────
perl -0pi -e 's/  if \(!v \|\| !esFechaValida\(fecha\)\) return true;/  if (!v || !esFechaValida(fecha)) return true;\n  return true;/' $V
probar "trabajaEseDia devuelve siempre true"
perl -0pi -e 's/  if \(esFechaValida\(v\.fechaIngreso\) && fecha < v\.fechaIngreso!\) return false;\n//' $V
probar "no se mira la fecha de ingreso"
perl -0pi -e 's/  if \(esFechaValida\(v\.fechaSalida\) && fecha > v\.fechaSalida!\) return false;\n//' $V
probar "no se mira la fecha de salida"
perl -0pi -e 's/fecha < v\.fechaIngreso!/fecha <= v.fechaIngreso!/' $V
probar "el día del ingreso deja de ser suyo (borde exclusivo)"
perl -0pi -e 's/fecha > v\.fechaSalida!/fecha >= v.fechaSalida!/' $V
probar "el día de la salida deja de ser suyo (borde exclusivo)"

# ── EL MOTOR ────────────────────────────────────────────────────────────────
perl -0pi -e 's/if \(diaFueraDeVigencia\(opts\.vigencias\?\.get\(codigo\), fecha\)\) \{/if (false) {/' $R
probar "el motor del reporte no aplica la regla"
perl -0pi -e 's/          revisar: false, enCurso, fueraDeVigencia: true, ausente: false,/          revisar: false, enCurso, fueraDeVigencia: true, ausente: habil \&\& !feriado,/' $R
probar "un día fuera de vigencia vuelve a marcarse ausente"
perl -0pi -e 's/          tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,\n          \/\/ 🔴 Los tres veredictos/          tardeMin: 99, excesoAlmuerzoMin: 0, salidaTempranaMin: 99, extraMin: 0, trabajadoMin: 0,\n          \/\/ 🔴 Los tres veredictos/' $R
probar "un día fuera de vigencia trae tardanza y salida temprana"
perl -0pi -e 's/          marcas: crudas\.map\(\n            \(seg\) =>\n              `\$\{p2\(Math\.floor\(seg \/ 3600\)\)\}:\$\{p2\(Math\.floor\(\(seg % 3600\) \/ 60\)\)\}:\$\{p2\(seg % 60\)\}`,\n          \),/          marcas: [],/' $R
probar "se borran las marcas del día fuera de vigencia"

# ── EL CABLEADO ─────────────────────────────────────────────────────────────
perl -0pi -e 's/      vigencias,\n    \}\);/    });/' $P
probar "la ruta de la planilla no pasa las vigencias"
perl -0pi -e 's/      vigencias,\n    \}\);/    });/' $A
probar "la ruta de Asistencia no pasa las vigencias"

# ── LA PANTALLA ─────────────────────────────────────────────────────────────
perl -0pi -e 's/              : d\.fueraDeVigencia \? <span className="text-gray-500">\{TEXTO_DIA_FUERA_DE_VIGENCIA\}<\/span>\n//' $F
probar "la pantalla vuelve a decir «Ausencia sin justificar»"
perl -0pi -e 's/&& !d\.fueraDeVigencia;/;/' $F
probar "se vuelve a ofrecer «Justificar» en un día que no era suyo"
perl -0pi -e 's/export const TEXTO_DIA_FUERA_DE_VIGENCIA = "No trabajaba aquí ese día";/export const TEXTO_DIA_FUERA_DE_VIGENCIA = "Ausencia sin justificar";/' $V
probar "el texto de la pantalla pasa a decir que fue una ausencia"

# ── CONTROLES: lo que NO tiene que poner nada rojo ───────────────────────────
perl -0pi -e 's/\/\*\* Lo mismo al revés, que es como se lee en el motor: «ese día no era suyo». \*\//\/** Lo mismo al reves. *\//' $V
control "reescribir un comentario"
perl -0pi -e 's/export const TEXTO_DIA_FUERA_DE_VIGENCIA = "No trabajaba aquí ese día";/export const TEXTO_DIA_FUERA_DE_VIGENCIA = "No trabajaba aquí ese día";\nexport const NO_SE_USA = 1;/' $V
control "agregar una constante que nadie lee"

echo ""
echo "$ok de $total"
