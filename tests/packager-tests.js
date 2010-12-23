var packager = require('../packager').Packager
  , fs = require('fs')
  , callbacks = {};

console.assert(Array.diff([1,2,3,4,5], [3,6,2]).include(5) + '' == [1,4,5] + '')

callbacks.parse_manifest = false;
packager.parse_manifest('test-package', function(){
  var test;
  callbacks.parse_manifest = true;
  
  console.assert(
    packager.packages.TestPackage != null,
    'parse_manifest should convert the manifest into an object'
  );
  
  test = packager.get_package_authors('TestPackage')[0]
  console.assert(
    test == 'rpflo',
    'get_package_authors, expected rpflo, got ',
    test
  );
  
  test = packager.get_file_authors('TestPackage/Source')[0]
  console.assert(
    test == 'CrypticSwarm',
    'get_file_authors, expected CrypticSwarm, got',
    test
  );
  
  test = packager.component_to_file('TestPackage/source')
  console.assert(
    test == 'TestPackage/Source',
    'component_to_file should do ... something ... expected TestPackage/Source, got',
    test
  );
  
  test = packager.component_to_hash('TestPackage/source')
  console.assert(
    test.name == 'Source',
    'component_to_hash should create an object out of the yaml header, got this',
    test
  );
  
  test = packager.file_to_hash('TestPackage/Source')
  console.assert(
    test.name == 'Source',
    'file_to_hash should create an object, got this',
    test
  );
  
  console.assert(
    packager.validate(null, null, ['TestPackage']),
    'validate should validate a valid package, but did not'
  );
  
  test = packager.get_all_files('TestPackage')
  console.assert(
    test.toString() == 'TestPackage/Source,TestPackage/Source2',
    'get_all_files should return an array of the files'
  );
  
  test = packager.complete_files(packager.get_all_files('TestPackage'))
  console.assert(
    test.toString() == './test-package/source2.js,./test-package/source.js',
    'complete_files should return a list of paths, got',
    test
  );

  callbacks.build = false;
  packager.build(null, null, ['TestPackage'], null, null, function(source){
    callbacks.build = true;
    var src = fs.readFileSync('test-package/expected-build.js').toString();
    console.assert(
      source = src,
      'build should build! got',
      source
    );
  });
});


process.addListener('exit', function(){
  for (i in callbacks){
    if (callbacks.hasOwnProperty(i)){
      console.assert(callbacks[i], i + ' callback was never called');
    }
  }
});