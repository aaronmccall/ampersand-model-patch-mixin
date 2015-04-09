/*jshint expr:true*/
var extend = require('lodash.assign');
var Lab = require('lab');
var sinon = require('sinon');
var patcherMixin = require('../../');
var testData = require('./testData');
var expect = Lab.expect;
var AmpersandModel = require('ampersand-model');
var AmpersandCollection = require('ampersand-collection').extend(require('ampersand-collection-lodash-mixin'));

module.exports = function (BaseModel, config) {
    var lab = Lab.script();
    var describe = lab.experiment;
    var it = lab.test;
    var afterEach = lab.afterEach;
    var beforeEach = lab.beforeEach;
    var OldShoes = BaseModel.prototype._collections.shoes;
    var FriendModel = BaseModel.extend(patcherMixin(BaseModel, {
        collections: {
            shoes: OldShoes.extend({
                model: OldShoes.prototype.model.extend(patcherMixin(OldShoes.prototype.model, {
                    collections: {
                        laces: OldShoes.extend({
                            model: AmpersandModel.extend({
                                props: {
                                    id: 'number',
                                    color: 'string'
                                }
                            })
                        })
                    },
                    initialize: function (attrs) {
                        this.initPatcher(attrs);
                    }
                }))
            })
        },
        initialize: function (attrs) {
            this.initPatcher(attrs);
        },
        _patcherConfig: {debug: config.debug}
    }));
    var protoProps = {
        _patcherConfig: { debug: config.debug },
        children: { friend: FriendModel }
    };

    var MyModel = BaseModel.extend(patcherMixin(BaseModel, protoProps));

    describe(config.name + ': handles recursive patching', function () {
        var instance;
        beforeEach(function (done) {
            var data = testData();
            data.friend = {
                id: 4,
                name: 'Colonel Parker', 
                shoes: [{
                    id: 5,
                    color: 'White',
                    style: 'Patent Saddle'
                }]
            };
            instance = new MyModel(data, {parse: true});
            done();
        });
        afterEach(function (done) {
            instance = null;
            done();
        });

        it('bubbles children\'s add ops', function (done) {
            var shoes = instance.friend.shoes.get(5);
            shoes.laces.add({color: 'Blue'});
            var laces = shoes.laces.at(0);
            expect(laces.color).to.equal('Blue');
            expect(instance.friend._ops).to.exist;
            expect(instance._ops).to.exist;
            expect(instance._ops.length).to.equal(instance.friend._ops.length);
            laces.color = 'White';
            expect(instance._ops.every(function (op) { return op.op === 'add' })).to.equal(true);
            expect(instance._ops.length).to.equal(instance.friend._ops.length);
            done();
        });

        it('bubbles children\'s remove ops', function (done) {
            var shoes = instance.friend.shoes.get(5);
            shoes.laces.add({color: 'Blue'});
            var laces = shoes.laces.at(0);
            expect(laces.color).to.equal('Blue');
            expect(instance.friend._ops).to.exist;
            expect(instance._ops).to.exist;
            expect(instance._ops.length).to.equal(instance.friend._ops.length);
            expect(instance._ops.length).to.equal(1);
            shoes.laces.remove(laces);
            expect(instance._ops.length).to.equal(instance.friend._ops.length);
            expect(instance._ops.length).to.equal(0);
            done();
        });

        it('bubbles children\'s replace ops', function (done) {
            var shoes = instance.friend.shoes.get(5);
            shoes.color = 'Black and White';
            expect(instance.friend._ops).to.exist;
            expect(instance._ops).to.exist;
            expect(instance._ops.length).to.equal(instance.friend._ops.length);
            expect(instance._ops.length).to.equal(1);
            done();
        });

        it('can be configured to ignore bubbled paths', function (done) {
            if (instance._ops) delete instance._ops;
            instance._patcherConfig.ignorePaths = [
                /\/shoes\/\d+\/laces/,
                '/shoes/0/color'
            ];
            var shoes = instance.friend.shoes.get(5);
            shoes.laces.add({color: 'Blue'});
            shoes.color = 'Black and White';
            expect(instance.friend._ops).to.exist.and.have.length(2);
            expect(instance._ops).to.not.exist;
            done();
        });
    });
    return lab;
};
