import Model from '../src/model'
import TestModel from './test-model'
import {
  OrangeDatabaseInputValidationError,
  OrangeDatabaseModelAccessError,
  OrangeDatabaseModelError,
  OrangeDatabaseModelRuntimeError,
} from '../src/errors'
import { ActiveRecord } from 'orange-dragonfly-orm'
import type { ODValidatorRulesSchema } from 'orange-dragonfly-validator'

const validData = {
  id: 1,
  username: 'tester',
  uuid: '1234567890123456789012345678901234567890',
}

afterEach(() => {
  jest.restoreAllMocks()
})

// ============ OrangeDatabaseInputValidationError ============

test('OrangeDatabaseInputValidationError info setter replaces info object', () => {
  const err = new OrangeDatabaseInputValidationError('test')
  err.info = { field: 'some error' }
  expect(err.info).toEqual({ field: 'some error' })
})

// ============ create() ============

test('create throws OrangeDatabaseInputValidationError for unknown field', async() => {
  await expect(
    TestModel.create({ username: 'x', uuid: 'a'.repeat(40), unknown_field: 'z' }),
  ).rejects.toThrow(OrangeDatabaseInputValidationError)
})

test('create error for unknown field includes field name in info', async() => {
  try {
    await TestModel.create({ username: 'x', uuid: 'a'.repeat(40), bad_field: 'z' })
    fail('expected to throw')
  } catch (e) {
    expect(e).toBeInstanceOf(OrangeDatabaseInputValidationError)
    expect((e as OrangeDatabaseInputValidationError).info).toHaveProperty('bad_field')
  }
})

test('create throws for restricted field (id)', async() => {
  await expect(
    TestModel.create({ id: 1, username: 'x', uuid: 'a'.repeat(40) }),
  ).rejects.toThrow(OrangeDatabaseInputValidationError)
})

test('create error for restricted field includes field name in info', async() => {
  try {
    await TestModel.create({ id: 1, username: 'x', uuid: 'a'.repeat(40) })
    fail('expected to throw')
  } catch (e) {
    expect(e).toBeInstanceOf(OrangeDatabaseInputValidationError)
    expect((e as OrangeDatabaseInputValidationError).info).toHaveProperty('id')
  }
})

test('create with IGNORE_EXTRA_FIELDS skips unknown fields and calls save', async() => {
  class IgnoreModel extends TestModel {
    static override get ignore_extra_fields(): boolean { return true }
  }
  jest.spyOn(ActiveRecord.prototype as any, 'save').mockImplementation(async function(this: any) { return this })
  const result = await IgnoreModel.create({ username: 'test', uuid: 'a'.repeat(40), extra: 'ignored' })
  expect(result).toBeInstanceOf(IgnoreModel)
  expect(result.data).not.toHaveProperty('extra')
})

test('create success instantiates model and calls save', async() => {
  const mockSave = jest.spyOn(ActiveRecord.prototype as any, 'save').mockImplementation(async function(this: any) { return this })
  const result = await TestModel.create({ username: 'tester', uuid: 'a'.repeat(40) })
  expect(result).toBeInstanceOf(TestModel)
  expect(mockSave).toHaveBeenCalled()
})

// ============ update() ============

test('update throws when object has no id', async() => {
  const t = new TestModel({ username: 'test', uuid: 'a'.repeat(40) })
  await expect(t.update({ username: 'new' })).rejects.toThrow(OrangeDatabaseModelRuntimeError)
  await expect(t.update({ username: 'new' })).rejects.toThrow('You can update saved object only')
})

test('update throws for unknown field', async() => {
  const t = new TestModel(validData)
  await expect(t.update({ unknown_field: 'value' })).rejects.toThrow(OrangeDatabaseInputValidationError)
})

test('update error for unknown field includes field name in info', async() => {
  const t = new TestModel(validData)
  try {
    await t.update({ bad_field: 'value' })
    fail('expected to throw')
  } catch (e) {
    expect(e).toBeInstanceOf(OrangeDatabaseInputValidationError)
    expect((e as OrangeDatabaseInputValidationError).info).toHaveProperty('bad_field')
  }
})

test('update throws for restricted field (id)', async() => {
  const t = new TestModel(validData)
  await expect(t.update({ id: 2 })).rejects.toThrow(OrangeDatabaseInputValidationError)
})

test('update with IGNORE_EXTRA_FIELDS skips unknown fields', async() => {
  class IgnoreModel extends TestModel {
    static override get ignore_extra_fields(): boolean { return true }
  }
  const mockSave = jest.spyOn(ActiveRecord.prototype as any, 'save').mockImplementation(async function(this: any) { return this })
  const t = new IgnoreModel(validData)
  await t.update({ username: 'new', extra: 'ignored' })
  expect(mockSave).toHaveBeenCalledWith({ username: 'new' })
})

test('update success calls save with the filtered data', async() => {
  const mockSave = jest.spyOn(ActiveRecord.prototype as any, 'save').mockImplementation(async function(this: any) { return this })
  const t = new TestModel(validData)
  await t.update({ username: 'new_name' })
  expect(mockSave).toHaveBeenCalledWith({ username: 'new_name' })
})

// ============ checkUniqueness() ============

test('checkUniqueness returns true when UNIQUE_KEYS is empty', async() => {
  const t = new TestModel(validData)
  expect(await t.checkUniqueness()).toBe(true)
})

test('checkUniqueness returns true when all keys are unique', async() => {
  class UniqueModel extends TestModel {
    static override get unique_keys(): string[][] { return [['username']] }
  }
  const t = new UniqueModel(validData)
  jest.spyOn(t, 'isUnique').mockResolvedValue(true)
  expect(await t.checkUniqueness()).toBe(true)
})

test('checkUniqueness returns false when a key is not unique', async() => {
  class UniqueModel extends TestModel {
    static override get unique_keys(): string[][] { return [['username']] }
  }
  const t = new UniqueModel(validData)
  jest.spyOn(t, 'isUnique').mockResolvedValue(false)
  expect(await t.checkUniqueness()).toBe(false)
})

test('checkUniqueness throws OrangeDatabaseInputValidationError in exception_mode when not unique', async() => {
  class UniqueModel extends TestModel {
    static override get unique_keys(): string[][] { return [['username']] }
  }
  const t = new UniqueModel(validData)
  jest.spyOn(t, 'isUnique').mockResolvedValue(false)
  const err = await t.checkUniqueness(true).catch(e => e)
  expect(err).toBeInstanceOf(OrangeDatabaseInputValidationError)
  expect(err.info).toHaveProperty('username')
})

test('checkUniqueness passes ignore_null to isUnique', async() => {
  class UniqueModel extends TestModel {
    static override get unique_keys(): string[][] { return [['username']] }
  }
  const t = new UniqueModel(validData)
  const isUniqueSpy = jest.spyOn(t, 'isUnique').mockResolvedValue(true)
  await t.checkUniqueness(false, true)
  expect(isUniqueSpy).toHaveBeenCalledWith(['username'], true)
})

// ============ _preSave() ============

test('_preSave calls checkUniqueness(true, true) and validate', async() => {
  const t = new TestModel(validData)
  const checkUniq = jest.spyOn(t, 'checkUniqueness').mockResolvedValue(true)
  const validate = jest.spyOn(t as any, 'validate').mockResolvedValue(undefined)
  await (t as any)._preSave()
  expect(checkUniq).toHaveBeenCalledWith(true, true)
  expect(validate).toHaveBeenCalled()
})

test('_preSave with IGNORE_EXTRA_FIELDS strips unknown keys from data', async() => {
  class IgnoreModel extends Model {
    static override get ignore_extra_fields(): boolean { return true }
    static override get validation_rules(): ODValidatorRulesSchema {
      return {
        id: { required: false, type: 'integer', min: 1 },
        name: { required: false, type: 'string' },
      }
    }
  }
  const t = new IgnoreModel({ id: 1, name: 'test', extra: 'gone' })
  jest.spyOn(t, 'checkUniqueness').mockResolvedValue(true)
  jest.spyOn(t as any, 'validate').mockResolvedValue(undefined)
  await (t as any)._preSave()
  expect(t.data).not.toHaveProperty('extra')
  expect(t.data).toHaveProperty('name', 'test')
})

// ============ validate() ============

test('validate throws when validation_rules returns null', async() => {
  class BrokenModel extends Model {
    static override get validation_rules(): any { return null }
  }
  const t = new BrokenModel({ id: 1 })
  await expect(t.validate()).rejects.toThrow(OrangeDatabaseModelError)
  await expect(t.validate()).rejects.toThrow('Validation rules are not defined for model BrokenModel')
})

test('validate succeeds with valid data', async() => {
  const t = new TestModel(validData)
  await expect(t.validate()).resolves.toBeUndefined()
})

test('validate throws when parse fails due to wrong type', async() => {
  const t = new TestModel({ id: 1, username: 123, uuid: 'a'.repeat(40) })
  await expect(t.validate()).rejects.toThrow()
})

test('validate throws OrangeDatabaseInputValidationError on custom_validation errors', async() => {
  class StrictModel extends TestModel {
    override async custom_validation() {
      return { username: 'Username is taken' }
    }
  }
  const t = new StrictModel(validData)
  const err = await t.validate().catch(e => e)
  expect(err).toBeInstanceOf(OrangeDatabaseInputValidationError)
  expect(err.info).toHaveProperty('username', 'Username is taken')
})

test('validate custom_validation returning null causes no error', async() => {
  const t = new TestModel(validData)
  await expect(t.validate()).resolves.toBeUndefined()
})

test('validate custom_validation returning empty object causes no error', async() => {
  class EmptyValidationModel extends TestModel {
    override async custom_validation() { return {} }
  }
  const t = new EmptyValidationModel(validData)
  await expect(t.validate()).resolves.toBeUndefined()
})

test('validate coerces boolean field from 1 to true', async() => {
  class BoolModel extends Model {
    static override get validation_rules(): ODValidatorRulesSchema {
      return {
        id: { required: false, type: 'integer', min: 1 },
        active: { required: false, type: 'boolean' },
      }
    }
  }
  const t = new BoolModel({ id: 1, active: 1 })
  await t.validate()
  expect(t.data.active).toBe(true)
})

test('validate coerces boolean field from 0 to false', async() => {
  class BoolModel extends Model {
    static override get validation_rules(): ODValidatorRulesSchema {
      return {
        id: { required: false, type: 'integer', min: 1 },
        active: { required: false, type: 'boolean' },
      }
    }
  }
  const t = new BoolModel({ id: 1, active: 0 })
  await t.validate()
  expect(t.data.active).toBe(false)
})

test('validate throws when parent relation FK is set but relation not found', async() => {
  const t = new TestModel({ ...validData, test_model_id: 5 })
  jest.spyOn(ActiveRecord.prototype as any, 'rel').mockResolvedValue(null)
  const err = await t.validate().catch(e => e)
  expect(err).toBeInstanceOf(OrangeDatabaseInputValidationError)
  expect(err.info).toHaveProperty('test_model_id', 'Parent object not found')
})

test('validate skips parent relation check when FK is null', async() => {
  const t = new TestModel({ ...validData, test_model_id: null })
  const relSpy = jest.spyOn(ActiveRecord.prototype as any, 'rel')
  await t.validate()
  expect(relSpy).not.toHaveBeenCalled()
})

test('validate skips parent relation check when FK is 0', async() => {
  const t = new TestModel({ ...validData, test_model_id: 0 })
  const relSpy = jest.spyOn(ActiveRecord.prototype as any, 'rel')
  await t.validate()
  expect(relSpy).not.toHaveBeenCalled()
})

test('validate skips parent relation check when FK field not in data', async() => {
  const t = new TestModel(validData)
  const relSpy = jest.spyOn(ActiveRecord.prototype as any, 'rel')
  await t.validate()
  expect(relSpy).not.toHaveBeenCalled()
})

test('validate succeeds when parent relation FK is set and relation is found', async() => {
  const t = new TestModel({ ...validData, test_model_id: 2 })
  jest.spyOn(ActiveRecord.prototype as any, 'rel').mockResolvedValue(new TestModel(validData))
  await expect(t.validate()).resolves.toBeUndefined()
})

// ============ findAndCheckAccessOrDie() ============

test('findAndCheckAccessOrDie returns object when found and accessible', async() => {
  const t = new TestModel(validData)
  jest.spyOn(TestModel, 'find').mockResolvedValue(t as any)
  jest.spyOn(t, 'accessible').mockResolvedValue(true)
  const result = await TestModel.findAndCheckAccessOrDie(1, null)
  expect(result).toBe(t)
})

test('findAndCheckAccessOrDie throws when object not found', async() => {
  jest.spyOn(TestModel, 'find').mockResolvedValue(null)
  await expect(TestModel.findAndCheckAccessOrDie(99, null)).rejects.toThrow(OrangeDatabaseModelRuntimeError)
  await expect(TestModel.findAndCheckAccessOrDie(99, null)).rejects.toThrow('TestModel #99 not found')
})

test('findAndCheckAccessOrDie throws when object not accessible without mode', async() => {
  const t = new TestModel(validData)
  jest.spyOn(TestModel, 'find').mockResolvedValue(t as any)
  jest.spyOn(t, 'accessible').mockResolvedValue(false)
  await expect(TestModel.findAndCheckAccessOrDie(1, null)).rejects.toThrow(OrangeDatabaseModelAccessError)
  await expect(TestModel.findAndCheckAccessOrDie(1, null)).rejects.toThrow('is not accessible')
})

test('findAndCheckAccessOrDie throws with mode in error message when not accessible', async() => {
  const t = new TestModel(validData)
  jest.spyOn(TestModel, 'find').mockResolvedValue(t as any)
  jest.spyOn(t, 'accessible').mockResolvedValue(false)
  await expect(TestModel.findAndCheckAccessOrDie(1, null, 'edit')).rejects.toThrow(OrangeDatabaseModelAccessError)
  await expect(TestModel.findAndCheckAccessOrDie(1, null, 'edit')).rejects.toThrow('for edit')
})

// ============ getExtendedOutput() edge cases ============

test('getExtendedOutput throws for a restricted relation', async() => {
  class RestrictedModel extends TestModel {
    static override get restricted_for_output(): string[] { return ['child_test'] }
  }
  const t = new RestrictedModel(validData)
  await expect(t.getExtendedOutput(['child_test'])).rejects.toThrow(OrangeDatabaseModelError)
  await expect(t.getExtendedOutput(['child_test'])).rejects.toThrow('not allowed for extended output')
})

test('getExtendedOutput handles array relation data', async() => {
  const data2 = { id: 2, username: 'admin', uuid: '0987654321098765432109876543210987654321' }
  const data3 = { id: 3, username: 'mod', uuid: '1111111111111111111111111111111111111111' }
  const t = new TestModel(validData)
  const t2 = new TestModel(data2)
  const t3 = new TestModel(data3)
  t.relations.child_test = [t2, t3]
  const o = await t.getExtendedOutput(['child_test'])
  expect(Array.isArray(o[':child_test'])).toBe(true)
  expect((o[':child_test'] as any[]).length).toBe(2)
  expect((o[':child_test'] as any[])[0].id).toBe(2)
  expect((o[':child_test'] as any[])[1].id).toBe(3)
})

test('getExtendedOutput skips nested relation specifiers at top level', async() => {
  const t = new TestModel(validData)
  t.relations.child_test = null
  const o = await t.getExtendedOutput(['child_test', 'child_test:sub'])
  expect(o).not.toHaveProperty(':child_test:sub')
  expect(o[':child_test']).toBeNull()
})
