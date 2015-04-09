var bind = require('lodash.bind');
var difference = require('lodash.difference');
var each = require('lodash.foreach');
var isRegExp = require('lodash.isregexp');
var keys = require('lodash.keys');
var map = require('lodash.map');
var object = require('lodash.zipobject');
var omit = require('lodash.omit');
var partial = require('lodash.partial');
var where = require('lodash.where');

var utils = require('./utils');

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
    // Since we've bypassed the usual save process, we need to trigger 'sync' ourselves
    var success = options.success;
    options.success = function (resp) {
        model._blockSave = false;
        // TODO: make this handle recursive ops
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