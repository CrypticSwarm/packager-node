var packager = require('../packager').Packager
  , fs = require('fs')
  , callbacks = {};

console.assert(Array.diff([1,2,3,4,5], [3,6,2]).include(5) + '' == [1,4,5] + '')

callbacks.construct = false;

packager.construct(
  [ 'test-package'
  , 'core'
  ]
  , function(){
    var test;
    callbacks.construct = true;
  
    console.assert(
      packager.packages.TestPackage != null,
      'parseManifest should convert the manifest into an object'
    );
  
    test = packager.getPackageAuthors('TestPackage')[0]
    console.assert(
      test == 'rpflo',
      'getPackageAuthors, expected rpflo, got ',
      test
    );
  
    test = packager.getFileAuthors('TestPackage/Source')[0]
    console.assert(
      test == 'CrypticSwarm',
      'getFileAuthors, expected CrypticSwarm, got',
      test
    );
  
    test = packager.componentToFile('TestPackage/source')
    console.assert(
      test == 'TestPackage/Source',
      'componentToFile should do ... something ... expected TestPackage/Source, got',
      test
    );
  
    test = packager.componentToHash('TestPackage/source')
    console.assert(
      test.name == 'Source',
      'componentToHash should create an object out of the yaml header, got this',
      test
    );
  
    test = packager.fileToHash('TestPackage/Source')
    console.assert(
      test.name == 'Source',
      'fileToHash should create an object, got this',
      test
    );
  
    console.assert(
      packager.validate(null, null, ['TestPackage']),
      'validate should validate a valid package, but did not'
    );
  
    test = packager.getAllFiles('TestPackage')
    console.assert(
      test.toString() == 'TestPackage/Source,TestPackage/Source2',
      'getAllFiles should return an array of the files'
    );
  
    test = packager.completeFiles(packager.getAllFiles('TestPackage'))
    console.assert(
      test.toString() == './test-package/source2.js,./test-package/source.js',
      'completeFiles should return a list of paths, got',
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
  }
);


process.addListener('exit', function(){
  for (i in callbacks){
    if (callbacks.hasOwnProperty(i)){
      console.assert(callbacks[i], i + ' callback was never called');
    }
  }
});