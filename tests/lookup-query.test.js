/* eslint-disable no-undef */

const TestModel = require('./test-model')

test('select-id', () => {
  const data = [1]
  const lookup_data = { id: data[0] }
  const q = TestModel.lookupQuery(lookup_data).buildRawSQL()
  expect(q.sql).toBe('SELECT * FROM test_model WHERE test_model.id = ?')
  expect(q.params).toEqual(data)
})

test('delete-id', () => {
  const data = [1]
  const lookup_data = { id: data[0] }
  const q = TestModel.lookupQuery(lookup_data, TestModel.deleteQuery()).buildRawSQL()
  expect(q.sql).toBe('DELETE FROM test_model WHERE test_model.id = ?')
  expect(q.params).toEqual(data)
})

test('select-id-multiple', () => {
  const data = [1, 2, 3]
  const lookup_data = { id: data }
  const q = TestModel.lookupQuery(lookup_data).buildRawSQL()
  expect(q.sql).toBe('SELECT * FROM test_model WHERE test_model.id IN (?, ?, ?)')
  expect(q.params).toEqual(data)
})

test('select-username', () => {
  const data = ['qwerty']
  const lookup_data = { username: data[0] }
  const q = TestModel.lookupQuery(lookup_data).buildRawSQL()
  expect(q.sql).toBe('SELECT * FROM test_model WHERE test_model.username = ?')
  expect(q.params).toEqual(data)
})

test('select-username-incorrect', () => {
  const lookup_data = { username: 123 }
  expect(() => TestModel.lookupQuery(lookup_data)).toThrow()
})

test('select-username-wrong-field', () => {
  const lookup_data = { 'wrong-field': 123 }
  expect(() => TestModel.lookupQuery(lookup_data)).toThrow()
})

test('select-username-restricted-field', () => {
  const lookup_data = { uuid: '1234567890123456789012345678901234567890' }
  expect(() => TestModel.lookupQuery(lookup_data)).toThrow()
})
