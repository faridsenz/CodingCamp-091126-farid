/* =========================================================================
   Expense & Budget Visualizer — app.js
   Single-file IIFE module exposing the ExpenseViz global namespace.

   Architecture (conceptual layers within this one file):
     - Logic Layer:   pure functions (no DOM or storage access)
     - State Layer:   in-memory transactions array (added in later tasks)
     - UI Layer:      DOM rendering and event handling (added in later tasks)
     - Persistence:   localStorage adapter (added in later tasks)

   Amounts are stored internally as integer cents to avoid floating-point
   drift; they are formatted to two decimal places only at display time.
   ========================================================================= */

(function () {
  "use strict";

  /* ===================================================================
     Constants
     =================================================================== */

  // Allowed expense categories (Requirement 1.1).
  var ALLOWED_CATEGORIES = ["Food", "Transport", "Fun"];
  var ALLOWED_CATEGORIES_SET = Object.create(null);
  for (var i = 0; i < ALLOWED_CATEGORIES.length; i++) {
    ALLOWED_CATEGORIES_SET[ALLOWED_CATEGORIES[i]] = true;
  }

  // Amount range expressed as integer cents (Requirement 1.1).
  // 0.01 dollars = 1 cent; 999999999.99 dollars = 99999999999 cents.
  var MIN_AMOUNT_CENTS = 1;
  var MAX_AMOUNT_CENTS = 99999999999;

  // Item name length constraint (Requirement 1.1).
  var MAX_ITEM_NAME_LENGTH = 100;

  // Persisted storage schema version. The version tag supports future
  // schema migration; deserializeTransactions rejects payloads whose
  // version is missing or unsupported (Requirement 5.4).
  var STORAGE_SCHEMA_VERSION = 1;

  /* ===================================================================
     Logic Layer — Pure Functions
     =================================================================== */

  /**
   * Validates raw form input for a new expense transaction.
   *
   * Checks:
   *   - itemName: trimmed, non-empty, length 1–100 characters.
   *   - amount:   raw string parsed to integer cents; must be a finite
   *               number in the range 0.01–999999999.99 (1–99999999999 cents).
   *   - category: must be one of Food, Transport, or Fun.
   *
   * Returns a ValidationResult { valid, errors } where `errors` has a
   * message string for each invalid field and null for valid fields.
   * `valid` is true only when all three fields have null error messages.
   *
   * Pure function: no side effects, no DOM or storage access.
   *
   * @param {object} input - RawInput { itemName: string, amount: string,
   *                                   category: "Food"|"Transport"|"Fun" }.
   * @returns {object} ValidationResult
   *   { valid: boolean,
   *     errors: { itemName: string|null, amount: string|null,
   *               category: string|null } }
   *
   * Validates: Requirements 1.1, 1.3
   */
  function validateTransaction(input) {
    // Gracefully handle missing input object.
    input = input || {};

    // Normalize fields to strings so the function is robust regardless
    // of how the caller provides the values.
    var itemName = input.itemName != null ? String(input.itemName) : "";
    var amount = input.amount != null ? String(input.amount) : "";
    var category = input.category != null ? input.category : "";

    var errors = {
      itemName: null,
      amount: null,
      category: null,
    };

    // --- itemName: trimmed, non-empty, length 1–100 (Requirement 1.1) ---
    var trimmedName = itemName.trim();
    if (trimmedName === "") {
      errors.itemName = "Item name is required.";
    } else if (trimmedName.length > MAX_ITEM_NAME_LENGTH) {
      errors.itemName =
        "Item name must be " + MAX_ITEM_NAME_LENGTH + " characters or fewer.";
    }

    // --- amount: parse raw string to integer cents, finite, in range ---
    // (Requirement 1.1, 1.3)
    var trimmedAmount = amount.trim();
    if (trimmedAmount === "") {
      errors.amount = "Amount is required.";
    } else {
      var num = Number(trimmedAmount);
      if (!Number.isFinite(num)) {
        errors.amount = "Amount must be a valid number.";
      } else {
        // Convert dollars to integer cents, rounding to avoid
        // floating-point drift (e.g., 0.07 * 100 → 7.000000000000001).
        var cents = Math.round(num * 100);
        if (cents < MIN_AMOUNT_CENTS || cents > MAX_AMOUNT_CENTS) {
          errors.amount = "Amount must be between 0.01 and 999999999.99.";
        }
      }
    }

    // --- category: must be one of the three allowed values (Req 1.1) ---
    if (!ALLOWED_CATEGORIES_SET[category]) {
      errors.category = "Category must be Food, Transport, or Fun.";
    }

    // valid is true only when all three fields have null error messages.
    var valid =
      errors.itemName === null &&
      errors.amount === null &&
      errors.category === null;

    return { valid: valid, errors: errors };
  }

  /**
   * Computes the total balance from a list of transactions.
   *
   * Sums the `amountCents` value of every transaction and returns the
   * total in integer cents. Returns 0 when the list is empty or not
   * provided (Requirement 3.3).
   *
   * Pure function: no side effects, no DOM or storage access. Does not
   * mutate the input array.
   *
   * @param {Array<object>} transactions - Transaction[] where each entry
   *   has an `amountCents` integer and a `category`.
   * @returns {number} Total amount in integer cents (0 when empty).
   *
   * Validates: Requirements 3.1, 3.3
   */
  function computeTotalBalance(transactions) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return 0;
    }

    var total = 0;
    for (var i = 0; i < transactions.length; i++) {
      var tx = transactions[i];
      // Guard against malformed entries so a missing amountCents never
      // poisons the running total with NaN.
      if (tx && typeof tx.amountCents === "number") {
        total += tx.amountCents;
      }
    }
    return total;
  }

  /**
   * Aggregates transaction amounts by category.
   *
   * Returns a CategoryTotals object { Food, Transport, Fun } where each
   * value is the sum of `amountCents` for transactions in that category.
   * All three keys are always present, even when a category's total is
   * zero (Requirement 4.1).
   *
   * Pure function: no side effects, no DOM or storage access. Does not
   * mutate the input array.
   *
   * @param {Array<object>} transactions - Transaction[] where each entry
   *   has an `amountCents` integer and a `category` in the allowed set.
   * @returns {object} CategoryTotals { Food: number, Transport: number,
   *                                    Fun: number }
   *
   * Validates: Requirements 3.1, 3.3, 4.1
   */
  function computeCategoryTotals(transactions) {
    // Initialize all three categories to zero so every key is always
    // present, even for an empty list or a category with no spending
    // (Requirement 4.1).
    var totals = {
      Food: 0,
      Transport: 0,
      Fun: 0,
    };

    if (!Array.isArray(transactions)) {
      return totals;
    }

    for (var i = 0; i < transactions.length; i++) {
      var tx = transactions[i];
      // Only aggregate valid categories with a numeric amount so an
      // unexpected entry never produces NaN totals.
      if (
        tx &&
        ALLOWED_CATEGORIES_SET[tx.category] &&
        typeof tx.amountCents === "number"
      ) {
        totals[tx.category] += tx.amountCents;
      }
    }
    return totals;
  }

  /**
   * Serializes a transaction array into a versioned JSON string.
   *
   * Encodes the array into the persisted storage format
   * { version: 1, transactions: [...] }. The schema version tag supports
   * forward compatibility and future migration (Requirement 5.1).
   *
   * Pure function: input → output string, no side effects.
   *
   * @param {Array<object>} transactions - Transaction[] to persist.
   * @returns {string} JSON string in the persisted storage format.
   *
   * Validates: Requirements 5.1, 5.2, 5.4
   */
  function serializeTransactions(transactions) {
    var txs = Array.isArray(transactions) ? transactions : [];
    return JSON.stringify({
      version: STORAGE_SCHEMA_VERSION,
      transactions: txs,
    });
  }

  /**
   * Validates the shape of a single stored transaction.
   *
   * Checks that the object has valid id, itemName, amountCents, and
   * category fields matching the Transaction model. Pure helper with
   * no side effects.
   *
   * @param {*} tx - Candidate transaction object.
   * @returns {boolean} True when the transaction is valid.
   */
  function isValidStoredTransaction(tx) {
    if (tx === null || typeof tx !== "object") {
      return false;
    }

    // id: must be a non-empty string.
    if (typeof tx.id !== "string" || tx.id.length === 0) {
      return false;
    }

    // itemName: must be a string, trimmed non-empty, length 1–100.
    if (typeof tx.itemName !== "string") {
      return false;
    }
    var trimmedName = tx.itemName.trim();
    if (trimmedName.length === 0 || trimmedName.length > MAX_ITEM_NAME_LENGTH) {
      return false;
    }

    // amountCents: must be an integer in range [1, 99999999999].
    if (
      typeof tx.amountCents !== "number" ||
      !Number.isInteger(tx.amountCents)
    ) {
      return false;
    }
    if (tx.amountCents < MIN_AMOUNT_CENTS || tx.amountCents > MAX_AMOUNT_CENTS) {
      return false;
    }

    // category: must be one of the allowed values.
    if (!ALLOWED_CATEGORIES_SET[tx.category]) {
      return false;
    }

    return true;
  }

  /**
   * Deserializes a stored JSON string back into a Transaction array.
   *
   * Parses and validates the stored string, verifying that the schema
   * version is present and supported and that every transaction has valid
   * id, itemName, amountCents, and category fields. Returns null on any
   * parse, schema, or shape failure so the app initializes empty
   * (Requirement 5.4). Inverse of serializeTransactions.
   *
   * The returned array contains clean transaction objects with only the
   * four canonical fields, stripping any extraneous properties.
   *
   * Pure function: input → output, no side effects.
   *
   * @param {string} data - JSON string in the persisted storage format.
   * @returns {Array<object>|null} Transaction[] when valid, null otherwise.
   *
   * Validates: Requirements 5.1, 5.2, 5.4
   */
  function deserializeTransactions(data) {
    // Non-string input cannot be parsed.
    if (typeof data !== "string") {
      return null;
    }

    // Parse JSON; any parse failure returns null.
    var parsed;
    try {
      parsed = JSON.parse(data);
    } catch (e) {
      return null;
    }

    // Must be a non-null, non-array object.
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    // Verify schema version is present and supported (Requirement 5.4).
    // A missing version (undefined) or any unsupported value fails.
    if (parsed.version !== STORAGE_SCHEMA_VERSION) {
      return null;
    }

    // Verify transactions is an array.
    if (!Array.isArray(parsed.transactions)) {
      return null;
    }

    // Validate each transaction's shape, building a clean result that
    // contains only the four canonical fields.
    var source = parsed.transactions;
    var result = [];
    for (var i = 0; i < source.length; i++) {
      var tx = source[i];
      if (!isValidStoredTransaction(tx)) {
        return null;
      }
      result.push({
        id: tx.id,
        itemName: tx.itemName,
        amountCents: tx.amountCents,
        category: tx.category,
      });
    }
    return result;
  }

  /* ===================================================================
     Persistence Layer — localStorage adapter
     All operations are wrapped in try/catch because file:// origins are
     treated inconsistently across Chrome, Firefox, Edge, and Safari
     (Requirement 5.3). Nothing here ever throws to the caller.
     =================================================================== */

  // Single storage key. The schema version is embedded in the payload by
  // serializeTransactions, so the key itself stays stable across versions.
  var STORAGE_KEY = "expenseViz.transactions";

  /**
   * Feature-detects Local Storage with a probe write/read/remove cycle.
   *
   * @returns {boolean} True when Local Storage is usable.
   *
   * Validates: Requirements 5.2, 5.3
   */
  function isStorageAvailable() {
    try {
      if (typeof localStorage === "undefined" || localStorage === null) {
        return false;
      }
      var probeKey = "__expenseVizProbe__";
      localStorage.setItem(probeKey, "1");
      var readBack = localStorage.getItem(probeKey) === "1";
      localStorage.removeItem(probeKey);
      return readBack;
    } catch (e) {
      return false;
    }
  }

  /**
   * Serializes and writes the transaction list to Local Storage.
   *
   * @param {Array<object>} list - Transaction[] to persist.
   * @returns {boolean} True on success, false on any failure. Never throws.
   *
   * Validates: Requirements 5.1, 5.3
   */
  function save(list) {
    try {
      if (!isStorageAvailable()) {
        return false;
      }
      localStorage.setItem(STORAGE_KEY, serializeTransactions(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Reads and deserializes the stored transaction list.
   *
   * @returns {Array<object>|null} Transaction[] when valid, otherwise null
   *   (storage unavailable, empty, or invalid data). Never throws.
   *
   * Validates: Requirements 5.2, 5.4
   */
  function load() {
    try {
      if (!isStorageAvailable()) {
        return null;
      }
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null || raw === "") {
        return null;
      }
      return deserializeTransactions(raw);
    } catch (e) {
      return null;
    }
  }

  /* ===================================================================
     State Layer — in-memory transactions array (single source of truth)
     =================================================================== */

  var transactions = [];

  /**
   * Generates a unique transaction id.
   *
   * Uses crypto.randomUUID when available, falling back to a
   * timestamp + random string so ids stay unique on older engines.
   *
   * @returns {string} Unique id.
   */
  function generateId() {
    try {
      if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
      ) {
        return crypto.randomUUID();
      }
    } catch (e) {
      // Fall through to the manual generator below.
    }
    return (
      "tx-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10)
    );
  }

  /**
   * Converts a raw amount string (major units) to integer cents.
   *
   * @param {*} rawAmount - Raw value from the amount field.
   * @returns {number} Integer cents.
   */
  function toCents(rawAmount) {
    return Math.round(Number(String(rawAmount).trim()) * 100);
  }

  /**
   * Adds a transaction from raw form input.
   *
   * Validates first; invalid input returns errors and leaves the state
   * untouched. Valid input appends a Transaction, re-renders every view,
   * and persists the new list (Requirements 1.2, 5.1).
   *
   * @param {object} input - RawInput { itemName, amount, category }.
   * @returns {{ok: boolean, errors?: object, transaction?: object}}
   */
  function addTransaction(input) {
    var result = validateTransaction(input);

    if (!result.valid) {
      return { ok: false, errors: result.errors };
    }

    var transaction = {
      id: generateId(),
      itemName: String(input.itemName).trim(),
      amountCents: toCents(input.amount),
      category: input.category,
    };

    transactions.push(transaction);
    renderAll();
    persist();

    return { ok: true, transaction: transaction };
  }

  /**
   * Removes the transaction with the given id.
   *
   * @param {string} id - Transaction id.
   * @returns {boolean} True when a transaction was removed, false when the
   *   id was not found (list left unchanged).
   *
   * Validates: Requirements 2.4, 5.1
   */
  function deleteTransaction(id) {
    for (var i = 0; i < transactions.length; i++) {
      if (transactions[i].id === id) {
        transactions.splice(i, 1);
        renderAll();
        persist();
        return true;
      }
    }
    return false;
  }

  /**
   * Returns a copy of the current transaction list (testability helper).
   *
   * @returns {Array<object>} Shallow copy of the transactions array.
   */
  function getTransactions() {
    return transactions.slice();
  }

  /**
   * Persists the current list and surfaces a non-blocking notice on
   * failure while keeping the in-memory list intact (Requirement 5.3).
   *
   * @returns {boolean} True when the write succeeded.
   */
  function persist() {
    var saved = save(transactions);
    if (saved) {
      hideStorageError();
    } else {
      showStorageError(
        "Your transactions could not be saved. They are kept only until this page is closed."
      );
    }
    return saved;
  }

  /* ===================================================================
     UI Layer — rendering and event handling
     =================================================================== */

  // Chart.js instance, created lazily and reused across renders.
  var chart = null;

  /* --- Optional challenges: sort, spending limit, dark mode -------------
     Preferences live in Local Storage through their own keys so a corrupt
     or missing preference can never break the transaction data. */

  var PREF_SORT_KEY = "expenseViz.sortMode";
  var PREF_LIMIT_KEY = "expenseViz.limitCents";
  var PREF_THEME_KEY = "expenseViz.theme";

  var SORT_MODES = ["newest", "amount-desc", "amount-asc", "category"];

  // Display-only sort; the state array keeps insertion order.
  var sortMode = "newest";

  // 0 means "no limit set", so nothing is highlighted.
  var limitCents = 0;

  /**
   * Reads a preference value, tolerating unavailable storage.
   *
   * @param {string} key - Storage key.
   * @returns {string|null}
   */
  function readPref(key) {
    try {
      if (typeof localStorage === "undefined") {
        return null;
      }
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  /**
   * Writes a preference value, tolerating unavailable storage.
   *
   * @param {string} key - Storage key.
   * @param {*} value - Value to store.
   * @returns {boolean} True when the write succeeded.
   */
  function writePref(key, value) {
    try {
      if (typeof localStorage === "undefined") {
        return false;
      }
      localStorage.setItem(key, String(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Per-field error element ids (Requirement 1.3).
  var FIELD_ERROR_IDS = {
    itemName: "item-name-error",
    amount: "amount-error",
    category: "category-error",
  };

  /**
   * Safe element lookup (returns null outside a DOM environment).
   *
   * @param {string} id - Element id.
   * @returns {HTMLElement|null}
   */
  function byId(id) {
    if (typeof document === "undefined" || !document.getElementById) {
      return null;
    }
    return document.getElementById(id);
  }

  // Cached Intl formatter; created once because constructing it is the
  // expensive part (Requirement 7.3 asks views to update in <100ms).
  var idrFormatter = null;

  /**
   * Formats integer cents as an Indonesian Rupiah string with exactly two
   * decimal places, e.g. 250000 cents -> "Rp 2.500,00".
   *
   * Two decimals are kept deliberately: the balance requirement asks for a
   * 2-decimal display even though everyday rupiah amounts rarely use them.
   *
   * @param {number} cents - Amount in integer cents.
   * @returns {string} Formatted amount.
   */
  function formatCents(cents) {
    var amount = cents / 100;
    try {
      if (
        typeof Intl !== "undefined" &&
        typeof Intl.NumberFormat === "function"
      ) {
        if (idrFormatter === null) {
          idrFormatter = new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        }
        return idrFormatter.format(amount);
      }
    } catch (e) {
      // Fall through to the manual format below.
    }
    return "Rp " + amount.toFixed(2);
  }

  /**
   * Writes the formatted total balance to the balance element.
   * Shows 0.00 when no transactions exist (Requirements 3.1, 3.3).
   */
  function renderTotalBalance() {
    var el = byId("total-balance");
    if (!el) {
      return;
    }
    el.textContent = formatCents(computeTotalBalance(transactions));
  }

  /**
   * Builds one list row: item name, amount, category, delete control.
   *
   * Uses textContent (never innerHTML) so item names cannot inject markup.
   *
   * @param {object} transaction - Transaction to render.
   * @returns {HTMLLIElement}
   */
  function buildTransactionRow(transaction) {
    var li = document.createElement("li");

    var name = document.createElement("span");
    name.className = "tx-name";
    name.textContent = transaction.itemName;

    var amount = document.createElement("span");
    amount.className = "tx-amount";
    amount.textContent = formatCents(transaction.amountCents);

    var category = document.createElement("span");
    category.className = "tx-category";
    category.textContent = transaction.category;

    var deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-btn";
    deleteButton.setAttribute("data-id", transaction.id);
    deleteButton.setAttribute(
      "aria-label",
      "Delete " + transaction.itemName
    );
    deleteButton.textContent = "Delete";

    li.appendChild(name);
    li.appendChild(amount);
    li.appendChild(category);
    li.appendChild(deleteButton);
    return li;
  }

  /**
   * Rebuilds the transaction list from the state array.
   *
   * Shows the empty-state message when the list is empty and hides it
   * otherwise (Requirements 2.1, 2.6).
   */
  function renderTransactionList() {
    var listEl = byId("transaction-items");
    if (!listEl) {
      return;
    }

    var emptyEl = byId("empty-state");

    while (listEl.firstChild) {
      listEl.removeChild(listEl.firstChild);
    }

    if (transactions.length === 0) {
      if (emptyEl) {
        emptyEl.hidden = false;
      }
      return;
    }

    if (emptyEl) {
      emptyEl.hidden = true;
    }

    var rows = getSortedTransactions();
    var fragment = document.createDocumentFragment();
    for (var i = 0; i < rows.length; i++) {
      var row = buildTransactionRow(rows[i]);
      // Optional challenge: flag spending above the configured limit.
      if (limitCents > 0 && rows[i].amountCents > limitCents) {
        row.className = "over-limit";
      }
      fragment.appendChild(row);
    }
    listEl.appendChild(fragment);
  }

  /**
   * Renders or updates the pie chart of spending per category.
   *
   * Shows the "no spending data" message and hides the canvas when there
   * are no transactions or when Chart.js failed to load, so the app
   * degrades gracefully (Requirements 4.1, 4.2, 4.3).
   */
  function renderChart() {
    var canvas = byId("spending-chart");
    var noDataEl = byId("no-spending-data");
    var chartLibraryLoaded = typeof Chart !== "undefined";

    if (transactions.length === 0 || !canvas || !chartLibraryLoaded) {
      if (chart) {
        chart.destroy();
        chart = null;
      }
      if (canvas) {
        canvas.hidden = true;
      }
      if (noDataEl) {
        noDataEl.hidden = false;
      }
      return;
    }

    if (noDataEl) {
      noDataEl.hidden = true;
    }
    canvas.hidden = false;

    var totals = computeCategoryTotals(transactions);
    // Chart.js works in major units, so cents are converted for display.
    var data = [totals.Food / 100, totals.Transport / 100, totals.Fun / 100];

    if (chart) {
      chart.data.datasets[0].data = data;
      chart.update();
      return;
    }

    chart = new Chart(canvas.getContext("2d"), {
      type: "pie",
      data: {
        labels: ALLOWED_CATEGORIES.slice(),
        datasets: [
          {
            data: data,
            backgroundColor: ["#2563eb", "#16a34a", "#f59e0b"],
            borderColor: "#ffffff",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: "bottom",
            labels: { boxWidth: 14, font: { size: 14 } },
          },
          // Tooltips must show rupiah too, not the raw major-unit number.
          tooltip: {
            callbacks: {
              label: function (context) {
                var value = context && context.parsed ? context.parsed : 0;
                var label = context && context.label ? context.label : "";
                return label + ": " + formatCents(Math.round(value * 100));
              },
            },
          },
        },
      },
    });
  }

  /**
   * Re-derives every view from the single source of truth.
   *
   * @returns {void}
   */
  function renderAll() {
    renderTransactionList();
    renderTotalBalance();
    renderChart();
  }

  /**
   * Renders per-field validation messages next to their inputs.
   * A null message clears the field's error (Requirement 1.3).
   *
   * @param {object} errors - { itemName, amount, category } messages.
   */
  function showValidationErrors(errors) {
    var fields = ["itemName", "amount", "category"];
    for (var i = 0; i < fields.length; i++) {
      var key = fields[i];
      var el = byId(FIELD_ERROR_IDS[key]);
      if (!el) {
        continue;
      }
      el.textContent = errors && errors[key] ? errors[key] : "";
    }
  }

  /**
   * Shows a non-blocking notice that persistence failed (Req 5.3).
   *
   * @param {string} message - Message to display.
   */
  function showStorageError(message) {
    var el = byId("storage-error");
    if (!el) {
      return;
    }
    el.textContent = message;
    el.hidden = false;
  }

  /** Hides the storage notice after a successful write. */
  function hideStorageError() {
    var el = byId("storage-error");
    if (!el) {
      return;
    }
    el.hidden = true;
    el.textContent = "";
  }

  /**
   * Form submit handler.
   *
   * Clears the form on success; on failure shows inline messages and keeps
   * the entered values (Requirements 1.2, 1.3).
   *
   * @param {Event} event - Submit event.
   * @returns {object} The addTransaction result.
   */
  function handleFormSubmit(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    var nameEl = byId("item-name");
    var amountEl = byId("amount");
    var categoryEl = byId("category");

    var result = addTransaction({
      itemName: nameEl ? nameEl.value : "",
      amount: amountEl ? amountEl.value : "",
      category: categoryEl ? categoryEl.value : "",
    });

    if (result.ok) {
      showValidationErrors(null);
      var form = byId("expense-form");
      if (form && typeof form.reset === "function") {
        form.reset();
      } else {
        if (nameEl) {
          nameEl.value = "";
        }
        if (amountEl) {
          amountEl.value = "";
        }
        if (categoryEl) {
          categoryEl.value = "";
        }
      }
      if (nameEl && typeof nameEl.focus === "function") {
        nameEl.focus();
      }
    } else {
      showValidationErrors(result.errors);
    }

    return result;
  }

  /**
   * Delete handler: asks for confirmation, then removes the transaction.
   * Cancelling leaves the list untouched (Requirements 2.3, 2.4, 2.5).
   *
   * @param {string} id - Transaction id.
   * @returns {boolean} True when the transaction was removed.
   */
  function handleDeleteClick(id) {
    if (!id) {
      return false;
    }

    var confirmed =
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm("Delete this transaction?")
        : true;

    if (!confirmed) {
      return false;
    }

    return deleteTransaction(id);
  }

  /**
   * Returns the transactions in display order without mutating the state
   * array (optional challenge: sorting).
   *
   * @returns {Array<object>} Sorted copy of the transactions array.
   */
  function getSortedTransactions() {
    var list = transactions.slice();

    if (sortMode === "amount-desc") {
      list.sort(function (a, b) {
        return b.amountCents - a.amountCents;
      });
    } else if (sortMode === "amount-asc") {
      list.sort(function (a, b) {
        return a.amountCents - b.amountCents;
      });
    } else if (sortMode === "category") {
      list.sort(function (a, b) {
        if (a.category === b.category) {
          return a.itemName.localeCompare(b.itemName);
        }
        return a.category.localeCompare(b.category);
      });
    } else {
      // "newest": most recently added first.
      list.reverse();
    }

    return list;
  }

  /**
   * Applies a theme and keeps the toggle button label in sync.
   *
   * @param {string} theme - "dark" or "light".
   */
  function applyTheme(theme) {
    if (typeof document === "undefined" || !document.documentElement) {
      return;
    }

    var isDark = theme === "dark";
    var root = document.documentElement;

    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    var button = byId("theme-toggle");
    if (button) {
      button.textContent = isDark ? "Light mode" : "Dark mode";
      button.setAttribute("aria-pressed", isDark ? "true" : "false");
    }
  }

  /**
   * Resolves the initial theme: stored preference first, then the OS/browser
   * colour-scheme preference, then light.
   *
   * @returns {string} "dark" or "light".
   */
  function resolveInitialTheme() {
    var stored = readPref(PREF_THEME_KEY);
    if (stored === "dark" || stored === "light") {
      return stored;
    }
    try {
      if (
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        return "dark";
      }
    } catch (e) {
      // Ignore and fall back to light.
    }
    return "light";
  }

  /**
   * Toggles between dark and light mode and persists the choice.
   *
   * @returns {string} The theme now applied.
   */
  function toggleTheme() {
    var isDark =
      typeof document !== "undefined" &&
      document.documentElement &&
      document.documentElement.classList.contains("dark");
    var next = isDark ? "light" : "dark";
    applyTheme(next);
    writePref(PREF_THEME_KEY, next);
    return next;
  }

  /**
   * Handles a change of the sort control.
   *
   * @param {Event} event - Change event from the sort select.
   * @returns {string} The sort mode now applied.
   */
  function handleSortChange(event) {
    var value = event && event.target ? event.target.value : "newest";
    sortMode = SORT_MODES.indexOf(value) >= 0 ? value : "newest";
    writePref(PREF_SORT_KEY, sortMode);
    renderTransactionList();
    return sortMode;
  }

  /**
   * Handles input on the spending-limit field and re-renders the list so
   * over-limit rows are highlighted immediately.
   *
   * A blank or zero value clears the highlight.
   *
   * @param {Event} event - Input event from the limit field.
   * @returns {number} The limit in integer cents.
   */
  function handleLimitInput(event) {
    var raw = event && event.target ? String(event.target.value).trim() : "";
    var parsed = raw === "" ? NaN : Number(raw);

    limitCents =
      Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;

    writePref(PREF_LIMIT_KEY, limitCents);
    renderTransactionList();
    return limitCents;
  }

  /**
   * Restores state from Local Storage, wires the event listeners, and
   * renders the initial views (Requirements 5.2, 5.4, 6.1).
   *
   * @returns {object} The public ExpenseViz API.
   */
  function init() {
    // Restore preferences before the first render so the initial paint
    // already reflects the saved sort order, limit, and theme.
    var storedSort = readPref(PREF_SORT_KEY);
    sortMode = SORT_MODES.indexOf(storedSort) >= 0 ? storedSort : "newest";

    var storedLimit = readPref(PREF_LIMIT_KEY);
    var parsedLimit = storedLimit === null ? NaN : parseInt(storedLimit, 10);
    limitCents = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 0;

    applyTheme(resolveInitialTheme());

    var restored = load();
    transactions = restored === null ? [] : restored;

    renderAll();

    var form = byId("expense-form");
    if (form && typeof form.addEventListener === "function") {
      form.addEventListener("submit", handleFormSubmit);
    }

    var listEl = byId("transaction-items");
    if (listEl && typeof listEl.addEventListener === "function") {
      // Event delegation: one listener covers every current and future row.
      listEl.addEventListener("click", function (event) {
        var target = event.target;
        while (
          target &&
          target !== listEl &&
          !(target.classList && target.classList.contains("delete-btn"))
        ) {
          target = target.parentNode;
        }
        if (
          target &&
          target !== listEl &&
          target.classList &&
          target.classList.contains("delete-btn")
        ) {
          handleDeleteClick(target.getAttribute("data-id"));
        }
      });
    }

    var sortSelect = byId("sort-select");
    if (sortSelect && typeof sortSelect.addEventListener === "function") {
      sortSelect.value = sortMode;
      sortSelect.addEventListener("change", handleSortChange);
    }

    var limitInput = byId("limit-input");
    if (limitInput && typeof limitInput.addEventListener === "function") {
      limitInput.value = limitCents > 0 ? (limitCents / 100).toFixed(2) : "";
      limitInput.addEventListener("input", handleLimitInput);
    }

    var themeToggle = byId("theme-toggle");
    if (themeToggle && typeof themeToggle.addEventListener === "function") {
      themeToggle.addEventListener("click", toggleTheme);
    }

    if (!isStorageAvailable()) {
      showStorageError(
        "Local storage is unavailable in this browser. Transactions will be kept only until this page is closed."
      );
    }

    return publicApi;
  }

  /* ===================================================================
     Public API (exposed for testing and external use)
     =================================================================== */

  var publicApi = {
    validateTransaction: validateTransaction,
    computeTotalBalance: computeTotalBalance,
    computeCategoryTotals: computeCategoryTotals,
    serializeTransactions: serializeTransactions,
    deserializeTransactions: deserializeTransactions,
    addTransaction: addTransaction,
    deleteTransaction: deleteTransaction,
    getTransactions: getTransactions,
    renderAll: renderAll,
    handleFormSubmit: handleFormSubmit,
    handleDeleteClick: handleDeleteClick,
    handleSortChange: handleSortChange,
    handleLimitInput: handleLimitInput,
    toggleTheme: toggleTheme,
    init: init,
  };

  globalThis.ExpenseViz = publicApi;

  // Auto-initialize only in a real browser. The guard keeps the module
  // importable from a Node test environment (no `document` there).
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        init();
      });
    } else {
      init();
    }
  }
})();
