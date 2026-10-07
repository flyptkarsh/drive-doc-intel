/** A document can't be extracted for a reason worth showing to the user as-is. */
export class ExtractionError extends Error {
  override name = "ExtractionError";
}
