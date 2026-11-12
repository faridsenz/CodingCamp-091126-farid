# Requirements Document

## Introduction

The Expense & Budget Visualizer is a mobile-friendly, standalone web application that helps users track daily spending. Users add expense transactions through an input form, view a scrollable history of transactions, see a total balance that updates automatically, and visualize spending distribution by category through a pie chart. All data is stored client-side in the browser using the Local Storage API; no backend server is required. The application is built with HTML, CSS, and Vanilla JavaScript only, and uses Chart.js for the spending chart.

Optional enhancements (dark/light mode toggle, highlighting spending over a set limit, and sorting transactions by amount or category) are intentionally excluded from this MVP requirements set; they will be implemented as separate optional challenges and are out of scope for these requirements.

## Glossary

- **Expense_Visualizer**: The standalone web application that tracks spending, displays the total balance, transaction history, and spending chart.
- **Transaction**: A single recorded expense consisting of an item name, an amount, and a category.
- **Category**: A classification assigned to a Transaction, restricted to one of Food, Transport, or Fun.
- **Input_Form**: The form within the Expense_Visualizer where a user enters the item name, amount, and category to create a Transaction.
- **Transaction_List**: The scrollable list that displays all recorded Transactions and provides a delete control for each item.
- **Total_Balance**: The aggregate value displayed at the top of the screen, computed as the sum of all Transaction amounts.
- **Spending_Chart**: The pie chart, rendered with Chart.js, showing the total amount spent per Category.
- **Local_Storage**: The browser Web Storage API used to persist the Transaction list on the client side without a backend server.
- **Chart.js**: The third-party JavaScript charting library used to render the Spending_Chart pie chart.

## Requirements

### Requirement 1: Add Expense Transaction

**User Story:** As a user, I want to enter an expense with an item name, amount, and category so that I can record my daily spending.

#### Acceptance Criteria

1. THE Input_Form SHALL provide fields for an item name (text, maximum 100 characters), an amount (a number between 0.01 and 999,999,999.99), and a category restricted to Food, Transport, or Fun.
2. WHEN a user submits the Input_Form with all fields filled and a valid amount between 0.01 and 999,999,999.99, THE Expense_Visualizer SHALL create a new Transaction, add it to the Transaction_List, and clear the Input_Form fields.
3. IF the user submits the Input_Form with one or more empty fields or an amount that is not a number between 0.01 and 999,999,999.99, THEN THE Expense_Visualizer SHALL display a validation message indicating which field is invalid, retain the entered values in the Input_Form, and SHALL not add a Transaction.

### Requirement 2: Transaction List Display and Deletion

**User Story:** As a user, I want to view all my recorded transactions in a scrollable list and delete any item so that I can review and correct my spending history.

#### Acceptance Criteria

1. THE Transaction_List SHALL display every recorded Transaction, with each entry showing the item name, amount, category, and a delete control.
2. WHILE the number of Transactions exceeds the visible area of the Transaction_List, THE Transaction_List SHALL remain scrollable vertically without horizontal scrolling so that every entry is reachable.
3. WHEN a user activates the delete control on a Transaction entry, THE Expense_Visualizer SHALL display a confirmation prompt with confirm and cancel options.
4. IF the user confirms the deletion, THEN THE Expense_Visualizer SHALL remove that Transaction and update the Total_Balance and the Spending_Chart.
5. IF the user cancels the deletion, THEN THE Expense_Visualizer SHALL retain the Transaction without modification.
6. WHILE no Transactions exist, THE Transaction_List SHALL display an empty state indicating that no transactions have been recorded.

### Requirement 3: Total Balance Display

**User Story:** As a user, I want to see my total balance at the top of the screen so that I can quickly understand my overall spending.

#### Acceptance Criteria

1. THE Expense_Visualizer SHALL display the Total_Balance at the top of the screen, computed as the sum of all Transaction amounts, formatted with 2 decimal places.
2. WHEN a Transaction is added, deleted, or edited, THE Expense_Visualizer SHALL recompute and update the Total_Balance within 100 milliseconds.
3. IF no Transactions exist, THEN THE Expense_Visualizer SHALL display the Total_Balance as 0.00.

### Requirement 4: Spending Distribution Chart

**User Story:** As a user, I want to see a pie chart of spending by category so that I can visualize how my money is distributed across categories.

#### Acceptance Criteria

1. THE Spending_Chart SHALL render a pie chart using Chart.js that shows the total amount spent for each Category (Food, Transport, and Fun), where each Category total is the sum of all Transaction amounts for that Category, including categories with zero total spending.
2. WHEN a Transaction is added, edited, or deleted, THE Expense_Visualizer SHALL recompute the per-category totals and update the Spending_Chart within 100 milliseconds.
3. WHILE no Transactions exist, THE Spending_Chart SHALL display a message indicating that no spending data is available instead of rendering the pie chart.

### Requirement 5: Client-Side Data Persistence

**User Story:** As a user, I want my transactions saved in the browser so that my data persists when I close and reopen the app.

#### Acceptance Criteria

1. WHEN a Transaction is added, modified, or deleted, THE Expense_Visualizer SHALL persist the complete Transaction list to Local_Storage.
2. WHEN the Expense_Visualizer loads, IF Local_Storage contains valid Transaction data, THEN THE Expense_Visualizer SHALL restore the Transaction list from Local_Storage and repopulate the Transaction_List, Total_Balance, and Spending_Chart from the restored data.
3. IF Local_Storage is unavailable or the write operation fails, THEN THE Expense_Visualizer SHALL maintain the current Transaction list in the Transaction_List and display an error message indicating the data could not be saved.
4. IF Local_Storage contains no Transaction data or the stored data is invalid, THEN THE Expense_Visualizer SHALL initialize with an empty Transaction list and display the Total_Balance as zero.

### Requirement 6: Technology Stack and Cross-Browser Support

**User Story:** As a developer and user, I want the app built with standard web technologies and runnable in any modern browser so that it works everywhere without a backend.

#### Acceptance Criteria

1. THE Expense_Visualizer SHALL be built using only HTML for structure, CSS for styling, and Vanilla JavaScript for logic, with Chart.js as the sole allowed client-side charting library, and no backend server.
2. THE Expense_Visualizer SHALL function in current stable versions of Chrome, Firefox, Edge, and Safari, including adding Transactions via the Input_Form, displaying the Transaction_List, calculating and displaying the Total_Balance, and rendering the Spending_Chart.
3. THE Expense_Visualizer SHALL be runnable by opening its HTML file directly in a browser without a build step or installation.

### Requirement 7: Responsive Mobile-Friendly Interface

**User Story:** As a user, I want a clean, mobile-friendly interface so that I can use the app comfortably on my phone.

#### Acceptance Criteria

1. WHILE the viewport width is between 320 and 768 pixels, THE Expense_Visualizer SHALL render a layout with no horizontal scrolling, a minimum font size of 16 pixels, and minimum touch target sizes of 44 by 44 pixels.
2. THE Expense_Visualizer SHALL load and render the initial interface within 2 seconds on a connection with a minimum bandwidth of 400 kilobits per second.
3. WHEN a Transaction is added or deleted, THE Expense_Visualizer SHALL update the Transaction_List, Total_Balance, and Spending_Chart within 100 milliseconds.
4. IF the update of the Transaction_List, Total_Balance, or Spending_Chart fails following a Transaction addition or deletion, THEN THE Expense_Visualizer SHALL display an error indication and retain the current data without modification.

### Requirement 8: Visual Design and Simplicity

**User Story:** As a user, I want a simple, clear interface so that I can understand and use the app without instruction.

#### Acceptance Criteria

1. THE Expense_Visualizer SHALL present only the Total_Balance, Input_Form, Transaction_List, and Spending_Chart in a single vertical stack with no additional sections or decorative elements.
2. THE Expense_Visualizer SHALL present the Total_Balance with a font size at least 2 times the base body text size, followed by the Input_Form, then the Transaction_List, then the Spending_Chart.
3. THE Expense_Visualizer SHALL use a font with a base body text size of at least 16 pixels for all displayed text.
