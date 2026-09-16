#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado «el aviso del reloj: a las 24 horas y de
# lunes a viernes» (15-sep-2026):
#   `src/__tests__/lib/reloj-avisa-a-las-24-horas.test.ts`
#   `src/__tests__/lib/asistencia-agente.test.ts`      (la retirada + el vigía)
#   `src/__tests__/scripts/agente-dos-relojes.test.ts` (los nombres legibles)
#
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO;
# dos CONTROLES (cambios que NO alteran la regla) tienen que quedar en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

REGLA=src/lib/asistencia/agente.ts
INGEST=src/app/api/asistencia/ingest/route.ts
VERCEL=vercel.json

TESTS=(
  src/__tests__/lib/reloj-avisa-a-las-24-horas.test.ts
  src/__tests__/lib/asistencia-agente.test.ts
  src/__tests__/scripts/agente-dos-relojes.test.ts
)

ARCHIVOS=("$REGLA" "$INGEST" "$VERCEL")

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

echo "== 1. el umbral vuelve a 6 horas =="
mutar "$REGLA" 'export const HORAS_PARA_VIGIA = 24;' 'export const HORAS_PARA_VIGIA = 6;' \
&& probar 'la noche con la tienda cerrada vuelve a sonar'

echo "== 2. el umbral se estira a 48 horas =="
mutar "$REGLA" 'export const HORAS_PARA_VIGIA = 24;' 'export const HORAS_PARA_VIGIA = 48;' \
&& probar 'un día hábil entero sin reloj se pasa en silencio'

echo "== 3. se vuelve a medir la PC y no el reloj =="
mutar "$REGLA" '  return fila.leido_ok_en ?? fila.visto_en;' '  return fila.visto_en;' \
&& probar 'la PC prendida con el reloj mudo no suena nunca'

echo "== 4. se mide SOLO el reloj: sin la migración se queda mudo =="
mutar "$REGLA" '  return fila.leido_ok_en ?? fila.visto_en;' '  return fila.leido_ok_en;' \
&& probar 'falla CERRADA: sin el DDL corrido no avisa de nada'

echo "== 5. el ingest deja de anotar la lectura buena =="
mutar "$INGEST" '    { fallos_seguidos: 0, alertado_en: null, leido_ok_en: ahora, ...extraPedido, ...extraVersion },' '    { fallos_seguidos: 0, alertado_en: null, ...extraPedido, ...extraVersion },' \
&& probar 'la columna nunca se llena y el aviso mide otra cosa'

echo "== 6. el ingest anota la lectura buena TAMBIÉN cuando falló =="
mutar "$INGEST" '      { fallos_seguidos: fallos, ...extraPedido, ...extraVersion },' '      { fallos_seguidos: fallos, leido_ok_en: ahora, ...extraPedido, ...extraVersion },' \
&& probar 'un error cuenta como lectura buena: no suena jamás'

echo "== 7. la rama del error vuelve a gastar el candado del vigía =="
mutar "$INGEST" '      { fallos_seguidos: fallos, ...extraPedido, ...extraVersion },' '      { fallos_seguidos: fallos, alertado_en: ahora, ...extraPedido, ...extraVersion },' \
&& probar 'el reporte de error deja mudo al vigía'

echo "== 8. el camino del éxito deja de rearmar el candado =="
mutar "$INGEST" '    { fallos_seguidos: 0, alertado_en: null, leido_ok_en: ahora, ...extraPedido, ...extraVersion },' '    { fallos_seguidos: 0, leido_ok_en: ahora, ...extraPedido, ...extraVersion },' \
&& probar 'el episodio no se cierra nunca'

echo "== 9. la columna nueva sale de la lista de «falta el DDL» =="
mutar "$REGLA" '  "hueco_alertado_en",
  "leido_ok_en",
] as const;' '  "hueco_alertado_en",
] as const;' \
&& probar 'sin la migración el ingest se cae en vez de degradar'

echo "== 10. el mensaje vuelve a hablar de la PC y no del reloj =="
mutar "$REGLA" '    `Hace ${hace(minutos).replace("hace ", "")} que no se puede leer el reloj (${dispositivo}).`,' '    `Hace ${hace(minutos).replace("hace ", "")} que la PC de la oficina no manda marcaciones (${dispositivo}).`,' \
&& probar 'manda a mirar una PC que está prendida'

echo "== 11. el mensaje deja de ofrecer la segunda causa =="
mutar "$REGLA" '    "Qué hacer: prender la PC del iVMS de la oficina; si ya está prendida, revisar que el reloj esté encendido y en la red.",' '    "Qué hacer: prender la PC del iVMS de la oficina.",' \
&& probar 'el reloj caído se queda sin instrucción'

echo "== 12. el candado anti-repetición se va =="
mutar "$REGLA" '    if (desdeAviso === null || desdeAviso <= horasEntreAvisos * 60) return false;' '    if (false) return false;' \
&& probar 'dos pasadas pegadas mandan dos mensajes'

echo "== 13. el aviso vuelve a ser UNO POR EPISODIO =="
mutar "$REGLA" '    const desdeAviso = minutosDesde(fila.alertado_en, ahoraMs);' '    return false;
    const desdeAviso = minutosDesde(fila.alertado_en, ahoraMs);' \
&& probar 'un aviso y después silencio, que es lo que dejó mudo el lunes'

echo "== 14. el vigía vuelve a correr sábado y domingo =="
mutar "$VERCEL" '      "schedule": "0 15 * * 1-5"' '      "schedule": "0 15 * * *"' \
&& probar 'el sábado gasta el candado y el lunes no suena'

echo "== 15. vuelve «falló 3 veces seguidas» por la puerta de atrás =="
mutar "$REGLA" 'export function textoSilencio(' 'export function textoCaido(dispositivo: string, motivo: string): string {
  return `El agente no puede leer el reloj (${dispositivo}). ${motivo}`;
}

export function textoSilencio(' \
&& probar 'el mensaje nocturno vuelve a existir'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$REGLA" '/** "hace 3 minutos" / "hace 2 horas" / "hace 4 días" — en español simple. */' '/** "hace 3 minutos" / "hace 2 horas" / "hace 4 dias" — en español simple. */' \
&& controlar 'comentario en el módulo puro'

echo "== CONTROL B. el respiro entre avisos se lee de la constante (misma conducta) =="
mutar "$REGLA" '    if (desdeAviso === null || desdeAviso <= horasEntreAvisos * 60) return false;' '    if (desdeAviso === null) return false;
    if (desdeAviso <= horasEntreAvisos * 60) return false;' \
&& controlar 'la misma condición partida en dos'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="
