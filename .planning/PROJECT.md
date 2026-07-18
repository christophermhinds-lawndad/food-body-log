# Food Body Log

## What This Is

Food Body Log is a simple, standalone iOS app for personal daily tracking around planned meals, food-related habits, emotional context, body weight, and next-day planning. It is built for one user on an iPhone 13, with all functionality and data self-contained on the device and no external service dependencies.

The app centers on a low-friction daily loop: plan tomorrow's meals, quickly log meal outcomes during the day, weigh in in the morning, and reflect in the evening when the day's data suggests something worth examining.

## Core Value

Make it fast and emotionally safe to notice patterns around hunger, satiety, food choices, emotions, and weight without turning tracking into judgment.

## Requirements

### Validated

(None yet - ship to validate)

### Active

- [ ] User can plan tomorrow's Breakfast, Lunch, Dinner, and Optional Snack with freeform meal text.
- [ ] User can log each meal in under 60 seconds with minimal friction.
- [ ] User can mark each meal with "Ate when hungry?" and "Stopped at enough?" yes/no values.
- [ ] User can mark a planned meal as skipped and still preserve that event in the day's record.
- [ ] User can enter one morning body weight value for a day.
- [ ] Morning weight entry includes encouraging, non-judgmental language that weight is only a number and not a reflection of personal worth.
- [ ] User can complete an evening journal and next-day planning flow.
- [ ] Evening journal prompts deeper reflection only after the day has a No or Skipped meal outcome.
- [ ] User can select emotion/situation chips and add optional freeform notes in evening reflection.
- [ ] User can highlight specific freeform journal answers as personal breakthroughs for later reference.
- [ ] User can view and edit prior days, with a preferred 72-hour edit window before records become read-only.
- [ ] User can see reports for meal habit percentages and weight averages across recent time windows.
- [ ] User can use prior meal text as typeahead suggestions while planning, limited to at most three suggestions at a time.
- [ ] All data stays local to the app and works without accounts, network access, analytics, or external storage.

### Out of Scope

- Notifications and reminders - user will manage reminders in a separate to-do app for v1.
- Apple Health import - useful later, but HealthKit permissions and entitlements add scope beyond v1.
- Cloud sync, accounts, collaboration, or web backend - the app is intentionally standalone and private.
- Calorie counting, macro tracking, dieting recommendations, or medical advice - not aligned with the emotionally safe core value.
- Body-image chips in the first emotion/situation chip set - intentionally excluded from this specific feature for v1.

## Context

The app is for personal use and self-installation on an iPhone 13. It should be a native iOS app that can be built and installed locally through Xcode. Because the app is personal and sensitive, privacy, offline operation, and a calm tone matter more than feature breadth.

The day is organized around four planned meal slots:

- Breakfast
- Lunch
- Dinner
- Optional Snack

Meal planning happens the day before, but the app does not need to hard-lock that timing. Each planned meal is freeform text. While typing a plan, the app should suggest matching prior meal entries to reduce cognitive load, showing no more than three suggestions at once.

During the day, meal logging must stay intentionally small: the user opens the app, records the two yes/no meal metrics or marks the meal skipped, and moves on. No reflection prompts should appear during meal logging.

Evening reflection is where deeper review happens. If any meal has "No" for either metric, or if a meal was skipped, the evening journal should prompt the user to evaluate what happened. Useful prompts include what was happening, what emotion or situation was present, what helped, and what could be done differently next time.

The starting emotion/situation chips are:

- stressed
- tired
- rushed
- bored
- anxious
- sad
- lonely
- celebratory
- distracted
- social pressure
- habit
- craving
- convenience
- conflict
- work pressure

Each evening journal question should have its own text field. Where relevant, a question may have associated emotion/situation chips. The user can highlight the freeform answer for a specific question as a breakthrough; highlighting an entire day's journal is out of scope because it becomes less useful for later review.

Weight tracking should store only the daily number. Reports should compare the current week's average weight against the previous week, four weeks ago, and twelve weeks ago, displaying "no data" where history is missing. The same report area should show habit percentages such as "Ate when hungry" and "Stopped at enough" over comparable time windows when enough meal data exists. A stretch report section may show top chips used in the last seven days.

## Constraints

- **Platform**: Native iOS app for iPhone 13 - must be practical to build and self-install locally.
- **Dependencies**: No external runtime dependencies or services - functionality and data should be self-contained.
- **Privacy**: All data remains local - food, emotion, journal, and weight data are sensitive.
- **Network**: Offline-first with no required network access - app should function fully without connectivity.
- **Scope**: v1 excludes Apple Health import and reminders - both are useful but not core to the first usable version.
- **Tone**: UI copy must be encouraging and non-judgmental - the app supports reflection, not shame.
- **Editing**: Prefer a 72-hour edit window before records become read-only - if this complicates v1 too much, fully editable history is acceptable.
- **Reporting**: Trend views should tolerate sparse data - display "no data" rather than making weak claims.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build as a standalone native iOS app | User wants self-installation on iPhone 13 and fully local functionality | - Pending |
| Keep meal logging to two yes/no metrics plus Skipped | The in-the-moment workflow must take under 60 seconds and avoid friction | - Pending |
| Defer deeper prompts to evening review | Reflection during meal logging would add noise and barriers | - Pending |
| Use freeform meal planning text with prior-entry suggestions | Planning should be flexible while reducing cognitive load | - Pending |
| Store only one daily weight number | The app should track trends without overcomplicating weigh-ins | - Pending |
| Exclude reminders and Apple Health import from v1 | User can manage reminders elsewhere; HealthKit adds extra implementation scope | - Pending |
| Highlight specific journal answers, not whole days | Specific breakthroughs are more useful for later review | - Pending |
| Prefer 72-hour edit window for prior days | Supports corrections while preserving historical integrity | - Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-17 after initialization*
