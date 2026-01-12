class ValidationException extends Error {
  get info () {
    return this.__info || {}
  }

  set info (v) {
    this.__info = v
  }
}

module.exports = ValidationException
