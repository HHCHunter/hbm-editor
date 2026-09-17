/**
 * A value loaded on first use and shared by later callers. A load that fails isn't kept, so the
 * next caller tries again rather than getting the same error until restart.
 */
export class Once<T> {
  private pending: Promise<T> | null = null;

  get(load: () => Promise<T>): Promise<T> {
    if (!this.pending) {
      const pending = load();
      this.pending = pending;
      pending.catch(() => {
        if (this.pending === pending) this.pending = null;
      });
    }
    return this.pending;
  }

  clear(): void {
    this.pending = null;
  }
}
