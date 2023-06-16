#!/usr/bin/env node

const async = require("async");

const {
  assertTooling,
  getFolders,
  getInfo,
  deleteUpdateBranch,
  isOriginExists,
  updateYarnDeps,
  updatePythonDeps,
  isDirty,
  createUpdateBranch,
  commitBranch,
  pushBranch,
  createPr,
  checkout,
  UPDATE_BRANCH_NAME,
} = require("./services");

process();

async function process() {
  await Promise.all([
    assertTooling("gh"),
    assertTooling("git"),
    assertTooling("yarn"),
  ]);

  const folders = await getFolders();

  return async.mapLimit(folders, 10, handler);
}

async function handler(folder) {
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

        throw new Error(`Unknown repo type: ${folder}`);
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
}
