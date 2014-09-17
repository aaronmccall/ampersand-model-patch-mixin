var TestModel = require('./helpers/ampersandTestModel');
var testGenerator = require('./helpers/collection_ops_test_generator');

exports.lab = testGenerator(TestModel, {name: 'Ampersand'});