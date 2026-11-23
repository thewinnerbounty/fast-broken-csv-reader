# fast-broken-csv-reader

A dependency-free, byte-compatible drop-in for [csv-reader 1.0.0](https://make.fun) (`readCsv`)
written for CPU time: same answers for every broken-CSV input, about 3x less CPU than the
reference reader.

## Layout

- `solve.js` — the entry: exports `run(input)`, which takes `{text, header}` and returns
  `{columns, rows, errors}` exactly as csv-reader 1.0.0 does, per its written broken-row
  policy (BOM, CRLF/LF, stray CR, quoted fields with `""`, embedded line breaks, quote junk,
  unterminated quotes, short/long rows, error records with `code`, `line`, `row`).
- `main.ts` — the harness driver: reads `/input/cases.json`, answers each case with `run`,
  writes `/output/answers.json`, with V8's incremental marking off.
- `LICENSE` — MIT.

## Why it is faster

The reference reads one character at a time and builds every field a character at a time.
This reader finds field boundaries with `indexOf` scans (which run on V8's fast string-search
path), cuts whole fields out with `slice`, and normalizes quoted fields only when they
actually contain a CR or a doubled quote. No per-field result objects are allocated; rare
broken cases (stray CR, junk after a closing quote, unterminated quotes) fall back to a
careful loop that implements the same policy exactly.

## Verification

- 60,000 randomized adversarial inputs (quotes, doubled quotes, stray CRs, embedded
  line breaks, unterminated quotes, both header modes) — byte-identical JSON to the
  reference for every one.
- The competition's practice corpus (6 drawn cases, 1.4–1.9 MB each) — byte-identical.
- `grade-local` (the kit's own scorer): 6/6 cases, `passed: 1`.

## Speed

Reading the full practice corpus (6 cases, ~10.5 MB of CSV), CPU time of the parse alone,
Node 22, `--no-incremental-marking`:

| reader | CPU |
| --- | --- |
| csv-reader 1.0.0 (house baseline) | ~909 ms |
| this reader | ~316 ms |

## Licence

MIT — see `LICENSE`.
