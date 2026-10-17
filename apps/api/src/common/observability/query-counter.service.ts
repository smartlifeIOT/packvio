import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface QueryCountStore {
  count: number;
}

/**
 * Per-request SQL query counter.
 *
 * "No N+1" is an assertion that decays silently: one `await` moved inside a
 * `map` turns a 2-query endpoint into a 25-query endpoint with no test failing
 * and no error logged. Counting queries per request makes the regression
 * visible the moment it happens, in the dev log, rather than in production
 * latency graphs months later.
 *
 * AsyncLocalStorage is what makes the count attributable: the DataSource is a
 * process-wide singleton with no idea which request a query belongs to, and the
 * ALS context propagates through every await in the handler chain.
 */
@Injectable()
export class QueryCounterService {
  private readonly storage = new AsyncLocalStorage<QueryCountStore>();

  run<T>(store: QueryCountStore, work: () => T): T {
    return this.storage.run(store, work);
  }

  increment(): void {
    const store = this.storage.getStore();
    if (store) store.count += 1;
  }
}
