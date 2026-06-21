import { ActiveRecord, type DeleteQuery, type InsertQuery, type IQueryBuilder, type Relation, SelectQuery, type UpdateQuery } from 'orange-dragonfly-orm'
import { ODValidatorException, parse, type ODValidatorRuleSchema, type ODValidatorRulesSchema } from 'orange-dragonfly-validator'

type ValidatorTSType<T extends string> =
  T extends 'string' ? string :
  T extends 'integer' | 'number' ? number :
  T extends 'boolean' ? boolean :
  T extends 'null' ? null :
  T extends 'object' ? Record<string, unknown> :
  T extends 'array' ? unknown[] :
  T extends 'function' ? (...args: unknown[]) => unknown :
  unknown

type FieldTS<R extends ODValidatorRuleSchema> =
  R['type'] extends string
    ? ValidatorTSType<R['type']>
    : R['type'] extends readonly (infer U extends string)[]
      ? ValidatorTSType<U>
      : unknown

/**
 * Converts an `ODValidatorRulesSchema` to a TypeScript object type.
 * Requires the schema to be declared with `as const satisfies ODValidatorRulesSchema`
 * to preserve literal type information.
 *
 * @example
 * const schema = { name: { type: 'string', required: true } } as const satisfies ODValidatorRulesSchema
 * class MyModel extends Model {
 *   static override get validation_rules() { return schema }
 *   declare data: ModelData<typeof schema>
 * }
 */
export type ModelData<S extends ODValidatorRulesSchema> = {
  [K in Exclude<keyof S, '@' | '#' | '*'>]: S[K] extends ODValidatorRuleSchema ? FieldTS<S[K]> : never
}

import {
  OrangeDatabaseInputValidationError,
  OrangeDatabaseModelAccessError,
  OrangeDatabaseModelError,
  OrangeDatabaseModelRuntimeError,
} from './errors'

export interface IModelConstructor {
  new(data?: Record<string, unknown>): Model
  readonly id_key: string
  readonly table: string
  readonly name: string
  readonly special_fields: string[]
  readonly available_relations: Record<string, Relation>
  readonly ignore_extra_fields: boolean
  readonly unique_keys: string[][]
  readonly fulltext_indexes: string[][]
  /** @deprecated Use `ignore_extra_fields` instead */
  readonly IGNORE_EXTRA_FIELDS: boolean
  /** @deprecated Use `unique_keys` instead */
  readonly UNIQUE_KEYS: string[][]
  /** @deprecated Use `fulltext_indexes` instead */
  readonly FULLTEXT_INDEXES: string[][]
  readonly validation_rules: ODValidatorRulesSchema
  readonly restricted_for_output: string[]
  readonly restricted_for_lookup: string[]
  readonly restricted_for_create: string[]
  readonly restricted_for_update: string[]
  resetRegisteredModels(): void
  insertQuery(): InsertQuery
  selectQuery(include_deleted?: boolean): IQueryBuilder<Model>
  updateQuery(include_deleted?: boolean): UpdateQuery
  deleteQuery(include_deleted?: boolean): DeleteQuery
  loadRelations(objects: Model[], relations?: string[] | null): Promise<Model[]>
  find(id: unknown, include_deleted?: boolean): Promise<Model | null>
  all(include_deleted?: boolean): Promise<Model[]>
  lookupQuery(data: Record<string, unknown>, basicQuery?: SelectQuery | null): SelectQuery<Model>
  create(data: Record<string, unknown>): Promise<Model>
  findAndCheckAccessOrDie(id: unknown, user: unknown, mode?: string | null): Promise<Model>
  model(class_name: string): IModelConstructor
  registerModel(model_class: IModelConstructor): IModelConstructor
}

export default class Model extends ActiveRecord {
  private get _mCls(): typeof Model {
    return this.constructor as typeof Model
  }

  static get ignore_extra_fields(): boolean {
    return false
  }

  /**
   * Returns list of unique keys
   * @returns List of unique keys
   */
  static get unique_keys(): string[][] {
    return []
  }

  /**
   * Returns list of fulltext indexes
   * @returns List of fulltext indexes
   */
  static get fulltext_indexes(): string[][] {
    return []
  }

  /** @deprecated Use `ignore_extra_fields` instead */
  static get IGNORE_EXTRA_FIELDS(): boolean {
    return this.ignore_extra_fields
  }

  /** @deprecated Use `unique_keys` instead */
  static get UNIQUE_KEYS(): string[][] {
    return this.unique_keys
  }

  /** @deprecated Use `fulltext_indexes` instead */
  static get FULLTEXT_INDEXES(): string[][] {
    return this.fulltext_indexes
  }

  /**
   * Returns schema for the model (Orange Dragonfly Validator format)
   */
  static get validation_rules(): ODValidatorRulesSchema {
    return {
      id: {
        required: false,
        type: 'integer',
        min: 1,
      },
    }
  }

  /**
   * Overridden method of ActiveRecord. Returns special fields list based on validation rules
   */
  static override get special_fields(): string[] {
    const rules = this.validation_rules
    const fields: string[] = []
    for (const field of ['created_at', 'updated_at', 'deleted_at']) {
      if (Object.hasOwn(rules, field)) fields.push(field)
    }
    return fields
  }

  /**
   * Returns list of relations restricted for extended output
   */
  static get restricted_for_output(): string[] {
    return []
  }

  /**
   * Returns list of fields restricted for lookup
   */
  static get restricted_for_lookup(): string[] {
    return []
  }

  /**
   * Returns list of fields restricted for create method
   */
  static get restricted_for_create(): string[] {
    return ['id'].concat(this.special_fields)
  }

  /**
   * Returns list of fields restricted for update method
   */
  static get restricted_for_update(): string[] {
    return ['id'].concat(this.special_fields)
  }

  /**
   * Lookup method
   * @param data
   * @param basicQuery Query to be used for adding conditions. By default a new SelectQuery is created.
   */
  static lookupQuery<T extends Model>(
    this: abstract new (data?: Record<string, unknown>) => T,
    data: Record<string, unknown>,
    basicQuery: SelectQuery | null = null,
  ): SelectQuery<T> {
    const cls = this as unknown as typeof Model
    const rules = cls.validation_rules
    const q = (basicQuery ?? cls.selectQuery()) as SelectQuery<T>
    const filtered_rules: ODValidatorRulesSchema = {}
    for (const field of Object.keys(data)) {
      if (!Object.hasOwn(rules, field)) {
        if (cls.ignore_extra_fields) {
          continue
        }
        const ex = new OrangeDatabaseInputValidationError('Parameters error')
        ex.info[field] = `Field "${field}" is not described for model ${cls.name}`
        throw ex
      }
      if (cls.restricted_for_lookup.includes(field)) {
        const ex = new OrangeDatabaseInputValidationError('Parameters error')
        ex.info[field] = `Field "${field}" is restricted for searching model ${cls.name}`
        throw ex
      }
      q.where(field, data[field])
      const rule = rules[field] as ODValidatorRuleSchema
      filtered_rules[field] = Array.isArray(data[field]) ? { type: 'array', children: { '*': rule } } : rule
    }
    try {
      parse(filtered_rules, data, { strictMode: false })
    } catch (e) {
      if (e instanceof ODValidatorException) {
        const message = `Model ${cls.name} lookup rules validation failed`
        console.error(message, e.info)
        throw new OrangeDatabaseInputValidationError(message)
      } else {
        throw e
      }
    }
    return q
  }

  /**
   * Creates object
   * @param data
   */
  static async create<T extends Model>(
    this: abstract new (data?: Record<string, unknown>) => T,
    data: Record<string, unknown>,
  ): Promise<T> {
    const cls = this as unknown as typeof Model
    const rules = cls.validation_rules
    const new_data: Record<string, unknown> = {}
    for (const field of Object.keys(data)) {
      if (!Object.hasOwn(rules, field)) {
        if (cls.ignore_extra_fields) {
          continue
        }
        const ex = new OrangeDatabaseInputValidationError('Parameters error')
        ex.info[field] = `Field "${field}" is not described for model ${cls.name}`
        throw ex
      }
      if (cls.restricted_for_create.includes(field)) {
        const ex = new OrangeDatabaseInputValidationError('Parameters error')
        ex.info[field] = `Field "${field}" is restricted for creating model ${cls.name}`
        throw ex
      }
      new_data[field] = data[field]
    }
    const Cls = this as unknown as new (data?: Record<string, unknown>) => T
    return (new Cls(new_data)).save()
  }

  /**
   * Updates object
   * @param data
   */
  async update(data: Record<string, unknown>): Promise<this> {
    if (!this.id) {
      throw new OrangeDatabaseModelRuntimeError('You can update saved object only')
    }
    const cls = this._mCls
    const rules = cls.validation_rules
    const new_data: Record<string, unknown> = {}
    for (const field of Object.keys(data)) {
      if (!Object.hasOwn(rules, field)) {
        if (cls.ignore_extra_fields) {
          continue
        }
        const ex = new OrangeDatabaseInputValidationError('Parameters error')
        ex.info[field] = `Field "${field}" is not described for model ${cls.name}`
        throw ex
      }
      if (cls.restricted_for_update.includes(field)) {
        const ex = new OrangeDatabaseInputValidationError('Parameters error')
        ex.info[field] = `Field "${field}" is restricted for updating model ${cls.name}`
        throw ex
      }
      new_data[field] = data[field]
    }
    return this.save(new_data)
  }

  /**
   * Checks uniqueness of the object based on unique_keys
   */
  async checkUniqueness(exception_mode = false, ignore_null = false): Promise<boolean> {
    const cls = this._mCls
    for (const fields of cls.unique_keys) {
      if (!await this.isUnique(fields, ignore_null)) {
        if (exception_mode) {
          const ex = new OrangeDatabaseInputValidationError('Object is not unique')
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

  protected override async _preSave(_is_new?: boolean): Promise<void> {
    const cls = this._mCls
    if (cls.ignore_extra_fields) {
      const rules = cls.validation_rules
      for (const key of Object.keys(this.data).filter(v => !Object.hasOwn(rules, v))) {
        delete this.data[key]
      }
    }
    await super._preSave(_is_new)
    await this.checkUniqueness(true, true)
    await this.validate()
  }

  /**
   * Performs custom validation - returns null in case of success or an object of validation issues
   */
  async custom_validation(): Promise<Record<string, string> | null> {
    return null
  }

  /**
   * Validate object's data
   */
  async validate(): Promise<void> {
    const cls = this._mCls
    const rules = cls.validation_rules
    if (!rules) {
      throw new OrangeDatabaseModelError(`Validation rules are not defined for model ${cls.name}`)
    }
    for (const rule_name of Object.keys(rules)) {
      if (Object.hasOwn(this.data, rule_name)) {
        const rule = rules[rule_name] as ODValidatorRuleSchema
        if (rule?.type) {
          const types = Array.isArray(rule.type) ? (rule.type as string[]) : [rule.type as string]
          if (types.includes('boolean')) {
            if ((this.data[rule_name] === 1) || (this.data[rule_name] === 0)) {
              this.data[rule_name] = this.data[rule_name] === 1
            }
          }
        }
      }
    }
    try {
      this.data = parse(rules, this.data, { strictMode: false })
    } catch (e) {
      if (e instanceof ODValidatorException) {
        const message = `Model ${cls.name} rules validation failed`
        console.error(message, e.info)
        const ex = new OrangeDatabaseInputValidationError(message)
        for (const [key, msgs] of Object.entries(e.info as Record<string, string | string[]>)) {
          ex.info[key] = Array.isArray(msgs) ? msgs[0] : msgs
        }
        throw ex
      } else {
        throw e
      }
    }
    const custom_validation_errors = await this.custom_validation()
    if (custom_validation_errors && Object.keys(custom_validation_errors).length) {
      const ex = new OrangeDatabaseInputValidationError('Validation failed')
      for (const [param, message] of Object.entries(custom_validation_errors)) ex.info[param] = message
      throw ex
    }
    const relation_errors: string[] = []
    for (const rel_name of Object.keys(cls.available_relations)) {
      const rel: Relation = cls.available_relations[rel_name]
      if (rel.mode === 'parent') {
        const aKey = (rel as unknown as { _a_key_by_mode: string })._a_key_by_mode
        if (Object.hasOwn(this.data, aKey) && (this.data[aKey] !== null) && (this.data[aKey] !== 0)) {
          if ((await this.rel(rel_name, true) as Model | null) === null) {
            relation_errors.push(aKey)
          }
        }
      }
    }
    if (relation_errors.length) {
      const ex = new OrangeDatabaseInputValidationError(`Some relations of the ${cls.name} are not found`)
      for (const param of relation_errors) ex.info[param] = 'Parent object not found'
      throw ex
    }
  }

  static override model(class_name: string): IModelConstructor {
    return super.model(class_name) as unknown as IModelConstructor
  }

  static override registerModel(model_class: Parameters<typeof ActiveRecord.registerModel>[0]): typeof Model {
    return super.registerModel(model_class) as unknown as typeof Model
  }

  /**
   * Returns object by ID if it exists and accessible by user
   * @param id
   * @param user
   * @param mode
   */
  static async findAndCheckAccessOrDie<T extends Model>(
    this: abstract new (data?: Record<string, unknown>) => T,
    id: number,
    user: unknown,
    mode: string | null = null,
  ): Promise<T> {
    const cls = this as unknown as typeof Model
    const obj = await cls.find(id) as T | null
    if (!obj) {
      throw new OrangeDatabaseModelRuntimeError(`${cls.name} #${id} not found`)
    }
    if (!(await obj.accessible(user, mode))) {
      throw new OrangeDatabaseModelAccessError(`${cls.name} #${id} is not accessible${mode ? ` for ${mode}` : ''}`)
    }
    return obj
  }

  /**
   * Returns whether the object is accessible by user
   * @param user
   * @param mode
   */
   
  async accessible(_user: unknown, mode: string | null = null): Promise<boolean> {
    return mode === null
  }

  /**
   * Returns public data of the object
   */
  get output(): Record<string, unknown> {
    return {
      id: this.id,
    }
  }

  /**
   * Format output
   * @param mode
   */
  formatOutput(_mode: string | null = null): Record<string, unknown> {
    return this.output
  }

  /**
   * Returns public data of the object with relations
   * @param required_relations
   * @param mode
   */
  async getExtendedOutput(required_relations: string[] = [], mode: string | null = null): Promise<Record<string, unknown>> {
    const output = this.formatOutput(mode)
    const cls = this._mCls
    for (const name of required_relations) {
      if (name.split(':').length > 1) continue
      if (cls.restricted_for_output.includes(name)) {
        throw new OrangeDatabaseModelError(`Relation "${name}" is not allowed for extended output of model ${cls.name}`)
      }
      const rel_data = await this.rel(name) as Model | Model[] | null
      const rel_mode = `relation:${cls.name}.${name}`
      const rel_relations = required_relations.filter(v => v.startsWith(`${name}:`)).map(v => v.slice(name.length + 1))
      output[`:${name}`] = Array.isArray(rel_data)
        ? await Promise.all(rel_data.map(v => v.getExtendedOutput(rel_relations, rel_mode)))
        : (rel_data ? await rel_data.getExtendedOutput(rel_relations, rel_mode) : null)
    }
    return output
  }
}
