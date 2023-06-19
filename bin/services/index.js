#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const { default: shellExec } = require("shell-exec");

async function assertTooling(tool) {
  return shellExec(`type ${tool}`).then((out) => {
    if (out.code !== 0) {
      throw new Error(`Tooling not found: ${tool}`);
    }
  });
}

async function getFolders() {
  return fs
    .readdirSync(".", { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map(({ name }) => name);
}

async function getInfo(folder) {
  const [isYarn, isYarnWorkspace, isPython, branch, master, clean, dirty] =
    await Promise.all([
      isYarnFolder(folder),
      isYarnWorkspaceFolder(folder),
      isPythonFolder(folder),
      getBranchName(folder),
      isMaster(folder),
      isClean(folder),
      isDirty(folder),
    ]);

  return { isYarn, isYarnWorkspace, isPython, branch, master, clean, dirty };
}

async function checkout(folder, branch) {
  return executeCommandSuccess(`cd ${folder} && git checkout ${branch}`);
}

async function isOriginExists(folder, branch) {
  return shellExec(
    `cd ${folder} && git ls-remote --exit-code --heads origin ${branch}`
  ).then((out) => out.code === 0);
}

async function createBranch(folder, branch) {
  return executeCommandSuccess(`cd ${folder} && git checkout -b ${branch}`);
}

async function deleteBranch(folder, branch) {
  return shellExec(`cd ${folder} && git branch -D ${branch}`);
}

async function commitBranch(folder, commit) {
  return executeCommandSuccess(`cd ${folder} && git commit -am "${commit}"`);
}

async function pushBranch(folder, branch) {
  return executeCommandSuccess(
    `cd ${folder} && git push origin ${branch} --force`
  );
}

async function createPr(folder, title, body) {
  return executeCommandSuccess(
    `cd ${folder} && gh pr create --title "${title}" --body "${body}"`
  );
}

async function getPrStatus(folder) {
  console.log(`Getting PR info: ${folder}`);
  const { stdout } = await executeCommandSuccess(
    `cd ${folder} && gh pr status --json id,title`
  );

  return JSON.parse(stdout);
}

async function getPrCurrentBranchTitle(folder) {
  const { currentBranch } = await getPrStatus(folder);
  const { title } = currentBranch || {};
  return title;
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

  return !!pkg && !!pkg.workspaces;
}

async function getPackageJson(folder) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(`${path.resolve(folder)}/package.json`);
  } catch (error) {
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

module.exports = {
  assertTooling,
  getInfo,
  getFolders,
  checkout,
  isOriginExists,
  createBranch,
  deleteBranch,
  commitBranch,
  pushBranch,
  createPr,
  getPrStatus,
  getPrCurrentBranchTitle,
  updateYarnDeps,
  updatePythonDeps,
  isYarnFolder,
  isYarnWorkspaceFolder,
  getPackageJson,
  isPythonFolder,
  isMaster,
  getBranchName,
  isClean,
  isDirty,
  executeCommandSuccess,
};
