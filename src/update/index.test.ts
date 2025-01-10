import { PrismaClient } from "@prisma/client";
import { extendedPrisma } from "./";
import { execSync } from "child_process";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import fs from "fs";
import path from "path";

let prisma: PrismaClient;
let testTimestamp: string;

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

afterEach(async () => {
  const data = await prisma.user.findMany();
  const snapshotsDir = path.resolve(__dirname, "../../snapshots");
  const testDir = path.join(snapshotsDir, testTimestamp);
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(testDir, "after.json"),
    JSON.stringify(data, null, 2)
  );
});

describe("bulkUpdateCompoundWhere", () => {
  beforeEach(async () => {
    testTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await prisma.user.deleteMany(); // Clean up the table before each test
  });

  it("should update multiple rows with compound where clause", async () => {
    await prisma.user.createMany({
      data: [
        { orgId: 1, email: "alice@corp.com", name: "Alice", status: "PENDING" },
        { orgId: 1, email: "bob@corp.com", name: "Bob", status: "PENDING" },
      ],
    });

    await extendedPrisma.user.bulkUpdateCompoundWhere([
      {
        where: { orgId_email: { orgId: 1, email: "alice@corp.com" } },
        data: { name: "Alice Updated", status: "ACTIVE" },
      },
      {
        where: { orgId_email: { orgId: 1, email: "bob@corp.com" } },
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

  it("should handle empty rows array", async () => {
    await extendedPrisma.user.bulkUpdateCompoundWhere([]);
    const users = await prisma.user.findMany();
    expect(users).toHaveLength(0);
  });

  it("should not update if no matching rows", async () => {
    await prisma.user.createMany({
      data: [
        { orgId: 1, email: "alice@corp.com", name: "Alice", status: "PENDING" },
        { orgId: 1, email: "bob@corp.com", name: "Bob", status: "PENDING" },
      ],
    });

    await extendedPrisma.user.bulkUpdateCompoundWhere([
      {
        where: { orgId_email: { orgId: 2, email: "charlie@corp.com" } },
        data: { name: "Charlie", status: "ACTIVE" },
      },
    ]);

    const users = await prisma.user.findMany();
    expect(users[0]).toMatchObject({
      id: users[0].id,
      orgId: 1,
      email: "alice@corp.com",
      name: "Alice",
      status: "PENDING",
    });
    expect(users[1]).toMatchObject({
      id: users[1].id,
      orgId: 1,
      email: "bob@corp.com",
      name: "Bob",
      status: "PENDING",
    });
  });

  it("should update only specified fields", async () => {
    await prisma.user.createMany({
      data: [
        { orgId: 1, email: "alice@corp.com", name: "Alice", status: "PENDING" },
        { orgId: 1, email: "bob@corp.com", name: "Bob", status: "PENDING" },
      ],
    });

    await extendedPrisma.user.bulkUpdateCompoundWhere([
      {
        where: { orgId_email: { orgId: 1, email: "alice@corp.com" } },
        data: { status: "ACTIVE" },
      },
    ]);

    const alice = await prisma.user.findUnique({
      where: { orgId_email: { orgId: 1, email: "alice@corp.com" } },
    });

    expect(alice).toMatchObject({ name: "Alice", status: "ACTIVE" });
  });

  it("should handle multiple updates with overlapping data columns", async () => {
    await prisma.user.createMany({
      data: [
        { orgId: 1, email: "alice@corp.com", name: "Alice", status: "PENDING" },
        { orgId: 1, email: "bob@corp.com", name: "Bob", status: "PENDING" },
      ],
    });

    await extendedPrisma.user.bulkUpdateCompoundWhere([
      {
        where: { orgId_email: { orgId: 1, email: "alice@corp.com" } },
        data: { name: "Alice Updated", status: "ACTIVE" },
      },
      {
        where: { orgId_email: { orgId: 1, email: "bob@corp.com" } },
        data: { name: "Bob Updated", status: "INACTIVE" },
      },
    ]);

    const alice = await prisma.user.findUnique({
      where: { orgId_email: { orgId: 1, email: "alice@corp.com" } },
    });
    const bob = await prisma.user.findUnique({
      where: { orgId_email: { orgId: 1, email: "bob@corp.com" } },
    });

    expect(alice).toMatchObject({ name: "Alice Updated", status: "ACTIVE" });
    expect(bob).toMatchObject({ name: "Bob Updated", status: "INACTIVE" });
  });

  it("should handle updates with null values", async () => {
    await prisma.user.createMany({
      data: [
        { orgId: 1, email: "alice@corp.com", name: "Alice", status: "PENDING" },
        { orgId: 1, email: "bob@corp.com", name: "Bob", status: "PENDING" },
      ],
    });

    await extendedPrisma.user.bulkUpdateCompoundWhere([
      {
        where: { orgId_email: { orgId: 1, email: "alice@corp.com" } },
        data: { name: null, status: "ACTIVE" },
      },
    ]);

    const alice = await prisma.user.findUnique({
      where: { orgId_email: { orgId: 1, email: "alice@corp.com" } },
    });

    expect(alice).toMatchObject({ name: null, status: "ACTIVE" });
  });
  it("should handle updates with boolean values", async () => {
    await prisma.user.createMany({
      data: [
        { orgId: 1, email: "alice@corp.com", name: "Alice", isActive: false },
        { orgId: 1, email: "bob@corp.com", name: "Bob", isActive: false },
      ],
    });

    await extendedPrisma.user.bulkUpdateCompoundWhere([
      {
        where: { orgId_email: { orgId: 1, email: "alice@corp.com" } },
        data: { isActive: true },
      },
      {
        where: { orgId_email: { orgId: 1, email: "bob@corp.com" } },
        data: { isActive: true },
      },
    ]);

    const alice = await prisma.user.findUnique({
      where: { orgId_email: { orgId: 1, email: "alice@corp.com" } },
    });
    const bob = await prisma.user.findUnique({
      where: { orgId_email: { orgId: 1, email: "bob@corp.com" } },
    });

    expect(alice).toMatchObject({ isActive: true });
    expect(bob).toMatchObject({ isActive: true });
  });
});
