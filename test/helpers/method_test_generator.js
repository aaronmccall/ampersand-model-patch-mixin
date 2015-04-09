/*jshint expr:true*/
var clone = require('lodash.clone');
var each = require('lodash.foreach');
var extend = require('lodash.assign');
var omit = require('lodash.omit');
 
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
    var MyModel = BaseModel.extend(patcherMixin(BaseModel, {_patcherConfig: { debug: config.debug }}));

    describe(config.name + ': methods', function () {
        describe('initPatcher', function () {
            beforeEach(function (done) {
                sinon.spy(MyModel.prototype, 'initPatcher');
                done();
            });
            afterEach(function (done) {
                MyModel.prototype.initPatcher.restore();
                done();
            });
            it('sets _patcherInitialized to true', function (done) {
                var instance = new MyModel(testData());
                expect(instance._patcherInitialized).to.equal(true);
                done();
            });
            it('returns early if model is new', function (done) {
                var data = testData();
                delete data.id;
                var instance = new MyModel(data);
                expect(instance._patcherInitialized).to.not.exist;
                done();
            });
            it('sets itself to listen for the next sync event if model is new', function (done) {
                var data = testData();
                delete data.id;
                var instance = new MyModel(data);
                expect(instance._patcherInitialized).to.not.exist;
                instance.trigger('sync', instance, {}, {});
                expect(instance.initPatcher.calledTwice).to.equal(true);
                done();
            });
            it('sets change and destroy listeners on child models', function (done) {
                var instance = new MyModel(testData());
                each(instance._children, function (x, name) {
                    expect(instance[name]._events).to.include.keys('change', 'destroy');
                });
                done();
            });
            it('sets add, change, and remove listeners on child collections', function (done) {
                var instance = new MyModel(testData());
                each(instance._collections, function (x, name) {
                    expect(instance[name]._events).to.include.keys('change', 'add', 'remove');
                });
                done();
            });
            it('sets a change listener on self', function (done) {
                var instance = new (MyModel.extend({_children: null, _collections: null}))({id: 1, name: 'Foo Bar'});
                expect(instance._events.change).to.be.an('array').with.length(1);
                done();
            });
        });
        describe('parse', function () {
            var instance, data;
            beforeEach(function (done) {
                sinon.spy(BaseModel.prototype, 'parse');
                instance = new MyModel(testData());
                data = {id: 1, name: 'Elvis Aaron Presley'};
                done();
            });
            afterEach(function (done) {
                BaseModel.prototype.parse.restore();
                done();
            });
            it('sets _original data when options.parse === true', function (done) {
                instance.parse(data, {parse: true});
                expect(instance._original).to.equal(data);
                done();
            });
            it('calls _super.prototype.parse and returns its response', function (done) {
                instance.parse(data);
                expect(BaseModel.prototype.parse.called).to.equal(true);
                expect(BaseModel.prototype.parse.returned(sinon.match.same(data))).to.equal(true);
                done();
            });
        });
        describe('save', function () {
            var instance;
            MyModel.prototype.sync.reset();
            beforeEach(function (done) {
                sinon.spy(BaseModel.prototype, 'save');
                instance = new MyModel(testData());
                done();
            });
            afterEach(function (done) {
                BaseModel.prototype.save.restore();
                MyModel.prototype.sync.reset();
                done();
            });
            it('calls _super.prototype.save if the model is new', function (done) {
                var data = testData();
                delete data.id;
                instance = new MyModel(data);
                expect(instance.isNew()).to.equal(true);
                instance.save();
                expect(BaseModel.prototype.save.called).to.equal(true);
                done();
            });
            it('returns early if _blockSave is true', function (done) {
                instance._ops = [{}];
                instance._blockSave = true;
                instance.save();
                expect(MyModel.prototype.sync.called).to.equal(false);
                done();
            });
            it('returns early if _ops is falsy', function (done) {
                instance.save();
                expect(MyModel.prototype.sync.called).to.equal(false);
                done();
            });
            it('returns early if _ops is empty', function (done) {
                instance._ops = [];
                instance.save();
                expect(MyModel.prototype.sync.called).to.equal(false);
                done();
            });
            it('sets _blockSave to true', function (done) {
                var ops = instance._ops = [{}];
                instance.save();
                expect(instance._blockSave).to.equal(true);
                done();
            });
            it('calls sync with ops as options.attrs', function (done) {
                var ops = instance._ops = [{op: 'test', cid: 1}, {op: 'test', cid: 2}];
                instance.save();
                var args = MyModel.prototype.sync.lastCall.args;
                expect(args[2].attrs).to.exist.and.eql(ops.map(function (op) {
                    return omit(op, 'cid');
                }));
                done();
            });
            it('ensures both error and success handlers', function (done) {
                var ops = instance._ops = [{op: 'test', cid: 1}, {op: 'test', cid: 2}];
                instance.save();
                var args = MyModel.prototype.sync.lastCall.args;
                expect(args[2]).to.exist.and.include.keys('success', 'error');
                done();
            });
            it('its success and error handlers set _blockSave to false', function (done) {
                instance._ops = [{}];
                instance.save(null, {success: function () {
                    expect(instance._blockSave).to.equal(false);
                    MyModel.prototype.sync.yieldsToAsync('error');
                    instance._ops = [{}];
                    var error = sinon.spy(function () {
                        expect(instance._blockSave).to.equal(false);
                        MyModel.prototype.sync.yieldsToAsync('success');
                        expect(error.called).to.equal(true);
                        done();
                    });
                    instance.save(null, {error: error});
                    expect(instance._blockSave).to.equal(true);
                }});
                expect(instance._blockSave).to.equal(true);
            });
            it('can be called with key, val, options signature', function (done) {
                instance.save('name', 'Elvis Aaron Presley');
                var args = MyModel.prototype.sync.lastCall.args;
                expect(args[2].attrs).to.be.an('array');
                expect(args[2].attrs[0]).to.be.an('object');
                expect(args[2].attrs[0].path).to.equal('/name');
                done();
            });
            it('can be called with attrs, options signature', function (done) {
                instance.save({name: 'Elvis Aaron Presley'});
                var args = MyModel.prototype.sync.lastCall.args;
                expect(args[2].attrs).to.be.an('array');
                expect(args[2].attrs[0]).to.be.an('object');
                expect(args[2].attrs[0].path).to.equal('/name');
                done();
            });
        });
        describe('_queueOp', function () {
            var instance;
            beforeEach(function (done) {
                instance = new MyModel(testData());
                done();
            });
            it('builds ops with keys from opTemplates', function (done) {
                instance._queueOp('add', '/foo', 'bar', 'c123');
                var op = instance._ops[0];
                expect(op).to.have.keys(patcherMixin._internals.opTemplates.add);
                done();
            });
            it('only adds ops that match opTemplate properties', function (done) {
                instance._queueOp('test', '/foo', 'bar', 'c123');
                expect(instance._ops).to.not.exist;
                done();
            });
            it('triggers a patcher:op-count event with the current _ops.length', function (done) {
                instance.on('patcher:op-count', function (model, count) {
                    expect(model).to.equal(instance);
                    expect(count).to.equal(model._ops.length);
                    done();
                });
                instance._queueOp('add', '/foo', 'bar', 'c123');
            });
            it('calls autoSave test function if configured', function (done) {
                var autoSave = sinon.spy();
                var instance = new (BaseModel.extend(patcherMixin(BaseModel, {_patcherConfig: {autoSave: autoSave}})))(testData());
                instance._queueOp('add', '/foo', 'bar', 'c123');
                expect(instance._ops.length).to.equal(1);
                expect(autoSave.calledOnce).to.equal(true);
                expect(autoSave.firstCall.args[1]).to.equal(instance._ops.length);
                done();
            });
            it('calls save when op count reaches autoSave count', function (done) {
                var instance = new (BaseModel.extend(patcherMixin(BaseModel, {_patcherConfig: {autoSave: 1}})))(testData());
                var autoSave = sinon.stub(instance, 'save');
                instance._queueOp('add', '/foo', 'bar', 'c123');
                expect(instance._ops.length).to.equal(1);
                expect(autoSave.calledOnce).to.equal(true);
                done();
            });
        });
        describe('_queueModelAdd', function () {
            var instance;
            beforeEach(function (done) {
                instance = new MyModel(testData());
                done();
            });
            it('creates an add op from a new model', function (done) {
                var shoeModel = new MyModel.prototype._collections.shoes.prototype.model();
                instance._queueModelAdd('/foo', shoeModel);
                expect(instance._ops).to.be.an('array').with.length(1);
                expect(instance._ops[0].op).to.equal('add');
                expect(instance._ops[0].value).to.eql(shoeModel.toJSON());
                done();
            });
            it('aborts if model is not new', function (done) {
                var shoeModel = new MyModel.prototype._collections.shoes.prototype.model({id: 123});
                var qA = sinon.spy(instance, '_queueOp');
                instance._queueModelAdd('/foo', shoeModel);
                expect(instance._ops).to.not.exist;
                expect(qA.called).to.equal(false);
                done();
            });
        });
        describe('_changeCollectionModel', function () {
            var instance;
            beforeEach(function (done) {
                instance = new MyModel(testData());
                done();
            });
            it('updates add ops of new collection models', function (done) {
                instance.shoes.add({style: 'Vans'});
                var pair = instance.shoes.last();
                expect(instance._ops.length).to.equal(1);
                var addOp = instance._ops[0];
                instance._changeCollectionModel('shoes', pair);
                expect(instance._ops.length).to.equal(1);
                expect(addOp).to.equal(instance._ops[0]);
                done();
            });
            it('creates replace ops for collection models', function (done) {
                var pair = instance.shoes.at(0);
                pair.set('color', 'Chartreuse', {silent: true});
                instance._changeCollectionModel('shoes', pair);
                expect(instance._ops.length).to.equal(1);
                expect(instance._ops[0]).to.eql({
                    cid: pair.cid,
                    path: '/shoes/0/color',
                    op: 'replace',
                    value: 'Chartreuse'
                });
                done();
            });
        });
        describe('toJSON', function () {
            it('is replaced in Backbone', function (done) {
                var instance = new MyModel(testData());
                if (instance.serialize) return done();
                var Backbone = require('Backbone');
                var bbInstance = new Backbone.Model();
                expect(bbInstance.toJSON).to.equal(Backbone.Model.prototype.toJSON);
                expect(instance.toJSON).to.not.equal(Backbone.Model.prototype.toJSON);
                done();
            });
            it('and calls toJSON on child models and collections', function (done) {
                var instance = new MyModel(testData());
                if (instance.serialize) return done();
                var shoesSpy = sinon.spy(instance.shoes, 'toJSON');
                var carSpy = sinon.spy(instance.car, 'toJSON');
                var json = instance.toJSON();
                expect(shoesSpy.called).to.equal(true);
                expect(carSpy.called).to.equal(true);
                expect(json).to.eql(extend(clone(instance.attributes), {shoes: instance.shoes.toJSON()}, {car: instance.car.toJSON()}));
                done();
            });
        });
        describe('_modelIndex', function () {
            it('finds the index of a model in _original by id', function (done) {
                var data = testData();
                data.shoes.push({id: 6, style: 'Flip-flop', color: 'Rainbow'});
                var instance = new MyModel(data);
                var index = instance._modelIndex(instance.shoes.last(), 'shoes');
                expect(index).to.equal(1);
                expect(instance.shoes.at(index)).to.equal(instance.shoes.get(6));
                done();
            });
            it('returns -1 if no match found', function (done) {
                var data = testData();
                var instance = new MyModel(data);
                instance.shoes.add({id: 6, style: 'Flip-flop', color: 'Rainbow'});
                var index = instance._modelIndex(instance.shoes.last(), 'shoes');
                expect(index).to.equal(-1);
                done();
            });
            it('finds a model\'s parent via _collections when collection name not given', function (done) {
                var data = testData();
                data.shoes.push({id: 6, style: 'Flip-flop', color: 'Rainbow'});
                var instance = new MyModel(data);
                instance._collections.foo = function () { this.on = sinon.spy(); };
                var index = instance._modelIndex(instance.shoes.last());
                expect(index).to.equal(1);
                expect(instance.shoes.at(index)).to.equal(instance.shoes.get(6));
                done();
            });
        });
    });
    return lab;
};
