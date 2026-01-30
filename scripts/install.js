const fs = require('fs');
const path = require('path');


function copy(s, d) {
	const stat = fs.statSync(s);
	if (stat.isDirectory()) {
		if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
		fs.readdirSync(s).forEach(f => copy(path.join(s, f), path.join(d, f)));
		return;
	}
	fs.copyFileSync(s, d);
}


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
	if (fs.existsSync(temp)) copy(temp, mach);
}


install();