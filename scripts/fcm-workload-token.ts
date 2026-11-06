// Executable credential source for the optional production WIF configuration.
// stdout is consumed privately by google-auth-library. Never run this in a terminal or log its output.
import { readFileSync } from "node:fs";
import { sign } from "node:crypto";
const root = "/run/little-office-fcm/";
const { issuer, subject, audience, kid } = JSON.parse(
  readFileSync(root + "issuer.json", "utf8"),
);
const now = Math.floor(Date.now() / 1000);
const encode = (data: unknown) =>
  Buffer.from(JSON.stringify(data)).toString("base64url");
const unsigned =
  encode({ alg: "RS256", typ: "JWT", kid }) +
  "." +
  encode({
    iss: issuer,
    sub: subject,
    aud: audience,
    iat: now,
    exp: now + 300,
  });
const jwt =
  unsigned +
  "." +
  sign(
    "RSA-SHA256",
    Buffer.from(unsigned),
    readFileSync(root + "workload.pem"),
  ).toString("base64url");
process.stdout.write(
  JSON.stringify({
    version: 1,
    success: true,
    token_type: "urn:ietf:params:oauth:token-type:jwt",
    id_token: jwt,
    expiration_time: now + 300,
  }),
);
