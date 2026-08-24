/**
 * The boundary that keeps Lodariq from ever becoming the host page's problem.
 *
 * Everything Lodariq attaches to a customer's page — capture-phase listeners on
 * their elements, lifecycle handlers on their window, the auto-install itself —
 * runs inside their call stacks. An exception that escapes one of those
 * callbacks is indistinguishable, from the customer's side, from a bug in their
 * own application: it lands in their error reporter, trips their alerting, and
 * in a capture-phase click handler it can abort dispatch before their own
 * handler ever runs.
 *
 * So no Lodariq callback invoked from host context is allowed to throw. Errors
 * are routed to the sink below instead, where the runtime forwards them to our
 * observability once one exists. Before a runtime is constructed, or if
 * reporting itself fails, the error is dropped: a page that is merely missing a
 * tour is a far better outcome than a page whose own error budget we spend.
 *
 * This module is deliberately dependency-free and lives outside every renderer
 * so it can be imported from the smallest bundles without pulling a graph in.
 */

/** Which boundary caught the error; the label names the callback site. */
export interface HostErrorContext {
  label: string;
}

export type HostErrorSink = (error: unknown, context: HostErrorContext) => void;

let sink: HostErrorSink | null = null;

/**
 * Point the boundary at a reporter. The most recently installed sink wins, so a
 * runtime constructed later in the page's life takes over from an earlier one.
 */
export function setHostErrorSink(next: HostErrorSink | null): void {
  sink = next;
}

/**
 * Hand an error to the sink, swallowing anything the sink itself throws.
 *
 * A reporter that fails must not escalate into the very failure mode this
 * module exists to prevent.
 */
export function reportHostError(error: unknown, context: HostErrorContext): void {
  if (!sink) return;
  try {
    sink(error, context);
  } catch {
    /* A failing reporter is never allowed to reach the host page. */
  }
}

/**
 * Wrap a callback that host code will invoke so it cannot throw into that call.
 *
 * The wrapper preserves the return value on success and yields undefined on
 * failure, which is the correct shape for listeners and observers. Use
 * `hostSafeAsync` where the callback returns a promise: a rejected promise
 * escapes this wrapper untouched, because the throw happens after it returns.
 */
export function hostSafe<Args extends unknown[], Result>(
  label: string,
  callback: (...args: Args) => Result,
): (...args: Args) => Result | undefined {
  return (...args: Args): Result | undefined => {
    try {
      return callback(...args);
    } catch (error) {
      reportHostError(error, { label });
      return undefined;
    }
  };
}

/**
 * The async counterpart: catches both a synchronous throw and a later rejection
 * so neither surfaces as an unhandled rejection on the customer's page.
 */
export function hostSafeAsync<Args extends unknown[], Result>(
  label: string,
  callback: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result | undefined> {
  return async (...args: Args): Promise<Result | undefined> => {
    try {
      return await callback(...args);
    } catch (error) {
      reportHostError(error, { label });
      return undefined;
    }
  };
}
