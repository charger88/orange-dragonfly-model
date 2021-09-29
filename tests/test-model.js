/* eslint-disable no-undef */

const Model = require('../components/model')
const ORM = require('orange-dragonfly-orm')

class TestModel extends Model {
  static get available_relations () {
    return {
      child_test: ORM.Relation.parent(this, this)
    }
  }

  static get validation_rules () {
    return require('./test-model-schema.json')
  }

  static get restricted_for_lookup () {
    return ['uuid']
  }

  get output () {
    return {
      id: this.id,
      username: this.data.username,
      uuid: this.data.uuid,
      constant_value: 'QWERTY'
    }
  }
}

module.exports = TestModel
