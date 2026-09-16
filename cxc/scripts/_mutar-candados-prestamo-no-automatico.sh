#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado «el préstamo deja de descontarse solo»
# (15-sep-2026): `src/__tests__/lib/prestamo-no-automatico.test.ts`, más los
# cinco candados que pasaron a ser el CONTROL de «prendido, todo igual».
#
# Este punto MUEVE PLATA (decide qué se le descuenta del sueldo a alguien y qué
# pago se anota contra su deuda), así que se rompe cada regla a propósito y se
# comprueba que el candado se pone ROJO. Dos CONTROLES quedan en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

REGLA=src/lib/asistencia/prestamos-planilla.ts
PANTALLA=src/app/asistencia/PlanillaTab.tsx

TESTS=(
  src/__tests__/lib/prestamo-no-automatico.test.ts
  src/__tests__/lib/asistencia-prestamo-planilla.test.ts
  src/__tests__/lib/planilla-dano-por-cuota.test.ts
  src/__tests__/lib/planilla-sin-descontar.test.ts
  src/__tests__/components/prestamos-cuota-obligatoria-y-neto.test.tsx
)

ARCHIVOS=("$REGLA" "$PANTALLA")

TMP=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f" | tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f" | tr / _)" "$f"; done; }
trap restaurar EXIT INT TERM PIPE

cazadas=0; total=0; muertas=0; controles_ok=0; controles=0

mutar() { python3 scripts/_mutar-aplicar.py "$@"; }

correr() { npx vitest run "${TESTS[@]}" 2>&1; }

# 🩸 SIN TUBERÍAS PARA MIRAR LA SALIDA: con `set -o pipefail`, un
# `echo "$salida" | grep -q` sobre una salida grande devuelve 141 (grep corta,
# echo se come un SIGPIPE) y una mutación CAZADA se reportaría como muerta.
tiene() { case "$2" in *"$1"*) return 0;; *) return 1;; esac; }
corrio() { tiene "Test Files" "$1"; }
fallo()  { [[ "$1" =~ Tests[[:space:]]+[^$'\n']*failed ]]; }

probar() {  # $1 = nombre de la mutación — TIENE que cazarse
  total=$((total + 1))
  local salida; salida=$(correr)
  if ! corrio "$salida"; then
    echo "  ⛔ CORRIDA MUERTA — $1"; muertas=$((muertas + 1)); restaurar; return
  fi
  if fallo "$salida"; then
    echo "  ✅ CAZADA — $1"; cazadas=$((cazadas + 1))
  else
    echo "  ❌ SOBREVIVIÓ — $1"
  fi
  restaurar
}

controlar() {  # $1 = nombre del control — NO tiene que cazarse
  controles=$((controles + 1))
  local salida; salida=$(correr)
  if corrio "$salida" && ! fallo "$salida"; then
    echo "  ✅ CONTROL en verde (esperado) — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  ❌ CONTROL se puso rojo (NO esperado) — $1"
  fi
  restaurar
}

echo "== 1. el interruptor se vuelve a prender =="
mutar "$REGLA" 'export const PRESTAMO_AUTOMATICO = false;' 'export const PRESTAMO_AUTOMATICO = true;' \
&& probar 'la cuota vuelve a entrar sola (el caso de Eloyn)'

echo "== 2. la función que decide ignora el interruptor =="
mutar "$REGLA" '  if (!automatico) return 0;
  return centavos(Math.max(0, num(sugerido)));' '  return centavos(Math.max(0, num(sugerido)));' \
&& probar 'apagado sigue proponiendo la cuota'

echo "== 3. la casilla se salta la función y propone por su cuenta =="
mutar "$REGLA" '  return cuotaPropuesta(sugerido, automatico);
}' '  return centavos(Math.max(0, num(sugerido)));
}' \
&& probar 'un segundo lugar decide la cuota'

echo "== 4. el parámetro deja de llegar: la línea usa el interruptor a medias =="
mutar "$REGLA" '  const prestamo = casillaAutomatica(linea.manuales.prestamo, sugerencia.sugerido, automatico);' '  const prestamo = casillaAutomatica(linea.manuales.prestamo, sugerencia.sugerido);' \
&& probar 'el CONTROL de «prendido» deja de funcionar para el préstamo'

echo "== 5. terceros se queda sin el interruptor =="
mutar "$REGLA" '  const terceros = casillaAutomatica(linea.manuales.terceros, sugerencia.sugeridoTerceros, automatico);' '  const terceros = casillaAutomatica(linea.manuales.terceros, sugerencia.sugeridoTerceros, true);' \
&& probar 'la cuota de terceros entra sola con el automático apagado'

echo "== 6. la mercancía se queda sin el interruptor =="
mutar "$REGLA" '  const mercancia = casillaAutomatica(linea.manuales.mercancia, sugerencia.sugeridoDano, automatico);' '  const mercancia = casillaAutomatica(linea.manuales.mercancia, sugerencia.sugeridoDano, true);' \
&& probar 'la cuota de daño entra sola con el automático apagado'

echo "== 7. el 0 a propósito vuelve a inventar una cuota saltada =="
mutar "$REGLA" '    estadoCasilla(escrito) === "sin-descontar" ? cuotaPropuesta(propuesto, automatico) : 0;' '    estadoCasilla(escrito) === "sin-descontar" ? centavos(Math.max(0, num(propuesto))) : 0;' \
&& probar 'dice «me salté $70» donde no había cuota'

echo "== 8. la fila deja de decir cuánto debe =="
mutar "$REGLA" '  if (automatico) return null;' '  return null;
  if (automatico) return null;' \
&& probar 'se pierde la información junto con la decisión'

echo "== 9. la deuda se dice TAMBIÉN con el automático prendido =="
mutar "$REGLA" '  if (automatico) return null;' '  if (false) return null;' \
&& probar 'la casilla trae la cuota Y debajo la repite'

echo "== 10. «sin cuota» se disfraza de cuota en cero =="
mutar "$REGLA" '    : `Debe ${plata(d.saldo)} · sin cuota`;' '    : `Debe ${plata(d.saldo)} · cuota ${plata(0)}`;' \
&& probar 'una deuda sin cuota se lee como cuota de cero'

echo '== 11. se dice «Debe $0.00» de quien no debe nada =='
mutar "$REGLA" '  if (!d || d.saldo <= 0.004) return null;' '  if (!d) return null;' \
&& probar 'ruido debajo de cada casilla'

echo "== 12. el aviso de la «última cuota» sigue saliendo apagado =="
mutar "$REGLA" '  if (!automatico) return [];' '  if (false) return [];' \
&& probar 'se dice «se le descuenta el saldo» sobre algo que no pasa'

echo "== 13. la lista de cuentas se escribe a mano (segunda lista) =="
mutar "$REGLA" '  const algo = CASILLAS_AUTOMATICAS.some((c) => deuda[c].saldo > 0.004);' '  const algo = deuda.prestamo.saldo > 0.004;' \
&& probar 'una deuda de solo daño deja de mostrarse'

echo "== 14. la pantalla no dibuja la deuda =="
mutar "$PANTALLA" '      {deuda && !bloqueada && (' '      {false && deuda && !bloqueada && (' \
&& probar 'la casilla queda vacía y muda'

echo "== 15. la pantalla la dibuja en una sola de las dos formas =="
mutar "$PANTALLA" '                  deuda={deudaDe(l, campo)}' '                  deuda={null}' \
&& probar 'en el celular no se ve cuánto debe'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$REGLA" '/** Los archivos que Daniel tiene que correr. Se le muestran tal cual. */' '/** Los archivos que Daniel corre a mano. Se le muestran tal cual. */' \
&& controlar 'comentario en el módulo de la regla'

echo "== CONTROL B. el orden de las tres cuentas de la deuda (misma conducta) =="
mutar "$REGLA" '    prestamo: { saldo: centavos(num(s.saldo)), cuota: centavos(num(s.cuota)) },
    terceros: { saldo: centavos(num(s.saldoTerceros)), cuota: centavos(num(s.cuotaTerceros)) },
    mercancia: { saldo: centavos(num(s.saldoDano)), cuota: centavos(num(s.cuotaDano)) },' '    mercancia: { saldo: centavos(num(s.saldoDano)), cuota: centavos(num(s.cuotaDano)) },
    terceros: { saldo: centavos(num(s.saldoTerceros)), cuota: centavos(num(s.cuotaTerceros)) },
    prestamo: { saldo: centavos(num(s.saldo)), cuota: centavos(num(s.cuota)) },' \
&& controlar 'orden de las propiedades del objeto'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="
