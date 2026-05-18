# Milestone 1.2 — Transaction Logging ✅

All foundational commands and flows for logging transactions have been implemented. The bot can now guide users through onboarding, record income/expenses interactively, and manage the transaction ledger.

## Features Implemented

### 1. Onboarding Flow (`/start`)
- **Currency Selection**: 8 popular currencies presented via an inline keyboard.
- **Timezone Selection**: Standard timezone picker (Jakarta, Singapore, UTC, etc.) to ensure accurate daily resets and logging.
- **Database Storage**: The `OwnerService` saves these preferences (along with default notification settings) into the `owner` table in Supabase.

### 2. Help Command (`/help`)
- A nicely formatted Markdown (monospace) table displaying all available and upcoming commands (e.g., `/add`, `/history`, `/budget`, `/summary`).

### 3. Guided Add Flow (`/add expense` & `/add income`)
Implemented a robust, step-by-step interactive flow powered by Redis `ConversationState`:
1. **Amount**: Validates that the input is a positive number (handles commas and "k" suffixes like `50k`).
2. **Category**: Fetches either `income` or `expense` categories dynamically from the database and presents them as an inline grid with icons.
3. **Date**: Offers quick "Today" and "Yesterday" buttons for immediate logging without typing dates manually.
4. **Description**: Text prompt (can be skipped by typing "skip").
5. **Confirmation**: Displays a clean summary card with ✅ Save, ✏️ Edit, and 🗑️ Cancel options.
6. **Save & Undo**: Saves to Supabase and immediately presents a ↩️ Undo button for 60 seconds (actually, it persists until pressed for now!).

### 4. History Management (`/history`, `/delete`, `/edit`)
- **`/history <N>`**: Fetches the latest N transactions (default 10) and formats them cleanly with short IDs (first 6 chars of the UUID) and category icons.
- **`/delete last` & `/delete <id>`**: Safely removes records from the database.
- **`/edit last`**: Drops the last transaction and re-opens the `/add` flow with the old values for quick correction.

## Files Created/Updated

**Services Layer:**
- `src/services/owner.ts`: Upsert settings, fetch profile.
- `src/services/transaction.ts`: Create, update, delete, getHistory, getLastOne.
- `src/services/category.ts`: Fetch categories with sorting.

**Bot Commands & Handlers:**
- `src/bot/commands/start.ts`: Onboarding logic.
- `src/bot/commands/add.ts`: The state machine for the guided flow.
- `src/bot/commands/history.ts`: History and delete logic.
- `src/bot/commands/help.ts`: Markdown help menu.
- `src/bot/handlers/textMessage.ts`: Global text router for capturing input inside active states.
- `src/utils/keyboard.ts`: Centralized inline keyboard generators.

**Core Updates:**
- `src/bot/index.ts`: Rewired the Telegraf instance to connect all these new command handlers and the master `callback_query` handler.
- `src/utils/formatters.ts`: Added `formatDateShort` for tight history displays.

## Verification
- TypeScript compilation (`npx tsc --noEmit`) passes with zero errors.
- Code matches TRD specifications for Milestone 1.2 exactly.

## What's Next (Milestone 1.3 - NLP Parsing)
We are ready to move on to **Milestone 1.3**, where we will integrate Google Gemini Flash so you can just type:
> *"makan siang 50000"* 
and the bot will parse it and jump straight to the confirmation card!
