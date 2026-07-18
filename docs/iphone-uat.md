# iPhone UAT Checklist

Use this checklist for final iPhone 13 Safari validation from a hosted HTTPS URL. Do not mark the manual result as passing unless it was completed on the target device and deployed URL.

## Test Record

| Field | Value |
|-------|-------|
| Tester |  |
| Device | iPhone 13 |
| iOS version |  |
| Browser | iPhone 13 Safari |
| Hosted HTTPS URL |  |
| Date |  |
| Result | Pass / Fail / Blocked |
| Blocked reason | No physical iPhone 13 available / No hosted HTTPS static-host URL available / Other: |
| Notes |  |

## Preconditions

- The hosted HTTPS URL serves the `public/` directory from the same root domain or project subpath intended for routine use.
- Settings can be opened from the bottom tab bar.
- The tester can run `Check install status` from Settings while online.

Keep the protocol, domain, and path stable during the test. IndexedDB data is tied to the browser storage location for the app URL; changing from one hosted HTTPS URL to another can make the existing IndexedDB setup/status record unavailable from the new location.

## Install And Standalone Relaunch

1. Open the hosted HTTPS URL in iPhone 13 Safari.
2. Confirm the app shell loads and the Settings tab is reachable.
3. Use Safari Share -> Add to Home Screen.
4. Accept the app name and icon shown by Safari.
5. Launch the app from the Home Screen icon.
6. Record whether standalone relaunch opens the app shell without Safari browser chrome.
7. Open Settings and run `Check install status`.
8. Record the Install mode, Offline app shell, Local storage, Local-only privacy, Storage caveat, and Updates rows.

Expected result: standalone relaunch opens the same app path, and Settings remains readable with local storage available.

## Cache-Ready Settings Status And Offline Check

1. With network available, open Settings from the Home Screen app.
2. Run `Check install status`.
3. Wait for cache-ready Settings status: Offline app shell should read `Ready`.
4. Close the app.
5. Enable Airplane Mode.
6. Launch from the Home Screen icon again.
7. Record whether the airplane-mode launch opens the cached app shell.
8. Open Settings and confirm the prior setup/status rows are still present.

Expected result: after cache readiness, airplane-mode launch opens the static shell and Settings remains usable.

## Update/Relaunch Data Preservation

1. While online, confirm Settings has written an IndexedDB setup/status record by running `Check install status`.
2. Replace the static files on the same hosted path.
3. Reopen the hosted HTTPS URL once in Safari or relaunch the Home Screen app while online.
4. Run `Check install status` again.
5. Relaunch from Home Screen.
6. Record update/relaunch data preservation: the app shell may update, but the local setup/status record remains available at the same URL location.

Expected result: replacing static files does not move local data off the device and does not require a different app URL.

## Requirement Map

| Requirement | Manual evidence |
|-------------|-----------------|
| APP-05 | iPhone 13 Safari Add to Home Screen succeeds from the hosted HTTPS URL. |
| APP-06 | Home Screen standalone relaunch opens the app shell after first load. |
| APP-07 | Airplane-mode launch opens the cached shell after cache readiness. |
| APP-08 | Settings explains that updates may require revisiting the app URL. |
| HOST-06 | Install and use are verified from a hosted HTTPS URL. |
| HOST-07 | Update/relaunch data preservation is verified at the same URL location. |
| HOST-08 | Settings status verifies the offline app shell is ready. |

## Execution Status

Current automated execution status: Blocked for physical-device UAT unless both of these are available:

- No physical iPhone 13 available.
- No hosted HTTPS static-host URL available.

Local automated checks can still pass while this manual UAT remains Blocked.
