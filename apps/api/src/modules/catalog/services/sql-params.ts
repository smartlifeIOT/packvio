/**
 * Positional-parameter accumulator for the hand-written catalog queries.
 *
 * These queries are assembled from optional fragments (category filter, search,
 * fulfilment mode…), which makes hand-numbering `$1`, `$2`… a reliable source of
 * off-by-one bugs — and an off-by-one in a parameter list is the kind of bug
 * that returns the wrong rows rather than an error. `add()` returns the
 * placeholder it just allocated, so a value and its position can never drift
 * apart, and no user input is ever concatenated into SQL.
 */
export class SqlParams {
  private readonly collected: unknown[] = [];

  add(value: unknown): string {
    this.collected.push(value);
    return `$${this.collected.length}`;
  }

  get values(): unknown[] {
    return this.collected;
  }
}
