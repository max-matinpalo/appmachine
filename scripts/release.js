#!/usr/bin/env node
import { execFileSync } from "child_process";

function sh(cmd, args, stdio) {
	execFileSync(cmd, args, { stdio: stdio || "inherit" });
}

function statusPorcelain() {
	return execFileSync("git", ["status", "--porcelain"], {
		encoding: "utf8"
	}).trim();
}

function die(msg) {
	console.error(msg);
	process.exit(1);
}

function main() {
	const commitMsg = (process.argv[2] || "Update").trim() || "Update";

	console.log("\n📦 Releasing...");

	try {
		// 1) Commit any changes (incl untracked)
		if (statusPorcelain()) {
			console.log(`   - Committing: "${commitMsg}"`);
			sh("git", ["add", "."]);
			sh("git", ["commit", "-m", commitMsg], "ignore");
		}

		// 2) Bump version + tag
		console.log("   - Bumping version...");
		sh("npm", ["version", "patch", "-m", "Release %s"], "ignore");

		// 3) Push tags/commit first
		console.log("   - Pushing...");
		sh("git", ["push", "--follow-tags"]);

		// 4) Publish
		console.log("   - Publishing...");
		sh("npm", ["publish"]);

		console.log("\n✅ Done!");
	} catch (e) {
		die("\n❌ Release failed");
	}
}

main();
