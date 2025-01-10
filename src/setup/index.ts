import { exec } from "child_process";
import Dockerode from "dockerode";

export const setup = async () => {
  await setupContainer();
  await prismaDbPush();
};

const prismaDbPush = async () => {
  return new Promise((resolve, reject) => {
    exec("npm run prisma:push").once("exit", (code) => {
      code === 0 ? resolve(undefined) : reject();
    });
  });
};

const containerName = "postgres-test";
const docker = new Dockerode();
let container: Dockerode.Container;
const setupContainer = async () => {
  container = await docker.createContainer({
    Image: "postgres:13",
    name: containerName,
    AttachStdin: false,
    AttachStdout: false,
    AttachStderr: false,
    Tty: false,
    OpenStdin: false,
    Env: [
      `POSTGRES_USER: johndoe
            POSTGRES_PASSWORD: randompassword
            POSTGRES_DB: mydb`,
    ],
    StdinOnce: false,
  });
  await container.start();
};

export const teardown = async () => {
  await container.stop();
  await container.remove();
};
