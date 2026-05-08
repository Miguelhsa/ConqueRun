# Store Readiness Checklist

- Provide a public privacy policy URL in App Store Connect and Play Console.
- Provide an external account deletion request URL for Google Play.
- Keep location permission foreground-only unless background tracking becomes essential.
- Add Sign in with Apple if Google login is added on iOS.
- Keep Strava OAuth token exchange and refresh on backend, never in the mobile app.
- Provide an Apple review demo account with realistic test data.
- Deploy Firestore and Storage rules before closed testing.
- Add backend jobs for final account deletion, Strava imports, image moderation, and conquest validation.
- Keep the longer post-MVP implementation backlog in `docs/todo-post-mvp.md`.
