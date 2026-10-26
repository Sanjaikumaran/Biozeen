/**
 * Move the database between machines. Each collection is saved as Extended JSON (ObjectIds and
 * dates keep their types) under db/data/, together with the uploaded files.
 *
 *   npm run db:export               # this database -> db/data
 *   npm run db:import               # db/data -> this database (only when it is empty)
 *   npm run db:import -- --replace  # drop this database first, then import
 *
 * The server also imports db/data automatically on first start when the database is empty
 * (AUTO_INIT_DB, on by default), and falls back to the sample seed when there is no export.
 */
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { config } from "./config.js";

const { EJSON } = mongoose.mongo.BSON;

/** Live, per-session data that should not travel with an export. */
const SKIP = new Set(["notifications"]);
const MANIFEST = "manifest.json";

interface Manifest {
  exportedAt: string;
  collections: Record<string, number>;
  files: number;
}

function db() {
  const handle = mongoose.connection.db;
  if (!handle) throw new Error("Not connected to MongoDB");
  return handle;
}

export function hasExport(dir = config.dataDir) {
  return fs.existsSync(path.join(dir, MANIFEST));
}

function copyDir(from: string, to: string) {
  if (!fs.existsSync(from)) return 0;
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) n += copyDir(src, dest);
    else {
      fs.copyFileSync(src, dest);
      n += 1;
    }
  }
  return n;
}

export async function exportData(dir = config.dataDir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const manifest: Manifest = { exportedAt: new Date().toISOString(), collections: {}, files: 0 };
  const collections = (await db().listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).sort();
  for (const name of collections) {
    if (SKIP.has(name) || name.startsWith("system.")) continue;
    const docs = await db().collection(name).find().sort({ _id: 1 }).toArray();
    fs.writeFileSync(path.join(dir, `${name}.json`), EJSON.stringify(docs, undefined, 2, { relaxed: false }) + "\n");
    manifest.collections[name] = docs.length;
  }
  manifest.files = copyDir(config.uploadDir, path.join(dir, "uploads"));
  fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

export async function importData(dir = config.dataDir, { replace = false } = {}) {
  if (!hasExport(dir)) throw new Error(`No export found in ${dir} (missing ${MANIFEST}). Run \`npm run db:export\` on the source machine.`);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), "utf8")) as Manifest;
  if (replace) await db().dropDatabase();
  else if (await db().collection("users").estimatedDocumentCount()) {
    throw new Error("This database already has data. Use `npm run db:import -- --replace` to overwrite it.");
  }
  for (const name of Object.keys(manifest.collections)) {
    const docs = EJSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"), { relaxed: false }) as Record<string, unknown>[];
    if (docs.length) await db().collection(name).insertMany(docs);
  }
  copyDir(path.join(dir, "uploads"), config.uploadDir);
  await mongoose.syncIndexes();
  return manifest;
}

async function main() {
  const command = process.argv[2];
  await mongoose.connect(config.mongoUri);
  try {
    if (command === "export") {
      const m = await exportData();
      console.log(`Exported ${Object.values(m.collections).reduce((a, b) => a + b, 0)} documents from ${Object.keys(m.collections).length} collections and ${m.files} files to ${config.dataDir}`);
    } else if (command === "import") {
      const m = await importData(config.dataDir, { replace: process.argv.includes("--replace") });
      console.log(`Imported the export from ${m.exportedAt}: ${Object.entries(m.collections).map(([k, v]) => `${k} ${v}`).join(", ")}; ${m.files} files.`);
    } else {
      console.log("Usage: tsx src/db-transfer.ts export | import [--replace]");
      process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
