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
    var MyModel = BaseModel.extend(patcherMixin(BaseModel, {debug: config.debug}));
    var instance;
    beforeEach(function (done) {
        instance = new MyModel(testData());
        instance.shoes.add([{color: 'Red'}, {style: 'Vans'}]);
        done();
    });
    describe(config.name + ': handles collection changes efficiently', function () {
        it('only adds remove ops for models that are not new', function (done) {
            expect(instance.shoes.length).to.equal(3);
            instance.shoes.at(0).destroy();
            instance.shoes.at(1).destroy();
            expect(instance.shoes.length).to.equal(1);
            var removeOps = instance._ops.filter(function (op) {
                return op.op === 'remove';
            });
            expect(removeOps.length).to.equal(1);
            expect(removeOps[0].path).to.match(/\/shoes\/0/);
            done();
        });
        it('only adds replace ops for models that are not new', function (done) {
            instance.shoes.at(0).set({color: 'Buff'});
            instance.shoes.at(1).set({style: 'Loafer'});
            var replaceOps = instance._ops.filter(function (op) {
                return op.op === 'replace';
            });
            expect(replaceOps.length).to.equal(1);
            expect(replaceOps[0].path).to.match(/\/shoes\/0\/color/);
            done();
        });
        it('merges all changes into the add op for new models', function (done) {
            var initialOpCount = instance._ops.length;
            expect(initialOpCount).to.equal(2);
            var changeCount = 0;
            instance.listenTo(instance.shoes, 'change', function (model) {
                changeCount += Object.keys(model.changedAttributes()).length;
            });
            instance.shoes.at(1).set({color: 'Fuchsia', style: 'Spats'});
            instance.shoes.at(2).set({color: 'Lemon', style: 'Flip-flop'});
            expect(changeCount).to.equal(4);
            expect(instance._ops.length).equal(initialOpCount);
            done();
        });

    });
    return lab;
};