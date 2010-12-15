var packager = require('../packager').Packager;

packager.parse_manifest('test-package');
console.log(packager.packages)
console.log(packager.get_package_authors('TestPackage'));
console.log(packager.get_file_authors('TestPackage/Source'));
console.log(packager.component_to_file('TestPackage/source'));
console.log("All files from TestPackage: ", packager.get_all_files('TestPackage'));
