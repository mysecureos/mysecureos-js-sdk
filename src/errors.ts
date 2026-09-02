/**
 * Thrown by `MySecureOSPartnerClient` for any non-2xx response from the
 * MySecureOS API. `status` is the HTTP status code; `message` is the server's
 * error message when it sent one.
 */
export class MySecureOSApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'MySecureOSApiError'
    this.status = status
    // Restore the prototype chain when compiled down to ES5-ish targets.
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * HTTP 402 — the org's SDK plan can't take this activation right now: the plan
 * is inactive / past due, or this calendar month's activation quota is used up.
 *
 * This is a billing/ops condition, **not** a transient failure: don't retry.
 * Surface it (alert, dashboard, log), then either upgrade the plan or wait for
 * the monthly reset. `clearEmergency` is never rate-limited, so an in-progress
 * incident can always be closed out.
 *
 * `message` is deliberately generic ("temporarily unavailable, try again
 * later") so it's safe to show an end user in a panic flow. For the real
 * reason and how close you are to the limit, call `client.getAccount()`. The
 * org's admins are also emailed at 80% of quota and again when it's reached.
 */
export class MySecureOSPaymentRequiredError extends MySecureOSApiError {
  constructor(message: string) {
    super(message, 402)
    this.name = 'MySecureOSPaymentRequiredError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
