var difference = require('lodash.difference');
var each = require('lodash.foreach');
var findWhere = require('lodash.findwhere');
var partial = require('lodash.partial');
var where = require('lodash.where');
var makePath = require('./utils').makePath;

exports._changeCollectionModel = function (name, model) {
    if (!model) return;
    // If the model is an add, just update its add payload and return
    var addOp = findWhere(this._getOps(), {cid: model.cid, op: 'add'});
    if (addOp) {
        addOp.value = model.toJSON();
        return this.trigger('patcher:op-changed', this, 1, addOp);
    }
    var index = this._modelIndex(model, name);
    // and queue a replace op for each changed attribute
    each(this._getChanged(model), function (val, key) {
        var noPrev = typeof model.previous(key) === 'undefined';
        this._queueOp(noPrev ? 'add' : 'replace', makePath(name, index, key), val, model.cid);
    }, this);

}

exports._removeCollectionModel = function (name, model) {
    if (!model) return;
    // Unqueue any previous ops
    var prevOps = where(this._getOps(), {cid: model.cid});
    if (prevOps.length) this._setOps(difference(this._ops, prevOps));
    // For new models trigger op-removed and return
    if (model.isNew()) {
         each(prevOps, function (op) {
            this.trigger('patcher:op-removed', model, 1, op);
        }, this);
         return;
    }
    var index = this._modelIndex(model, name);
    this._queueOp('remove', makePath(name, index), model.cid);
}

exports._initCollectionWatchers = function () {
    var collections = this[this._patcherConfig.collectionProperty];
    if (collections) {
        // For every child collection:
        each(collections, function (x, name) {
            // 1. Watch for added members and queue an add op for them.
            this.listenTo(this[name], 'add', partial(this._queueModelAdd, makePath(name, '-')));
            // 2. Watch for changes to member models,
            this.listenTo(this[name], 'change', partial(this._changeCollectionModel, name));
            // 3. Watch for removed members and queue a remove op for them.
            this.listenTo(this[name], 'remove', partial(this._removeCollectionModel, name));
        }, this);
    }
};