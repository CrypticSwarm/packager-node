var path = require('path')
  , fs = require('fs')
  , yaml = require('yaml')
  , fileParsers = exports.fileParsers =
      { 'json': JSON.parse
      , 'yaml': yaml.eval 
      }
  , manifestExtensions = exports.manifestExtensions = 
      { yml:  'yaml'
      , yaml: 'yaml'
      , json: 'json'
      };

Object.extend = function(original, extensions){
  original = original || {};
  for (var i in extensions){
    if (extensions.hasOwnProperty(i)) {
      original[i] = extensions[i];
    }
  }
  return original;
};

Array.prototype.include = function(item) {
  if (this.indexOf(item) === -1) this.push(item);
  return this;
};

Array.diff = function(arr, arr2){
  return arr.map(function(item) {
    return arr2.indexOf(item) === -1 
      ? item
      : null;
  }).filter(function(item){
    return item;
  });
};

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
  
  construct: function(package_paths){
    var self = this;
    package_paths.forEach(function(package_path){
      self.parse_manifest(package_path);
    });
  },
  
  parse_manifest: function(filePath){
    var stat = fs.statSync(filePath)
      , package_path
      , manifest_path
      , manifest_format;

    if (stat.isDirectory()){  
      console.log('isDirectory')    
      package_path = path.dirname(filePath) + '/' + path.basename(filePath) + '/'
      console.log('package_path', package_path)
      Object.keys(manifestExtensions).some(function(ext){
        if (path.existsSync(package_path + 'package.' + ext)){
          console.log(ext);
          manifest_path = package_path + 'package.' + ext;
          manifest_format = manifestExtensions[ext];
          return true;
        }
      });
    } else if (stat.isFile()){
      console.log('isFile')
      package_path = path.dirname(filePath) + '/';
      manifest_path = package_path + path.basename(filePath);
      manifest_format = path.extname(filePath);
    }
    
    if (fileParsers[manifest_format]) var manifest = fileParsers[manifest_format](fs.readFileSync(manifest_path).toString());

    if (!Object.keys(manifest).length) throw new Error("manifest not found in package_path, or unable to parse manifest.");
    
    var package_name = manifest.name;
    
    if (this.root === null) this.root = package_name;

    if (this.manifests[package_name]) return;

    manifest.path = package_path;
    manifest.manifest = manifest_path;
    
    this.manifests[package_name] = manifest;
    this.packages[package_name] = {};
    
    var self = this, p = path;
    manifest.sources.forEach(function(path, i){
      var path = package_path + path
      // this is where we "hook" for possible other replacers.
        , source = fs.readFileSync(path).toString()
      // get contents of first comment
        , matches = /\/\*\s*^---([\s\S]*?)^\.\.\.\s*\*\//m.exec(source)
        , descriptor = (matches && yaml.eval(matches[1])) || {}
      // populate / convert to array requires and provides
        , provides = descriptor.provides || []
        , file_name = descriptor.name || p.basename(path) + '.js'
        , license = descriptor.license
      // "normalization" for requires. Fills up the default package name from requires, if not present.
        , requires = (descriptor.requires || []).map(
            function(require){
              return self.parse_name(package_name, require).join('/');
            }
          );

      self.packages[package_name][file_name] = Object.extend(descriptor
        , { package: package_name
          , requires: requires
          , provides: provides
          , source: source
          , path: path
          , 'package/name': package_name + '/' + file_name
          , license: license || manifest.license
          }
      );
      
    });

  },
  
  // here
  add_package: function(package_path){
    this.parse_manifest(package_path);
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

  // # private HASHES
  component_to_hash: function(name){
    var pair = this.parse_name(this.root, name)
      , package = this.packages[pair[0]]
      , component = pair[1]
      , ret = null;

    if (!package) return;
    Object.keys(package).some(function(file){
      return package[file].provides.some(function(c){
        if (c == component) return ret = package[file];
      });
    });
    
    return ret;
  },
  
  file_to_hash: function(name){
    var pair = this.parse_name(this.root, name)
      , package = this.packages[pair[0]]
      , ret = null;

    if (!package) return;
    file_name = pair[1];

    Object.keys(package).some(function(file) {
      if (file == file_name) return ret = package[file];
    });
    
    return ret;
  },
  
  file_exists: function(name){
    return !!this.file_to_hash(name);
  },
  
  component_exists: function(name){
    return !!this.component_to_hash(name);
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
      package = this.packages[packageNames[i]];
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
  
  build: function(files, components, packages, blocks, excluded){
    files = files || [];
    components = components || [];
    packages = packages || [];
    blocks = blocks || [];
    excluded = excluded || [];
    var more = this.components_to_files(components);

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
    
    included_sources = [];
    files.forEach(function(file) {
      included_sources.push(fs.readFileSync(file).toString());
    }, this);
    
    source = included_sources.join("\n\n");

    // double check that I know what this is doing!
    blocks.forEach(function(block) {
      source.replace(new Regexp('(/[/*])\\s*<' + block + '>(.*?)</' + block + '>(\\s*\\*)?', 'g'), this.block_replacement);
    }, this);
    
    return source + "\n";
  },
  
  block_replacement: function(matches){
    return (matches[2].indexOf(matches[1] == "//" ? "\n" : "*") === -1) ? matches[2] : "";
  },
  
  build_from_files: function(files){
    return this.build(files);
  },
  
  build_from_components: function(components, blocks, excluded){
    return this.build([], components, [], blocks, excluded);
  },

  write_from_files: function(writeStream, files){
    var full = this.build_from_files(files);
    writeStream.write(full);
  },

  write_from_components: function(writeStream, components, blocks, exclude){
    var full = this.build_from_components(components, blocks, exclude);
    writeStream.write(full);
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
    files.include(hash['package/name']);
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
    return this.component_to_hash(component)['package/name'];
  },
  
  components_to_files: function(components){
    var files = [];
    components.forEach(function(component){
      var file_name = this.component_to_file(component);
      if (file_name) files.include(file_name);
    }, this);
    return files;
  },
  
  // # dynamic getter for PACKAGE properties and FILE properties
  /*
  _call: function(method, arguments){
    if (strpos(method, 'get_file_') === 0){
      file = array_get(arguments, 0);
      if (empty(file)) return null;
      key = substr(method, 9);
      hash = this.file_to_hash(file);
      return array_get(hash, key);
    }
    
    if (strpos(method, 'get_package_') === 0){
      key = substr(method, 12);
      package = array_get(arguments, 0);
      package = array_get(this.manifests, (empty(package)) ? this.root : package);
      return array_get(package, key);
    }
    
    return null;
  },
 */ 
  get_packages: function(){
    return Object.keys(this.packages);
  },
  
  // authors normalization
  
  get_package_authors: function(package){
    if (package) package = this.root;
    package = this.manifests[package];
    if (!package) return [];
    return this.normalize_authors(package['authors'], package['author']);
  },
  
  get_file_authors: function(file){
    var hash = this.file_to_hash(file);
    if (!hash) return [];
    return this.normalize_authors(hash.authors, hash.author, this.get_package_authors());
  },
  
  normalize_authors: function(authors, author, ddefault){
    var use = authors ? authors : author;
    if (!use && ddefault) return ddefault;
    if (Array.isArray(use)) return use;
    if (!use) return [];
    return [use];
  }
  
};

