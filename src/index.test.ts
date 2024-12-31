import { PrismaClient } from "@prisma/client";
import createPrismaMock from "prisma-mock";
import { extendedPrisma } from "./index";
import { execSync } from "child_process";
import { describe, it, expect } from "vitest";

let prisma: PrismaClient;

// jest.mock("@prisma/client", () => {
//   const actualPrismaClient = jest.requireActual("@prisma/client");
//   return {
//     ...actualPrismaClient,
//     PrismaClient: jest.fn(() => prisma),
//   };
// });

beforeAll(() => {
  // Start Docker container
  execSync("docker-compose up -d", { stdio: "inherit" });
});

afterAll(() => {
  // Stop Docker container
  execSync("docker-compose down", { stdio: "inherit" });
});

describe("bulkUpdateCompoundWhere", () => {
  beforeEach(() => {
    prisma = createPrismaMock();
  });

  it("should update multiple rows with compound where clause", async () => {
    await prisma.user.createMany({
      data: [
        { orgId: 1, email: "alice@corp.com", name: "Alice", status: "PENDING" },
        { orgId: 1, email: "bob@corp.com", name: "Bob", status: "PENDING" },
      ],
    });

    await extendedPrisma.bulkUpdateCompoundWhere("user", [
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
