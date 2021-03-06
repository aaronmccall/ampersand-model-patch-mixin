/*jshint eqnull: true */
var defaults = require('lodash.defaults');
var difference = require('lodash.difference');
var each = require('lodash.foreach');
var extend = require('lodash.assign');
var findWhere = require('lodash.findwhere');
var isEmpty = require('lodash.isempty');
var isEqual = require('lodash.isequal');
var isObject = require('lodash.isobject');
var keys = require('lodash.keys');
var object = require('lodash.zipobject');
var omit = require('lodash.omit');
var toArray = require('lodash.toarray');
var kisslog = require('kisslog');

var collectionHandlers = require('./lib/collections');
var modelHandlers = require('./lib/models');
var utils = require('./lib/utils');
var methodOverrides = require('./lib/method_overrides');

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
            // If we've already initialized before, we don't want to re-add
            // the add/change/remove/destroy watchers
            if (this._patcherInitialized) return;
            // If not, let's initialize them
            this._patcherInitialized = true;
            this._initCollectionWatchers();
            this._initChildWatchers();

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
        _modelIndex: function (model, collectionName) {
            log('_modelIndex called with %o, %s', model, collectionName);
            if (!model || !this[config.originalProperty]) return log('no model or no %s', config.originalProperty), -1;
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
            } else if (op === 'remove') {
                var add = findWhere(ops, { op: 'add', path: path, cid: cid });
                if (add) {
                    this._setOps(difference(ops, [add]));
                    this.trigger('patcher:op-removed', this, 1, add);
                }
            }
            ops.push(operation);
            this.trigger('patcher:op-count', this, ops.length, operation);
        },
        _queueModelAdd: function (path, model) {
            if (!model.isNew() && !model.collection) return;
            this._queueOp('add', path, model.toJSON(), model.cid);
        },
        _getOriginal: function () {
            return omit(this[config.originalProperty], config.ignoreProps);
        },
        _setOriginal: function (data) {
            return this[config.originalProperty] = data;
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
    var methodOverrideKeys = ['parse', 'save'];
    if (_super.prototype._getEventBubblingHandler) {
        methodOverrideKeys.push('_getEventBubblingHandler', '_initCollections');
    }
    if (!_super.prototype.serialize && config.overrideToJSON !== false) {
        methodOverrideKeys.push('toJSON');
    }

    // Compose our final mixinProps payload
    extend(mixinProps, collectionHandlers, modelHandlers, methodOverrides.getMethods(methodOverrideKeys, _super));
    if (config.debug) {
        // Add debug logging wrapper
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