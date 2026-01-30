const fs = require('fs');
const path = require('path');


function install() {
	const root = process.env.INIT_CWD || path.resolve('../../..');
	const src = path.join(__dirname, '../src');
	const dest = path.join(root, '.github/workflows');
	const temp = path.join(__dirname, '../template');
	const mach = path.join(root, 'appmachine');
	if (fs.existsSync(src)) {
		if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
		fs.readdirSync(src).forEach(f => {
			if (f.endsWith('.yml')) fs.copyFileSync(path.join(src, f), path.join(dest, f));
		});
	}
	if (fs.existsSync(temp)) {
		if (!fs.existsSync(mach)) fs.mkdirSync(mach, { recursive: true });
		fs.readdirSync(temp).forEach(f => fs.copyFileSync(path.join(temp, f), path.join(mach, f)));
	}
}


install();