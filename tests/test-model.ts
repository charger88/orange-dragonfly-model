import Model from '../src/model'
import { Relation } from 'orange-dragonfly-orm'
import type { ODValidatorRulesSchema } from 'orange-dragonfly-validator'

class TestModel extends Model {
  static override get available_relations() {
    return {
      child_test: Relation.parent(this as any, this as any),
    }
  }

  static override get validation_rules(): ODValidatorRulesSchema {
    return {
      id: { required: false, type: 'integer', min: 1 },
      username: { required: true, type: 'string', min: 1, max: 256 },
      uuid: { required: true, type: 'string', min: 40, max: 40 },
    }
  }

  static override get restricted_for_lookup(): string[] {
    return ['uuid']
  }

  override get output(): Record<string, unknown> {
    return {
      id: this.id,
      username: this.data.username,
      uuid: this.data.uuid,
      constant_value: 'QWERTY',
    }
  }
}

export default TestModel
