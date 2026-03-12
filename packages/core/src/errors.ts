export class KubeAgentsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'KubeAgentsError';
  }
}

export class ValidationError extends KubeAgentsError {
  constructor(message: string, cause?: unknown) {
    super(message, 'VALIDATION_ERROR', cause);
    this.name = 'ValidationError';
  }
}

export class MailError extends KubeAgentsError {
  constructor(message: string, cause?: unknown) {
    super(message, 'MAIL_ERROR', cause);
    this.name = 'MailError';
  }
}

export class LLMError extends KubeAgentsError {
  constructor(message: string, cause?: unknown) {
    super(message, 'LLM_ERROR', cause);
    this.name = 'LLMError';
  }
}

export class ToolError extends KubeAgentsError {
  constructor(message: string, cause?: unknown) {
    super(message, 'TOOL_ERROR', cause);
    this.name = 'ToolError';
  }
}

export class OperatorError extends KubeAgentsError {
  constructor(message: string, cause?: unknown) {
    super(message, 'OPERATOR_ERROR', cause);
    this.name = 'OperatorError';
  }
}
