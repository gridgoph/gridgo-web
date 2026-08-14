import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const root = resolve(process.argv[2] || ".next/static");
const textExtensions = new Set([".css", ".html", ".js", ".json", ".map", ".txt"]);
const secretKey = /sk_(?:test|live)_[A-Za-z0-9_-]+/;

function filesUnder(path) {
  return readdirSync(path).flatMap((entry) => {
    const full = join(path, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

const offender = filesUnder(root).find(
  (file) => textExtensions.has(extname(file)) && secretKey.test(readFileSync(file, "utf8")),
);

if (offender) {
  console.error(`Clerk secret key detected in client output: ${offender}`);
  process.exit(1);
}

console.log("Clerk client output contains no secret keys.");
