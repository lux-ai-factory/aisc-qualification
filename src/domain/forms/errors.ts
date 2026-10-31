// A submitted form the app refuses. Its message is for the person who filled the form, so
// the parser, the domain checks and the save all throw this one class, and an action
// shows its message as it is.

export class FormValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormValidationError";
  }
}
