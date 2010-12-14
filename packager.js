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

this.Packager = {
  
  warn: function (message){
    console.warn(message);
  },

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
          manifest_format = extensions[ext];
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
    
    var self = this;
    manifest.sources.forEach(function(path, i){
      var path = package_path + path;
      
      // this is where we "hook" for possible other replacers.
      var source = fs.readFileSync(path).toString();

      var descriptor = {};

      // get contents of first comment
      var matches = source.match('/\/\*\s*^---(.*?)^\.\.\.\s*\*\//ms');

      if (matches.length) {
        var descriptor = YAML.decode(matches[0]);
      }

      // populate / convert to array requires and provides
      var requires = descriptor.requires || [];
      var provides = descriptor.provides || [];
      var file_name = descriptor.name || p.basename(path) + '.js';

      // "normalization" for requires. Fills up the default package name from requires, if not present.
      requires.map(function(require){
        return self.parse_name(package_name, require).join('/');
      })
      
      license = descriptor.license;

      self.packages[package_name][file_name] = Object.extend(descriptor, {
        package: package_name,
        requires: requires,
        provides: provides,
        source: source,
        path: path,
        'package/name': package_name + '/' + file_name,
        license: license || manifest.license
      });
      
    });

  },
  
  // here
  add_package: function(package_path){
    this.parse_manifest(package_path);
  },
  
  remove_package: function(package_name){
    unset(this.packages[package_name]);
    unset(this.manifests[package_name]);
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
/*  
  component_to_hash: function(name){
    pair = this.parse_name(this.root, name);
    package = array_get(this.packages, pair[0]);

    if (!empty(package)){
      component = pair[1];

      foreach (package as file => data){
        foreach (data['provides'] as c){
          if (c == component) return data;
        }
      }
    }
    
    return null;
  },
  
  file_to_hash: function(name){
    pair = this.parse_name(this.root, name);
    package = array_get(this.packages, pair[0]);

    if (!empty(package)){
      file_name = pair[1];

      foreach (package as file => data){
        if (file == file_name) return data;
      }
    }
    
    return null;
  },
  
  file_exists: function(name){
    return this.file_to_hash(name) ? true : false;
  },
  
  component_exists: function(name){
    return this.component_to_hash(name) ? true : false;
  },
  
  package_exists: function(name){
    return array_contains(this.get_packages(), name);
  },
  
  validate: function(more_files = [], more_components = [], more_packages = []){

    foreach (this.packages as name => files){
      foreach (files as file){
        file_requires = file['requires'];
        foreach (file_requires as component){
          if (!this.component_exists(component)){
            self::warn("WARNING: The component component, required in the file " + file['package/name'] + ", has not been provided.\n");
          }
        }
      }
    }
    
    foreach (more_files as file){
      if (!this.file_exists(file)) self::warn("WARNING: The required file file could not be found.\n");
    }
    
    foreach (more_components as component){
      if (!this.component_exists(component)) self::warn("WARNING: The required component component could not be found.\n");
    }
    
    foreach (more_packages as package){
      if (!this.package_exists(package)) self::warn("WARNING: The required package package could not be found.\n");
    }
  },
  
  // # public BUILD
  
  build: function(files = [], components = [], packages = [], blocks = [], excluded = []){

    if (!empty(components)){
      more = this.components_to_files(components);
      foreach (more as file) array_include(files, file);
    }
    
    foreach (packages as package){
      more = this.get_all_files(package);
      foreach (more as file) array_include(files, file);  
    }
    
    files = this.complete_files(files);
    
    if (!empty(excluded)){
      less = [];
      foreach (this.components_to_files(excluded) as file) array_include(less, file);
      exclude = this.complete_files(less);
      files = array_diff(files, exclude);
    }
    
    if (empty(files)) return '';
    
    included_sources = [];
    foreach (files as file) included_sources[] = this.get_file_source(file);
    
    source = implode(included_sources, "\n\n");
    
    foreach (blocks as block){
                                                                             / add slash there
      source = preg_replace_callback("%(/[/*])\s*<block>(.*?)</block>(?:\s*\*)?%s", array(this, "block_replacement"), source);
    }
    
    return source + "\n";
  },
  
  block_replacement: function(matches){
                                                               / add slash there
    return (strpos(matches[2], (matches[1] == "//") ? "\n" : "*") === false) ? matches[2] : "";
  },
  
  build_from_files: function(files){
    return this.build(files);
  },
  
  build_from_components: function(components, blocks = null, excluded = null){
    return this.build([], components, [], blocks, excluded);
  },

  write_from_files: function(file_name, files = null){
    full = this.build_from_files(files);
    file_put_contents(file_name, full);
  },

  write_from_components: function(file_name, components = null, blocks = null, exclude = null){
    full = this.build_from_components(components, blocks, exclude);
    file_put_contents(file_name, full);
  },
  
  // # public FILES

  get_all_files: function(of_package = null){
    files = [];
    foreach (this.packages as name => package){
      if (of_package == null || of_package == name) foreach (package as file){
        files[] = file['package/name'];
      }
    }
    return files;
  },
  
  get_file_dependancies: function(file){
    hash = this.file_to_hash(file);
    if (empty(hash)) return [];
    return this.complete_files(this.components_to_files(hash['requires']));
  },
  
  complete_file: function(file){
    files = this.get_file_dependancies(file);
    hash = this.file_to_hash(file);
    if (empty(hash)) return [];
    array_include(files, hash['package/name']);
    return files;
  },
  
  complete_files: function(files){
    ordered_files = [];
    foreach (files as file){
      all_files = this.complete_file(file);
      foreach (all_files as one_file) array_include(ordered_files, one_file);
    }
    return ordered_files;
  },
  
  // # public COMPONENTS
  
  component_to_file: function(component){
    return array_get(this.component_to_hash(component), 'package/name');
  },
  
  components_to_files: function(components){
    files = [];
    foreach (components as component){
      file_name = this.component_to_file(component);
      if (!empty(file_name) && !in_array(file_name, files)) files[] = file_name;
    }
    return files;
  },
  
  // # dynamic getter for PACKAGE properties and FILE properties
  
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
  
  get_packages: function(){
    return array_keys(this.packages);
  },
  
  // authors normalization
  
  get_package_authors: function(package = null){
    if (empty(package)) package = this.root;
    package = array_get(this.manifests, package);
    if (empty(package)) return [];
    return this.normalize_authors(array_get(package, 'authors'), array_get(package, 'author'));
  },
  
  get_file_authors: function(file){
    hash = this.file_to_hash(file);
    if (empty(hash)) return [];
    return this.normalize_authors(array_get(hash, 'authors'), array_get(hash, 'author'), this.get_package_authors());
  },
  
  normalize_authors: function(authors = null, author = null, default = null){
    use = empty(authors) ? author : authors;
    if (empty(use) && !empty(default)) return default;
    if (is_array(use)) return use;
    if (empty(use)) return [];
    return array(use);
  }
  */
  
};

exports = this.Packager;