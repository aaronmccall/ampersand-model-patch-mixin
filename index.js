/*jshint eqnull: true */
var _ = require('underscore');

// Find index of array member  that passes test
function smartIndexOf(array, test) {
    var index = -1;
    if (!array || !test) return index;
    var length = array.length;
    if (!length) return index;
    while (++index < length) {
        if (test(array[index], index, array)) return index;
    }
    return -1;
}

// Returns index of object with matching id property
function indexById(array, id) {
    if (!array) return -1;
    return smartIndexOf(array, function (obj) {
        return obj.id === id;
    });
}

// Creates PATCH paths from arguments
// e.g., makePath('foo', 0, 'bar') => '/foo/0/bar'
function makePath() {
    var args = _.toArray(arguments);
    return '/' + _.reject(args, function (arg) {
        var stringable = _.isString(arg) || _.isNumber(arg);
        return !stringable || (''+arg).length === 0;
    }).join('/').replace(/^\/|\/$/g, '');
}

var opPathValue = ['op', 'path', 'value', 'cid'];
var opTemplates = {
    add: opPathValue,
    remove: ['op', 'path', 'cid'],
    replace: opPathValue
};

module.exports = function (_super, protoProps) {
    var config = (protoProps && protoProps._patcherConfig) || {};

    var log = internals.log = function () {
        if (config.debug) {
            console.log.apply(console, arguments);
        }
    };

    _.defaults(config, {
        originalProperty: '_original',
        modelProperty: '_children',
        collectionProperty: '_collections'
    });
    log('config:', config);
    var mixinProps = {
        _queueOp: function (op, path, value, cid) {
            if (!opTemplates[op]) return;
            var operation = _.object(opTemplates[op], _.toArray(arguments));
            var ops = this._ops || (this._ops = []);
            // If we already have a replace op for this path, just update it
            if (op === 'replace') {
                var dupe = _.findWhere(ops, { op: op, path: path });
                if (dupe) return _.extend(dupe, operation);
            }
            ops.push(operation);
            this.trigger('patcher:op-count', this, ops.length);
        },
        _queueModelAdd: function (path, model) {
            if (!model.isNew()) return;
            this._queueOp('add', path, model.toJSON(), model.cid);
        },
        _changeCollectionModel: function (root, model) {
            // If the model is new, just update its add payload and return
            if (model.isNew()) {
                var addOp = _.findWhere(this._ops, {cid: model.cid});
                addOp.value = model.toJSON();
                return;
            }
            var index = indexById(this[config.originalProperty][root], model.id);
            // and queue a replace op for each changed attribute
            _.each(model.changedAttributes(), function (val, key) {
                this._queueOp('replace', makePath(root, index, key), val, model.cid);
            }, this);

        },
        initPatcher: function (attrs) {
            // No need to queue ops if root model is new or only id is populated
            if (this.isNew() || _.isEqual(attrs || this.attributes, {id: this.id})) {
                // Re-run after first save or first sync if only attr is id
                this.listenToOnce(this, 'sync', this.initPatcher);
                return;
            }
            // If not new AND bootstrapped
            if (_.isObject(attrs) && !_.isEmpty(attrs) && attrs !== this) {
                log('setting %s to', config.originalProperty, attrs);
                this[config.originalProperty] = attrs;
            }
            if (this._patcherInitialized) return;
            // If we've already initialized before, we don't want to re-add
            // the add/change/remove/destroy watchers
            this._patcherInitialized = true;
            if (this[config.collectionProperty]) {
                log('initializing collection watching');
                // For every child collection:
                _.each(this[config.collectionProperty], function (x, name) {
                    // 1. Watch for added members and queue an add op for them.
                    this.listenTo(this[name], 'add', _.bind(this._queueModelAdd, this, makePath(name, '-')));
                    // 2. Watch for changes to member models,
                    this.listenTo(this[name], 'change', _.partial(this._changeCollectionModel, name));
                    // 3. Watch for removed members and queue a remove op for them.
                    this.listenTo(this[name], 'remove', function (model) {
                        // Unqueue previous ops
                        var prevOps = _.where(this._ops, {cid: model.cid});
                        if (prevOps.length) this._ops = _.difference(this._ops, prevOps);
                        // For new models just return
                        if (model.isNew()) return;
                        var index = indexById(this[config.originalProperty][name], model.id);
                        this._queueOp('remove', makePath(name, index), model.cid);
                    });
                }, this);
            }
            if (this[config.modelProperty]) {
                log('initializing children watching');
                _.each(this[config.modelProperty], function (x, name) {
                    var model = this[name];
                    if (model.isNew()) {
                        this._queueModelAdd(makePath(name), model);
                    }
                    // 1. Watch for changes to child models,
                    this.listenTo(model, 'change', function (model) {
                        // and queue a replace op for each changed attribute
                        _.each(model.changedAttributes(), function (val, key) {
                            if (model.isNew()) {
                                var addOp = _.findWhere(this._ops, {cid: model.cid});
                                if (addOp) {
                                    addOp.value = model.toJSON();
                                    return;
                                }
                            }
                            this._queueOp('replace', makePath(name, key), val, model.cid);
                        }, this);
                    });
                    // 2. Watch for removed members and queue a remove op for them.
                    this.listenTo(model, 'destroy', function (model) {
                        // Throw away any edits to this model since we're destroying it.
                        var addOp = _.where(this._ops, {cid: model.cid});
                        if (addOp.length) this._ops = _.difference(this._ops, addOp);
                        if (model.isNew()) return;
                        this._queueOp('remove', makePath(name), model.cid);
                    });
                }, this);
            }
            this.listenTo(this, 'change', function (self) {
                var changed = this.changedAttributes();
                _.each(changed, function (val, key) {
                    this._queueOp('replace', makePath(key), val, self.cid);
                }, this);
            });
            if (config.autoSave) {
                log('adding autoSave handler', config.autoSave);
                this.listenTo(this, 'patcher:op-count', function (model, opCount) {
                    var saveType = typeof config.autoSave;
                    var doSave = false;
                    if (saveType === 'function') {
                        doSave = config.autoSave.call(this, model, opCount);
                    }
                    if (saveType === 'number') {
                        doSave = opCount >= config.autoSave;
                    }
                    if (doSave) this.save();
                });
            }
        },

        parse: function (response, options) {
            options = options || {};
            var parsed = _super.prototype.parse.call(this, response, options);
            if (parsed && options && options.parse === true && !options._patcherParsed) {
                this[config.originalProperty] = parsed;
                options._patcherParsed = true;
            }
            return parsed;
        },
        // We need to override the built-in save to accomodate
        // sending json-patch compliant edit payloads
        save: function (key, val, options) {
            // If root model is new, we save normally
            if (this.isNew()) {
                return _super.prototype.save.apply(this, arguments);
            }
            if (this._blockSave) return;
            // Mimic the barebones of Backbone.Model.prototype.save's argument handling
            var attrs;
            if (key == null || typeof key === 'object') {
                attrs = key;
                options = val;
            } else {
                (attrs = {})[key] = val;
            }
            // If attrs have been passed, but are invalid, abort.
            if (attrs && !this.set(attrs, options)) return false;
            // Abort if there are no ops to send
            if (!this._ops || !this._ops.length) return;
            if (!options) options = {};
            options.attrs = _(this._ops).map(function (op) { return _.omit(op, 'cid'); });
            var model = this;
            // Since we've bypassed the usual save process, we need to trigger 'sync' ourselves
            var success = options.success;
            options.success = function (resp) {
                model._blockSave = false;
                model._ops = null;
                if (success) success(model, resp, options);
                model.trigger('sync', model, resp, options);
            };
            // In case of error, we need to unblock saving.
            var error = options.error;
            options.error = function (xhr, status, msg) {
                model._blockSave = false;
                if (error) error(xhr, status, msg);
            };
            this.sync('patch', this, options);
            this._blockSave = true;
        }
    };

    if (!_super.prototype.serialize && config.overrideToJSON !== false) {
        mixinProps.toJSON = function () {
            var res = _super.prototype.toJSON.apply(this, arguments);
            var keys = _.keys(this[config.modelProperty])
                        .concat(_.keys(this[config.collectionProperty]));
            _.each(keys, function (name) {
                res[name] = this[name].toJSON();
            }, this);
            return res;
        };
    }
    if (config.debug) {
        _.each(mixinProps, function (prop, name) {
            if (typeof prop === 'function') {
                mixinProps[name] = function () {
                    internals.log('[Function %s]:', name, arguments);
                    return prop.apply(this, arguments);
                };
                mixinProps[name]._original = prop;
            }
        });
    }
    internals.mixinProps = mixinProps;
    internals.config = config;
    return _.extend({}, mixinProps, protoProps, {_patcherConfig: config});
};

var internals = module.exports._internals = {
    smartIndexOf: smartIndexOf,
    indexById: indexById,
    makePath: makePath,
    opTemplates: opTemplates
};