#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Log error and exit process
function die(msg) {
	console.error("❌ " + msg);
	process.exit(1);
}

// 2. Recursive copy that skips existing files to protect user modifications
function copy(s, d) {
	const stat = fs.statSync(s);

	if (stat.isDirectory()) {
		if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
		fs.readdirSync(s).forEach(f => copy(path.join(s, f), path.join(d, f)));
		return;
	}

	if (!fs.existsSync(d)) fs.copyFileSync(s, d);
}

// 3. Main installer logic
function install() {
	// INIT_CWD is set by npm/pnpm during postinstall to point to the actual project root
	const root = process.env.INIT_CWD || process.cwd();
	const src = path.join(__dirname, "../src");
	const dest = path.join(root, ".github/workflows");
	const temp = path.join(__dirname, "../template");
	const mach = path.join(root, "appmachine");

	// 4. Overwrite workflow files to keep CI/CD pipelines updated with the package version
	if (fs.existsSync(src)) {
		if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
		fs.readdirSync(src).forEach(f => {
			if (f.endsWith(".yml")) fs.copyFileSync(path.join(src, f), path.join(dest, f));
		});
	}

	// 5. Initialize the appmachine directory if it doesn't exist
	if (fs.existsSync(temp)) copy(temp, mach);
}

try {
	install();
} catch (err) {
	die(err.message || "Install failed");
}