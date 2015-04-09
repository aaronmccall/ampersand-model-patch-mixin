/*jshint eqnull: true */
var bind = require('lodash.bind');
var defaults = require('lodash.defaults');
var difference = require('lodash.difference');
var each = require('lodash.foreach');
var extend = require('lodash.assign');
var findWhere = require('lodash.findwhere');
var isEmpty = require('lodash.isempty');
var isEqual = require('lodash.isequal');
var isObject = require('lodash.isobject');
var keys = require('lodash.keys');
var map = require('lodash.map');
var object = require('lodash.zipobject');
var omit = require('lodash.omit');
var partial = require('lodash.partial');
var toArray = require('lodash.toarray');
var where = require('lodash.where');
var kisslog = require('kisslog');

var utils = require('./lib/utils');

var opPathValue = ['op', 'path', 'value', 'cid'];
var opTemplates = {
    add: opPathValue,
    remove: ['op', 'path', 'cid'],
    replace: opPathValue
};

module.exports = function (_super, protoProps) {
    var config = (protoProps && protoProps._patcherConfig) || {};

    var log = internals.log = kisslog(config);

    defaults(config, {
        originalProperty: '_original',
        modelProperty: '_children',
        collectionProperty: '_collections'
    });
    log('config:', config);
    var mixinProps = {
        _patcherConfig: config,
        initPatcher: function (_attrs) {
            var attrs = _attrs || this.attributes;
            var idOnlyTest = {};
            idOnlyTest[this.idAttribute] = this[this.idAttribute];
            // No need to queue ops if root model is new or only id is populated
            if (this.isNew() || isEqual(attrs, idOnlyTest)) {
                log('new or only id');
                // Re-run after first save or first sync if only attr is id
                this.listenToOnce(this, 'sync', this.initPatcher);
                return;
            }
            // If not new AND bootstrapped
            if (isObject(attrs) && !isEmpty(attrs) && attrs !== this) {
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
                each(this[config.collectionProperty], function (x, name) {
                    // 1. Watch for added members and queue an add op for them.
                    this.listenTo(this[name], 'add', bind(this._queueModelAdd, this, makePath(name, '-')));
                    // 2. Watch for changes to member models,
                    this.listenTo(this[name], 'change', partial(this._changeCollectionModel, name));
                    // 3. Watch for removed members and queue a remove op for them.
                    this.listenTo(this[name], 'remove', function (model) {
                        // Unqueue previous ops
                        var prevOps = where(this._ops, {cid: model.cid});
                        if (prevOps.length) this._ops = difference(this._ops, prevOps);
                        // For new models just return
                        if (model.isNew()) return;
                        var index = this._modelIndex(model, name);
                        this._queueOp('remove', makePath(name, index), model.cid);
                    });
                }, this);
            }
            if (this[config.modelProperty]) {
                log('initializing children watching');
                each(this[config.modelProperty], function (x, name) {
                    var model = this[name];
                    if (model.isNew()) {
                        this._queueModelAdd(makePath(name), model);
                    }
                    // 1. Watch for changes to child models,
                    this.listenTo(model, 'change', function (model) {
                        // and queue a replace op for each changed attribute
                        each(this._getChanged(model), function (val, key) {
                            if (model.isNew()) {
                                var addOp = findWhere(this._ops, {cid: model.cid});
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
                        var addOp = where(this._ops, {cid: model.cid});
                        if (addOp.length) this._ops = difference(this._ops, addOp);
                        if (model.isNew()) return;
                        this._queueOp('remove', makePath(name), model.cid);
                    });
                }, this);
            }
            this.listenTo(this, 'change', function (self) {
                var changed = this._getChanged(self);
                each(changed, function (val, key) {
                    this._queueOp('replace', utils.makePath(key), val, self.cid);
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
            options.attrs = map(this._ops, function (op) {
                return omit(op, 'cid');
            });
            var model = this;
            // Since we've bypassed the usual save process, we need to trigger 'sync' ourselves
            var success = options.success;
            options.success = function (resp) {
                model._blockSave = false;
                if (model._resetOps) model._resetOps();
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
        },
        _modelIndex: function (model, collectionName) {
            log('_modelIndex called with %o, %s', model, collectionName);
            if (!model) return -1;
            if (model.isNew()) return log('model is new'), -1;
            if (!collectionName) {
                each(keys(this[config.collectionProperty]), function (name) {
                    if (this[name] === model.collection) collectionName = name;
                }, this);
            }
            return utils.indexById(this[config.originalProperty][collectionName], model.id);
        },
        _getOps: function () {
            return this._ops || this._setOps([]);
        },
        _setOps: function (ops) {
            this._ops = ops;
            return this._ops;
        },
        _resetOps: function () {
            this._setOps([]);
        },
        _queueOp: function (op, path, value, cid) {
            if (!opTemplates[op]) return;
            var operation = object(opTemplates[op], toArray(arguments));
            var ops = this._getOps();
            // If we already have a replace op for this path, just update it
            if (op === 'replace' || op === 'add') {
                var dupe = findWhere(ops, { op: op, path: path, cid: cid });
                if (dupe) return extend(dupe, operation);
            }
            ops.push(operation);
            this.trigger('patcher:op-count', this, ops.length);
        },
        _queueModelAdd: function (path, model) {
            if (!model.isNew() && !model.collection) return;
            this._queueOp('add', path, model.toJSON(), model.cid);
        },
        _changeCollectionModel: function (root, model) {
            // If the model is an add, just update its add payload and return
            var addOp = findWhere(this._ops, {cid: model.cid, op: 'add'});
            if (addOp) {
                addOp.value = model.toJSON();
                return;
            }
            var index = this._modelIndex(model, root);
            // and queue a replace op for each changed attribute
            each(this._getChanged(model), function (val, key) {
                this._queueOp('replace', makePath(root, index, key), val, model.cid);
            }, this);

        },
        _getOriginal: function () {
            return omit(this[config.originalProperty], config.ignoreProps);
        },
        _setOriginal: function (data) {
            this[config.originalProperty] = data;
        },
        _getChanged: function (model) {
            if (!model) return;
            if (!model.isState) return model.changedAttributes();
            return this._omitSession(model, model.changedAttributes());
        },
        _omitSession: function (model, props) {
            if (!model || !props) return;
            var payload = {};
            each(props, function (prop, key) {
                var def = model._definition[key] || {};
                if (def.session) return;
                if (!def.session) payload[key] = prop;
            });
            return payload;
        }
    };

    if (!_super.prototype.serialize && config.overrideToJSON !== false) {
        mixinProps.toJSON = function () {
            var res = _super.prototype.toJSON.apply(this, arguments);
            var childKeys = keys(this[config.modelProperty])
                        .concat(keys(this[config.collectionProperty]));
            each(childKeys, function (name) {
                if (this[name] && this[name].toJSON) return res[name] = this[name].toJSON();
                console.log('%s has no toJSON:', name);
            }, this);
            return res;
        };
    }
    if (config.debug) {
        each(mixinProps, function (prop, name) {
            if (typeof prop === 'function') {
                mixinProps[name] = function () {
                    internals.log('[Function %s]: %o', name, arguments);
                    return prop.apply(this, arguments);
                };
                mixinProps[name]._original = prop;
            }
        });
    }
    internals.mixinProps = mixinProps;
    internals.config = config;
    return extend({}, mixinProps, protoProps);
};

var internals = module.exports._internals = {
    smartIndexOf: utils.smartIndexOf,
    indexById: utils.indexById,
    makePath: utils.makePath,
    opTemplates: opTemplates
};