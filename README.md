ampersand-model-patch-mixin
====================

Sync implementation for Ampersand and Backbone that implements the [RFC 6902 json+patch spec](http://tools.ietf.org/html/rfc6902) on updates.

## How is it different than the default approach?

If the model is new, Ampersand model's behavior is completely ordinary. Backbone models are modified to pick up their child models/collections data in toJSON as per Ampersand's default behavior.

When the model is not new, the mixin sets watchers on all of the model's own properties, child models, and child collections and creates patch operations for any additions, changes, or removals that occur. The model's save method is overridden to send the accumulated patch operations with the HTTP PATCH verb.

As operations are accumulated, the current operation count is published as a patcher:op-count event to [allow auto-saving based on your criteria](#config.autoSave).


## How do I use it?

With Ampersand model, you could do something like this:

```javascript
var Model = require('ampersand-model');
var Collection = require('ampersand-collection');
var patcherMixin = require('ampersand-model-patch-mixin');

var PatchingModel = Model.extend(patcherMixin(Model, {
    initialize: function (attrs) {
        this.initPatcher(attrs);
    },
    props: {
        id: 'number',
        name: ['string', true],
        age: 'number'
    }
    children: {
        car: Model.extend({
            props: {
                id: 'number',
                make:  ['string', true],
                model: ['string', true],
                color: 'string'
            }
        })
    },
    collections: {
        shoes: Collection.extend({
            model: Model.extend({
                props: {
                    id: 'number',
                    color: ['string', true],
                    style: ['string', true]
                }
            })
        })
    }
}));

module.exports = PatchingModel;

```

Backbone is a little bit more complicated, but still pretty simple:

```javascript
var _ = require('underscore');
var Backbone = require('backbone');
var patcherMixin = require('ampersand-model-patch-mixin');

var PatchingModel = Backbone.Model.extend(patcherMixin(Backbone.Model, {
    initialize: function (attrs) {
        this._initChildren(attrs);
        this._initCollections(attrs);
        this.initPatcher(attrs);
    },
    sync: sync,
    _children: {
        car: Backbone.Model.extend({})
    },
    _collections: {
        shoes: Backbone.Collection.extend({
            model: Backbone.Model.extend({})
        })
    },
    _initChildren: function (attrs) {
        _.each(this._children, function (childConstructor, name) {
            this[name] = new childConstructor(attrs[name] || {});
        }.bind(this));
    },
    _initCollections: function (attrs) {
        _.each(this._collections, function (collectionConstructor, name) {
            this[name] = new collectionConstructor(attrs[name] || []);
        }.bind(this));
    }
}));

module.exports = PatchingModel;
```

**NOTE**: The mixin is a function that must be called with the Model constructor that we are extending from. This allows us to pick up the methods that we will be wrapping from its prototype. You may also pass a protoProps object as you normally would directly to the extend method. 

## Configuration

You can customize behavior by adding a _patcherConfig object to your (optional) protoProps object:

```javascript

var PatchingModel = Model.extend(patcherMixin(Model, {
    _patcherConfig: {
        originalProperty: '_original',
        modelProperty: '_children',
        collectionProperty: '_collections',
        autoSave: undefined,
        debug: undefined
    }
}));

```

The above is the equivalent of the default behavior.

### config.originalProperty

This is the property on the model where the last known server state is stored. It is used primarily to ensure that operation paths for collection models are generated correctly.

### config.modelProperty

This is the property of the model where we will find the names of child models to watch for changes.

### config.collectionProperty

This is the property of the model where we will find the names of child collections to watch for changes.

### config.autoSave

You can set this item with either a number or a function to control when automatic saving will occur.

If it's a function, when a new patch operation is created the function will be called with the model and current operation count as arguments and the model as `this` context. If the function returns a truthy value, the model will be saved.

If it's a number and the operation count is greater than or equal to the number, the model will be saved.

### config.debug

If you set this to true, debug output will be sent to the console when the mixin runs and when its methods are called.