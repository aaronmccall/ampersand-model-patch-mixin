var TestModel = require('./helpers/ampersandTestModel');
var testGenerator = require('./helpers/attribute_ops_test_generator');

exports.lab = testGenerator(TestModel, {name: 'Ampersand'});