var yaml = require('yaml'),
    fs = require('fs')

var file = 'test-package/package.yml'
file = 'test.yml'

var y = yaml.eval(fs.readFileSync(file).toString())

console.log(y)
