var packager = require('../packager').Packager;

packager.parse_manifest('test-package');
console.log(packager.packages)
