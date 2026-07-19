---
phase: 06-data-safety-and-experience-hardening
status: ready-for-verification
created: 2026-07-19
scope: Data safety, static shell parity, Settings backup, and calm mobile experience
---

# Phase 06 UAT: Data Safety And Experience Hardening

Use this checklist during `$gsd-verify-work` to validate the final Phase 6 backup experience, static shell cache boundary, and target-device backstops. Automated tests cover repository behavior, copy guards, static shell parity, and cache exclusions; the checks below cover browser behavior and manual device evidence without claiming unavailable target checks.

## Automation Prerequisite

- Run `node --test tests/*.test.js`.
- Expected: the full dependency-free Node test suite is green before manual UAT starts.
- Scope note: these tests do not prove physical iPhone 13 Safari, hosted HTTPS launch, Home Screen install, native file picker behavior, browser download UI, or installed offline relaunch.

## Local Browser Checks

### Export Download

- Setup: open the app from a local static server or hosted static URL using a disposable test origin, then save at least one meal, weight, or reflection entry.
- Steps: open Settings and activate `Export backup`.
- Expected: the browser offers or creates a Food Body Log JSON backup file; Settings shows `Backup exported. Keep the file somewhere you can find it later.` Saved local data remains available in the app.
- Result status: pending manual verification.

### Valid Import Merge

- Setup: keep a known exported Food Body Log JSON backup from the same test origin or a disposable fixture. Export current local data first if it needs to be preserved.
- Steps: open Settings, choose the valid JSON backup with dates that do not overlap local data, select `Import backup`, then reopen Today, Plan, Journal, History, and Reports.
- Expected: validation shows `Backup looks ready to import. Non-overlapping dates will be added to local data.` Existing local dates remain saved, and imported records appear in the relevant tabs.
- Result status: pending manual verification.

### Valid Import Overlap Confirmation

- Setup: keep a known exported Food Body Log JSON backup whose dates overlap at least one local date on the test origin. Export current local data first if it needs to be preserved.
- Steps: open Settings and choose the valid JSON backup.
- Expected: Settings shows `Backup has dates that overlap local data. Check the overwrite box before importing.`, lists the number of overlapping days, shows the overlap checkbox, and keeps `Import backup` unavailable until the checkbox is checked. After checking the box and importing, overlapping dates are replaced by the backup while non-overlapping local dates stay saved.
- Result status: pending manual verification.

### Invalid Import No-Write

- Setup: create a malformed JSON file or edit a backup so it has an unsupported app, version, or missing required local data section.
- Steps: open Settings, choose the invalid file, and inspect the import status.
- Expected: Settings shows one of the calm invalid or unsupported backup messages plus `Nothing was imported, and the local data already on this device was not changed.` The replace action stays unavailable, and existing app data remains unchanged after reopening tabs.
- Result status: pending manual verification.

### Settings Storage Warning

- Setup: open Settings.
- Steps: inspect the install status rows and the `Data backup` section.
- Expected: Settings names Home Screen app deletion, website data clearing, and browser storage changes as ways local app data can be removed, and recommends exporting a backup outside browser storage.
- Result status: pending manual verification.

### Long Filename Wrapping

- Setup: choose a valid or invalid backup file with a very long filename, including at least one long unbroken segment if possible.
- Steps: inspect Settings at a 390px-wide viewport after selecting the file.
- Expected: selected filename, helper text, validation status, and action labels wrap inside the Settings panel without horizontal scrolling, overlap, clipping, or bottom-tab collision.
- Result status: pending manual verification.

### Whole-App Primary-Flow Fit

- Setup: use a 390px-wide viewport and representative saved data, including long meal text and long journal text.
- Steps: inspect Today, Plan, Reports, Journal, History, and Settings backup controls.
- Expected: primary controls remain reachable, text remains legible, dynamic/user-authored text wraps, and the fixed bottom tab bar does not hide the active content.
- Result status: pending manual verification.

### Safety And Tone Pass

- Setup: use sparse data, partial days, skipped meals, invalid backup input, unsupported backup input, and read-only History days.
- Steps: inspect visible copy across all tabs.
- Expected: copy remains calm for No, Skipped, missing, invalid backup, unsupported backup, and read-only states. No calorie, macro, food-grade, diet, target-weight, streak, score, shame, or pressure framing appears.
- Result status: pending manual verification.

### Cache-Ready Static Shell Boundary

- Setup: open the app once while online after the Phase 6 static files are published.
- Steps: open Settings and activate `Check install status`; then inspect service-worker cache contents with browser devtools if available.
- Expected: the static shell can report readiness for the Phase 6 asset set, including `data-portability.js`, while JSON backups, IndexedDB records, export/import paths, backend/API/account/analytics/package artifacts, and user data are not cached as shell assets.
- Result status: pending manual verification.

## Human-Needed Target Evidence

These checks require real target evidence. They are not claimed by this artifact.

| Evidence | Status | Why Human-Needed | Expected Check |
| --- | --- | --- | --- |
| Physical iPhone 13 | human-needed | No physical iPhone 13 evidence was captured during execution. | Open the app in Safari on iPhone 13 and inspect Settings backup plus primary tabs for clipping, overlap, horizontal scroll, and legible labels. |
| Hosted HTTPS URL | human-needed | No hosted HTTPS static-host URL evidence was captured during execution. | Load the published static app from HTTPS and confirm relative assets, manifest, service worker scope, and project-subpath behavior work. |
| Home Screen install | human-needed | No Home Screen launch evidence was captured during execution. | Add the hosted HTTPS app to Home Screen, launch it standalone, and inspect the six-tab shell plus Settings backup controls. |
| Installed offline relaunch | human-needed | No installed offline relaunch evidence was captured during execution. | After an online hosted launch and Home Screen launch, enable airplane mode and relaunch the installed app; confirm the cached shell loads and Settings backup controls remain available. |

## Sign-Off Notes

- Keep every target evidence row above as `human-needed` until corresponding real device or hosted evidence is captured.
- Record actual manual evidence in verifier output. Do not rewrite this checklist to imply target-device, hosted HTTPS, Home Screen, or offline relaunch evidence was captured by automated tests.
- If local browser checks are run on desktop only, leave iPhone 13, hosted HTTPS, Home Screen install, and installed offline relaunch rows as `human-needed`.
