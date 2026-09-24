import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // .tsx habilitado para los tests que renderizan componentes de verdad
    // (@testing-library/react), no solo lógica pura.
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    // ─────────────────────────────────────────────────────────────────────
    // 🔴 CUÁNTO AGUANTA UNA PRUEBA ANTES DE QUE VITEST LA MATE (23-sep-2026)
    //
    // 🩸 EL DEFECTO: `vitest.setup.ts` le dio a `waitFor` una espera de 5.000
    // ms… y el tope de Vitest por omisión es EXACTAMENTE 5.000 ms. O sea que
    // la prueba se moría en el mismo instante en que `waitFor` iba a rendirse:
    // el margen que se había ganado el 20-sep nunca se pudo usar. En la
    // máquina de GitHub —2 núcleos para 876 archivos de prueba— eso daba rojo
    // al azar: 13 de 34 corridas entre el 19 y el 23-sep, nunca la misma
    // prueba dos veces, y todas pasaban solas al repetirlas.
    //
    // 🔑 ESTO NO TAPA NADA. `waitFor` REINTENTA hasta que la condición se
    // cumple: con el código sano termina en milisegundos y estos 20 segundos
    // no se gastan jamás. Una prueba de verdad rota sigue roja, unos segundos
    // más tarde. Lo que SÍ sería taparlo es una espera fija (`setTimeout` de
    // N ms y después afirmar); ésas se barrieron el 19-sep y no vuelven.
    //
    // ⚠️ REGLA: este número tiene que quedar MUY por encima del
    // `asyncUtilTimeout` de `vitest.setup.ts`. Si alguien sube aquel, sube
    // éste también.
    // ─────────────────────────────────────────────────────────────────────
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
