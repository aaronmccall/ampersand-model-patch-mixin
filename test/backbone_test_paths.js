var TestModel = require('./helpers/backboneTestModel');
var testGenerator = require('./helpers/path_test_generator');

exports.lab = testGenerator(TestModel, {name: 'Backbone'});