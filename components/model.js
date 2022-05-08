const ORM = require('orange-dragonfly-orm')
const validate = require('orange-dragonfly-validator')

class ValidationException extends Error {
  info = {}
}

class Model extends ORM.ActiveRecord {
  static get IGNORE_EXTRA_FIELDS () {
    return false
  }

  /**
   * Returns list of unique keys
   * @returns Array[] List of unique keys
   */
  static get UNIQUE_KEYS () {
    return []
  }

  /**
   * Returns schema for the model (Orange Dragonfly Validator format)
   * @return object
   */
  static get validation_rules () {
    return {
      id: {
        required: false,
        type: 'integer',
        min: 1
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
    for (const field of ['created_at', 'updated_at', 'deleted_at']) {
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
    for (const field of Object.keys(data)) {
      if (!rules.hasOwnProperty(field)) {
        if (this.IGNORE_EXTRA_FIELDS) {
          continue
        }
        const ex = new ValidationException('Parameters error')
        ex.info[field] = `Field "${field}" is not described for model ${this.name}`
        throw ex
      }
      if (this.restricted_for_lookup.includes(field)) {
        const ex = new ValidationException('Parameters error')
        ex.info[field] = `Field "${field}" is restricted for searching model ${this.name}`
        throw ex
      }
      q.where(field, data[field])
      filtered_rules[field] = Array.isArray(data[field]) ? { type: 'array', children: { '*': rules[field] } } : rules[field]
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
    for (const field of Object.keys(data)) {
      if (!rules.hasOwnProperty(field)) {
        if (this.IGNORE_EXTRA_FIELDS) {
          continue
        }
        const ex = new ValidationException('Parameters error')
        ex.info[field] = `Field "${field}" is not described for model ${this.name}`
        throw ex
      }
      if (this.restricted_for_create.includes(field)) {
        const ex = new ValidationException('Parameters error')
        ex.info[field] = `Field "${field}" is restricted for creating model ${this.name}`
        throw ex
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
      throw new Error('You can update saved object only')
    }
    const rules = this.constructor.validation_rules
    const new_data = {}
    for (const field of Object.keys(data)) {
      if (!rules.hasOwnProperty(field)) {
        if (this.constructor.IGNORE_EXTRA_FIELDS) {
          continue
        }
        const ex = new ValidationException('Parameters error')
        ex.info[field] = `Field "${field}" is not described for model ${this.constructor.name}`
        throw ex
      }
      if (this.constructor.restricted_for_update.includes(field)) {
        const ex = new ValidationException('Parameters error')
        ex.info[field] = `Field "${field}" is restricted for updating model ${this.constructor.name}`
        throw ex
      }
      new_data[field] = data[field]
    }
    return await this.save(new_data)
  }

  /**
   * Checks uniqueness of the object based on UNIQUE_KEYS
   */
  async checkUniqueness (exception_mode = false, ignore_null = false) {
    for (const fields of this.constructor.UNIQUE_KEYS) {
      if (!await this.isUnique(fields, ignore_null)) {
        if (exception_mode) {
          const ex = new ValidationException('Object is not unique')
          for (const field of fields) {
            ex.info[field] = 'Part of the unique key'
          }
          throw ex
        }
        return false
      }
    }
    return true
  }

  async _preSave () {
    if (this.constructor.IGNORE_EXTRA_FIELDS) {
      const rules = this.constructor.validation_rules
      for (const key of Object.keys(this.data).filter(v => !rules.hasOwnProperty(v))) {
        delete this.data[key]
      }
    }
    await super._preSave()
    await this.checkUniqueness(true, true)
    await this.validate()
  }

  /**
   * Performs custom validation - returns null (empty object) in case of successful validation or object of validation issues
   * @return {Promise<null|Object>}
   */
  async custom_validation () {
    return null
  }

  /**
   * Validate object's data
   * @return {Promise<void>}
   */
  async validate () {
    const rules = this.constructor.validation_rules
    if (!rules) {
      throw new Error(`Validation rules are not defined for mode ${this.constructor.name}`)
    }
    // Convert integer 1 or 0 to boolean
    let types
    for (const rule_name of Object.keys(rules)) {
      if (this.data.hasOwnProperty(rule_name)) {
        if (rules[rule_name].hasOwnProperty('type')) {
          types = Array.isArray(rules[rule_name].type) ? rules[rule_name].type : [rules[rule_name].type]
          if (types.includes('boolean')) {
            if ((this.data[rule_name] === 1) || (this.data[rule_name] === 0)) {
              this.data[rule_name] = this.data[rule_name] === 1
            }
          }
        }
      }
    }
    validate(rules, this.data)
    const custom_validation_errors = await this.custom_validation()
    if (custom_validation_errors && Object.keys(custom_validation_errors).length) {
      const ex = new ValidationException('Validation failed')
      for (const [param, message] of Object.entries(custom_validation_errors)) ex.info[param] = message
      throw ex
    }
    let rel
    const relation_errors = []
    for (const rel_name of Object.keys(this.constructor.available_relations)) {
      rel = this.constructor.available_relations[rel_name]
      if (rel.mode === 'parent') {
        if (this.data.hasOwnProperty(rel._a_key_by_mode) && (this.data[rel._a_key_by_mode] !== null) && (this.data[rel._a_key_by_mode] !== 0)) {
          if ((await this.rel(rel_name, true)) === null) {
            relation_errors.push(rel._a_key_by_mode)
          }
        }
      }
      if (relation_errors.length) {
        const ex = new ValidationException(`Some relations of the ${this.constructor.name} are not found`)
        for (const param of relation_errors) ex.info[param] = 'Parent object not found'
        throw ex
      }
    }
  }

  /**
   * Returns object by ID if it exists and accessible by user
   * @param id
   * @param user
   * @param mode
   * @return {Promise<ActiveRecord>}
   */
  static async findAndCheckAccessOrDie (id, user, mode = null) {
    const obj = await this.find(id)
    if (!obj) {
      throw new Error(`${this.name} #${id} not found`)
    }
    if (!(await obj.accessible(user, mode))) {
      throw new Error(`${this.name} #${id} is not accessible${mode ? ` for ${mode}` : ''}`)
    }
    return obj
  }

  /**
   * Returns is object accessible by user
   * @param user
   * @param mode
   * @return {Promise<boolean>}
   */
  async accessible (user, mode = null) {
    return mode === null
  }

  /**
   * Returns public data of the object
   * @return Object
   */
  get output () {
    return {
      id: this.id
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
  async getExtendedOutput (required_relations = [], mode = null) {
    const output = this.formatOutput(mode)
    let rel_data, rel_mode, rel_relations
    for (const name of required_relations) {
      if (name.split(':').length > 1) continue
      if (this.constructor.restricted_for_output.includes(name)) {
        throw new Error(`Relation "${name}" is not allowed for extended output of model ${this.constructor.name}`)
      }
      rel_data = await this.rel(name)
      rel_mode = `relation:${this.constructor.name}.${name}`
      rel_relations = required_relations.filter(v => v.startsWith(`${name}:`)).map(v => v.substr(name.length + 1))
      output[`:${name}`] = Array.isArray(rel_data)
        ? await Promise.all(rel_data.map(v => v.getExtendedOutput(rel_relations, rel_mode)))
        : (rel_data ? await rel_data.getExtendedOutput(rel_relations, rel_mode) : null)
    }
    return output
  }
}

module.exports = Model
