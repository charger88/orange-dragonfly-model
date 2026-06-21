# Orange Dragonfly Model

An active-record model class for the Orange Dragonfly framework. Extends [`orange-dragonfly-orm`](https://github.com/charger88/orange-dragonfly-orm)'s `ActiveRecord` with validation, access control, field restrictions, and structured output serialisation.

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Defining a model](#defining-a-model)
- [Typed data access](#typed-data-access)
- [Field restrictions](#field-restrictions)
- [CRUD operations](#crud-operations)
- [Querying](#querying)
- [Validation](#validation)
- [Access control](#access-control)
- [Output serialisation](#output-serialisation)
- [Error handling](#error-handling)
- [Deprecated API](#deprecated-api)

---

## Installation

```bash
npm install orange-dragonfly-model
```

`orange-dragonfly-orm` and `orange-dragonfly-validator` are regular dependencies and are installed automatically.

---

## Quick start

```typescript
import { Model } from 'orange-dragonfly-model'
import type { ODValidatorRulesSchema } from 'orange-dragonfly-validator'
import { Relation } from 'orange-dragonfly-orm'

class Article extends Model {
  static override get validation_rules(): ODValidatorRulesSchema {
    return {
      id:         { required: false, type: 'integer', min: 1 },
      title:      { required: true,  type: 'string',  min: 1, max: 255 },
      body:       { required: true,  type: 'string',  min: 1 },
      author_id:  { required: true,  type: 'integer', min: 1 },
      published:  { required: false, type: 'boolean' },
      created_at: { required: false, type: 'integer' },
      updated_at: { required: false, type: 'integer' },
    }
  }

  static override get unique_keys(): string[][] {
    return [['title']]
  }

  static override get available_relations() {
    return {
      author: Relation.parent(this, User),
    }
  }

  override get output(): Record<string, unknown> {
    return {
      id:        this.id,
      title:     this.data.title,
      published: this.data.published,
    }
  }
}

// Create
const article = await Article.create({ title: 'Hello', body: 'World', author_id: 1 })

// Update
await article.update({ title: 'Hello World' })

// Lookup
const q = Article.lookupQuery({ title: 'Hello World' })
const results = await q.select()

// Serialise with relations
const json = await article.getExtendedOutput(['author'])
```

---

## Defining a model

Subclass `Model` and override the static getters that describe the model's shape and behaviour. Every getter is optional — the base class provides safe defaults.

### validation_rules

Returns an [`orange-dragonfly-validator`](https://github.com/charger88/orange-dragonfly-validator) schema that describes every field the model accepts. This schema is used by `validate()`, `create()`, `update()`, and `lookupQuery()`.

```typescript
static override get validation_rules(): ODValidatorRulesSchema {
  return {
    id:       { required: false, type: 'integer', min: 1 },
    username: { required: true,  type: 'string',  min: 1, max: 64 },
    email:    { required: true,  type: 'string',  min: 5, max: 255 },
    active:   { required: false, type: 'boolean' },
  }
}
```

The default rule set contains only `id`.

**Boolean coercion.** During validation, fields declared as `type: 'boolean'` are automatically coerced: the integer `1` becomes `true` and `0` becomes `false`. This handles databases that store booleans as integers.

**Relation integrity.** For every `parent`-mode relation defined in `available_relations`, `validate()` checks that the referenced parent record exists whenever the foreign-key field is present and non-null/non-zero.

### special_fields

Derived automatically from `validation_rules` — no override needed. A field is "special" when its name is one of `created_at`, `updated_at`, or `deleted_at`. Special fields are managed by `ActiveRecord.save()` and `ActiveRecord.remove()` and are automatically added to `restricted_for_create` and `restricted_for_update`.

```typescript
// If your rules include created_at and updated_at:
static override get validation_rules(): ODValidatorRulesSchema {
  return {
    id:         { required: false, type: 'integer', min: 1 },
    name:       { required: true,  type: 'string' },
    created_at: { required: false, type: 'integer' },
    updated_at: { required: false, type: 'integer' },
  }
}
// → special_fields returns ['created_at', 'updated_at'] automatically
// → restricted_for_create returns ['id', 'created_at', 'updated_at'] automatically
```

### unique_keys

A list of field-name groups that must be unique across the table. Each inner array is one composite key. Checked automatically on every `save()`.

```typescript
static override get unique_keys(): string[][] {
  return [
    ['email'],               // email alone must be unique
    ['first_name', 'last_name'], // combination must be unique
  ]
}
```

When a uniqueness violation is detected during save, an `OrangeDatabaseInputValidationError` is thrown with every field in the failing key listed in `.info`.

**Null handling.** By default, null values in a key cause the uniqueness check to pass (treating null as always-unique). This matches SQL `UNIQUE` index behaviour where `NULL ≠ NULL`. You can control this per-call via the `ignore_null` parameter of `checkUniqueness()`.

### fulltext_indexes

Declares the fulltext indexes that exist on the table. This is informational metadata — the library itself does not automatically build MATCH/AGAINST queries from it, but your query-builder layer or framework tooling can inspect it.

```typescript
static override get fulltext_indexes(): string[][] {
  return [
    ['title', 'body'],  // composite fulltext index
  ]
}
```

### ignore_extra_fields

When `true`, fields present in input data that are not declared in `validation_rules` are silently dropped instead of raising an error. Applies to `create()`, `update()`, `lookupQuery()`, and `_preSave()`.

Useful when the application shares a database with other systems and columns may be added to a table outside of your control.

```typescript
static override get ignore_extra_fields(): boolean {
  return true
}
```

Default: `false` — unknown fields throw `OrangeDatabaseInputValidationError`.

---

## Typed data access

By default `this.data` is typed as `Record<string, unknown>`, so accessing individual fields gives `unknown`. The exported `ModelData<S>` utility type derives a precise TypeScript type directly from a `validation_rules` schema, making field access fully type-safe.

**Three steps to opt in:**

1. Declare the schema as a module-level `const` using `as const satisfies ODValidatorRulesSchema` to preserve literal type information.
2. Return that const from `validation_rules` (drop the explicit `: ODValidatorRulesSchema` return-type annotation so TypeScript keeps the narrow type).
3. Add `declare data: ModelData<typeof schema>` inside the subclass.

```typescript
import Model, { type ModelData } from 'orange-dragonfly-model'
import type { ODValidatorRulesSchema } from 'orange-dragonfly-validator'

const articleSchema = {
  id:         { required: false, type: 'integer', min: 1 },
  title:      { required: true,  type: 'string',  min: 1, max: 255 },
  body:       { required: true,  type: 'string',  min: 1 },
  author_id:  { required: true,  type: 'integer', min: 1 },
  published:  { required: false, type: 'boolean' },
  created_at: { required: false, type: 'integer' },
  updated_at: { required: false, type: 'integer' },
} as const satisfies ODValidatorRulesSchema

class Article extends Model {
  static override get validation_rules() { return articleSchema }
  declare data: ModelData<typeof articleSchema>
}

// Field access is now fully typed:
const article = await Article.find(1)
article.data.title      // string
article.data.published  // boolean
article.data.author_id  // number
article.data.missing    // TypeScript error — field not in schema
```

**Schema type → TypeScript type mapping:**

| Validator type | TypeScript type |
|---|---|
| `'string'` | `string` |
| `'integer'`, `'number'` | `number` |
| `'boolean'` | `boolean` |
| `'null'` | `null` |
| `'object'` | `Record<string, unknown>` |
| `'array'` | `unknown[]` |
| `'function'` | `(...args: unknown[]) => unknown` |

When `type` is an array (e.g. `['string', 'null']`), the result is the union of the corresponding TypeScript types (`string | null`).

**Why `as const` is required.** Without it, TypeScript widens the string literal `'integer'` to the broad type `string`, and `ModelData` cannot resolve the mapping. `satisfies ODValidatorRulesSchema` validates the object against the schema without widening the inferred type.

**Why the schema lives outside the class.** `declare data: ModelData<typeof articleSchema>` inside the class body needs to reference a name that is already in scope. A static getter cannot be referenced this way without a circular reference.

The `declare data` line has no runtime cost — it is a type-only declaration that narrows the `Record<string, unknown>` inherited from `ActiveRecord`.

---

## Field restrictions

These getters return an array of field names that are blocked in specific operations. Attempting to pass a restricted field throws `OrangeDatabaseInputValidationError`.

### restricted_for_lookup

Fields that callers may not filter by in `lookupQuery()`.

```typescript
static override get restricted_for_lookup(): string[] {
  return ['password_hash', 'secret_token']
}
```

Default: `[]`.

### restricted_for_create

Fields that callers may not supply to `create()`. Defaults to `['id', ...special_fields]` — override to extend it.

```typescript
static override get restricted_for_create(): string[] {
  return super.restricted_for_create.concat(['role'])  // callers cannot set role on creation
}
```

### restricted_for_update

Fields that callers may not supply to `update()`. Defaults to `['id', ...special_fields]`.

```typescript
static override get restricted_for_update(): string[] {
  return super.restricted_for_update.concat(['email'])  // email cannot be changed after creation
}
```

### restricted_for_output

Relation names that `getExtendedOutput()` will refuse to embed. Trying to include a restricted relation throws a plain `Error`.

```typescript
static override get restricted_for_output(): string[] {
  return ['payment_details']
}
```

Default: `[]`.

---

## CRUD operations

### create

Validates field names and restrictions, then inserts a new record. Validation rules and uniqueness constraints are enforced by `_preSave()` before the DB write.

```typescript
const user = await User.create({
  username: 'alice',
  email: 'alice@example.com',
})
// → User instance with id set by the database
```

Throws `OrangeDatabaseInputValidationError` when:
- a field is not in `validation_rules` (and `ignore_extra_fields` is `false`)
- a field is in `restricted_for_create`
- validation fails (type mismatch, required field missing, uniqueness violation, etc.)

### update

Merges the supplied fields into the record and saves it. The instance must already have an `id` (i.e. it was loaded from the database or returned by `create()`).

```typescript
await article.update({ title: 'Revised title', body: 'Updated content' })
```

Throws `Error('You can update saved object only')` if `this.id` is falsy. Throws `OrangeDatabaseInputValidationError` for the same field-level reasons as `create()`.

---

## Querying

### lookupQuery

Builds a `SelectQuery` from a plain data object, applying field validation and restriction checks before any SQL is generated. Returns the query so you can chain further conditions or execute it.

```typescript
// Simple equality
const q = User.lookupQuery({ username: 'alice' })
const users = await q.select()

// Array → IN (...)
const q2 = User.lookupQuery({ id: [1, 2, 3] })

// Compose with an existing query (e.g. add ORDER BY before calling select)
const base = User.selectQuery().orderBy('created_at', 'DESC')
const q3 = User.lookupQuery({ active: true }, base)
```

Fields not present in `validation_rules` throw unless `ignore_extra_fields` is `true`. Fields in `restricted_for_lookup` always throw.

---

## Validation

### validate

Called automatically by `_preSave()` on every `create()` / `update()` / `save()`. Can also be called manually.

Performs three checks in order:

1. **Schema validation** — runs `orange-dragonfly-validator` `parse()` against `this.data` using `validation_rules`.
2. **Custom validation** — calls `custom_validation()` and collects any returned errors.
3. **Relation integrity** — for each `parent`-mode relation, if the foreign-key field is set to a non-null, non-zero value, verifies the parent record exists.

```typescript
const user = new User({ username: '', email: 'not-an-email' })
await user.validate()  // throws OrangeDatabaseInputValidationError
```

### custom_validation

Override to add application-specific validation logic. Return `null` (or an empty object) on success, or a `Record<string, string>` mapping field names to error messages.

```typescript
override async custom_validation(): Promise<Record<string, string> | null> {
  if (this.data.password !== this.data.password_confirm) {
    return { password_confirm: 'Passwords do not match' }
  }
  if (await User.selectQuery().where('email', this.data.email).exists()) {
    return { email: 'Email is already taken' }
  }
  return null
}
```

### checkUniqueness

Checks all `unique_keys` constraints against the database. Called automatically during `_preSave()` with `exception_mode = true` and `ignore_null = true`. Can be called manually for pre-flight checks.

```typescript
// Returns boolean
const isOk = await article.checkUniqueness()

// Throws OrangeDatabaseInputValidationError if not unique
await article.checkUniqueness(true)

// Treat null values as non-unique (strict mode)
await article.checkUniqueness(true, false)
```

| Parameter | Default | Description |
|---|---|---|
| `exception_mode` | `false` | Throw instead of returning `false` when a violation is found |
| `ignore_null` | `false` | Return `true` immediately when any key field is `null` (null is always-unique) |

---

## Access control

### accessible

Override to implement per-object access control. Receives the requesting user and an optional mode string. Returns `true` when access should be granted.

The base implementation grants access when `mode` is `null` and denies it otherwise — a safe default that lets you add access checks incrementally.

```typescript
override async accessible(user: AuthUser | null, mode: string | null = null): Promise<boolean> {
  if (!user) return false
  if (user.role === 'admin') return true
  if (mode === 'write') return this.data.owner_id === user.id
  return true  // read access for any authenticated user
}
```

### findAndCheckAccessOrDie

Fetches a record by id and calls `accessible()`. Throws a plain `Error` if the record is not found or not accessible — suitable for use in API route handlers.

```typescript
// In a route handler:
const article = await Article.findAndCheckAccessOrDie(req.params.id, req.user, 'write')
// Continues only if the record exists and accessible(user, 'write') returns true
```

Error messages:
- `"Article #42 not found"` — record missing
- `"Article #42 is not accessible"` — mode is `null`
- `"Article #42 is not accessible for write"` — mode is provided

---

## Output serialisation

### output

A getter that returns the public representation of the record. Override to expose exactly the fields you want — omit sensitive data and include any computed values.

```typescript
override get output(): Record<string, unknown> {
  return {
    id:        this.id,
    username:  this.data.username,
    joined_at: this.data.created_at,
  }
}
```

The base implementation returns `{ id: this.id }`.

### formatOutput

Called by `getExtendedOutput()`. Override when the output shape depends on the access context (e.g. return fewer fields for relation embeds).

```typescript
override formatOutput(mode: string | null = null): Record<string, unknown> {
  const base = this.output
  if (mode?.startsWith('relation:')) {
    // Return a compact representation when embedded as a relation
    return { id: base.id, username: base.username }
  }
  return base
}
```

The base implementation delegates to `output` regardless of `mode`.

### getExtendedOutput

Embeds relation data alongside the base output. Pass a flat list of relation names; use colon-separated paths for nesting.

```typescript
// Embed a single relation
const data = await article.getExtendedOutput(['author'])
// → { id, title, ..., ':author': { id, username } }

// Nest relations: embed author's profile inside author
const data = await article.getExtendedOutput(['author', 'author:profile'])
// → { ..., ':author': { ..., ':profile': { ... } } }

// Array relations work automatically
const data = await post.getExtendedOutput(['comments'])
// → { ..., ':comments': [{ ... }, { ... }] }
```

Relation keys in the returned object are prefixed with `:` to distinguish them from plain fields. Relations listed in `restricted_for_output` throw `OrangeDatabaseModelError` when requested.

The `mode` string is threaded through `formatOutput()` calls on embedded objects as `"relation:ParentModel.relationName"`, which lets models adjust their output when they are rendered as embedded relations.

---

## Error handling

The library uses a typed error hierarchy, all rooted in `OrangeDatabaseError` from `orange-dragonfly-orm`:

```
OrangeDatabaseError                  (orange-dragonfly-orm)
├── OrangeDatabaseInputError         (orange-dragonfly-orm)
│   └── OrangeDatabaseInputValidationError   field-level validation failures
└── OrangeDatabaseModelError                 model configuration / programming errors
    └── OrangeDatabaseModelRuntimeError      runtime state errors
        └── OrangeDatabaseModelAccessError   access-control failures
```

All classes are exported from `orange-dragonfly-model`.

### OrangeDatabaseInputValidationError

Thrown by `create()`, `update()`, `lookupQuery()`, `validate()`, and `checkUniqueness()` whenever field-level input is invalid. Carries an `info` map of per-field error messages.

```typescript
import { OrangeDatabaseInputValidationError } from 'orange-dragonfly-model'

try {
  await User.create({ username: '', email: 'bad' })
} catch (e) {
  if (e instanceof OrangeDatabaseInputValidationError) {
    console.log(e.message)  // 'Validation failed'
    console.log(e.info)     // { username: '...', email: '...' }
  }
}
```

### OrangeDatabaseModelError

Thrown for model configuration or programming errors — for example, calling `getExtendedOutput()` with a relation that is in `restricted_for_output`, or accessing a model whose `validation_rules` returns `null`.

### OrangeDatabaseModelRuntimeError

Thrown for runtime state violations — for example, calling `update()` on an unsaved instance, or `findAndCheckAccessOrDie()` when the requested record does not exist.

### OrangeDatabaseModelAccessError

Thrown by `findAndCheckAccessOrDie()` when `accessible()` returns `false`. Extends `OrangeDatabaseModelRuntimeError`, so a single `catch (e instanceof OrangeDatabaseModelRuntimeError)` covers both not-found and access-denied cases if needed.

```typescript
import {
  OrangeDatabaseModelRuntimeError,
  OrangeDatabaseModelAccessError,
} from 'orange-dragonfly-model'

try {
  const article = await Article.findAndCheckAccessOrDie(id, user, 'write')
} catch (e) {
  if (e instanceof OrangeDatabaseModelAccessError) {
    // 403 — record exists but user cannot access it
  } else if (e instanceof OrangeDatabaseModelRuntimeError) {
    // 404 — record not found
  }
}
```

---

## Deprecated API

The following uppercase getters were renamed for naming consistency. They still work as proxies but will be removed in a future major version.

| Deprecated | Replacement |
|---|---|
| `IGNORE_EXTRA_FIELDS` | `ignore_extra_fields` |
| `UNIQUE_KEYS` | `unique_keys` |
| `FULLTEXT_INDEXES` | `fulltext_indexes` |

Migrate by renaming your overrides:

```typescript
// Before
static override get UNIQUE_KEYS(): string[][] {
  return [['email']]
}

// After
static override get unique_keys(): string[][] {
  return [['email']]
}
```
