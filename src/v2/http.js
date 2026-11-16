// Status codes the /v2 routes answer with.
export const HTTP = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  UNPROCESSABLE: 422,
  PRECONDITION_REQUIRED: 428
}

// MongoDB's error code for a unique index violation.
export const MONGO_DUPLICATE_KEY = 11000
