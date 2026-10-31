
const { execSync } = require("child_process");

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: "inherit" });
}

try {
  console.log("================================");
  console.log(" BRIGHTLOOP GAMING - GIT PUSH");
  console.log("================================");

  // Add admin dashboard files
  run("git add app/admin/");
  run("git add components/admin/");

  // Commit changes
  run('git commit -m "Add Brightloop Gaming Admin Dashboard"');

  // Push to GitHub
  run("git push origin main");

  console.log("\nSuccessfully pushed to GitHub!");
} catch (error) {
  console.error("\nGit push failed. Check the error above.");
  process.exit(1);
}
