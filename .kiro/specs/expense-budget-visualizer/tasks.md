# Implementation Plan: Expense & Budget Visualizer

## Overview

The implementation follows the three-layer architecture defined in the design: pure logic functions (validation, computation, serialization), a state layer with a single source of truth (the in-memory `transactions` array), a UI layer for DOM rendering and event handling, and a persistence layer wrapping Local Storage. All JavaScript lives in a single IIFE module in `js/app.js`, exposed via the `ExpenseViz` global namespace. Amounts are stored as integer cents internally and formatted to two decimal places only at display time. Chart.js is loaded via CDN `<script>` tag, and all Local Storage operations are wrapped in try/catch for `file://` origin compatibility.

## Tasks

- [x] 1. Set up project structure and HTML/CSS scaffolding
  - [x] 1.1 Create index.html with semantic structure and Chart.js CDN script tag
    - Create the HTML file with a single vertical stack layout containing four sections in order: Total_Balance, Input_Form, Transaction_List, and Spending_Chart
    - Input_Form fields: item name (text input, maxlength 100), amount (number input), category (select with Food, Transport, Fun options)
    - Transaction_List section with a scrollable container and an empty-state message element
    - Spending_Chart section with a `<canvas>` for Chart.js and a "no spending data" message element
    - Include Chart.js CDN `<script>` tag before `js/app.js` (traditional script tag, not ES module)
    - Link `css/styles.css` in the head
    - _Requirements: 6.1, 6.3, 8.1, 8.2_

  - [x] 1.2 Create css/styles.css with responsive mobile-friendly styling
    - Set base body font size to at least 16 pixels for all displayed text
    - Style the Total_Balance with a font size at least 2 times the base body text size
    - Ensure no horizontal scrolling for viewport widths between 320 and 768 pixels
    - Set minimum touch target sizes of 44 by 44 pixels for all interactive elements (buttons, select, inputs)
    - Apply a single vertical stack layout with no additional sections or decorative elements
    - Style the Transaction_List container to scroll vertically only (overflow-y: auto, overflow-x: hidden)
    - _Requirements: 7.1, 8.1, 8.2, 8.3_

- [x] 2. Implement Logic Layer pure functions
  - [x] 2.1 Implement validateTransaction
    - Define the allowed category set (Food, Transport, Fun)
    - Check itemName: trimmed non-empty, length between 1 and 100 characters
    - Check amount: parse the raw string to integer cents, must be a finite number in the range 0.01 to 999999999.99 (1 to 99999999999 cents)
    - Check category: must be one of the three allowed values
    - Return a ValidationResult object `{ valid, errors }` where errors has a message string per invalid field and null for valid fields; valid is true only when all three fields have null errors
    - No side effects; pure function
    - _Requirements: 1.1, 1.3_

  - [x] 2.2 Implement computeTotalBalance and computeCategoryTotals
    - computeTotalBalance: sum all transaction amountCents values and return the total in cents; return 0 for an empty list
    - computeCategoryTotals: aggregate amountCents per category, always returning an object with all three keys (Food, Transport, Fun) even when their total is zero
    - Both functions are pure with no side effects
    - _Requirements: 3.1, 3.3, 4.1_

  - [x] 2.3 Implement serializeTransactions and deserializeTransactions
    - serializeTransactions: JSON-encode the array into `{ version: 1, transactions: [...] }` format with a schema version tag for forward compatibility
    - deserializeTransactions: parse and validate a stored string back into a Transaction array; verify schema version is present and supported, verify each transaction has valid id, itemName, amountCents, and category fields
    - deserializeTransactions returns null on any parse, schema, or shape failure so the app initializes empty
    - Both functions are pure (input to output, no side effects)
    - _Requirements: 5.1, 5.2, 5.4_

  - [~] 2.4 Write unit tests for Logic Layer pure functions
    - Test validateTransaction with valid inputs, empty itemName, over-length itemName, non-numeric amount, out-of-range amounts (below 0.01, above 999999999.99), and invalid category values
    - Test computeTotalBalance with empty list (returns 0), single transaction, and multiple transactions
    - Test computeCategoryTotals with empty list (all zeros), single-category transactions, mixed-category transactions, and verify all three keys are always present
    - Test serialize/deserialize round-trip consistency, invalid JSON string, missing version field, unsupported version, and malformed transaction shape (returns null)
    - _Requirements: 1.1, 1.3, 3.1, 3.3, 4.1, 5.1, 5.2, 5.4_

- [x] 3. Implement Persistence Layer
  - [x] 3.1 Implement isStorageAvailable, save, and load
    - isStorageAvailable: feature-detect localStorage with a probe write/read/remove cycle, return boolean
    - save: call serializeTransactions and write to localStorage, return false on failure, never throw to the caller
    - load: read from localStorage and call deserializeTransactions, return null when unavailable, empty, or invalid
    - Wrap all storage operations in try/catch for file:// origin compatibility across Chrome, Firefox, Edge, and Safari
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [~] 3.2 Write unit tests for Persistence Layer
    - Test isStorageAvailable returns true when storage works and false when it throws
    - Test save with valid transaction data writes successfully and returns true
    - Test save returns false and does not throw when storage is unavailable
    - Test load returns the correct transaction array when valid data is stored
    - Test load returns null when storage is empty, contains invalid JSON, or is unavailable
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 4. Implement State Layer
  - [x] 4.1 Implement transactions array, addTransaction, and deleteTransaction
    - Maintain an in-memory transactions array as the single source of truth
    - addTransaction: call validateTransaction; if invalid, return `{ ok: false, errors }` without mutating state; if valid, generate a unique id (via crypto.randomUUID with timestamp-random fallback), append a new Transaction to the array, trigger renderAll, and call persist
    - deleteTransaction: remove the transaction with the given id from the array, trigger renderAll, and call persist
    - Expose addTransaction and deleteTransaction through the ExpenseViz public API
    - _Requirements: 1.2, 2.4, 5.1_

  - [~] 4.2 Write unit tests for State Layer
    - Test addTransaction with valid input adds a transaction and returns `{ ok: true }`
    - Test addTransaction with invalid input returns errors and does not mutate the transactions array
    - Test deleteTransaction with an existing id removes the correct transaction
    - Test deleteTransaction with a non-existent id leaves the array unchanged
    - Test generated ids are unique across multiple addTransaction calls
    - _Requirements: 1.2, 1.3, 2.4, 5.1_

- [x] 5. Implement UI Layer — rendering and event handling
  - [x] 5.1 Implement renderTransactionList and renderTotalBalance
    - renderTransactionList: rebuild the list DOM from the transactions array, each entry showing item name, amount (formatted to 2 decimals), category, and a delete control button
    - renderTransactionList: show the empty-state message when the array is empty, hide it when transactions exist
    - renderTotalBalance: compute the total via computeTotalBalance and write it formatted with 2 decimal places to the balance element; show 0.00 when no transactions exist
    - _Requirements: 2.1, 2.2, 2.6, 3.1, 3.2, 3.3_

  - [x] 5.2 Implement renderChart
    - If Chart.js is loaded (check typeof Chart) and transactions exist, render or update the pie chart from computeCategoryTotals with labels Food, Transport, Fun
    - If no transactions exist, show the "no spending data" message element and hide the canvas
    - Gracefully degrade if Chart.js fails to load by leaving the no-data message visible
    - Update the chart by calling chart.update() or destroying and recreating as needed
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 5.3 Implement renderAll, handleFormSubmit, showValidationErrors, and showStorageError
    - renderAll: orchestrate calls to renderTransactionList, renderTotalBalance, and renderChart
    - handleFormSubmit: prevent default, read form field values into a RawInput object, call addTransaction; on success clear the form fields; on failure call showValidationErrors
    - showValidationErrors: render per-field validation messages near the corresponding inputs
    - showStorageError: display a non-blocking notice element that persistence failed, without blocking the UI
    - _Requirements: 1.2, 1.3, 2.2, 3.2, 4.2, 5.3_

  - [x] 5.4 Implement handleDeleteClick with confirmation dialog
    - Show a confirmation prompt (confirm/cancel) when the user activates a delete control
    - On confirm: call deleteTransaction with the transaction id, which removes the transaction and updates all views
    - On cancel: retain the transaction without any modification
    - _Requirements: 2.3, 2.4, 2.5_

  - [~] 5.5 Write integration tests for UI Layer
    - Test form submission with valid data: transaction appears in list, balance updates, fields clear
    - Test form submission with invalid data: validation messages appear near fields, entered values are retained, no transaction added
    - Test delete confirmation flow: confirming removes the transaction and updates balance and chart; canceling retains it
    - Test empty state: list shows empty-state message, balance shows 0.00, chart shows no-data message
    - Test renderAll updates list, balance, and chart within a single call
    - _Requirements: 1.2, 1.3, 2.1, 2.3, 2.4, 2.5, 2.6, 3.1, 3.3, 4.1, 4.3, 7.4_

- [x] 6. Wire initialization and load flow
  - [x] 6.1 Implement init and wire up event listeners
    - init runs on DOMContentLoaded
    - Call load() to read from Local Storage; on success restore the transactions array, on failure (null) start with an empty array
    - Call renderAll to populate the list, balance, and chart from the restored state
    - Wire the form submit event to handleFormSubmit
    - Wire delete button clicks to handleDeleteClick (via event delegation on the list container)
    - Return the ExpenseViz public API object exposing pure functions and actions for testability
    - _Requirements: 5.2, 5.4, 6.1_

  - [~] 6.2 Write integration tests for load and initialization
    - Test init with valid stored data: restores transactions and renders list, balance, and chart correctly
    - Test init with empty storage: starts with empty list, balance 0.00, no-data chart message
    - Test init with invalid stored data: starts empty, balance 0.00, no-data chart message
    - Test init with unavailable storage: starts empty and displays a storage error notice
    - _Requirements: 3.3, 5.2, 5.3, 5.4_

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Skipped for this submission: the course brief states no test setup is required, and test files placed in `js/` would break the "only 1 JavaScript file inside js/" folder rule.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Test tasks (2.4, 3.2, 4.2, 5.5, 6.2) are intentionally not done: the course brief (NFR-1) says no test setup is required, and `js/**/*.test.js` would violate the single-JS-file folder rule. `package.json` + `vitest.config.js` are kept only as leftover scaffolding.
- Each task references specific requirements for traceability
- The single-file IIFE pattern in `js/app.js` exposes the `ExpenseViz` namespace for testability
- Integer cents are used internally for all amounts to avoid floating-point drift; amounts are parsed to cents on input and formatted to 2 decimals on display
- Chart.js is loaded via CDN `<script>` tag; the app degrades gracefully if the library fails to load
- All localStorage operations are wrapped in try/catch for `file://` origin compatibility across Chrome, Firefox, Edge, and Safari
- ES modules are deliberately avoided because they are blocked by Chrome's `file://` CORS policy

## Optional Challenges (implemented)

The course brief requires choosing 3 of the 5 optional challenges. Implemented:

- [x] Sort transactions by amount or category (`#sort-select`, `getSortedTransactions`)
- [x] Highlight spending over a set limit (`#limit-input`, `.over-limit` row class)
- [x] Dark/light mode toggle (`#theme-toggle`, `html.dark` token overrides)

Preferences persist in Local Storage under their own keys (`expenseViz.sortMode`, `expenseViz.limitCents`, `expenseViz.theme`) so a corrupt or missing preference can never affect the transaction data. Amounts are displayed as Indonesian Rupiah with two decimals.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3"] },
    { "id": 4, "tasks": ["2.4", "3.1"] },
    { "id": 5, "tasks": ["3.2", "4.1"] },
    { "id": 6, "tasks": ["4.2", "5.1"] },
    { "id": 7, "tasks": ["5.2"] },
    { "id": 8, "tasks": ["5.3"] },
    { "id": 9, "tasks": ["5.4"] },
    { "id": 10, "tasks": ["5.5", "6.1"] },
    { "id": 11, "tasks": ["6.2"] }
  ]
}
```
