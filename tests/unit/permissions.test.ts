import { describe, expect, test } from "bun:test";
import { AccessError, authorize, can, permissions, roles, type Permission, type User } from "../../src/lib/permissions";

describe("server authorization policy", () => {
  const expected = {
    agent: ["workspace:read", "refunds:read", "refunds:create"],
    reviewer: ["workspace:read", "note:write", "refunds:read", "refunds:review"],
    admin: ["workspace:read", "note:write", "users:read", "audit:read", "refunds:read"],
  };
  for (const role of roles) {
    const user: User = { id: "test", name: "Test", email: "test@example.test", role };
    for (const permission of Object.keys(permissions) as Permission[]) {
      test(`${role}: ${permission}`, () => {
        const allowed = expected[role].includes(permission);
        expect(can(user, permission)).toBe(allowed);
        if (allowed) expect(authorize(user, permission)).toBe(user);
        else {
          try { authorize(user, permission); throw new Error("Expected authorization failure"); }
          catch (error) { expect(error).toBeInstanceOf(AccessError); expect((error as AccessError).status).toBe(403); }
        }
      });
    }
  }
  test("anonymous and unknown roles fail closed", () => {
    expect(can(null, "workspace:read")).toBe(false);
    expect(can({ role: "invented" } as unknown as User, "workspace:read")).toBe(false);
    try { authorize(null, "workspace:read"); throw new Error("Expected authorization failure"); }
    catch (error) { expect((error as AccessError).status).toBe(401); }
  });
});
