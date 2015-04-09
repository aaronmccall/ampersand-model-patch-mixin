var each = require('lodash.foreach');
var Backbone = require('backbone');
var Model = Backbone.Model;
var Collection = Backbone.Collection;
var sinon = require('sinon');
var sync = sinon.stub(Model.prototype, 'sync');
sync.yieldsToAsync('success');

var TestModel = Model.extend({
    initialize: function (attrs) {
        this._initChildren(attrs);
        this._initCollections(attrs);
        this.initPatcher(attrs);
    },
    sync: sync,
    _children: {
        car: Model.extend({
            defaults: {
                make:  'Volkswagen',
                model: 'Beetle'
            },
            sync: sync
        })
    },
    _collections: {
        shoes: Collection.extend({
            model: Model.extend({
                defaults: {
                    color: 'Black',
                    style: 'Chuck\'s'
                },
                sync: sync
            }),
            sync: sync
        })
    },
    _initChildren: function (attrs) {
        each(this._children, function (childConstructor, name) {
            this[name] = new childConstructor(attrs[name] || {});
        }.bind(this));
    },
    _initCollections: function (attrs) {
        each(this._collections, function (collectionConstructor, name) {
            this[name] = new collectionConstructor(attrs[name] || []);
        }.bind(this));
    }
});

module.exports = TestModel;