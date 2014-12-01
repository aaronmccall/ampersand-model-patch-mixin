var TestModel = require('./helpers/backboneTestModel');
var testGenerator = require('./helpers/attribute_ops_test_generator');

exports.lab = testGenerator(TestModel, {name: 'Backbone'});