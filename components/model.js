const ORM = require('orange-dragonfly-orm')
const validate = require('orange-dragonfly-validator')


class Model extends ORM.ActiveRecord {

  /**
   * Returns schema for the model (Orange Dragonfly Validator format)
   * @return object
   */
  static get validation_rules () {
    return {
      "id": {
        "required": false,
        "type": "integer",
        "min": 1
      }
    }
  }

  /**
   * Overridden method of ActiveRecord. Returns special fields list based on validation rules
   * @return {Array}
   */
  static get special_fields () {
    const rules = this.validation_rules
    const fields = []
    for (let field of ['created_at', 'updated_at', 'deleted_at']) {
      rules.hasOwnProperty(field) && fields.push(field)
    }
    return fields
  }

  /**
   * Returns list of fields restricted for lookup
   * @return {Array}
   */
  static get restricted_for_lookup () {
    return []
  }

  /**
   * Lookup method
   * @param data
   * @return {SelectQuery}
   */
  static lookupQuery (data) {
    const rules = this.validation_rules
    const q = this.selectQuery()
    const filtered_rules = {}
    for (let field of Object.keys(data)) {
      if (!rules.hasOwnProperty(field)) {
        throw new Error(`Field "${field}" is not described for model ${this.name}`)
      }
      if (this.restricted_for_lookup.includes(field)) {
        throw new Error(`Field "${field}" is restricted for model ${this.name}`)
      }
      q.where(field, data[field])
      filtered_rules[field] = Array.isArray(data[field]) ? {'type': 'array', 'children': {'*': rules[field]}} : rules[field]
    }
    validate(filtered_rules, data)
    return q
  }

  async _preSave () {
    await this._preSaveBeforeValidation()
    await this.validate()
    await this._preSaveAfterValidation()
  }

  async _preSaveBeforeValidation () {}

  async validate () {
    if (this.constructor.validation_rules) {
      validate(await this.constructor.validation_rules, this.data)
    } else {
      throw new Error(`Validation rules are not defined for mode ${this.constructor.name}`)
    }
  }

  async _preSaveAfterValidation () {}

  static async findAndCheckAccessOrDie(id, user, write=false) {
    const obj = await this.find(id)
    if (!obj) {
      throw new Error(`${this.name} #${id} not found`)
    }
    if (!(await obj.accessible(user, write))) {
      throw new Error(`${this.name} #${id} is not accessible for ${write ? 'writing' : 'reading'} by the user`)
    }
    return obj
  }

  async accessible(user, write=false) {
    return !write
  }

}

module.exports = Model
