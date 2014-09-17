var TestModel = require('./helpers/backboneTestModel');
var testGenerator = require('./helpers/child_ops_test_generator');

exports.lab = testGenerator(TestModel, {name: 'Backbone'});