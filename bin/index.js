#!/usr/bin/env node

const async = require("async");
const fs = require("fs");
const path = require("path");
const { default: shellExec } = require("shell-exec");

const day = new Date().toLocaleDateString().replace(/\//g, "-");
const UPDATE_BRANCH_NAME = `chore/update-dependencies-${day}`;
const UPDATE_COMMIT = `Updating dependencies ${day}`;

process();

async function process() {
  await Promise.all([
    assertTooling("gh"),
    assertTooling("git"),
    assertTooling("yarn"),
  ]);

  const folders = fs
    .readdirSync(".", { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map(({ name }) => name);

  const handler = async (folder) => {
    return Promise.resolve()
      .then(async () => {
        const [isYarn, isYarnWorkspace, isPython, branch, master, clean] =
          await Promise.all([
            isYarnFolder(folder),
            isYarnWorkspaceFolder(folder),
            isPythonFolder(folder),
            getBranchName(folder),
            isMaster(folder),
            isClean(folder),
          ]);

        if (isYarnWorkspace) {
          console.log(`Cannot process yarn workspace: ${folder}`);
          return;
        }

        if (!isYarn && !isPython) {
          console.log(`Unknown folder: ${folder}`);
          return;
        }

        if (!master || !clean) {
          console.log(`Not master / clean: ${folder}`, { master, clean });
          return;
        }

        // Check to see if origin already has branch...
        const originExists = await isOriginExists(folder);
        if (originExists) {
          console.log(`Origin already has branch: ${folder}`, {
            UPDATE_BRANCH_NAME,
          });
          return;
        }

        // Update
        await Promise.resolve().then(() => {
          if (isYarn) {
            return updateYarnDeps(folder);
          }

          if (isPython) {
            return updatePythonDeps(folder);
          }
        });

        // Ensure is dirty
        const dirty = await isDirty(folder);
        if (!dirty) {
          console.log(`No updates: ${folder}`);
          return;
        }

        await deleteUpdateBranch(folder);
        await createUpdateBranch(folder);
        await commitBranch(folder);
        await pushBranch(folder);

        // Pull release
        await createPr(folder);

        // Revert to OG branch
        await checkout(folder, branch);
      })
      .catch((err) => {
        console.error(`Error while updating folder: ${folder}`, err);
      });
  };

  return async.mapLimit(folders, 10, handler);
}

async function assertTooling(tool) {
  return shellExec(`type ${tool}`).then((out) => {
    if (out.code !== 0) {
      throw new Error(`Tooling not found: ${tool}`);
    }
  });
}

async function checkout(folder, branch) {
  return executeCommandSuccess(`cd ${folder} && git checkout ${branch}`);
}

async function isOriginExists(folder) {
  return shellExec(
    `cd ${folder} && git ls-remote --exit-code --heads origin ${UPDATE_BRANCH_NAME}`
  ).then((out) => out.code === 0);
}

async function createUpdateBranch(folder) {
  return executeCommandSuccess(
    `cd ${folder} && git checkout -b ${UPDATE_BRANCH_NAME}`
  );
}

async function deleteUpdateBranch(folder) {
  return shellExec(`cd ${folder} && git branch -D ${UPDATE_BRANCH_NAME}`);
}

async function commitBranch(folder) {
  return executeCommandSuccess(
    `cd ${folder} && git commit -am "${UPDATE_COMMIT}"`
  );
}

async function pushBranch(folder) {
  return executeCommandSuccess(
    `cd ${folder} && git push origin ${UPDATE_BRANCH_NAME} --force`
  );
}

async function createPr(folder) {
  console.log(`Creating PR: ${folder}`);
  return executeCommandSuccess(
    `cd ${folder} && gh pr create --title "${UPDATE_BRANCH_NAME}" --body "${UPDATE_COMMIT}"`
  );
}

async function updateYarnDeps(folder) {
  console.log(`Updating yarn deps: ${folder}`);
  return executeCommandSuccess(
    `cd ${folder} && npm_config_yes=true npx yarn-upgrade-all`
  );
}

async function updatePythonDeps(folder) {
  console.log(`TODO: Updating python deps: ${folder}`);
}

async function isYarnFolder(folder) {
  return shellExec(`cd ${folder} && test -f yarn.lock`).then(
    (out) => out.code === 0
  );
}

async function isYarnWorkspaceFolder(folder) {
  const isYarn = await isYarnFolder(folder);

  if (!isYarn) {
    return false;
  }

  const pkg = await getPackageJson(folder);
  return !!pkg?.workspaces;
}

async function getPackageJson(folder) {
  try {
    return require(`${path.resolve(folder)}/package.json`);
  } catch {
    return null;
  }
}

async function isPythonFolder(folder) {
  return shellExec(`cd ${folder} && test -f requirements.txt`).then(
    (out) => out.code === 0
  );
}

async function isMaster(folder) {
  const branchName = await getBranchName(folder);
  return ["master", "main"].includes(branchName);
}

async function getBranchName(folder) {
  return executeCommandSuccess(
    `cd ${folder} && git branch --show-current`
  ).then((out) => out.stdout.trim());
}

async function isClean(folder) {
  return shellExec(`cd ${folder} && [[ -z $(git status -s) ]]`).then(
    (out) => out.code === 0
  );
}

async function isDirty(folder) {
  const clean = await isClean(folder);
  return !clean;
}

async function executeCommandSuccess(command) {
  return shellExec(command).then((out) => {
    if (out.code !== 0) {
      console.error(out);
      throw Error(`Error executing command: ${command}`);
    }
    return out;
  });
}
