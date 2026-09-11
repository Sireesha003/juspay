// generateKeys.js  
import { generateKeyPairSync } from "crypto";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// Ensure "keys" folder exists
const keysDir = join(process.cwd(), "keys");
if (!existsSync(keysDir)) {
  mkdirSync(keysDir);
}

// Generate RSA key pair (2048 bits)
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048, // Key size
  publicKeyEncoding: {
    type: "spki",  // Recommended for JWT verification
    format: "pem"
  },
  privateKeyEncoding: {
    type: "pkcs8", // Recommended for JWT signing
    format: "pem"
  }
});

// Save keys into /keys folder
writeFileSync(join(keysDir, "private.key"), privateKey);
writeFileSync(join(keysDir, "public.key"), publicKey);

console.log("✅ RSA Keys generated: ./keys/private.key & ./keys/public.key");