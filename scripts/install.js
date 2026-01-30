const fs = require('fs');
const path = require('path');

function install() {
	const projectRoot = process.env.INIT_CWD || path.resolve('../../..');
	const srcDir = path.join(__dirname, '../src/workflows');
	const destDir = path.join(projectRoot, '.github/workflows');
	const msgPath = path.join(__dirname, '../install-message.txt');
	if (fs.existsSync(srcDir)) {
		if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
		fs.readdirSync(srcDir).forEach(file => {
			fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
		});
	}
	if (fs.existsSync(msgPath)) {
		console.log('\n' + fs.readFileSync(msgPath, 'utf8') + '\n');
	}
}

install();