#!/usr/bin/env node

const async = require("async");

const {
  assertTooling,
  getFolders,
  getInfo,
  deleteBranch,
  isOriginExists,
  updateYarnDeps,
  updatePythonDeps,
  isDirty,
  createBranch,
  commitBranch,
  pushBranch,
  createPr,
  getPr,
  checkout,
  getPrCurrentBranchTitle,
} = require("./services");

process();

async function process() {
  await Promise.all([
    assertTooling("gh"),
    assertTooling("git"),
    assertTooling("yarn"),
  ]);

  const folders = await getFolders();

  const handler = async (folder) =>
    // handlerAutoUpdate(folder).catch((err) =>
    handlerAutoPullRequest(folder).catch((err) =>
      console.error(`Error while updating folder: ${folder}`, err)
    );

  return async.mapLimit(folders, 5, handler);
}

async function handlerAutoPullRequest(folder) {
  return Promise.resolve().then(async () => {
    const { isYarn, branch, dirty } = await getInfo(folder);

    if (branch !== "feature/update-dependencies") {
      console.log(`Not correct branch: ${branch}`);
      return;
    }

    if (!isYarn) {
      console.log("Not yarn");
      return;
    }

    const originExists = await isOriginExists(folder, branch);
    if (!originExists) {
      console.log("Committing...", folder);
      await commitBranch(folder, "Update dependencies");
      console.log("Pushing...", folder);
      await pushBranch(folder, branch);
    }

    const commitMessage = "Update dependencies";

    const title = await getPrCurrentBranchTitle(folder);

    if (!title) {
      console.log("Creating PR", folder, branch);
      await createPr(folder, branch, commitMessage);
    }
  });
}

async function handlerAutoUpdate(folder) {
  const day = new Date().toLocaleDateString().replace(/\//g, "-");
  const UPDATE_BRANCH_NAME = `chore/update-dependencies-${day}`;
  const UPDATE_COMMIT = `Updating dependencies ${day}`;

  return Promise.resolve()
    .then(async () => {
      const { isYarn, isYarnWorkspace, isPython, branch, master, clean } =
        await getInfo(folder);

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
      const originExists = await isOriginExists(folder, UPDATE_BRANCH_NAME);
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

        throw new Error(`Unknown repo type: ${folder}`);
      });

      // Ensure is dirty
      const dirty = await isDirty(folder);
      if (!dirty) {
        console.log(`No updates: ${folder}`);
        return;
      }

      await deleteBranch(folder, UPDATE_BRANCH_NAME);
      await createBranch(folder, UPDATE_BRANCH_NAME);
      await commitBranch(folder, UPDATE_COMMIT);
      await pushBranch(folder, UPDATE_BRANCH_NAME);

      // Pull release
      await createPr(folder, UPDATE_BRANCH_NAME, UPDATE_COMMIT);

      // Revert to OG branch
      await checkout(folder, branch);
    })
    .catch((err) => {
      console.error(`Error while updating folder: ${folder}`, err);
    });
}
