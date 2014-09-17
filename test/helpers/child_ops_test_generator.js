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
    describe(config.name + ': handles child changes efficiently', function () {
        it('only adds remove ops for models that are not new', function (done) {
            instance.car.destroy();
            expect(instance._ops.filter(function (op) { return op.op === 'remove'; }).length).to.equal(0);
            instance = new MyModel(testData());
            instance.car.destroy();
            expect(instance._ops.filter(function (op) { return op.op === 'remove'; }).length).to.equal(1);
            done();
        });
        it('only adds replace ops for models that are not new', function (done) {
            instance.car.set({color: 'Purple'});
            expect(instance._ops.filter(function (op) { return op.op === 'replace'; }).length).to.equal(0);
            instance = new MyModel(testData());
            instance.car.set({color: 'Purple'});
            expect(instance._ops.filter(function (op) { return op.op === 'replace'; }).length).to.equal(1);
            done();
        });
        it('merges all changes into the add op for new models', function (done) {
            var changeCount = 0;
            instance.listenTo(instance.car, 'change', function (car) {
                changeCount += Object.keys(car.changedAttributes()).length;
            });
            instance.car.set({make: 'DeSoto', model: 'Firesweep', color: 'Sunburst Yellow'});
            expect(changeCount).to.equal(3);
            expect(instance._ops.length).to.equal(1);
            expect(instance._ops[0].value).to.eql(instance.car.toJSON());
            done();
        });

    });
    return lab;
};
