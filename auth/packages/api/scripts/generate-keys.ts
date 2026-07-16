import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Generates the RSA key pair used to sign/verify JWTs.
// Run once with:  npm run keys
// Writes keys/private.pem (KEEP SECRET) and keys/public.pem (shareable).

const dir = path.resolve(process.cwd(), "keys");
fs.mkdirSync(dir, { recursive: true });

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

fs.writeFileSync(path.join(dir, "private.pem"), privateKey);
fs.writeFileSync(path.join(dir, "public.pem"), publicKey);

console.log("✅ Wrote keys/private.pem and keys/public.pem");
console.log("   (private.pem is git-ignored — never commit it)");
