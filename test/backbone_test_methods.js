var TestModel = require('./helpers/backboneTestModel');
var testGenerator = require('./helpers/method_test_generator');

exports.lab = testGenerator(TestModel, {name: 'Backbone'});