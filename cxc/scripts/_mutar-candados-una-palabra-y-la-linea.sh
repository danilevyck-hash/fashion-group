#!/usr/bin/env bash
# Verificación por MUTACIÓN de los dos cambios de TEXTO del 18-sep-2026:
#
#   1 · «Actualizar ahora» es la ÚNICA palabra para traer datos frescos
#       (Guías y Etiquetas decían «Buscar otra vez» y «Traer de Switch ahora»).
#   2 · la línea de «más de 4 marcas» DEJÓ DE NOMBRAR cuál sobra — el día de
#       Enrique Sánchez (7-sep-2026): la línea señalaba la 13:28:13, la que
#       sobraba era la 11:17:58, la contadora quitó la señalada y el día quedó
#       igual de mal.
#
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO;
# dos CONTROLES (cambios que NO alteran ninguna regla) tienen que quedar verdes.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

PALABRA=src/lib/ui/actualizar-ahora.ts
BOTON=src/components/shared/SyncNowButton.tsx
FACTURAS=src/app/guias/components/FacturasDelCliente.tsx
ETIQUETAS=src/app/guias/components/EtiquetasView.tsx
DIA=src/lib/asistencia/marcas-del-dia.ts
TSX=src/app/asistencia/ReporteTab.tsx

TESTS=(
  src/__tests__/lib/actualizar-ahora-una-palabra.test.ts
  src/__tests__/lib/asistencia-marcas-de-mas.test.ts
  src/__tests__/components/asistencia-marcas-de-mas.test.tsx
  src/__tests__/components/guia-form-marcar-facturas.test.tsx
  src/__tests__/components/guias-varios-clientes-y-dias.test.tsx
)

ARCHIVOS=("$PALABRA" "$BOTON" "$FACTURAS" "$ETIQUETAS" "$DIA" "$TSX")

TMP=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f" | tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f" | tr / _)" "$f"; done; }
trap restaurar EXIT INT TERM PIPE

cazadas=0; total=0; muertas=0; controles_ok=0; controles=0

mutar() { python3 scripts/_mutar-aplicar.py "$@"; }

# 🩸 La salida va a un ARCHIVO y se greppea de ahí. Con `echo "$salida" | grep -q`
# el `grep` corta al primer acierto, el `echo` muere por SIGPIPE y una mutación
# CAZADA se lee como «corrida muerta». Pasó con la 12.
SALIDA="$TMP/salida.txt"
correr() { npx vitest run "${TESTS[@]}" > "$SALIDA" 2>&1; }

probar() {  # $1 = nombre de la mutación — TIENE que cazarse
  total=$((total + 1))
  correr
  if ! grep -qE "Test Files" "$SALIDA"; then
    echo "  ⛔ CORRIDA MUERTA — $1"; muertas=$((muertas + 1)); restaurar; return
  fi
  if grep -qE "Tests +.*failed" "$SALIDA"; then
    echo "  ✅ CAZADA ($(grep -oE "[0-9]+ failed" "$SALIDA" | head -1)) — $1"; cazadas=$((cazadas + 1))
  else
    echo "  ❌ SOBREVIVIÓ — $1"
  fi
  restaurar
}

controlar() {  # $1 = nombre del control — NO tiene que cazarse
  controles=$((controles + 1))
  correr
  if grep -qE "Test Files" "$SALIDA" && ! grep -qE "Tests +.*failed" "$SALIDA"; then
    echo "  ✅ CONTROL en verde (esperado) — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  ❌ CONTROL se puso rojo (NO esperado) — $1"
  fi
  restaurar
}

echo "== 1. la palabra de la casa cambia sola en el módulo compartido =="
mutar "$PALABRA" 'export const TEXTO_ACTUALIZAR_AHORA = "Actualizar ahora";' \
                 'export const TEXTO_ACTUALIZAR_AHORA = "Refrescar";' \
&& probar 'los tres botones dejan de decir «Actualizar ahora»'

echo "== 2. el texto de «mientras corre» se desalinea =="
mutar "$PALABRA" 'export const TEXTO_ACTUALIZANDO = "Actualizando…";' \
                 'export const TEXTO_ACTUALIZANDO = "Cargando…";' \
&& probar 'el botón dice otra cosa mientras trae los datos'

echo "== 3. Nueva guía vuelve a «Buscar otra vez» =="
mutar "$FACTURAS" '                  {actualizando ? TEXTO_ACTUALIZANDO : TEXTO_ACTUALIZAR_AHORA}' \
                  '                  {actualizando ? "Buscando…" : "Buscar otra vez"}' \
&& probar 'el selector de facturas estrena otra vez su propia palabra'

echo "== 4. Etiquetas vuelve a «Traer de Switch ahora» =="
mutar "$ETIQUETAS" '                  {actualizando ? TEXTO_ACTUALIZANDO : TEXTO_ACTUALIZAR_AHORA}' \
                   '                  {actualizando ? "Trayendo…" : "Traer de Switch ahora"}' \
&& probar 'vuelven a ser tres palabras para la misma acción'

echo "== 5. el botón de los cinco módulos teclea su texto a mano =="
mutar "$BOTON" '          : TEXTO_ACTUALIZAR_AHORA}' '          : "Actualizar ahora"}' \
&& probar 'la palabra deja de salir de un solo lugar'

echo "== 6. la frase de Daniel de Etiquetas se cambia =="
mutar "$ETIQUETAS" '                <span>{TEXTO_TRAER_DE_SWITCH}</span>' \
                   '                <span>Actualiza para ver la factura de hoy</span>' \
&& probar 'la frase que dictó Daniel deja de estar en pantalla'

echo "== 7. la línea de marcas vuelve a NOMBRAR cuál sobra =="
mutar "$DIA" '  const quita = cuantasSueltas === 1 ? "quita la que sobra" : "quita las que sobren";
  return `El día tiene ${cuantasMarcasTexto(n)}, y son ${MARCAS_NORMALES} — ${quita}:`;' \
             '  return cuantasSueltas === 1 ? "Marca de más:" : "Marcas de más:";' \
&& probar 'vuelve el texto que hizo quitar la marcación equivocada'

echo "== 8. la nota de abajo vuelve a repetir el conteo =="
mutar "$DIA" '  return "";
}' '  return `— el día tiene ${n}, y son 4`;
}' \
&& probar 'la frase queda partida en dos otra vez'

echo "== 9. el plural deja de mirar cuántas sobran =="
mutar "$DIA" '  const quita = cuantasSueltas === 1 ? "quita la que sobra" : "quita las que sobren";' \
             '  const quita = "quita la que sobra";' \
&& probar 'un día de 6 marcas dice «quita la que sobra», y sobran dos'

echo "== 10. el 4 de la frase se teclea en vez de derivarse =="
mutar "$DIA" '  return `El día tiene ${cuantasMarcasTexto(n)}, y son ${MARCAS_NORMALES} — ${quita}:`;' \
             '  return `El día tiene ${cuantasMarcasTexto(n)}, y son 4 — ${quita}:`;' \
&& probar 'dos cuatros separados: el de la frase y el del motor'

echo "== 11. el día de 3 marcas pierde su frase, que SÍ es verdad =="
mutar "$DIA" '  if (n < MARCAS_NORMALES) return "Otra marca del día:";' \
             '  if (n < MARCAS_NORMALES) return "Marca de más:";' \
&& probar 'con 3 marcas se acusa a una de sobrar, y lo que pasa es que FALTA'

echo "== 12. la hora de la línea deja de ser un botón =="
mutar "$TSX" '                <HoraBoton idx={i} tenue />' \
             '                <span className="tabular-nums">{d.marcas[i]}</span>' \
&& probar 'la marca que hay que quitar deja de poderse tocar'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$PALABRA" '/** Lo que dice el botón que va a buscar datos frescos. En TODO el sistema. */' \
                 '/** Lo que dice el botón que trae datos frescos. En TODO el sistema. */' \
&& controlar 'comentario en el módulo de la palabra'

echo "== CONTROL B. se renombra una variable interna (misma conducta) =="
mutar "$DIA" '  const quita = cuantasSueltas === 1 ? "quita la que sobra" : "quita las que sobren";
  return `El día tiene ${cuantasMarcasTexto(n)}, y son ${MARCAS_NORMALES} — ${quita}:`;' \
             '  const queHacer = cuantasSueltas === 1 ? "quita la que sobra" : "quita las que sobren";
  return `El día tiene ${cuantasMarcasTexto(n)}, y son ${MARCAS_NORMALES} — ${queHacer}:`;' \
&& controlar 'nombre de la variable con el qué-hacer'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="
