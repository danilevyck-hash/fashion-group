#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado de las dos puertas a la ficha.
# Se rompe el camino nuevo a propósito, una cosa por vez, y el candado tiene que
# ponerse rojo. Las dos últimas son CONTROLES: cambios que NO cambian nada de lo
# que se ve, y ahí el candado tiene que quedarse VERDE — un candado que grita
# con todo no distingue nada.
#   bash scripts/_mutar-candados-ficha-una-persona.sh
set -u
cd "$(dirname "$0")/.." || exit 1
SRV=src/lib/asistencia/ficha-de-configuracion-server.ts
PURO=src/lib/asistencia/ficha-de-configuracion.ts
CFG=src/lib/asistencia/config-server.ts
PRE=src/lib/prestamos-lista-server.ts
CANDADO=src/__tests__/lib/asistencia-ficha-una-persona.test.ts
cp "$SRV" /tmp/.srv.bak; cp "$PURO" /tmp/.puro.bak; cp "$CFG" /tmp/.cfg.bak; cp "$PRE" /tmp/.pre.bak
restaurar() { cp /tmp/.srv.bak "$SRV"; cp /tmp/.puro.bak "$PURO"; cp /tmp/.cfg.bak "$CFG"; cp /tmp/.pre.bak "$PRE"; }
trap restaurar EXIT

CAZADAS=0; ESCAPADAS=0; CONTROLES_OK=0; CONTROLES_MAL=0
probar() { # $1 = descripción  $2 = "caza" | "control"
  if npx vitest run "$CANDADO" >/dev/null 2>&1; then rojo=0; else rojo=1; fi
  if [ "$2" = "control" ]; then
    if [ $rojo -eq 0 ]; then echo "  ✅ control (sigue verde): $1"; CONTROLES_OK=$((CONTROLES_OK+1));
    else echo "  ❌ control ROJO sin motivo: $1"; CONTROLES_MAL=$((CONTROLES_MAL+1)); fi
  else
    if [ $rojo -eq 1 ]; then echo "  ✅ cazada: $1"; CAZADAS=$((CAZADAS+1));
    else echo "  ❌ ESCAPÓ: $1"; ESCAPADAS=$((ESCAPADAS+1)); fi
  fi
  restaurar
}

echo "── Mutaciones que TIENEN que ponerlo rojo ──"
perl -0pi -e 's/crearDirectorio\(ficha \? \[ficha\] : \[\]\)/crearDirectorio([])/' "$SRV"
probar "la ficha de una persona se queda sin nombre" caza

perl -0pi -e 's/deudaPrestamo: deudaDe\.get\(codigo\) \?\? 0/deudaPrestamo: 0/' "$SRV"
probar "no se le lee la deuda de Préstamos" caza

perl -0pi -e 's/tieneHorario: conHorario,/tieneHorario: null,/' "$SRV"
probar "nunca se sabe si tiene horario" caza

perl -0pi -e 's/filasReparto: agruparPorCodigo\(filasReparto\)\.get\(codigo\)/filasReparto: undefined/' "$SRV"
probar "se pierde el sueldo repartido entre dos empresas" caza

perl -0pi -e 's/  if \(ignorado\) return null;/  if (false) return null;/' "$SRV"
probar "un código ignorado vuelve a aparecer" caza

perl -0pi -e 's/  if \(!ficha && !visto\) return null;/  if (false) return null;/' "$SRV"
probar "un código inventado contesta una ficha en blanco" caza

perl -0pi -e 's/\.eq\("empleado_codigo", codigo\)\n    \.eq\("activo", true\)/.eq("activo", true)/' "$SRV"
probar "el filtro de ignorados mira a todos y no a este código" caza

perl -0pi -e 's/return \(soloCodigo \? q\.eq\("empleado_codigo", soloCodigo\) : q\);/return q;/' "$CFG" 2>/dev/null
perl -0pi -e 's/const \{ data, error \} = await \(soloCodigo \? q\.eq\("empleado_codigo", soloCodigo\) : q\);/const { data, error } = await q;/' "$CFG"
probar "la ficha no se acota por código (vuelve a leer las 48)" control

perl -0pi -e 's/\(soloCodigo \? q\.eq\("empleado_codigo", soloCodigo\) : q\)\n          \.order/q.order/' "$PRE"
probar "la deuda no se acota por código (se suma igual)" control

echo "── CONTROLES: cambios que NO separan los dos caminos ──"
perl -0pi -e 's/const jornada = \(Number\(f\?\.jornada_semanal\) === 40 \? 40 : 48\)/const jornada = (Number(f?.jornada_semanal) === 48 ? 40 : 48)/' "$PURO"
# 🔑 ÉSTE ES EL CONTROL QUE MÁS DICE. Romper el CÁLCULO compartido mueve los DOS
# caminos por igual, así que este candado —que compara camino contra camino— se
# queda verde: es la prueba de que el cálculo es UNO SOLO y no dos copiados. Un
# cálculo mal hecho lo caza quien tiene que cazarlo: `asistencia-config.test.ts`
# se pone rojo con esta misma mutación (verificado el 14-sep-2026).
probar "la jornada sale al revés (rompe el cálculo, no la igualdad)" control

echo
echo "Cazadas: $CAZADAS · Escapadas: $ESCAPADAS · Controles verdes: $CONTROLES_OK · Controles mal: $CONTROLES_MAL"
[ "$ESCAPADAS" -eq 0 ] && [ "$CONTROLES_MAL" -eq 0 ]
