# Milestone 1.3 — NLP Natural Language Input ✅

The AI-powered natural language processing engine has been fully implemented and integrated into the text handler. The bot can now understand free-text inputs and intelligently extract transaction data.

## Features Implemented

### 1. Two-Path Parser System (`NLPService`)
- **Path 1: Regex Fast-Path:** Catches common strict formats (e.g. `spent 50 on lunch`, `dapat bonus 1000k`, `15k makan siang`). This parses instantly with 0ms latency and 0 API cost.
- **Path 2: Gemini Flash 2.0 API:** Handles complex language (e.g. `Had a great dinner with friends, it cost me 150`) with an explicit system prompt.
- **Path 3: Groq API (Llama 3.1 70B):** Automatically falls back to Groq using the identical system prompt if Gemini is rate-limited or errors out.

### 2. Intelligent Data Extraction
- **Currency Detection:** Extracts standard symbols (`$`, `€`, `£`, `Rp`, `RM`, `¥`, `S$`) and overrides the owner's default currency.
- **"k" Suffix Scaling:** Automatically expands `k` suffixes (e.g. `50k` → `50000`, `1.5k` → `1500`).
- **Relative Date Parsing:** Supports both English and Indonesian relative dates (`yesterday`, `last monday`, `kemarin`, `tadi pagi`, `3 days ago`).

### 3. Category Mapping (`matchCategory`)
- Extracts category hints and uses a broad keyword-matching dictionary to map words like `kopi`, `bensin`, `grab`, `gaji`, and `sedekah` to their corresponding database categories (e.g., `Food & Dining`, `Transport`, `Salary`).

### 4. Confidence-Based Routing
The `textMessageHandler` now routes inputs based on the AI's/Regex's confidence level:
- **≥ 0.85 (High):** Auto-saves the transaction and shows the confirmation card (with Undo).
- **0.60 – 0.84 (Medium):** Shows a preview (`🤔 Does this look right?`) and waits for user confirmation (`yes` / `no`).
- **< 0.60 (Low):** Interactively asks the user to clarify whether it is an `expense` or `income`, then shows the category picker.

### 5. Validation & Testing
- Built a comprehensive set of test cases spanning regular formats, bare amounts, prefix currencies, missing descriptions, and complex sentences.
- Added strict type checking for the returned schema.
- All 37 tests (formatters + NLP services) pass perfectly.

## Files Created/Updated
- `src/services/nlp.ts`: Main NLP orchestrator.
- `src/services/nlp/regexParser.ts`: Zero-latency pattern matcher.
- `src/services/nlp/geminiParser.ts`: Google Gemini integration.
- `src/services/nlp/groqParser.ts`: Groq fallback integration.
- `src/services/nlp/categoryMatcher.ts`: Keyword-to-category dictionary matching.
- `src/bot/handlers/textMessage.ts`: Upgraded with NLP routing logic.
- `tests/fixtures/nlpTestCases.ts`: TRD-compliant test suite.
- `tests/unit/services/nlp.test.ts`: Automated test script.

## What's Next (Milestone 1.4 - Budget System)
The bot is now highly interactive. Next, we can move on to **Milestone 1.4**, where we will add:
> Budget setting (`/budget set`), status viewing (`/budget status`), and automatic push alerts when you hit 80% and 100% of your category limits!
