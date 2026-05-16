# Amazing Marvin Automation Kit

Tampermonkey scripts for Amazing Marvin. The repo is organized so the scripts stay usable now and the folder structure can grow into a larger browser-extension project later.

## Repository Layout

- `userscripts/` - installable Tampermonkey scripts.
- `docs/` - project notes and structure decisions.
- `references/` - local-only reference material for Marvin APIs and related experiments.

## Using These Scripts

1. Install Tampermonkey in your browser.
2. Open the `.user.js` file from `userscripts/` and install it into Tampermonkey.
3. Visit `https://app.amazingmarvin.com/` or `https://amazingmarvin.com/`.
4. Use the shortcut or workflow described in the script section below.

## `amazing-marvin-check-all-subtasks.user.js`

### What it solves

This script makes it faster to finish a task that has a lot of subtasks. Instead of clicking each subtask checkbox individually, you can toggle the whole set at once for the currently selected task.

### How to use it

- Shortcut: `Alt + Shift + D`
- No API token is required.
- The selected task must have visible subtasks on screen.
- The script only operates on the currently selected task. If focus is inside a task row, that task is used. Otherwise it falls back to Marvin's selected task state.

### Step-by-step example

1. Open a task in Marvin that has several visible subtasks.
2. Select the parent task so it is the active task on screen.
3. Press `Alt + Shift + D`.
4. The script checks all unchecked visible subtasks.
5. Marvin should immediately show those subtasks marked done.

### What you should see

- If some subtasks were unchecked, only those remaining subtasks get checked.
- If every visible subtask was already checked, the script unchecks them all instead.
- If the task has no visible subtasks, nothing changes.
- A task selection remains in place; this is not a navigation or page-refresh action.

## `amazing-marvin-task-unroller.user.js`

### What it solves

This script expands a single Marvin task into a short sequence of tasks when you write loop syntax in the title. It is useful for repeated work that you want Marvin to create automatically, while preserving the task's metadata.

Example inputs:

- `Do Assignment #$1..3`
- `8:00am Watch documentary on wildlife ($1..3)`

### How to use it

- No keyboard shortcut is required.
- The script watches Marvin for newly created tasks.
- You create the original task normally in Marvin.
- The script needs Marvin API credentials:
  - a full access token for reading and renaming the original task
  - a regular API token for creating the additional copies
- The script exposes Tampermonkey menu items to set those values:
  - `Set Marvin full access token`
  - `Set Marvin API token`
  - `Set Marvin API base URL`

### Loop syntax

- `$1..3` becomes a numbered sequence.
- `#` can be part of the title, so `Do Assignment #$1..3` becomes:
  - `Do Assignment #1`
  - `Do Assignment #2`
  - `Do Assignment #3`
- Parenthesized loops keep the counter and total, so `($1..3)` becomes `(1/3)`, `(2/3)`, `(3/3)`.
- If the task has a start time in the title or Marvin stores one separately, a duration is required so later copies can shift forward correctly.
- If there is no start time, the loop can still expand without a duration.

### Step-by-step example: basic numbering

1. In Marvin, create a task named `Do Assignment #$1..3`.
2. Save the task normally.
3. The script sees the new task, reads the saved Marvin task object, and renames the original to `Do Assignment #1`.
4. It creates two more tasks through Marvin's API: `Do Assignment #2` and `Do Assignment #3`.
5. Marvin should briefly show a toast saying it is unrolling the task, then another toast confirming the copies were created.

### What you should see

- The original task becomes the first item in the sequence.
- Additional tasks appear immediately underneath or alongside it, depending on the current Marvin list sorting.
- Category/project, labels, note, estimate, scheduling fields, and other preserved task metadata should carry over.
- If the task included subtasks, those are passed through as part of the copied task payload.

### Step-by-step example: timed unrolling

1. Create a task like `8:00am Watch documentary on wildlife ($1..3)`.
2. Give the task a duration of 20 minutes.
3. Save the task.
4. The script renames the original to the first iteration.
5. The next copies are created with shifted start times:
   - `8:00am Watch documentary on wildlife (1/3)`
   - `8:20am Watch documentary on wildlife (2/3)`
   - `8:40am Watch documentary on wildlife (3/3)`

### What you should see

- The task title updates to the first iteration.
- The later tasks keep the same general task details, but their start times advance by the duration.
- If the task has a start time but no duration, the script stops and shows an error instead of creating incorrect copies.
- If the loop syntax is invalid, nothing is created and Marvin keeps the original task as-is.

### Expected behavior notes

- The script intentionally waits until Marvin has created the real task first. It does not try to fake the entire creation flow itself.
- It uses Marvin's API rather than hardcoded DOM cloning so the result is closer to how Marvin itself would create a task.
- It shows short toast messages while it is working so you can tell whether the unroll is in progress or complete.

## `Append -since YYYY-MM-DD- to procrastination hover text-1.0.user.js`

### What it solves

This script makes Marvin's procrastination tooltip more informative. It takes hover text that looks like `Days procrastinated: 10` and appends an inferred start date, such as `Days procrastinated: 10 (since 2026-05-06)`.

### How to use it

- No keyboard shortcut is required.
- No API token is required.
- The script runs automatically on Marvin pages.
- It watches tooltip text in the `data-lhover3` attribute and keeps new elements in sync as Marvin updates the page.

### Step-by-step example

1. In Marvin, hover a task or item that shows procrastination information.
2. Marvin may render a tooltip like `Days procrastinated: 10`.
3. This script rewrites the hover text in place.
4. The tooltip becomes `Days procrastinated: 10 (since YYYY-MM-DD)`.
5. If Marvin re-renders the element later, the script patches it again so the date stays attached.

### What you should see

- The hover tooltip keeps Marvin's original procrastination count.
- The tooltip gains an appended `since` date derived from the number of procrastinated days.
- The change is automatic; there is no visible button, menu item, or shortcut.
- If the hover text does not match the expected pattern, the script leaves it alone.

## Development Notes

- The scripts are written to stay close to Marvin's own data and UI behavior.
- The repository is set up so more userscripts, a browser extension, or shared utilities can be added later without flattening everything into one folder.
- Secrets should stay in Tampermonkey storage or local `.env` files. `.env` is ignored on purpose.
