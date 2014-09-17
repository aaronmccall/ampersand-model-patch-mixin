var TestModel = require('./helpers/ampersandTestModel');
var testGenerator = require('./helpers/path_test_generator');

exports.lab = testGenerator(TestModel, {name: 'Ampersand'});