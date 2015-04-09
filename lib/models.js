var difference = require('lodash.difference');
var each = require('lodash.foreach');
var findWhere = require('lodash.findwhere');
var partial = require('lodash.partial');
var where = require('lodash.where');
var makePath = require('./utils').makePath;

exports._changeChild = function (name, model) {
    if (!model) return;
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
};

exports._destroyChild = function (name, model) {
    if (!model) return;
    // Throw away any edits to this model since we're destroying it.
    var addOp = where(this._ops, {cid: model.cid});
    if (addOp.length) this._ops = difference(this._ops, addOp);
    if (model.isNew()) return;
    this._queueOp('remove', makePath(name), model.cid);
};

exports._initChildWatchers = function () {
    var children = this[this._patcherConfig.modelProperty];
    if (children) {
        each(children, function (x, name) {
            var model = this[name];
            if (!this.isNew() && model.isNew()) {
                this._queueModelAdd(makePath(name), model);
            }
            // 1. Watch for changes to child models,
            this.listenTo(model, 'change', partial(this._changeChild, name));
            // 2. Watch for removed members and queue a remove op for them.
            this.listenTo(model, 'destroy', partial(this._destroyChild, name));
        }, this);
    }
};