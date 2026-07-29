import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * jsdom is one document per file, not per test, so a component left mounted by
 * one test is still in the DOM for the next — and `getByRole` then finds two
 * matches and fails with a message about ambiguity rather than about the leak.
 */
afterEach(cleanup);
