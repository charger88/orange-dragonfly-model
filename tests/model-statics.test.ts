import Model from '../src/model'
import TestModel from './test-model'
import type { ODValidatorRulesSchema } from 'orange-dragonfly-validator'

class TimestampModel extends Model {
  static override get validation_rules(): ODValidatorRulesSchema {
    return {
      id: { required: false, type: 'integer', min: 1 },
      created_at: { required: false, type: 'integer' },
      updated_at: { required: false, type: 'integer' },
      deleted_at: { required: false, type: 'integer' },
    }
  }
}

class IgnoreLookupModel extends TestModel {
  static override get ignore_extra_fields(): boolean {
    return true
  }
}

// ============ unique_keys ============

test('unique_keys default is empty', () => {
  expect(Model.unique_keys).toEqual([])
})

// ============ fulltext_indexes ============

test('fulltext_indexes default is empty', () => {
  expect(Model.fulltext_indexes).toEqual([])
})

test('fulltext_indexes can be overridden', () => {
  class FTModel extends Model {
    static override get fulltext_indexes(): string[][] {
      return [['title', 'body']]
    }
  }
  expect(FTModel.fulltext_indexes).toEqual([['title', 'body']])
})

// ============ ignore_extra_fields ============

test('ignore_extra_fields default is false', () => {
  expect(Model.ignore_extra_fields).toBe(false)
})

// ============ deprecated uppercase proxies ============

test('UNIQUE_KEYS proxies to unique_keys', () => {
  expect(Model.UNIQUE_KEYS).toEqual(Model.unique_keys)
})

test('FULLTEXT_INDEXES proxies to fulltext_indexes', () => {
  expect(Model.FULLTEXT_INDEXES).toEqual(Model.fulltext_indexes)
})

test('IGNORE_EXTRA_FIELDS proxies to ignore_extra_fields', () => {
  expect(Model.IGNORE_EXTRA_FIELDS).toBe(Model.ignore_extra_fields)
})

// ============ validation_rules ============

test('validation_rules default has id field', () => {
  const rules = Model.validation_rules
  expect(rules).toHaveProperty('id')
  expect(Object.keys(rules)).toEqual(['id'])
})

// ============ special_fields ============

test('special_fields is empty when no timestamp fields in rules', () => {
  expect(TestModel.special_fields).toEqual([])
})

test('special_fields includes timestamp fields present in validation_rules', () => {
  expect(TimestampModel.special_fields).toEqual(['created_at', 'updated_at', 'deleted_at'])
})

test('special_fields partial timestamps', () => {
  class PartialTimestampModel extends Model {
    static override get validation_rules(): ODValidatorRulesSchema {
      return {
        id: { required: false, type: 'integer', min: 1 },
        updated_at: { required: false, type: 'integer' },
      }
    }
  }
  expect(PartialTimestampModel.special_fields).toEqual(['updated_at'])
})

// ============ restricted_for_output ============

test('restricted_for_output default is empty', () => {
  expect(Model.restricted_for_output).toEqual([])
})

// ============ restricted_for_lookup ============

test('restricted_for_lookup default is empty on base Model', () => {
  expect(Model.restricted_for_lookup).toEqual([])
})

// ============ restricted_for_create ============

test('restricted_for_create includes id when no special fields', () => {
  expect(Model.restricted_for_create).toEqual(['id'])
})

test('restricted_for_create includes id and special fields', () => {
  expect(TimestampModel.restricted_for_create).toEqual(['id', 'created_at', 'updated_at', 'deleted_at'])
})

// ============ restricted_for_update ============

test('restricted_for_update includes id when no special fields', () => {
  expect(Model.restricted_for_update).toEqual(['id'])
})

test('restricted_for_update includes id and special fields', () => {
  expect(TimestampModel.restricted_for_update).toEqual(['id', 'created_at', 'updated_at', 'deleted_at'])
})

// ============ ignore_extra_fields in lookupQuery ============

test('lookupQuery ignore_extra_fields skips unknown fields', () => {
  const q = IgnoreLookupModel.lookupQuery({ extra_field: 'ignored', username: 'test' }).buildRawSQL()
  expect(q.sql).toContain('username = ?')
  expect(q.sql).not.toContain('extra_field')
  expect(q.params).toContain('test')
})

test('lookupQuery ignore_extra_fields with only unknown fields returns base query', () => {
  const q = IgnoreLookupModel.lookupQuery({ extra_field: 'ignored' }).buildRawSQL()
  expect(q.sql).not.toContain('extra_field')
  expect(q.params).toEqual([])
})

// ============ base Model output ============

test('base Model output returns id', () => {
  const m = new Model({ id: 42 })
  expect(m.output).toEqual({ id: 42 })
})

test('base Model output with absent id returns null', () => {
  const m = new Model({})
  expect(m.output).toEqual({ id: null })
})

// ============ formatOutput ============

test('formatOutput delegates to output', () => {
  const m = new Model({ id: 7 })
  expect(m.formatOutput()).toEqual({ id: 7 })
})

test('formatOutput accepts mode parameter', () => {
  const m = new Model({ id: 7 })
  expect(m.formatOutput('some-mode')).toEqual({ id: 7 })
})

// ============ accessible ============

test('accessible returns true when mode is null', async() => {
  const m = new Model({ id: 1 })
  expect(await m.accessible(null)).toBe(true)
})

test('accessible returns true when mode is null and user is provided', async() => {
  const m = new Model({ id: 1 })
  expect(await m.accessible({ id: 1 }, null)).toBe(true)
})

test('accessible returns false when mode is non-null', async() => {
  const m = new Model({ id: 1 })
  expect(await m.accessible(null, 'read')).toBe(false)
  expect(await m.accessible(null, 'write')).toBe(false)
})
