#!/usr/bin/env python3
"""Verificación POR MUTACIÓN de los candados de Ventas › Referencia (25-ago-2026).

Rompe el producto de UNA forma por vez y exige que los tests se pongan ROJOS.
Un candado que sobrevive a su mutación no está protegiendo nada.

  python3 scripts/_mutar-candados-referencia-cola.py

🩸 TRES LECCIONES QUE ESTE REPO YA PAGÓ Y ESTÁN APLICADAS ACÁ:
  · El reemplazo es LITERAL (str.replace), no un `s|de|a|` de perl/sed: el
    código real tiene `||`, `/` y `#`, y cualquier delimitador se des-escapa,
    se come el archivo entero y el informe canta un "SOBREVIVIÓ" falso.
  · La restauración va por COPIA, no con `git checkout`: hay archivos NUEVOS en
    la rama y git aborta el comando entero sin restaurar nada, así que las
    mutaciones se apilarían y ninguna se probaría por separado.
  · Si el patrón NO matchea, se DENUNCIA (⛔ patrón muerto) en vez de darlo por
    cazado, y si vitest no llegó a colectar tests, "0 fallos" NO se lee como
    "sobrevivió". Hay una mutación de CONTROL que a propósito no matchea: si no
    sale ⛔, el denunciador está roto y todos los ✅ valen lo mismo que nada.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]

MOTOR = "src/lib/ventas/resumen-articulo.ts"
ORDEN = "src/lib/ventas/referencia-orden.ts"
TABLA = "src/components/ventas/ReferenciaTablaPedido.tsx"
EXCEL = "src/lib/ventas/referencia-excel.ts"
FICHA = "src/components/ventas/ReferenciaTarjeta.tsx"

TESTS = [
    "src/__tests__/lib/ventas-resumen-articulo.test.ts",
    "src/__tests__/lib/ventas-compras.test.ts",
    "src/__tests__/lib/ventas-referencia-orden.test.ts",
    "src/__tests__/components/ventas-poda-textos.test.tsx",
    "src/__tests__/components/referencia-tabla-pedido.test.tsx",
]

# (nombre, archivo, texto viejo, texto nuevo, veces esperadas)
MUTACIONES: list[tuple[str, str, str, str, int]] = [
    (
        "la cola vuelve a exigir el CERO EXACTO (el bug de los 12 meses)",
        MOTOR,
        "  return existencia <= umbralDe(llegaron);",
        "  return existencia === 0;",
        1,
    ),
    (
        "existencia DESCONOCIDA se lee como cola (se afirma un agote que no se sabe)",
        MOTOR,
        "  if (existencia == null || llegaron == null) return false;",
        "  if (existencia == null || llegaron == null) return true;",
        1,
    ),
    (
        "el agotado de `medirAvance` vuelve a mirar el cero exacto",
        MOTOR,
        "  if (esColaDeBodega(art.existencia, compradoTotal) && vendidoTotal != null && vendidoTotal > 0) {",
        "  if (art.existencia === 0 && vendidoTotal != null && vendidoTotal > 0) {",
        1,
    ),
    (
        "el cierre de la ÚLTIMA llegada vuelve al cero exacto",
        MOTOR,
        "      (esColaDeBodega(art.existencia, t.llegaron, umbralDe) && t.vendidas > 0 && t.ultimaVentaMes != null);",
        "      (art.existencia === 0 && t.vendidas > 0 && t.ultimaVentaMes != null);",
        1,
    ),
    (
        "el % vuelve a medirse contra LO COMPRADO (100% con una unidad en bodega)",
        MOTOR,
        "  const hubo = vendido + Math.max(0, quedan);\n  if (!(hubo > 0)) return null;\n  return vendido / hubo;",
        "  return vendido / comprado;",
        1,
    ),
    (
        "una existencia NEGATIVA resta de lo que hubo (el % se dispara)",
        MOTOR,
        "  const hubo = vendido + Math.max(0, quedan);",
        "  const hubo = vendido + quedan;",
        1,
    ),
    (
        "sin catálogo se devuelve null en vez de caer a lo comprado",
        MOTOR,
        "  if (quedan == null) return vendido / comprado;",
        "  if (quedan == null) return null;",
        1,
    ),
    (
        "los TRES GRANDES de la llegada vuelven a `parteDeTanda` (25 ÷ 36)",
        MOTOR,
        "      parteVendida: parteVendidaReal(actual.vendidas, art.existencia, actual.llegaron),",
        "      parteVendida: parteDeTanda(actual),",
        1,
    ),
    (
        "el % del agotado vuelve al guard `vendido <= comprado` (TERMO en '—')",
        MOTOR,
        "      const parte = parteVendidaReal(vendidoTotal, art.existencia, compradoTotal);",
        "      const parte =\n        compradoTotal != null && compradoTotal > 0 && vendidoTotal <= compradoTotal\n          ? vendidoTotal / compradoTotal\n          : null;",
        1,
    ),
    (
        "la línea de venta vuelve a calcular su propio % (dos cuentas otra vez)",
        MOTOR,
        "      parte: parteVendidaReal(vendidoTotal ?? van(mesAncla), art.existencia, total) ?? 0,",
        "      parte: van(mesAncla) / total,",
        1,
    ),
    (
        "el pie de Vendí vuelve a decir 'de lo comprado' (miente al lado de Compré)",
        MOTOR,
        '  if (pct < 1) return "menos del 1% de lo que hubo";\n  return `el ${pct}% de lo que hubo`;',
        '  if (pct < 1) return "menos del 1% de lo comprado";\n  return `el ${pct}% de lo comprado`;',
        1,
    ),
    (
        "el pie de Vendí deja de dibujarse (la ficha pierde el %)",
        FICHA,
        "  const texto = textoParteVendida(g.parteVendida);",
        "  const texto: string | null = null;",
        1,
    ),
    (
        "el Excel deja de decir de qué sale el %",
        EXCEL,
        '`"Vendido" es lo REAL: Vendí ÷ (Vendí + Stock), o sea sobre lo que de verdad hubo — por eso con Stock 0 da 100% y con Stock a la vista da menos · `',
        '`"Vendido" es lo REAL · `',
        1,
    ),
    (
        "el tercer toque NO vuelve al orden pegado (queda revuelto para siempre)",
        ORDEN,
        "  // Tercero: se sale del override y vuelve el orden pegado.\n  return null;",
        "  return { col, dir: direccionInicial(col) };",
        1,
    ),
    (
        "el orden pegado deja de ser el default (siempre se ordena)",
        ORDEN,
        "  if (orden == null) return [...filas];",
        '  if (orden == null) orden = { col: "codigo", dir: "asc" };',
        1,
    ),
    (
        'los "—" pasan a ir primero al ordenar de menor a mayor',
        ORDEN,
        "    if (va == null) return 1;\n    if (vb == null) return -1;",
        "    if (va == null) return -1;\n    if (vb == null) return 1;",
        1,
    ),
    (
        "los números arrancan de menor a mayor (Stock ordena al revés)",
        ORDEN,
        '  return col === "codigo" ? "asc" : "desc";',
        '  return "asc";',
        1,
    ),
    (
        "la tabla ignora el estado de orden (el encabezado no hace nada)",
        TABLA,
        "    () => ordenarFilas(filasSinOrdenar, orden, (f) => f.valores),",
        "    () => ordenarFilas(filasSinOrdenar, null, (f) => f.valores),",
        1,
    ),
    (
        "el encabezado deja de ser un botón",
        TABLA,
        "                              onClick={() => setOrden((o) => siguienteOrden(o, c.col!))}",
        "                              onClick={() => undefined}",
        1,
    ),
    (
        "el sort vuelve a medir por su cuenta en vez de usar lo que la fila pintó",
        TABLA,
        "      vendido: vm.parte,",
        "      vendido: f.grandes.comprado ? f.grandes.vendido / f.grandes.comprado : null,",
        1,
    ),
    (
        "el redondeo vuelve a prometer 100% con algo en bodega (344 de 345)",
        MOTOR,
        "  return parte < 1 && pct >= 100 ? 99 : pct;",
        "  return pct;",
        1,
    ),
    (
        "la celda VENDIDO se salta el tope y redondea por su cuenta",
        MOTOR,
        "  return `${pctVendido(v.parte)}%`;",
        "  return `${Math.round(v.parte * 100)}%`;",
        1,
    ),
    (
        "CONTROL — este patrón NO existe y TIENE que denunciarse como muerto",
        MOTOR,
        "return unUmbralQueNoExisteEnNingunLado();",
        "return 0;",
        1,
    ),
]


def correr_tests() -> tuple[int, int]:
    """Devuelve (archivos colectados, tests fallados). Revienta si no colectó."""
    r = subprocess.run(
        ["npx", "vitest", "run", *TESTS],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    salida = r.stdout + r.stderr
    m_arch = re.search(r"Test Files\s+(.+)", salida)
    m_tests = re.search(r"^\s*Tests\s+(.+)$", salida, re.M)
    if not m_arch or not m_tests:
        # La corrida murió (o el módulo no compila): eso NO es "sobrevivió".
        return (0, -1)
    fallados = re.search(r"(\d+) failed", m_tests.group(1))
    archivos = sum(int(n) for n in re.findall(r"(\d+) (?:passed|failed)", m_arch.group(1)))
    return (archivos, int(fallados.group(1)) if fallados else 0)


def main() -> int:
    respaldo = Path(tempfile.mkdtemp(prefix="mutar-referencia-"))
    archivos = {MOTOR, ORDEN, TABLA, EXCEL, FICHA}
    for rel in archivos:
        destino = respaldo / rel
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(RAIZ / rel, destino)

    def restaurar() -> None:
        # 🔴 POR COPIA, nunca `git checkout`.
        for r in archivos:
            shutil.copy2(respaldo / r, RAIZ / r)

    cazadas, sobrevivientes, muertos = 0, [], []
    try:
        for nombre, rel, viejo, nuevo, veces in MUTACIONES:
            ruta = RAIZ / rel
            texto = ruta.read_text()
            if texto.count(viejo) != veces:
                muertos.append(nombre)
                print(f"⛔ PATRÓN MUERTO (no mutó nada): {nombre}")
                continue
            antes = texto
            ruta.write_text(texto.replace(viejo, nuevo))
            assert ruta.read_text() != antes, "el archivo no cambió"
            arch, fallados = correr_tests()
            restaurar()
            if fallados == -1:
                # El módulo no compila: la mutación se nota igual, pero se dice.
                print(f"✅ {nombre}  (la corrida ni compiló)")
                cazadas += 1
            elif fallados > 0:
                print(f"✅ {nombre}  ({fallados} test(s) en rojo, {arch} archivos)")
                cazadas += 1
            else:
                print(f"🔴 SOBREVIVIÓ: {nombre}")
                sobrevivientes.append(nombre)
    finally:
        restaurar()
        shutil.rmtree(respaldo, ignore_errors=True)

    reales = [m for m in MUTACIONES if not m[0].startswith("CONTROL")]
    print(f"\ncazadas {cazadas} de {len(reales)}")
    if muertos != ["CONTROL — este patrón NO existe y TIENE que denunciarse como muerto"]:
        print("🔴 el denunciador de patrones muertos no está funcionando:", muertos)
        return 1
    if sobrevivientes:
        print("🔴 sobrevivieron:", *sobrevivientes, sep="\n  · ")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
