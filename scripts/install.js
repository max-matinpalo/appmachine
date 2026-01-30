const fs = require('fs');
const path = require('path');

function install() {
	console.error('\x1b[32m%s\x1b[0m', '🚀 AppMachine: Installing workflows...');
	const projectRoot = process.env.INIT_CWD || path.resolve('../../..');
	const srcDir = path.join(__dirname, '../src');
	const destDir = path.join(projectRoot, '.github/workflows');
	const msgPath = path.join(__dirname, '../install-message.txt');
	if (fs.existsSync(srcDir)) {
		if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
		fs.readdirSync(srcDir).forEach(file => {
			if (file.endsWith('.yml')) fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
		});
	}
	if (fs.existsSync(msgPath)) console.error('\n' + fs.readFileSync(msgPath, 'utf8') + '\n');
}

install();