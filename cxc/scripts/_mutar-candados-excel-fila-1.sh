#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados de «los encabezados abren el
# archivo» (27-ago-2026).
#
# 🩸 RESTAURA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS en la rama y
# git aborta el comando ENTERO sin restaurar nada, así que las mutaciones se
# apilarían y ninguna se probaría por separado. Ya pasó en este repo.
#
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN DE VITEST antes de creerle a un cero:
# si la corrida muere (un módulo que no compila, un flag que no existe), vitest
# escribe "no tests" y "0 fallos" se leería como "sobrevivió" — un rojo inventado
# sobre un candado que nunca corrió.
#
#   bash scripts/_mutar-candados-excel-fila-1.sh
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS=(
  src/__tests__/lib/excel-encabezados-fila-1.test.ts
  src/__tests__/excel-exports-ventas.test.ts
  src/__tests__/excel-exports-catalogos.test.ts
  src/__tests__/excel-exports-finanzas.test.ts
  src/__tests__/excel-exports-operacion.test.ts
  src/__tests__/excel-exports-reclamos.test.ts
  src/__tests__/excel-exports-marketing.test.ts
  src/__tests__/api/pedidos-export-numeros.test.ts
  src/__tests__/lib/guias-numero-por-linea-y-papel.test.ts
)

ARCHIVOS=(
  src/lib/excel-export.ts
  src/lib/excel-panel-fijo.ts
  src/lib/asistencia/planilla-exportar.ts
)

RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap 'restaurar; rm -rf "$RESPALDO"' EXIT INT TERM PIPE

cazadas=0; sobrevivieron=0; muertas=0

probar() { # → imprime "N" fallos, o "MURIO"
  local salida
  # ⚠️ El array va ENTRECOMILLADO: en zsh una variable suelta NO se parte por
  # espacios, le llegaría a vitest como UN argumento, correría 0 archivos y todo
  # saldría verde sin haber probado nada.
  salida=$(npx vitest run "${TESTS[@]}" --reporter=dot 2>&1)
  if ! grep -qE "^ *Tests +" <<<"$salida"; then echo "MURIO"; return; fi
  grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo "0"
}

mutar() { # nombre, archivo, viejo, nuevo, [veces]
  local nombre="$1" archivo="$2" viejo="$3" nuevo="$4" veces="${5:-1}"
  local r
  if ! r=$(python3 scripts/_mutar-candados-excel-fila-1.py "$archivo" "$viejo" "$nuevo" "$veces" 2>&1); then
    echo "⛔ $nombre — $r"
    muertas=$((muertas + 1)); restaurar; return
  fi
  local fallos; fallos=$(probar)
  if [ "$fallos" = "MURIO" ]; then
    echo "⛔ $nombre — la corrida de vitest no colectó tests"
    muertas=$((muertas + 1))
  elif [ "$fallos" = "0" ]; then
    echo "🔴 SOBREVIVIÓ — $nombre"
    sobrevivieron=$((sobrevivieron + 1))
  else
    echo "✅ cazada ($fallos) — $nombre"
    cazadas=$((cazadas + 1))
  fi
  restaurar
}

echo "── mutaciones ──────────────────────────────────────────────────────────"

mutar "vuelve la banda de TÍTULO arriba de los encabezados" src/lib/excel-export.ts \
  '  opts.columns.forEach((c, i) => { ws[addr(r, i)] = hdr(c.header, c.align || "left"); });
  heights[r] = 22; r++;' \
  '  band(ws, r, lastCol, merges, "FASHION GROUP", p.pri, 14);
  heights[r] = 30; r++;
  opts.columns.forEach((c, i) => { ws[addr(r, i)] = hdr(c.header, c.align || "left"); });
  heights[r] = 22; r++;'

mutar "vuelve la franja separadora de 4 puntos" src/lib/excel-export.ts \
  '  opts.columns.forEach((c, i) => { ws[addr(r, i)] = hdr(c.header, c.align || "left"); });' \
  '  fillRow(ws, r, lastCol, p.sep); heights[r] = 4; r++;
  opts.columns.forEach((c, i) => { ws[addr(r, i)] = hdr(c.header, c.align || "left"); });'

mutar "el FILTRO desaparece" src/lib/excel-export.ts \
  '  ws["!autofilter"] = { ref: filtro };' \
  '  void filtro;'

mutar "el filtro arranca en la fila 2 (deja los nombres afuera)" src/lib/excel-export.ts \
  '  const filtro = `A1:${addr(opts.rows.length, lastCol)}`;' \
  '  const filtro = `A2:${addr(opts.rows.length, lastCol)}`;'

mutar "el filtro se TRAGA la fila de totales" src/lib/excel-export.ts \
  '  const filtro = `A1:${addr(opts.rows.length, lastCol)}`;' \
  '  const filtro = `A1:${addr(opts.rows.length + 2, lastCol)}`;'

mutar "la NOTA de la planilla no se dibuja" src/lib/excel-export.ts \
  '  if (opts.nota) {' \
  '  if (false && opts.nota) {'

mutar "la NOTA cae DENTRO del filtro (filtrar la esconde)" src/lib/excel-export.ts \
  '  const filtro = `A1:${addr(opts.rows.length, lastCol)}`;' \
  '  const filtro = `A1:${addr(opts.rows.length + 6, lastCol)}`;'

mutar "el panel fijo no se escribe" src/lib/excel-panel-fijo.ts \
  '  if (!/<autoFilter ref="A1:/.test(xml)) return null;' \
  '  return null; //'

mutar "el panel se congela en la fila 2 (parte los datos)" src/lib/excel-panel-fijo.ts \
  '  '"'"'<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'"'"' +' \
  '  '"'"'<pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/>'"'"' +'

mutar "el <pane> queda FUERA de <sheetView> (Excel lo ignora)" src/lib/excel-panel-fijo.ts \
  '  if (cerrado) return xml.replace(cerrado[0], `<sheetView${cerrado[1]}>${PANEL_FIJO}</sheetView>`);' \
  '  if (cerrado) return xml.replace(cerrado[0], `${cerrado[0]}${PANEL_FIJO}`);'

mutar "se congela CUALQUIER hoja, tenga encabezados o no" src/lib/excel-panel-fijo.ts \
  '  if (!/<autoFilter ref="A1:/.test(xml)) return null;' \
  '  if (false) return null;'

mutar "el tamaño de la entrada no se actualiza (el zip queda corrupto)" src/lib/excel-panel-fijo.ts \
  '    e.csize = datos.length;
    e.usize = datos.length;' \
  '    void datos;'

mutar "el CRC no se recalcula (el zip queda corrupto)" src/lib/excel-panel-fijo.ts \
  '    e.crc = crc32(datos);' \
  '    void datos;'

mutar 'workbookBytes deja de congelar (escribe con la librería a secas)' src/lib/excel-export.ts \
  '  return congelarEncabezadosXlsx(new Uint8Array(buf));' \
  '  return new Uint8Array(buf);'

mutar "la planilla de un rango libre pierde su aviso" src/lib/asistencia/planilla-exportar.ts \
  '    nota: avisoRangoLibre(d),
  });

  // Hoja 2' \
  '  });

  // Hoja 2'

mutar "el aviso de la planilla sale SIEMPRE, también en una quincena" src/lib/asistencia/planilla-exportar.ts \
  '  if (!d.periodo || d.periodo.esQuincena) return undefined;' \
  '  if (false) return undefined;'

mutar "el aviso deja de decir que NO es una quincena" src/lib/asistencia/planilla-exportar.ts \
  '  return `del ${d.periodo.etiqueta} · NO es una quincena: `' \
  '  return `del ${d.periodo.etiqueta} · `'

mutar "el aviso deja de decir que faltan los montos a mano" src/lib/asistencia/planilla-exportar.ts \
  '    + `sueldo base al ${(d.periodo.factorBase * 100).toFixed(1)} % y SIN los montos escritos a mano`;' \
  '    + `sueldo base al ${(d.periodo.factorBase * 100).toFixed(1)} %`;'

# ⛔ CONTROL: a propósito NO matchea nada. Si esto NO sale ⛔, el denunciador de
# patrones muertos está roto y todos los ✅ de arriba valen lo mismo que un
# barrido de texto con el comentario adentro.
mutar "CONTROL (no debe matchear)" src/lib/excel-export.ts \
  'ESTE_TEXTO_NO_EXISTE_EN_NINGUN_LADO' 'X'

echo "────────────────────────────────────────────────────────────────────────"
echo "cazadas: $cazadas · sobrevivieron: $sobrevivieron · patrón muerto: $muertas"
if [ "$muertas" -ne 1 ]; then
  echo "🔴 el CONTROL tenía que ser el ÚNICO patrón muerto — el denunciador está roto"
  exit 1
fi
[ "$sobrevivieron" -eq 0 ] || exit 1
