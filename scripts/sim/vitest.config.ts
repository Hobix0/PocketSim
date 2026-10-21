import { defineConfig } from 'vitest/config';

// Nur für die Balancing-Simulation: `npm run sim` (läuft nicht mit den normalen Tests)
export default defineConfig({
  test: { include: ['scripts/sim/**/*.sim.ts'], testTimeout: 600_000 },
});
