// Shared setup for ui component tests, which run in jsdom: import it before rendering.
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const g = globalThis as { ResizeObserver?: unknown };
g.ResizeObserver ??= NoopResizeObserver;

// jsdom has no layout, so scrolling into view is a no-op.
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

afterEach(() => cleanup());
