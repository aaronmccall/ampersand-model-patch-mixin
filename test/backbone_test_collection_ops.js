var TestModel = require('./helpers/backboneTestModel');
var testGenerator = require('./helpers/collection_ops_test_generator');

exports.lab = testGenerator(TestModel, {name: 'Backbone'});