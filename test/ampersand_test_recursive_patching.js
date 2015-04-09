var TestModel = require('./helpers/ampersandTestModel');
var testGenerator = require('./helpers/recursive_patching_test_generator');

exports.lab = testGenerator(TestModel, {name: 'Ampersand'});