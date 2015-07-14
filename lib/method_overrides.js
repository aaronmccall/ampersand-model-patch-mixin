var bind = require('lodash.bind');
var difference = require('lodash.difference');
var each = require('lodash.foreach');
var isObject = require('lodash.isobject');
var isRegExp = require('lodash.isregexp');
var keys = require('lodash.keys');
var map = require('lodash.map');
var object = require('lodash.zipobject');
var omit = require('lodash.omit');
var partial = require('lodash.partial');
var where = require('lodash.where');

var utils = require('./utils');

exports._getEventBubblingHandler = function (_super, propertyName) {
    var superBubbler;
    if (!this[propertyName].isCollection) superBubbler = _super.prototype._getEventBubblingHandler.call(this, propertyName);
    return bind(function (name, model, newValue, op) {
        var config = this._patcherConfig;
        if (superBubbler) superBubbler(name, model, newValue);
        var collection, index, opArgs, ignorePaths, ignoreLength, ignoreTest;
        if (name.indexOf('patcher:') !== -1 && op) {
            if ((ignorePaths = config.ignorePaths) && (ignoreLength = ignorePaths.length)) {
                for (var i=0; i<ignoreLength; i++) {
                    ignoreTest = ignorePaths[i];
                    if (typeof ignoreTest === 'string' && ignoreTest.indexOf(op.path) !== -1) {
                        return;
                    }
                    if (typeof ignoreTest === 'function' && !ignoreTest(op.path)) {
                        return;
                    }
                    if (isRegExp(ignoreTest) && ignoreTest.test(op.path)) {
                        return;
                    }
                }
            }
            collection = this[propertyName].isCollection ? this[propertyName] : null;
            child = this[propertyName].isState ? this[propertyName] : null;
            if (op.op === 'remove' || name.indexOf('op-removed') !== -1) {
                var ops = this._getOps();
                var removeOps = where(ops, {cid: op.cid});
                this._setOps(difference(ops, removeOps));
                each(removeOps, function(op) {
                    this.trigger('patcher:op-removed', model, 1, op);
                }, this);
            }
            if (collection) {
                index = this._modelIndex(model, propertyName);
                if (model.isNew() && ['add', 'replace'].indexOf(op.op) !== -1) {
                    opArgs = ['add', utils.makePath(propertyName, '-'), model.serialize()];
                } else {
                    opArgs = [op.op, utils.makePath(propertyName, (index === -1 ? collection.indexOf(model) : index), op.path)];
                    if ('value' in op) opArgs.push(op.value);
                }
            }
            if (child) {
                if (model.isNew() && ['add', 'replace'].indexOf(op.op) !== -1) {
                    opArgs = ['add', utils.makePath(propertyName), model.serialize()];
                } else {
                    opArgs = [op.op, utils.makePath(propertyName, op.path)];
                    if ('value' in op) opArgs.push(op.value);
                }
            }
            
            if (opArgs) {
                opArgs.push(op.cid);
                return this._queueOp.apply(this, opArgs);
            }
            this.trigger.apply(this, arguments);
        }
    }, this);
};

exports._initCollections = function (_super) {
    _super.prototype._initCollections.call(this);
    var coll;
    for (coll in this._collections) {
        this.listenTo(this[coll], 'all', this._getEventBubblingHandler(coll));
    }
};

exports.parse = function (_super, response, options) {
    options = options || {};
    var parsed = _super.prototype.parse.call(this, response, options);
    if (parsed && options && options.parse === true && !options._patcherParsed) {
        this[this._patcherConfig.originalProperty] = parsed;
        options._patcherParsed = true;
    }
    return parsed;
};

exports.save = function (_super, key, val, options) {
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
    if (!this._getOps().length) return;
    if (!options) options = {};
    options.attrs = map(this._ops, function (op) {
        return omit(op, 'cid');
    });
    var model = this;
    if (options.parse === void 0) options.parse = true;
    // Since we've bypassed the usual save process, we need to trigger 'sync' ourselves
    var success = options.success;
    options.success = function (resp) {
        model._blockSave = false;
        // TODO: make this handle recursive ops
        if (model._resetOps) model._resetOps();
        var serverAttrs = resp && model.parse(resp, options);
        if (isObject(serverAttrs) && !model.set(serverAttrs, options)) {
            return false;
        }
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
};

exports.toJSON = function (_super) {
    var res = _super.prototype.toJSON.apply(this, arguments);
    var config = this._patcherConfig;
    var childKeys = keys(this[config.modelProperty])
                .concat(keys(this[config.collectionProperty]));
    each(childKeys, function (name) {
        if (this[name] && this[name].toJSON) return res[name] = this[name].toJSON();
    }, this);
    return res;
}

exports.getMethods = function (list, _super) {
    return object(list, map(list, function (key) { return partial(exports[key], _super); }));
}