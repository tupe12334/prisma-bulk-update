import { describe, it, expect, beforeAll, jest } from "@jest/globals";
import { PrismaClient } from "@prisma/client";
import { extendedPrisma } from "./index";
import { mockDeep, mockReset } from "prisma-mock";

const prisma = mockDeep<PrismaClient>();

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => prisma),
}));

describe("bulkUpdateCompoundWhere", () => {
  beforeAll(() => {
    // Setup: Reset mock before each test
    mockReset(prisma);
  });

  it("should update multiple rows with compound where clause", async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({
        orgId: 1,
        email: "alice@corp.com",
        name: "Alice Updated",
        status: "ACTIVE",
      })
      .mockResolvedValueOnce({
        orgId: 1,
        email: "bob@corp.com",
        status: "INACTIVE",
      });

    await extendedPrisma.bulkUpdateCompoundWhere("User", [
      {
        where: { orgId: 1, email: "alice@corp.com" },
        data: { name: "Alice Updated", status: "ACTIVE" },
      },
      {
        where: { orgId: 1, email: "bob@corp.com" },
        data: { status: "INACTIVE" },
      },
    ]);

    const alice = await prisma.user.findUnique({
      where: { orgId_email: { orgId: 1, email: "alice@corp.com" } },
    });
    const bob = await prisma.user.findUnique({
      where: { orgId_email: { orgId: 1, email: "bob@corp.com" } },
    });

    expect(alice).toMatchObject({ name: "Alice Updated", status: "ACTIVE" });
    expect(bob).toMatchObject({ status: "INACTIVE" });
  });
});
