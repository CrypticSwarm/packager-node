var path = require('path')
  , fs = require('fs')
  , yaml = require('yaml')
  , step = require('step')
  , fileParsers = exports.fileParsers =
      { 'json': JSON.parse
      , 'yaml': yaml.eval 
      }
  , manifestExtensions = exports.manifestExtensions = 
      { yml:  'yaml'
      , yaml: 'yaml'
      , json: 'json'
      };

require('./lib/util');

//Include may need to be Included!
function includeAll(into, what){
  what.forEach(function(item) {
    into.include(item);
  });
}

function warn(message){
  console.warn(message);
}

var Packager = exports.Packager =  {

  packages: {},
  manifests: {},
  root: null,
  
  construct: function(packagePaths, cb){
    var self = this
    step(
      function() {
        var group = this.group();
        packagePaths.forEach(function(packagePath){
          self.parseManifest(packagePath, group());
        });
      }
      , function(grouped) {
        this();
      }
      , cb
    );
  },
  
  parseManifest: function(filePath, cb){
    var packagePath
      , manifestPath
      , manifestFormat
      , manifest
      , packageName
      , self = this;
    step(
      function statManifest() {
        fs.stat(filePath, this)
      }
      , function getManifestFile(err, stat) {
        if (err) throw err;
        var group;
        if (stat.isDirectory()){  
          packagePath = path.dirname(filePath) + '/' + path.basename(filePath) + '/'
          group = this.group();
          Object.keys(manifestExtensions).forEach(function(ext){
            var cb = group()
              , filePath = packagePath + 'package.' + ext;
            path.exists(filePath, function(exists){ 
              if (!exists) return cb(null);
              manifestPath = filePath;
              manifestFormat = manifestExtensions[ext];
              cb();
            });
          });
        } else if (stat.isFile()){
          packagePath = path.dirname(filePath) + '/';
          manifestPath = packagePath + path.basename(filePath);
          manifestFormat = manifestExtensions[path.extname(filePath)];
          this();
        }
      }
      , function readManifest() {
        if (!manifestFormat || !manifestPath) throw new Error("Can't find Manifest File in packagePath " + packagePath);
        if (!fileParsers[manifestFormat]) throw new Error("No " + manifestFormat + " manifest parser.");
        fs.readFile(manifestPath, this);
      }
      , function parseManifest(err, manifestBuf) {
        if (err) warn("Problem reading file " + manifestPath + " " + err);
        var group;
        manifest = fileParsers[manifestFormat](manifestBuf.toString());
        packageName = manifest.name;

        if (self.root === null) self.root = packageName;
        if (self.manifests[packageName]) return;
        manifest.path = packagePath;
        manifest.manifest = manifestPath;
        self.manifests[packageName] = manifest;
        self.packages[packageName] = 
          { files: {}
          , components: {}
          };
        group = this.group();
        manifest.sources.forEach(function(filename, i){
          var filePath = packagePath + filename
            , callback = group();
          fs.readFile(filePath, function(err, source) {
            callback(err,
              { path: filePath
              , source: source.toString()
              });
          });
        });
      }
      , function parseSourceFiles(err, files) {
        files.forEach(function(file){
          var source = file.source
            , filePath = file.path
          // this is where we "hook" for possible other replacers.
          // get contents of first comment
            , matches = /\/\*\s*^---([\s\S]*?)^\.\.\.\s*\*\//m.exec(source)
            , descriptor;
          //Still some small problems with the yaml parser...
          try {
            descriptor = (matches && yaml.eval(matches[1])) || {};
          } catch(e) { 
            warn(file.path + ' failed parse ' + e);
            return;
          }
          
          // populate / convert to array requires and provides
          var provides = descriptor.provides || []
            , fileName = descriptor.name || path.basename(filePath)
            , license = descriptor.license
          // "normalization" for requires. Fills up the default package name from requires, if not present.
            , requires = (descriptor.requires || []).map(
                function(require){
                  return self.parseName(packageName, require).join('/');
                }
              );

          self.packages[packageName].files[fileName] = Object.extend(descriptor
            , { package: packageName
              , requires: requires
              , provides: provides
              , source: source
              , path: filePath
              , 'package/name': packageName + '/' + fileName
              , license: license || manifest.license
              }
          );
          provides.forEach(function(component) {
            self.packages[packageName].components[component] = self.packages[packageName].files[fileName];
          });
        });
        this();
      }
      , cb
    );
  },
  
  addPackage: function(packagePath, cb){
    this.parseManifest(packagePath, cb);
  },
  
  removePackage: function(packageName){
    delete this.packages[packageName];
    delete this.manifests[packageName];
  },
  
  // # private UTILITIES
  
  parseName: function(ddefault, name){
    var split = name.split('/'),
        length = split.length;
    if (length == 1) return [ddefault, split[0]];
    if (split[0] == '') return [ddefault, split[1]];
    return [split[0], split[1]];
  },

  packageExists: function(name){
    return !!this.packages[name];
  },
  
  validate: function(moreFiles, moreComponents, morePackages){
    moreFiles = moreFiles || [];
    moreComponents = moreComponents || [];
    morePackages = morePackages || [];
    var packageNames = Object.keys(this.packages)
      , i = packageNames.length
      , package
      , files
      , self = this
      , valid = true;
    while(i--) {
      package = this.packages[packageNames[i]].files;
      files = Object.keys(package);
      files.forEach(function(fileName) {
        var fileRequires = package[fileName]['requires'];
        fileRequires.forEach(function(component){
          if (!self.componentExists(component)){
            warn("WARNING: The component component, required in the file " + file['package/name'] + ", has not been provided.\n");
            valid = false;
          }
        });
      });
    };

    var check =
      { file: moreFiles
      , component: moreComponents
      , package: morePackages
      };

    Object.keys(check).forEach(function(what) {
      check[what].forEach(function(item) {
        if (!self[what + 'Exists'](item)) {
          warn("WARNING: The required " + what + " " + item + " could not be found.\n");
          valid = false;
        }
      });
    });
    
    return valid;
  },
  
  // # public BUILD
  
  build: function(files, components, packages, blocks, excluded, cb){
    files = files || [];
    components = components || [];
    packages = packages || [];
    blocks = blocks || [];
    excluded = excluded || [];
    var more = this.componentsToFiles(components)
      , self
      , source = '';

    includeAll(files, more);
    
    packages.forEach(function(package){
      more = this.getAllFiles(package);
      includeAll(files, more);
    }, this);
    
    files = this.completeFiles(files);
    
    if (excluded.length){
      var less = [];
      includeAll(less, this.componentsToFiles(excluded));
      var exclude = this.completeFiles(less);
      files = Array.diff(files, exclude);
    }
    
    if (!files.length) return '';
    
    step(
      function(){
        var group = this.group();
        files.forEach(function(file) {
          fs.readFile(file, group());
        });
      }
      , function(err, sources){
        sources.forEach(function(file){
          source += file.toString() + "\n\n";
        });
    
        // double check that I know what this is doing!
        blocks.forEach(function(block) {
          source.replace(new Regexp('(/[/*])\\s*<' + block + '>(.*?)</' + block + '>(\\s*\\*)?', 'g'), self.blockReplacement);
        });
        this(source);
      }
      , cb
    );
  },
  
  blockReplacement: function(matches){
    return (matches[2].indexOf(matches[1] == "//" ? "\n" : "*") === -1) ? matches[2] : "";
  },
  
  buildFromFiles: function(files, cb){
    return this.build(files, null, null, null, null, cb);
  },
  
  buildFromComponents: function(components, blocks, excluded){
    return this.build([], components, [], blocks, excluded, cb);
  },

  writeFromFiles: function(writeStream, files){
    this.buildFromFiles(files, function(err, text) {
      writeStream.write(text);
    });
  },

  writeFromComponents: function(writeStream, components, blocks, exclude){
    this.buildFromComponents(components, blocks, exclude, function(){
      writeStream.write(text);
    });
  },
  
  // # public FILES

  getAllFiles: function(ofPackage){
    var files = [];
    if (ofPackage == null) {
      this.getPackages().forEach(function(package) {
        files.concat(this.getAllFiles(package));
      }, this);
      return files;
    }
    else {
      package = this.packages[ofPackage];
      return Object.keys(package.files).map(function(file) {
        return package.files[file]['package/name'];
      });
    }
  },
  
  getFileDependancies: function(file){
    var hash = this.fileToHash(file);
    if (!hash) return [];
    return this.completeFiles(this.componentsToFiles(hash['requires']));
  },
  
  completeFile: function(file){
    var files = this.getFileDependancies(file)
      , hash = this.fileToHash(file);
    if (!hash) return [];
    files.include(hash['path']);
    return files;
  },
  
  completeFiles: function(files){
    var orderedFiles = [];
    files.forEach(function(file){
      var allFiles = this.completeFile(file);
      includeAll(orderedFiles, allFiles);
    }, this);
    return orderedFiles;
  },
  
  componentToFile: function(component){
    var hash = this.componentToHash(component);
    if (!hash) return warn("Can't find component " + component);
    return hash['package/name'];
  },
  
  componentsToFiles: function(components){
    var files = [];
    components.forEach(function(component){
      var fileName = this.componentToFile(component);
      if (fileName) files.include(fileName);
    }, this);
    return files;
  },
  
  getPackages: function(){
    return Object.keys(this.packages);
  },
  
  getPackageAuthors: function(package){
    if (!package) package = this.root;
    package = this.manifests[package];
    if (!package) return [];
    return this.normalizeAuthors(package['authors'], package['author']);
  },
  
  getFileAuthors: function(file){
    var hash = this.fileToHash(file);
    if (!hash) return [];
    return this.normalizeAuthors(hash.authors, hash.author, this.getPackageAuthors(hash.package));
  },
  
  normalizeAuthors: function(authors, author, ddefault){
    var use = authors ? authors : author;
    if (!use && ddefault) return ddefault;
    if (Array.isArray(use)) return use;
    if (!use) return [];
    return [use];
  }
  
};

function addParts(part) {
  var toHash = Packager[part + 'ToHash'] = function(name) {
    var pair = this.parseName(this.root, name)
      , package = this.packages[pair[0]]
      , fileOrComponent = pair[1]
    if (!package) return;
    return package[part + 's'][fileOrComponent];
  }
  Packager[part + 'Exists'] = function(name){
    return !!toHash.call(this, name);
  }
}
addParts('file');
addParts('component');
