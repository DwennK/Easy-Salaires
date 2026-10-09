import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createPublicKey, createHash, verify } from "node:crypto";
function fail(message) {
  throw new Error(message);
}
// Tauri wraps a Minisign Ed25519 signature in base64. Verify both the
// artifact signature and its trusted comment before publishing latest.json.
export function verifyArtifact(file, signatureFile, pubkey, version) {
  const publicText = Buffer.from(pubkey, "base64")
    .toString("utf8")
    .trim()
    .split(/\r?\n/);
  const signatureText = Buffer.from(
    readFileSync(signatureFile, "utf8").trim(),
    "base64",
  )
    .toString("utf8")
    .trim()
    .split(/\r?\n/);
  const publicBytes = Buffer.from(publicText[1] ?? "", "base64");
  const signature = Buffer.from(signatureText[1] ?? "", "base64");
  if (
    publicBytes.length !== 42 ||
    signature.length !== 74 ||
    !signature.subarray(2, 10).equals(publicBytes.subarray(2, 10))
  )
    fail(`Invalid signature key: ${basename(file)}`);
  const algorithm = signature.subarray(0, 2).toString();
  if (
    !["ED", "Ed"].includes(algorithm) ||
    !signatureText[2]?.startsWith("trusted comment: ")
  )
    fail("Unsupported Minisign format");
  const key = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      publicBytes.subarray(10),
    ]),
    format: "der",
    type: "spki",
  });
  const data = readFileSync(file);
  const payload =
    algorithm === "ED" ? createHash("blake2b512").update(data).digest() : data;
  if (!verify(null, payload, key, signature.subarray(10)))
    fail(`Artifact signature mismatch: ${basename(file)}`);
  const comment = signatureText[2].slice("trusted comment: ".length);
  if (!comment.split(/\s+/).includes(`version:${version}`))
    fail("Signature is not bound to the release version");
  if (
    !verify(
      null,
      Buffer.concat([signature.subarray(10), Buffer.from(comment)]),
      key,
      Buffer.from(signatureText[3] ?? "", "base64"),
    )
  )
    fail("Trusted-comment signature mismatch");
}
