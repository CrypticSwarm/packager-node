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

require('./util');

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
  
  construct: function(package_paths, cb){
    var self = this
    step(
      function() {
        var group = this.group();
        package_paths.forEach(function(package_path){
          self.parse_manifest(package_path, group());
        });
      }
      , function(grouped) {
        this();
      }
      , cb
    );
  },
  
  parse_manifest: function(filePath, cb){
    var package_path
      , manifest_path
      , manifest_format
      , manifest
      , package_name
      , self = this;
    step(
      function statManifest() {
        fs.stat(filePath, this)
      }
      , function getManifestFile(err, stat) {
        if (err) throw err;
        var group;
        if (stat.isDirectory()){  
          console.log('isDirectory');
          package_path = path.dirname(filePath) + '/' + path.basename(filePath) + '/'
          console.log('package_path', package_path)
          group = this.group();
          Object.keys(manifestExtensions).forEach(function(ext){
            var cb = group()
              , filePath = package_path + 'package.' + ext;
            path.exists(filePath, function(exists){ 
              if (!exists) return cb(null);
              manifest_path = filePath;
              manifest_format = manifestExtensions[ext];
              cb();
            });
          });
        } else if (stat.isFile()){
          console.log('isFile')
          package_path = path.dirname(filePath) + '/';
          manifest_path = package_path + path.basename(filePath);
          manifest_format = manifestExtensions[path.extname(filePath)];
          this();
        }
      }
      , function readManifest() {
        if (!manifest_format || !manifest_path) throw new Error("Can't find Manifest File in package_path " + package_path);
        if (!fileParsers[manifest_format]) throw new Error("No " + manifest_format + " manifest parser.");
        fs.readFile(manifest_path, this);
      }
      , function parseManifest(err, manifestBuf) {
        if (err) warn("Problem reading file " + manifest_path + " " + err);
        var group;
        manifest = fileParsers[manifest_format](manifestBuf.toString());
        package_name = manifest.name;

        if (self.root === null) self.root = package_name;
        if (self.manifests[package_name]) return;
        manifest.path = package_path;
        manifest.manifest = manifest_path;
        self.manifests[package_name] = manifest;
        self.packages[package_name] = 
          { files: {}
          , components: {}
          };
        group = this.group();
        manifest.sources.forEach(function(filename, i){
          var filePath = package_path + filename
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
            , file_name = descriptor.name || path.basename(filePath)
            , license = descriptor.license
          // "normalization" for requires. Fills up the default package name from requires, if not present.
            , requires = (descriptor.requires || []).map(
                function(require){
                  return self.parse_name(package_name, require).join('/');
                }
              );

          self.packages[package_name].files[file_name] = Object.extend(descriptor
            , { package: package_name
              , requires: requires
              , provides: provides
              , source: source
              , path: filePath
              , 'package/name': package_name + '/' + file_name
              , license: license || manifest.license
              }
          );
          provides.forEach(function(component) {
            self.packages[package_name].components[component] = self.packages[package_name].files[file_name];
          });
        });
        this();
      }
      , cb
    );
  },
  
  // here
  add_package: function(package_path, cb){
    this.parse_manifest(package_path, cb);
  },
  
  remove_package: function(package_name){
    delete this.packages[package_name];
    delete this.manifests[package_name];
  },
  
  // # private UTILITIES
  
  parse_name: function(ddefault, name){
    var split = name.split('/'),
        length = split.length;
    if (length == 1) return [ddefault, split[0]];
    if (split[0] == '') return [ddefault, split[1]];
    return [split[0], split[1]];
  },

  package_exists: function(name){
    return !!this.packages[name];
  },
  
  validate: function(more_files, more_components, more_packages){
    more_files = more_files || [];
    more_components = more_components || [];
    more_packages = more_packages || [];
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
        var file_requires = package[fileName]['requires'];
        file_requires.forEach(function(component){
          if (!self.component_exists(component)){
            warn("WARNING: The component component, required in the file " + file['package/name'] + ", has not been provided.\n");
            valid = false;
          }
        });
      });
    };
    
    more_files.forEach(function(file){
      if (!self.file_exists(file)) { 
        warn("WARNING: The required file file could not be found.\n");
        valid = false;
      }
    });
    
    more_components.forEach(function(component){
      if (!self.component_exists(component)) {
        warn("WARNING: The required component component could not be found.\n");
        valid = false;
      }
    });
    
    more_packages.forEach(function(package){
      if (!self.package_exists(package)) {
        warn("WARNING: The required package package could not be found.\n");
        valid = false;
      }
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
    var more = this.components_to_files(components)
      , self
      , source = '';

    includeAll(files, more);
    
    packages.forEach(function(package){
      more = this.get_all_files(package);
      includeAll(files, more);
    }, this);
    
    files = this.complete_files(files);
    
    if (excluded.length){
      var less = [];
      includeAll(less, this.components_to_files(excluded));
      var exclude = this.complete_files(less);
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
          source.replace(new Regexp('(/[/*])\\s*<' + block + '>(.*?)</' + block + '>(\\s*\\*)?', 'g'), self.block_replacement);
        });
        this(source);
      }
      , cb
    );
  },
  
  block_replacement: function(matches){
    return (matches[2].indexOf(matches[1] == "//" ? "\n" : "*") === -1) ? matches[2] : "";
  },
  
  build_from_files: function(files, cb){
    return this.build(files, null, null, null, null, cb);
  },
  
  build_from_components: function(components, blocks, excluded){
    return this.build([], components, [], blocks, excluded, cb);
  },

  write_from_files: function(writeStream, files){
    this.build_from_files(files, function(err, text) {
      writeStream.write(text);
    });
  },

  write_from_components: function(writeStream, components, blocks, exclude){
    this.build_from_components(components, blocks, exclude, function(){
      writeStream.write(text);
    });
  },
  
  // # public FILES

  get_all_files: function(of_package){
    var files = []
      , packageNames = Object.keys(this.packages)
      , i = packageNames.length
      , name
      , package;
    while(i--) {
      if (of_package == null || of_package == packageNames[i]) {
        package = this.packages[packageNames[i]];
        Object.keys(package).forEach(function(file) {
          files.push(package[file]['package/name']);
        });
      }
    }
    return files;
  },
  
  get_file_dependancies: function(file){
    var hash = this.file_to_hash(file);
    if (!hash) return [];
    return this.complete_files(this.components_to_files(hash['requires']));
  },
  
  complete_file: function(file){
    var files = this.get_file_dependancies(file)
      , hash = this.file_to_hash(file);
    if (!hash) return [];
    files.include(hash['path']);
    return files;
  },
  
  complete_files: function(files){
    var ordered_files = [];
    files.forEach(function(file){
      var all_files = this.complete_file(file);
      includeAll(ordered_files, all_files);
    }, this);
    return ordered_files;
  },
  
  // # public COMPONENTS
  
  component_to_file: function(component){
    var hash = this.component_to_hash(component);
    if (!hash) return warn("Can't find component " + component);
    return hash['package/name'];
  },
  
  components_to_files: function(components){
    var files = [];
    components.forEach(function(component){
      var file_name = this.component_to_file(component);
      if (file_name) files.include(file_name);
    }, this);
    return files;
  },
  
  get_packages: function(){
    return Object.keys(this.packages);
  },
  
  // authors normalization
  
  get_package_authors: function(package){
    if (!package) package = this.root;
    package = this.manifests[package];
    if (!package) return [];
    return this.normalize_authors(package['authors'], package['author']);
  },
  
  get_file_authors: function(file){
    var hash = this.file_to_hash(file);
    if (!hash) return [];
    return this.normalize_authors(hash.authors, hash.author, this.get_package_authors(hash.package));
  },
  
  normalize_authors: function(authors, author, ddefault){
    var use = authors ? authors : author;
    if (!use && ddefault) return ddefault;
    if (Array.isArray(use)) return use;
    if (!use) return [];
    return [use];
  }
  
};

function addParts(part) {
  var toHash = Packager[part + '_to_hash'] = function(name) {
    var pair = this.parse_name(this.root, name)
      , package = this.packages[pair[0]]
      , fileOrComponent = pair[1]
    if (!package) return;
    return package[part + 's'][fileOrComponent];
  }
  Packager[part + '_exists'] = function(name){
    return !!toHash.call(this, name);
  }
}
addParts('file');
addParts('component');
