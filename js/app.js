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
     Public API (exposed for testing and external use)
     =================================================================== */

  globalThis.ExpenseViz = {
    validateTransaction: validateTransaction,
    computeTotalBalance: computeTotalBalance,
    computeCategoryTotals: computeCategoryTotals,
    serializeTransactions: serializeTransactions,
    deserializeTransactions: deserializeTransactions,
  };
})();
