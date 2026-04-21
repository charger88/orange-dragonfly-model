# Changelog

All notable changes to this project will be documented in this file.

## [0.12.0] - 4/21/2026

### Added

- Full TypeScript support with strict type checking
- Dual-format package output (ESM + CommonJS) with TypeScript declarations
- `ignore_extra_fields`, `unique_keys`, and `fulltext_indexes` lowercase static getters as the canonical names for these properties, consistent with the rest of the API naming style.

### Deprecated

- `IGNORE_EXTRA_FIELDS` — use `ignore_extra_fields` instead. The uppercase getter now proxies to the lowercase one and will be removed in a future major version.
- `UNIQUE_KEYS` — use `unique_keys` instead.
- `FULLTEXT_INDEXES` — use `fulltext_indexes` instead.

### Removed

- Support of `DeleteQuery` in `lookupQuery` function.
