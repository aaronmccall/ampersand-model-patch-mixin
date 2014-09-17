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
        done();
    });
    describe(config.name + ': builds json+patch op paths from prop and child names', function () {
        it('sets a child models\'s name as the path root', function (done) {
            instance.car.set({model: 'Fleetwood'});
            expect(instance._ops[0]).to.exist;
            expect(instance._ops[0].path).to.match(/^\/car/);
            done();
        });
        it('sets a child collection\'s name as the path root', function (done) {
            instance.shoes.at(0).set({color: 'Buff'});
            expect(instance._ops[0]).to.exist;
            expect(instance._ops[0].path).to.match(/^\/shoes\/0/);
            done();
        });
        it('sets an own prop name as the whole path', function (done) {
            instance.set({age: 47});
            expect(instance._ops[0]).to.exist;
            expect(instance._ops[0].path).to.match(/^\/age$/);
            done();
        });
        it('sets the final path segment for new collection models to "-"', function (done) {
            instance.shoes.add({color: 'Silver'});
            expect(instance._ops[0]).to.exist;
            expect(instance.shoes.last().get('color')).to.equal('Silver');
            expect(instance._ops[0].path).to.match(/-$/);
            done();
        });
    });
    return lab;
};