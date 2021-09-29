/* eslint-disable no-undef */

const TestModel = require('./test-model')

const data = {
  id: 1,
  username: 'tester',
  uuid: '1234567890123456789012345678901234567890'
}

test('output', () => {
  const t = new TestModel(data)
  const o = t.output
  expect(o.id).toBe(data.id)
  expect(o.username).toBe(data.username)
  expect(o.uuid).toBe(data.uuid)
  expect(o.constant_value).toBe('QWERTY')
})

test('output-extended', async () => {
  const t = new TestModel(data)
  const o = await t.getExtendedOutput()
  expect(o.id).toBe(data.id)
  expect(o.username).toBe(data.username)
  expect(o.uuid).toBe(data.uuid)
  expect(o.constant_value).toBe('QWERTY')
})

test('output-extended-rel-empty', async () => {
  const t = new TestModel(data)
  t.relations.child_test = null
  const o = await t.getExtendedOutput(['child_test'])
  expect(o.id).toBe(data.id)
  expect(o.username).toBe(data.username)
  expect(o.uuid).toBe(data.uuid)
  expect(o.constant_value).toBe('QWERTY')
  expect(o[':child_test']).toEqual(null)
})

test('output-extended-rel-data', async () => {
  const data2 = {
    id: 2,
    username: 'admin',
    uuid: '0987654321098765432109876543210987654321'
  }
  const t = new TestModel(data)
  const t2 = new TestModel(data2)
  t.relations.child_test = t2
  const o = await t.getExtendedOutput(['child_test'])
  expect(o.id).toBe(data.id)
  expect(o.username).toBe(data.username)
  expect(o.uuid).toBe(data.uuid)
  expect(o.constant_value).toBe('QWERTY')
  expect(o[':child_test'].id).toBe(data2.id)
  expect(o[':child_test'].username).toBe(data2.username)
  expect(o[':child_test'].uuid).toBe(data2.uuid)
  expect(o[':child_test'].constant_value).toBe('QWERTY')
})
