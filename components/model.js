const ORM = require('orange-dragonfly-orm')
const validate = require('orange-dragonfly-validator')


class Model extends ORM.ActiveRecord {

  static IGNORE_EXTRA_FIELDS = false

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
   * Returns list of relations restricted for extended output
   * @return {Array}
   */
  static get restricted_for_output () {
    return []
  }

  /**
   * Returns list of fields restricted for lookup
   * @return {Array}
   */
  static get restricted_for_lookup () {
    return []
  }

  /**
   * Returns list of fields restricted for create method
   * @return {Array}
   */
  static get restricted_for_create () {
    return ['id'].concat(this.special_fields)
  }

  /**
   * Returns list of fields restricted for update method
   * @return {Array}
   */
  static get restricted_for_update () {
    return ['id'].concat(this.special_fields)
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
        if (this.IGNORE_EXTRA_FIELDS) {
          continue
        }
        throw new Error(`Field "${field}" is not described for model ${this.name}`)
      }
      if (this.restricted_for_lookup.includes(field)) {
        throw new Error(`Field "${field}" is restricted for searching model ${this.name}`)
      }
      q.where(field, data[field])
      filtered_rules[field] = Array.isArray(data[field]) ? {'type': 'array', 'children': {'*': rules[field]}} : rules[field]
    }
    validate(filtered_rules, data)
    return q
  }

  /**
   * Creates object
   * @param data
   * @return {Promise<ActiveRecord>}
   */
  static async create (data) {
    const rules = this.validation_rules
    const new_data = {}
    for (let field of Object.keys(data)) {
      if (!rules.hasOwnProperty(field)) {
        if (this.IGNORE_EXTRA_FIELDS) {
          continue
        }
        throw new Error(`Field "${field}" is not described for model ${this.name}`)
      }
      if (this.restricted_for_create.includes(field)) {
        throw new Error(`Field "${field}" is restricted for creating model ${this.name}`)
      }
      new_data[field] = data[field]
    }
    return await (new this(new_data)).save()
  }

  /**
   * Updates object
   * @param data
   * @return {Promise<ActiveRecord>}
   */
  async update (data) {
    if (!this.id) {
      throw new Error(`You can update saved object only`)
    }
    const new_data = {}
    for (let field of Object.keys(data)) {
      if (!rules.hasOwnProperty(field)) {
        if (this.constructor.IGNORE_EXTRA_FIELDS) {
          continue
        }
        throw new Error(`Field "${field}" is not described for model ${this.name}`)
      }
      if (this.constructor.restricted_for_update.includes(field)) {
        throw new Error(`Field "${field}" is restricted for updating model ${this.name}`)
      }
      new_data[field] = data[field]
    }
    return await this.save(new_data)
  }

  async _preSave () {
    await this._preSaveBeforeValidation()
    await this.validate()
    await this._preSaveAfterValidation()
  }

  /**
   * Custom functionality before saving (before validation)
   * @return {Promise<void>}
   * @private
   */
  async _preSaveBeforeValidation () {}

  /**
   * Validate object's data
   * @return {Promise<void>}
   */
  async validate () {
    if (this.constructor.validation_rules) {
      validate(await this.constructor.validation_rules, this.data)
    } else {
      throw new Error(`Validation rules are not defined for mode ${this.constructor.name}`)
    }
  }

  /**
   * Custom functionality before saving (after validation)
   * @return {Promise<void>}
   * @private
   */
  async _preSaveAfterValidation () {}

  /**
   * Returns object by ID if it exists and accessible by user
   * @param id
   * @param user
   * @param write
   * @return {Promise<ActiveRecord>}
   */
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

  /**
   * Returns is object accessible by user
   * @param user
   * @param write
   * @return {Promise<boolean>}
   */
  async accessible(user, write=false) {
    return !write
  }

  /**
   * Returns public data of the object
   * @return Object
   */
  get output () {
    return {
      'id': this.id
    }
  }

  /**
   * Format output
   * @param mode
   * @return {Object}
   */
  formatOutput (mode) {
    return this.output
  }

  /**
   * Returns public data of the object with relations
   * @param required_relations
   * @param mode
   * @return {Promise<Object>}
   */
  async getExtendedOutput(required_relations=[], mode = null) {
    const output = this.formatOutput(mode)
    let rel_data, rel_mode, rel_relations
    for (let name of required_relations){
      if (name.split(':').length > 1) continue
      if (this.constructor.restricted_for_output.includes(name)) {
        throw new Error(`Relation "${name}" is not allowed for extended output of model ${this.constructor.name}`)
      }
      rel_data = await this.rel(name)
      rel_mode = `relation:${this.constructor.name}.${name}`
      rel_relations = required_relations.filter(v => v.startsWith(`${name}:`)).map(v => v.substr(name.length + 1))
      output[`:${name}`] = Array.isArray(rel_data)
        ? await Promise.all(rel_data.map(v => v.getExtendedOutput(rel_relations, rel_mode)))
        : await rel_data.getExtendedOutput(rel_relations, rel_mode)
    }
    return output
  }

}

module.exports = Model
