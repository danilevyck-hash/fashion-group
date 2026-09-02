#!/usr/bin/env bash
# Verificador de mutaciones del pie de los PDF de asistencia.
#
# La pregunta que contesta: si alguien vuelve a poner un `doc.text` largo sin
# partir —o le saca al pie el margen que tiene reservado abajo—, ¿el candado se
# pone rojo, o el papel vuelve a salir cortado sin que nadie se entere?
#
# 🩸 Restaura por COPIA y no con `git checkout`: `pdf-pie.ts` es un archivo NUEVO
# y git aborta el comando entero sin restaurar nada.
# 🩸 El reemplazo es LITERAL con python: el código tiene `||`, `/` y acentos, y
# cualquier delimitador de `perl -pi -e` se des-escapa y se come el archivo,
# dejando un «SOBREVIVIÓ» falso.
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS=(
  src/__tests__/lib/asistencia-pdf-pie-cabe-en-la-hoja.test.ts
)
ARCHIVOS=(
  src/lib/asistencia/pdf-pie.ts
  src/lib/asistencia/exportar.ts
  src/lib/asistencia/planilla-exportar.ts
)
TMP=$(mktemp -d); trap 'for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; rm -rf "$TMP"' EXIT INT TERM PIPE
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f"|tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; }

CAZ=0; SOB=0; NOOP=0
probar() {
  local out; out=$(npx vitest run "${TESTS[@]}" 2>&1)
  if ! grep -qE 'Tests +[0-9]+ (failed|passed)' <<<"$out"; then echo "MUERTA"; return; fi
  grep -oE 'Tests +[0-9]+ failed' <<<"$out" | grep -oE '[0-9]+' | head -1 || echo 0
}
mutar() { # archivo  viejo  nuevo  nombre
  local f="$1" antes; antes=$(md5 -q "$f")
  python3 scripts/_mutar-aplicar.py "$f" "$2" "$3" >/dev/null 2>&1
  if [ "$antes" = "$(md5 -q "$f")" ]; then
    echo "  ⛔ NO MUTÓ (patrón muerto) — $4"; NOOP=$((NOOP+1)); restaurar; return
  fi
  local n; n=$(probar)
  if [ "$n" = "MUERTA" ]; then echo "  ⛔ corrida MUERTA (no colectó) — $4"; NOOP=$((NOOP+1))
  elif [ "${n:-0}" -gt 0 ] 2>/dev/null; then echo "  ✅ cazada ($n) — $4"; CAZ=$((CAZ+1))
  else echo "  🔴 SOBREVIVIÓ — $4"; SOB=$((SOB+1)); fi
  restaurar
}

echo "== control: sin mutar debe dar 0 fallos =="
echo "  fallos: $(probar)"

# 1. El arreglo entero: se le quita el splitTextToSize y el pie vuelve a ser una
#    sola recta de 465 mm en una hoja de 251. Es el defecto original, tal cual.
mutar src/lib/asistencia/pdf-pie.ts \
  '.flatMap((p) => doc.splitTextToSize(p, util) as string[]);' \
  '.map((p) => p);' \
  'sin splitTextToSize: el pie vuelve a ser una sola recta'

# 2. Se parte, pero contra la hoja entera en vez de contra el ancho útil: las
#    líneas se pasan del margen derecho aunque «estén partidas».
mutar src/lib/asistencia/pdf-pie.ts \
  'const util = doc.internal.pageSize.getWidth() - margen * 2 - ZONA_PAGINA_MM;' \
  'const util = doc.internal.pageSize.getWidth() * 2;' \
  'parte contra un ancho que no es el de la hoja'

# 3. Se parte bien pero no se reserva el alto: el pie de varias líneas crece
#    hacia arriba y se mete adentro de la última fila de la tabla.
mutar src/lib/asistencia/pdf-pie.ts \
  'reservaMm: Math.max(
      reservaPorDefectoMm(doc),
      PIE_BASE_MM + lineas.length * PIE_ALTO_LINEA_MM + RESPIRO_MM,
    ),' \
  'reservaMm: reservaPorDefectoMm(doc),' \
  'no le reserva alto al pie: se mete en la tabla'

# 4. El pie no se apoya en el borde de abajo sino que baja: se sale de la hoja.
mutar src/lib/asistencia/pdf-pie.ts \
  'doc.text(linea, margen, abajo - (pie.lineas.length - 1 - i) * PIE_ALTO_LINEA_MM);' \
  'doc.text(linea, margen, abajo + i * PIE_ALTO_LINEA_MM);' \
  'el pie crece hacia abajo y se sale de la hoja'

# 5. El Reporte vuelve a dibujar el pie a mano, en una sola llamada sin partir.
mutar src/lib/asistencia/exportar.ts \
  'didDrawPage: () => dibujarPie(doc, pie, PIE_PT, PIE_MARGEN),' \
  'didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(PIE_PT); doc.setTextColor(156, 163, 175);
      doc.text(pie.lineas.join(" · "), PIE_MARGEN, h - 8);
      doc.text(`Página ${doc.getNumberOfPages()}`, w - PIE_MARGEN, h - 8, { align: "right" });
    },' \
  'el Reporte vuelve a un doc.text largo sin partir'

# 6. Lo mismo en la Planilla: los seis avisos pegados en una sola recta.
mutar src/lib/asistencia/planilla-exportar.ts \
  'didDrawPage: () => dibujarPie(doc, pie, PIE_PT, PIE_MARGEN),' \
  'didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(PIE_PT); doc.setTextColor(156, 163, 175);
      doc.text(pie.lineas.join("  "), PIE_MARGEN, h - 8);
      doc.text(`Página ${doc.getNumberOfPages()}`, w - PIE_MARGEN, h - 8, { align: "right" });
    },' \
  'la Planilla vuelve a un doc.text largo sin partir'

echo
echo "== resumen =="
echo "  cazadas: $CAZ · sobrevivieron: $SOB · no mutaron: $NOOP"
[ "$SOB" -eq 0 ] && [ "$NOOP" -eq 0 ]
