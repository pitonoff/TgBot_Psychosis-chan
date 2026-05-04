import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyTributeSignature(rawBody: string, signature: string | undefined, secret: string) {
  if (!signature) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const actual = signature.startsWith("sha256=") ? signature.slice("sha256=".length) : signature;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
