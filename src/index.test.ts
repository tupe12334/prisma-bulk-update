import { PrismaClient } from "@prisma/client";
import { extendedPrisma } from "./index";
import { execSync } from "child_process";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

let prisma: PrismaClient;

beforeAll(async () => {
  // Start Docker container
  execSync("docker-compose up -d", { stdio: "inherit" });
  prisma = new PrismaClient();
  await prisma.$connect();
});

afterAll(async () => {
  // Stop Docker container
  execSync("docker-compose down", { stdio: "inherit" });
  await prisma.$disconnect();
});

describe("bulkUpdateCompoundWhere", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany(); // Clean up the table before each test
  });

  it("should update multiple rows with compound where clause", async () => {
    await prisma.user.createMany({
      data: [
        { orgId: 1, email: "alice@corp.com", name: "Alice", status: "PENDING" },
        { orgId: 1, email: "bob@corp.com", name: "Bob", status: "PENDING" },
      ],
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
