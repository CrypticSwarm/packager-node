var packager = require('../packager').Packager;

console.assert(Array.diff([1,2,3,4,5], [3,6,2]).include(5) + '' == [1,4,5] + '')
packager.parse_manifest('test-package', function(){
	console.log(packager.packages.TestPackage)
	console.log(packager.get_package_authors('TestPackage'));
	console.log(packager.get_file_authors('TestPackage/Source'));
	console.log(packager.component_to_file('TestPackage/source'));
	console.log(packager.component_to_hash('TestPackage/source'));
	console.log(packager.file_to_hash(packager.component_to_file('TestPackage/source')));
	console.log(packager.validate(null, null, ['TestPackage']));
	console.log(packager.get_all_files('TestPackage'));
	console.log(packager.complete_files(packager.get_all_files('TestPackage')));

	console.log("All files from TestPackage: ", packager.get_all_files('TestPackage'));
	packager.build(null, null, ['TestPackage'], null, null, function(source){
		console.log(source);
	});
});
