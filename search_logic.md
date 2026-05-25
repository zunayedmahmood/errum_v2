# Product Search Logic

## Overview

This document describes a multi-signal, weighted scoring algorithm for product name search. It is designed to be language/framework-agnostic so an AI agent can implement it in any backend stack.

The root cause of the original bug: a plain word-overlap (set intersection) score treats all matching tokens as equal. For the query `Jordan 3 Retro`, the tokens `Jordan` and `Retro` match both `Jordan 1 Retro …` and `Jordan 3 Retro …`, giving them identical scores. The model number `3` — the most discriminating token in the query — had the same weight as any other word. The fix is to **promote positional/numeric tokens and penalise numeric mismatches**, while still rewarding broad fuzzy overlap.

---

## Definitions

| Term | Meaning |
|---|---|
| **Query** | The raw string the user typed |
| **Product name** | The full `name` field (base + variation suffix) |
| **Base name** | The `base_name` field — canonical model identity without size/color suffix |
| **Candidate** | Any product being scored against the query |
| **Token** | A single whitespace-delimited word after normalisation |
| **Numeric token** | A token that is (or starts with) one or more digits, e.g. `3`, `1`, `40`, `2022` |
| **Critical token** | A token that appears at a structurally significant position (see below) |

---

## Step 1 — Normalise

Apply to **both** the query and every candidate name before any comparison.

1. Lowercase the string.
2. Strip or replace special characters that are not meaningful separators:
   - Replace `/`, `-`, `_`, `&` with a space.
   - Remove `(`, `)`, `.` (they appear in quality markers like `(1:1)`, `(1.1)` which carry no search value).
3. Collapse multiple spaces to one.
4. Trim leading/trailing whitespace.
5. Split on spaces to get the token list.
6. **Do not stem or lemmatise.** The catalog contains model codes (`OG`, `SP`, `SE`, `GS`, `TR`), brand acronyms (`LV`, `AP`), and numbers that stemming would corrupt.

Example:
```
"Jordan 3 Retro A MA Maniere (1:1)"
→ tokens: ["jordan", "3", "retro", "a", "ma", "maniere"]
```

---

## Step 2 — Identify Token Types

For each token in the **query**, classify it:

| Class | Rule | Examples |
|---|---|---|
| **Numeric** | `token` matches `/^\d/` (starts with a digit) | `3`, `1`, `40`, `2022`, `650` |
| **Model code** | Short uppercase-only token (≤4 chars) | `OG`, `SP`, `SE`, `GS`, `TR`, `SB`, `UNC` |
| **Brand stop-word** | Token that is extremely common and alone gives no discrimination (see list below) | — |
| **Normal** | Everything else | `retro`, `dunk`, `jordan`, `adidas`, `black`, `cement` |

**Brand stop-words** (tokens so common they should not inflate scores on their own):
`the`, `a`, `an`, `by`, `x`, `de`, `la`, `le`, `and`, `with`, `for`, `of`, `in`, `low`, `high`, `mid`

> These are stop-words **only for scoring purposes**. Still use them for the "exact phrase" bonus in Step 4.

---

## Step 3 — Score Each Candidate

Compute `total_score` as the sum of four independent signals.

### Signal A — Token Overlap (base score)

For each **query token** that appears anywhere in the **candidate token list**, add:
- `+3` if the token is **Numeric** (digit-leading)
- `+2` if the token is a **Model code** (short all-caps)
- `+1` for any other **Normal** token
- `+0` for **Brand stop-words**

This alone does not fix the problem — a `Jordan 1 Retro` still matches `jordan` (+1) and `retro` (+1) = 2, while `Jordan 3 Retro` matches `jordan` (+1), `3` (+3), `retro` (+1) = 5. The numeric promotion now correctly separates them.

### Signal B — Numeric Mismatch Penalty

For each **Numeric token in the query**:
- Check if the **same numeric token** is present in the candidate.
- If it is **not** present → subtract `5` from the score.

This is the main fix for the reported bug. Query `Jordan 3 Retro` vs candidate `Jordan 1 Retro …`:
- Query numeric tokens: `["3"]`
- Candidate has `1` not `3` → penalty of `-5`
- Net effect: `Jordan 1 Retro` scores roughly `1+1-5 = -3`; `Jordan 3 Retro` scores `1+3+1 = 5`. Correct ordering guaranteed.

> **Edge case:** If the query contains no numeric tokens, Signal B contributes 0 (no penalty applied).

### Signal C — Positional / Prefix Bonus

Product names follow a consistent left-to-right specificity order:
`Brand → Model Number → Model Line → Sub-model → Colorway`

Reward candidates whose **leading tokens match the query's leading tokens**:
- For positions 0, 1, 2, 3 (first four token slots), if `query_token[i] == candidate_token[i]`, add `+1` per matching position.
- Cap this bonus at `+4` total.

This ensures `Jordan 3 Retro Black Cat` ranks above `Black Cat Jordan 3 Retro` (hypothetically) for the query `Jordan 3 Retro`.

### Signal D — Base-name Exact Match Bonus

Compare the **full normalised query string** against the **normalised base_name** of the candidate (not the full `name` with variation suffix):

- If the normalised query **equals** the normalised base_name → add `+20`
- If the normalised base_name **starts with** the normalised query → add `+10`
- If the normalised query **starts with** the normalised base_name → add `+5` (user typed more than the product name; still a strong match)
- Otherwise → `+0`

This guarantees that a user who types the exact product base name gets that product at the very top regardless of other scores.

---

## Step 4 — Exact Phrase Bonus (optional but recommended)

Before running the per-token signals, check: does the **full normalised query string** appear as a **contiguous substring** inside the **normalised candidate name**?

- Yes → add `+15` to that candidate's score.

This rewards results where the query appears verbatim inside the name, even for multi-word queries with stop-words (`jordan 3 retro black` should beat a product named `jordan 3 retro` followed by unrelated color text if the user typed the full color too).

---

## Step 5 — Filter Out Zero-and-Below Scores

After scoring all candidates, discard any with `total_score ≤ 0`. These have no meaningful relationship to the query (they matched nothing, or numeric penalties cancelled all gains).

> Exception: if the query is a single token and all candidates score ≤ 0, return the top 20 by raw overlap anyway, to avoid empty results on short/ambiguous queries.

---

## Step 6 — Sort and Return

Sort the remaining candidates by:
1. `total_score` **descending** (primary)
2. `base_name` **ascending** alphabetically (secondary — deterministic tiebreak, replaces the old "oldest first" tiebreak that caused the original bug)

Return the top N results (recommended: 20 for UI lists, all for API consumers who filter themselves).

---

## Worked Examples

### Query: `Jordan 3 Retro`

| Candidate | A | B | C | D | Total |
|---|---|---|---|---|---|
| Jordan 3 Retro Black Cat (1:1) | 1+3+1=5 | 0 | 1+1+1=3 | +10 | **18** |
| Jordan 3 Retro Fire Red Denim (1:1) | 1+3+1=5 | 0 | 1+1+1=3 | +10 | **18** |
| Jordan 1 Retro High OG Chicago (1:1) | 1+1=2 | -5 | 1+0+1=2 | 0 | **0** → filtered |
| Jordan 11 Retro Cherry 2022 (1:1) | 1+1=2 | -5 | 1+0+1=2 | 0 | **0** → filtered |
| Jordan 4 Retro Black Cat (1:1) | 1+1=2 | -5 | 1+0+1=2 | 0 | **0** → filtered |

Jordan 3 results correctly dominate. Jordan 1, 4, 11 are correctly suppressed.

---

### Query: `Nike Dunk Low`

| Candidate | A | B | C | D | Total |
|---|---|---|---|---|---|
| Nike Dunk Low Medium Curry (1:1) | 1+1+0=2 | 0 | 1+1+0=2 | +10 | **15** |
| Nike Dunk Low Athletic Department (1:1) | 1+1+0=2 | 0 | 1+1+0=2 | +10 | **15** |
| Nike SB Dunk Low Supreme 94 (1:1) | 1+1+0=2 | 0 | 1+0+0=1 | 0 | **4** |
| Adidas Samba OG Black White (1:1) | 0 | 0 | 0 | 0 | **0** → filtered |

*Note: `Low` is a stop-word so it scores 0 in Signal A, but it still contributes to the substring check in Step 4 and exact prefix in Signal D.*

---

### Query: `Jordan 3 Retro Black Cat`

Signal D fires the exact match bonus because `jordan 3 retro black cat` starts with the base name `jordan 3 retro black cat` (exact equality → +20). Colorway-specific queries reliably surface the exact product.

---

## Implementation Notes for the Agent

1. **Where to apply this:** Apply on the `base_name` field for scoring Signals A–C and D. Use the full `name` (with variation suffix) only for Signal D's prefix check and substring check (Step 4), since the suffix is display-only.

2. **Pre-processing at index time:** Normalise and tokenise all base names once when products are loaded/indexed. Store the token list alongside each product. Do not re-tokenise on every query.

3. **Numeric token edge cases:**
   - `1:1` and `1.1` (quality tags) become `1 1` after normalisation. Since they appear in almost every product, they act like stop-words in practice. If you want to be precise, add `1` to the brand stop-words list, or strip `:` and `.` **only when surrounded by digits** before tokenising.
   - Year numbers (`2022`, `2024`) are Numeric tokens. A query like `Jordan 11 Retro 2022` will correctly penalise products without `2022` in the name.

4. **Variation suffix handling:** The `variation_suffix` field contains sizes (`-40`, `-41`) and colors (`-Coffee`, `-Fire Green`). When a user searches for a base model, all size variants of a matching base name will have identical scores. Group them under their `base_name` in the UI and show the variation options on selection, rather than returning 12 identical rows for 12 shoe sizes.

5. **Minimum query length:** Queries of 1–2 characters should use a simple `startsWith` filter on the normalised base name rather than the full scoring algorithm, to avoid noisy results.

6. **Score normalisation (optional):** If you need to compare scores across different query lengths, divide `total_score` by the number of non-stop-word query tokens. This is optional and only needed if you surface a score percentage in the UI.

7. **Do not use `Date Created` / insertion order as a tiebreaker.** This was the root cause of the original bug. Use alphabetical `base_name` ascending as the deterministic tiebreaker instead.

---

## Summary of Weight Table

| Condition | Score Delta |
|---|---|
| Matching normal token (Signal A) | +1 |
| Matching model-code token (Signal A) | +2 |
| Matching numeric token (Signal A) | +3 |
| Numeric token in query missing from candidate (Signal B) | −5 |
| Matching leading position, per position up to 4 (Signal C) | +1 each |
| Normalised query is substring of candidate name (Step 4) | +15 |
| Normalised base_name exactly equals query (Signal D) | +20 |
| Normalised base_name starts with query (Signal D) | +10 |
| Normalised query starts with base_name (Signal D) | +5 |

---

*This document is self-contained. An implementing agent should read the Definitions, Steps 1–6, the Implementation Notes, and the Weight Table. No external libraries are required — the algorithm uses only string operations and arithmetic.*