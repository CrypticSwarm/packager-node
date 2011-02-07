
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


Array.from = function(val) {
	return Array.isArray(val) ? val : [val];
}
