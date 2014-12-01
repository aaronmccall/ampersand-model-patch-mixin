var Model = require('ampersand-model');
var underscoreMixin = require('ampersand-collection-underscore-mixin');
var Collection = require('ampersand-collection');
var sinon = require('sinon');
var sync = sinon.stub(Model.prototype, 'sync');
sync.yieldsToAsync('success');

var TestModel = Model.extend({
    initialize: function (attrs) {
        this.initPatcher(attrs);
    },
    props: {
        id: 'number',
        name: ['string', true],
        age: 'number'
    },
    session: {
        foo: 'string'
    },
    sync: sync,
    children: {
        car: Model.extend({
            props: {
                id: 'number',
                make:  ['string', true, 'Volkswagen'],
                model: ['string', true, 'Beetle'],
                color: 'string'
            },
            sync: sync
        })
    },
    collections: {
        shoes: Collection.extend(underscoreMixin, {
            model: Model.extend({
                props: {
                    id: 'number',
                    color: ['string', true, 'Black'],
                    style: ['string', true, 'Chuck\'s']
                },
                sync: sync
            }),
            sync: sync
        })
    }
});

module.exports = TestModel;
