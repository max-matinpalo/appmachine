import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function die(msg) {
	console.error("❌ " + msg);
	process.exit(1);
}

// Recursively copies files or directories from source (s) to destination (d)
function copy(s, d) {
	const stat = fs.statSync(s);

	// If it's a folder, ensure destination exists and copy all children
	if (stat.isDirectory()) {
		if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
		fs.readdirSync(s).forEach(f => copy(path.join(s, f), path.join(d, f)));
		return;
	}

	// Otherwise, just copy the file
	fs.copyFileSync(s, d);
}

// Main setup: moves GitHub workflows and AppMachine templates into the project root
function install() {
	const root = process.cwd();
	const src = path.join(__dirname, '../src');
	const dest = path.join(root, '.github/workflows');
	const temp = path.join(__dirname, '../template');
	const mach = path.join(root, 'appmachine');

	// 1. Copy all .yml workflow files to .github/workflows
	if (fs.existsSync(src)) {
		if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
		fs.readdirSync(src).forEach(f => {
			if (f.endsWith('.yml')) fs.copyFileSync(path.join(src, f), path.join(dest, f));
		});
	}

	// 2. Recursively copy the template folder to /appmachine
	if (fs.existsSync(temp)) copy(temp, mach);
}

try {
	install();
} catch (err) {
	die(err.message || "Install failed");
}