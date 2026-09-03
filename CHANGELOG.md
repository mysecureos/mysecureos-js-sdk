# Changelog

## Unreleased

- The **402** activation response now carries a deliberately generic message
  ("The emergency service is temporarily unavailable. Please try again later.")
- MySecureOS now emails the org's tenant admins at 80% of the monthly SDK
  activation quota and again when it is reached.

## 0.2.0

- **The SDK is now a paid product.** `POST /partner/emergencies` returns
  **HTTP 402** once the org's SDK plan is inactive/past-due or its monthly
  activation quota is used up. `MySecureOSPartnerClient.activateEmergency`
  throws the new **`MySecureOSPaymentRequiredError`** for this — catch it and
  alert billing/ops rather than retrying. `clearEmergency` is never quota-limited.
- New **`MySecureOSApiError`** (with a `status` field) is thrown for every other
  non-2xx API response; `MySecureOSPaymentRequiredError` extends it.
- New **`client.getAccount()`** → `{ tier, status, auraAddon, auraBundled, quota,
  used, periodEnd }`: the org's plan and this month's activation usage, so you
  can show usage in your own dashboard or warn before hitting the 402 wall.
- `panicBackend` (React Native) also throws the typed errors when your server
  relays MySecureOS's 402/error status through.

## 0.1.0

- Initial release: `MySecureOSPartnerClient` (activate / clear emergencies with a
  trusted-partner API key, exchanged for a short-lived SDK token), plus the
  opt-in `mysecureos-js-sdk/react-native` panic UI.
