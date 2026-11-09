const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** One queue per project binding, independent of React effect scheduling. */
export class Projection<T> {
  private observed?: T;
  private expected?: T;
  private preApplication?: T;
  private deferred?: T;
  private pending = 0;
  private queue: Promise<void> = Promise.resolve();
  private detached = false;
  private queued?: { before: T; after: T };
  constructor(
    private read: () => T | undefined,
    private apply: (snapshot: T) => void,
    private send: (before: T, after: T) => Promise<T | undefined>,
    private error: (error: unknown) => void = () => {},
    private pendingChanged: (pending: number) => void = () => {},
  ) {}
  initialize(snapshot: T) {
    this.show(snapshot);
  }
  private show(snapshot: T) {
    if (this.detached) return;
    this.preApplication = this.read();
    this.observed = snapshot;
    this.expected = same(this.preApplication, snapshot) ? undefined : snapshot;
    this.apply(snapshot);
  }
  observe(snapshot: T) {
    if (this.detached) return;
    if (this.expected !== undefined) {
      if (same(snapshot, this.expected)) {
        this.expected = undefined;
        return;
      }
      if (same(snapshot, this.preApplication)) return;
      // A genuinely new render may include an edit coalesced with application.
      this.expected = undefined;
    }
    if (this.observed === undefined || same(snapshot, this.observed)) return;
    const before = this.observed;
    this.observed = snapshot;
    // Mientras el IPC/guardado está ocupado, el siguiente envío conserva el
    // primer estado observado y el último borrador: no escribe cien copias completas.
    if (this.queued) { this.queued.after = snapshot; return; }
    this.queued = { before, after: snapshot };
    this.pendingChanged(++this.pending);
    this.queue = this.queue
      .then(async () => {
        const batch = this.queued!; this.queued = undefined;
        const merged = await this.send(batch.before, batch.after);
        if (merged !== undefined) this.deferred = merged;
      })
      .catch(error => this.error(error))
      .finally(() => {
        this.pendingChanged(--this.pending);
        if (!this.pending && !this.detached) {
          const current = this.read();
          if (current !== undefined) this.observe(current);
        }
        if (!this.pending && this.deferred !== undefined) {
          const merged = this.deferred;
          this.deferred = undefined;
          this.show(merged);
        }
      });
  }
  receive(snapshot: T) {
    if (this.detached) return;
    const current = this.read();
    // Capture an edit that rendered but has not reached its publication effect.
    if (current !== undefined) this.observe(current);
    if (this.pending) this.deferred = snapshot;
    else this.show(snapshot);
  }
  async settled() {
    let observed: Promise<void>;
    do {
      observed = this.queue;
      await observed;
    } while (observed !== this.queue);
  }
  detach() {
    this.detached = true;
  }
}
