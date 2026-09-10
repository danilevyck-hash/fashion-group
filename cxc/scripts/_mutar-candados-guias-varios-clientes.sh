#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿LOS CANDADOS DE «VARIOS CLIENTES Y DÍAS PLEGADOS» CAZAN DE VERDAD?
# (Guías › Nueva guía › Facturas del cliente — 10-sep-2026)
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES (sin mutar, y una mutación inocua) tienen que
# quedar VERDES: un ✅ ahí significa que los candados fallan por otra razón y
# toda la corrida no dice nada.
#
# Lo que Daniel aprobó y no se puede volver a romper:
#   1. «+ Otro cliente» limpia el BUSCADOR y NO borra los renglones marcados.
#   2. Solo el día más reciente viene abierto; los demás, plegados con su
#      conteo, y se abren de un toque. «Ver más días» los trae plegados.
#   3. 44 px con el dedo; lo que se aprieta es la computadora (pointer fino).
#   4. 🔴 EL PAYLOAD NO CAMBIA — un renglón por cliente-empresa, byte a byte.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: con archivos NUEVOS en
# la rama git aborta el comando entero sin restaurar nada — y un `checkout` en
# medio de la corrida borra el trabajo sin commitear.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-guias-varios-clientes.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/guias-varios-clientes-y-dias.test.ts \
src/__tests__/components/guias-varios-clientes-y-dias.test.tsx \
src/__tests__/components/guia-form-marcar-facturas.test.tsx \
src/__tests__/lib/guias-atajos-facturas.test.ts \
src/__tests__/un-solo-selector-de-cliente.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/guias/atajos-facturas.ts"
  "src/app/guias/components/FacturasDelCliente.tsx"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0

probar() { # $1 = nombre de la mutación
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
  fi
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos fallos) — $1"
    cazadas=$((cazadas + 1))
  else
    echo "  🔴 SOBREVIVIÓ — $1"
    sobrevivientes=$((sobrevivientes + 1))
  fi
}

mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  restaurar
  python3 - "$1" "$2" "$3" <<'PY'
import sys
ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta).read()
if viejo not in s:
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:70]}")
    sys.exit(3)
open(ruta, "w").write(s.replace(viejo, nuevo, 1))
PY
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

echo "── CONTROLES ────────────────────────────────────────────────────────────"
# ⚠️ `probar` está escrito para MUTACIONES: ahí «✅ CAZADA» = hubo fallos. En un
# CONTROL la lectura es al revés — lo bueno es el «🔴 SOBREVIVIÓ» (0 fallos).
probar "CONTROL 1 — sin mutar. Acá lo BUENO es el 🔴 (0 fallos); un ✅ es el problema"
mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  'className={`w-2.5 h-2.5 text-gray-400 shrink-0 transition-transform' \
  'className={`w-2.5 h-2.5 text-gray-500 shrink-0 transition-transform' \
  "CONTROL 2 — el gris de la flechita del día. Lo bueno es el 🔴"
mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '          data-testid="otro-cliente"' \
  '          data-fuera="no"
          data-testid="otro-cliente"' \
  "CONTROL 3 — un atributo de más en el botón. Lo bueno es el 🔴"
mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '      <div className="border border-gray-200 rounded-lg p-4">' \
  '      <div className="border border-gray-200 rounded-lg p-4" data-cuadro>' \
  "CONTROL 4 — marcar el cuadro con un atributo. Lo bueno es el 🔴"
control_fallos=$cazadas
cazadas=0; sobrevivientes=0

echo "── 1. «+ OTRO CLIENTE»: LIMPIA EL BUSCADOR, NO LOS RENGLONES ────────────"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '  function otroCliente() {
    setCliente(null);' \
  '  function otroCliente() {' \
  "1.1 el botón NO limpia el buscador (el cliente anterior se queda puesto)"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '    setCliente(null);
    setFacturas(null);' \
  '    setCliente(null);
    onReemplazarItems([]);
    setFacturas(null);' \
  "1.2 🩸 el botón BORRA los renglones ya marcados"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '{!cargando && clienteYaTieneRenglon && (' \
  '{!cargando && (' \
  "1.3 el botón se dibuja aunque el cliente no haya dejado nada"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  'items.some((r) => (r.cliente_codigo ?? "").trim() === cliente.codigo)' \
  'items.some((r) => (r.cliente_codigo ?? "").trim() !== "")' \
  "1.4 el botón mira CUALQUIER renglón, no los de ESTE cliente"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '    setPedirFoco((n) => n + 1);' \
  '    const campoYa = document.getElementById("facturas-cliente");
    if (campoYa instanceof HTMLInputElement) campoYa.focus();' \
  "1.5 🩸 el foco vuelve ANTES del re-render (el nombre viejo queda escrito)"

mutar "src/lib/guias/atajos-facturas.ts" \
  '    (r.cliente_codigo ?? "").trim() === cliente.codigo' \
  '    true' \
  "1.6 🔴 EL PAYLOAD — el segundo cliente se mete en el renglón del primero"

echo "── 2. LOS DÍAS VIENEN PLEGADOS, MENOS EL MÁS RECIENTE ───────────────────"

mutar "src/lib/guias/atajos-facturas.ts" \
  '  const abrePorDefecto = dia === diaMasReciente;
  return alternados.has(dia) ? !abrePorDefecto : abrePorDefecto;' \
  '  return true;' \
  "2.1 todos los días abren (la pantalla se vuelve a llenar)"

mutar "src/lib/guias/atajos-facturas.ts" \
  '  const abrePorDefecto = dia === diaMasReciente;
  return alternados.has(dia) ? !abrePorDefecto : abrePorDefecto;' \
  '  return alternados.has(dia);' \
  "2.2 ningún día abre solo (ni el más reciente)"

mutar "src/lib/guias/atajos-facturas.ts" \
  '  return alternados.has(dia) ? !abrePorDefecto : abrePorDefecto;' \
  '  return alternados.has(dia) || abrePorDefecto;' \
  "2.3 el día más reciente ya no se puede plegar"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '  const diaMasReciente = grupos[0]?.dia ?? null;' \
  '  const diaMasReciente = grupos[grupos.length - 1]?.dia ?? null;' \
  "2.4 el que abre solo es el día más VIEJO, no el más reciente"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '                      onClick={() => setDiasAlternados((a) => alternarDia(a, dia))}' \
  '                      onClick={() => {}}' \
  "2.5 el encabezado del día ya no abre nada"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '              setDiasAlternados(new Set());
              // El `nombre` ya viene' \
  '              // El `nombre` ya viene' \
  "2.6 cambiar de cliente no reinicia los días abiertos a mano"

mutar "src/lib/guias/atajos-facturas.ts" \
  '  const siguiente = new Set(alternados);' \
  '  const siguiente = alternados as Set<string>;' \
  "2.7 alternar MUTA el conjunto anterior"

echo "── 3. EL ENCABEZADO DICE CUÁNTAS FACTURAS ESCONDE ───────────────────────"

mutar "src/lib/guias/atajos-facturas.ts" \
  '  const facturas = `${total} ${total === 1 ? "factura" : "facturas"}`;' \
  '  const facturas = "";' \
  "3.1 el día plegado no dice cuántas facturas tiene"

mutar "src/lib/guias/atajos-facturas.ts" \
  '  if (abierto || marcadas <= 0) return facturas;' \
  '  if (marcadas <= 0) return facturas;' \
  "3.2 el día ABIERTO repite las marcadas (palabra de más)"

mutar "src/lib/guias/atajos-facturas.ts" \
  '  if (abierto || marcadas <= 0) return facturas;' \
  '  return facturas;' \
  "3.3 🩸 el día plegado esconde que ya hay facturas marcadas adentro"

mutar "src/lib/guias/atajos-facturas.ts" \
  '${total === 1 ? "factura" : "facturas"}' \
  '${"facturas"}' \
  "3.4 «1 facturas» — se pierde el singular"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '{`· ${resumenDelDia(fs.length, marcadasDelDia, abierto)}`}' \
  '{`· ${resumenDelDia(fs.length, 0, abierto)}`}' \
  "3.5 la pantalla nunca le pasa las marcadas al resumen"

echo "── 4. 44 PX CON EL DEDO ─────────────────────────────────────────────────"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  'className="flex flex-wrap items-center gap-3 py-1.5 min-h-[44px] lg:[@media(pointer:fine)]:min-h-0' \
  'className="flex flex-wrap items-center gap-3 py-1.5 min-h-0 lg:[@media(pointer:fine)]:min-h-0' \
  "4.1 la fila se aprieta TAMBIÉN en el celular"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  'className="flex flex-wrap items-center gap-3 py-1.5' \
  'className="flex items-center gap-3 py-1.5' \
  "4.4 la fila deja de envolver (en 390 px la página se arrastra de lado)"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  'text-left mb-1 min-h-[44px] lg:[@media(pointer:fine)]:min-h-0 lg:[@media(pointer:fine)]:py-1' \
  'text-left mb-1 lg:min-h-0 lg:py-1' \
  "4.2 el encabezado del día pierde los 44 px y se aprieta por ANCHO (el iPad se toca con el dedo)"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  'className="mt-2 text-sm text-gray-500 hover:text-black transition inline-flex items-center min-h-[44px]' \
  'className="mt-2 text-sm text-gray-500 hover:text-black transition inline-flex items-center' \
  "4.3 «+ Otro cliente» deja de tocarse desde el teléfono"

echo "── 6. MINIMALISMO: EL BOTÓN AFUERA Y EL PIE EN UNA LÍNEA ────────────────"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '          className="mt-2 text-sm text-gray-500 hover:text-black transition inline-flex items-center' \
  '          className="mt-2 w-full text-sm text-gray-500 hover:text-black transition flex items-center' \
  "6.2 «+ Otro cliente» vuelve a ser un botón gordo de ancho completo"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '                className="mt-3 flex flex-wrap items-center gap-x-2 border-t border-gray-100 pt-1 text-xs text-gray-400"' \
  '                className="mt-3 flex flex-col items-start gap-y-2 border-t-2 border-gray-200 pt-3 text-sm text-gray-400"' \
  "6.3 el pie vuelve a ser varios renglones con letra grande y línea gruesa"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '                    <span>Actualizado {horaCorta(hasta)}</span>' \
  '                    <span title={`Actualizado ${horaCorta(hasta)}`}>·</span>' \
  "6.4 la frescura se esconde en un title (en el iPad no hay mouse)"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '                  Escribir el número
                </button>' \
  '                </button>' \
  "6.5 se pierde «Escribir el número» (la salida a mano de siempre)"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '                  {buscandoOtraVez ? "Buscando…" : "Buscar otra vez"}' \
  '                  {buscandoOtraVez ? "Buscando…" : ""}' \
  "6.6 se pierde «Buscar otra vez»"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '      </div>

      {/* 🔴 «+ OTRO CLIENTE» VA DEBAJO DEL CUADRO, NO ADENTRO (10-sep-2026).
          Daniel, textual: *«agregar otro cliente debería estar abajo de ese
          cuadro, no dentro»* — adentro se leía como una acción MÁS del cliente
          que se está mirando; afuera se lee como lo que es: terminaste con
          éste, sigue con el próximo.

          🔴 Lo que HACE no cambió: limpia el buscador y deja el foco ahí; los
          renglones ya marcados se quedan abajo, en «Detalle de Envío». Y se
          dibuja solo cuando este cliente ya dejó algo en la guía. */}
      {!cargando && clienteYaTieneRenglon && (
        <button
          type="button"
          data-testid="otro-cliente"
          onClick={otroCliente}
          className="mt-2 text-sm text-gray-500 hover:text-black transition inline-flex items-center min-h-[44px] md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1"
        >
          + Otro cliente
        </button>
      )}
    </div>
  );
}' \
  '      {/* 🔴 «+ OTRO CLIENTE» VA DEBAJO DEL CUADRO, NO ADENTRO (10-sep-2026).
          Daniel, textual: *«agregar otro cliente debería estar abajo de ese
          cuadro, no dentro»* — adentro se leía como una acción MÁS del cliente
          que se está mirando; afuera se lee como lo que es: terminaste con
          éste, sigue con el próximo.

          🔴 Lo que HACE no cambió: limpia el buscador y deja el foco ahí; los
          renglones ya marcados se quedan abajo, en «Detalle de Envío». Y se
          dibuja solo cuando este cliente ya dejó algo en la guía. */}
      {!cargando && clienteYaTieneRenglon && (
        <button
          type="button"
          data-testid="otro-cliente"
          onClick={otroCliente}
          className="mt-2 text-sm text-gray-500 hover:text-black transition inline-flex items-center min-h-[44px] md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1"
        >
          + Otro cliente
        </button>
      )}
      </div>
    </div>
  );
}' \
  "6.8 el botón vuelve ADENTRO del cuadro (Daniel: «no dentro»)"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '                    className="text-xs text-gray-400 hover:text-black transition inline-flex items-center min-h-[44px] md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:mt-1"
                  >
                    Ver más días' \
  '                    className="text-base text-gray-400 hover:text-black transition inline-flex items-center min-h-[44px]"
                  >
                    Ver más días' \
  "6.7 «Ver más días» deja de ser un enlace chico"

echo "── 5. LO QUE NO SE TOCA ─────────────────────────────────────────────────"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '                                  Ya salió en GT-{String(f.yaSalioEn).padStart(3, "0")}' \
  '                                  GT-{String(f.yaSalioEn).padStart(3, "0")}' \
  "5.1 la etiqueta «Ya salió en GT-XXX» se recorta (Daniel: «el ya salió no me molesta»)"

mutar "src/app/guias/components/FacturasDelCliente.tsx" \
  '            permitirOtro={false}' \
  '            permitirOtro' \
  "5.2 el buscador del panel deja pasar clientes escritos a mano"

echo
echo "────────────────────────────────────────────────────────────────────────"
echo "CONTROLES que fallaron (tiene que ser 0): $control_fallos"
echo "MUTACIONES cazadas: $cazadas · sobrevivientes: $sobrevivientes"
