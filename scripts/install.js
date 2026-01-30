const fs = require('fs');
const path = require('path');

function install() {
	console.log('install starts');
	const projectRoot = process.env.INIT_CWD || path.resolve('../../..');
	const srcDir = path.join(__dirname, '../src');
	const destDir = path.join(projectRoot, '.github/workflows');
	const msgPath = path.join(__dirname, '../install-message.txt');

	if (fs.existsSync(srcDir)) {
		if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
		fs.readdirSync(srcDir).forEach(file => {
			const srcFile = path.join(srcDir, file);
			const destFile = path.join(destDir, file);
			if (file.endsWith('.yml')) fs.copyFileSync(srcFile, destFile);
		});
	}

	if (fs.existsSync(msgPath)) console.log('\n' + fs.readFileSync(msgPath, 'utf8') + '\n');
}

install();