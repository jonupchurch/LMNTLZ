import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'rules',
    include: ['tests/rules/**/*.test.ts'],
  },
});
