const Model = require('../components/model')

class TestModel extends Model {

  static get validation_rules () {
    return require('./test-model-schema.json')
  }

  static get restricted_for_lookup () {
    return ['uuid']
  }

}

module.exports = TestModel
