import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/lib/database";

export async function fixture(setup?: (raw: Client) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "tools-unit-"));
  const path = join(dir, "test.db");
  const raw = createClient({ url: `file:${path}` });
  await setup?.(raw);
  const store = new Store(path);
  await store.users();
  return { store, raw, path, close() { store.close(); raw.close(); rmSync(dir, { recursive: true, force: true }); } };
}
