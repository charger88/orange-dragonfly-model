import { OrangeDatabaseError, OrangeDatabaseInputError } from 'orange-dragonfly-orm'

export class OrangeDatabaseInputValidationError extends OrangeDatabaseInputError {
  private _info: Record<string, string> = {}

  get info(): Record<string, string> {
    return this._info
  }

  set info(v: Record<string, string>) {
    this._info = v
  }
}

export class OrangeDatabaseModelError extends OrangeDatabaseError {}

export class OrangeDatabaseModelRuntimeError extends OrangeDatabaseModelError {}

export class OrangeDatabaseModelAccessError extends OrangeDatabaseModelRuntimeError {}
