import { OrangeDatabaseInputError } from 'orange-dragonfly-orm'

export default class OrangeDatabaseInputValidationError extends OrangeDatabaseInputError {
  private _info: Record<string, string> = {}

  get info(): Record<string, string> {
    return this._info
  }

  set info(v: Record<string, string>) {
    this._info = v
  }
}
