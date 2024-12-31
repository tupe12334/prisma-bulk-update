import { PrismaClient } from "@prisma/client";
import { extendedPrisma } from "./index";
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
  const snapshotsDir = path.resolve(__dirname, "../snapshots");
  const testDir = path.join(snapshotsDir, testTimestamp);
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir);
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

    const snapshotsDir = path.resolve(__dirname, "../snapshots");
    const testDir = path.join(snapshotsDir, testTimestamp);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir);
    }
    const beforeData = await prisma.user.findMany();
    fs.writeFileSync(
      path.join(testDir, "before.json"),
      JSON.stringify(beforeData, null, 2)
    );

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
