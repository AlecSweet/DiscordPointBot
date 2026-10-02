const isDuplicateKeyError = (error: unknown): boolean =>
    typeof error === "object" && error !== null && (error as {code?: number}).code === 11000

export default isDuplicateKeyError
