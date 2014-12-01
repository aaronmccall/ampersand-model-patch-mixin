/*jshint expr:true*/
var Lab = require('lab');
var sinon = require('sinon');
var patcherMixin = require('../../');
var testData = require('./testData');
var expect = Lab.expect;

module.exports = function (BaseModel, config) {
    var lab = Lab.script();
    var describe = lab.experiment;
    var it = lab.test;
    var afterEach = lab.afterEach;
    var beforeEach = lab.beforeEach;
    var MyModel = BaseModel.extend(patcherMixin(BaseModel, {
        _patcherConfig: { debug: config.debug }
    }));
    var instance;
    beforeEach(function (done) {
        var data = testData();
        delete data.car.id;
        instance = new MyModel(data);
        done();
    });
    describe(config.name + ': handles attribute changes properly', function () {
        it('only adds ops for non-session properties', function (done) {
            instance.set({name: 'Elvis Aaron Presley', foo: 'bar'});
            expect(instance._ops.filter(function (op) { return op.op === 'replace'; }).length).to.equal(instance.isState ? 1 : 2);
            done();
        });

    });
    return lab;
};
