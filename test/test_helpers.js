/*jshint expr:true*/
var random = require('lodash.random');
var range = require('lodash.range');
var Lab = require('lab');
var sinon = require('sinon');
var patcherMixin = require('../');
var expect = Lab.expect;

var lab = exports.lab = Lab.script();

var describe = lab.experiment;
var it = lab.test;
var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;

function wrapDone(fn) {
    return function (done) {
        fn();
        done();
    };
}

describe('patch-mixin helpers', function () {

    describe('indexById', function () {
        var indexById = patcherMixin._internals.indexById;
        var array = [{id: 1}, {id: 2}];
        it('returns -1 if array is falsy', wrapDone(function () {
            expect(indexById(null, 1)).to.equal(-1);
        }));
        it('returns -1 if array has no object with matching id property', wrapDone(function () {
            expect(indexById(array, 3)).to.equal(-1);
        }));
        it('returns index of object with matching id property', wrapDone(function () {
            expect(indexById(array, 2)).to.equal(1);
        }));
    });

    describe('makePath', function () {
        var makePath = patcherMixin._internals.makePath;
        it('eliminates double-slashes "//"', wrapDone(function () {
            expect(makePath('', 'foo', '', '', 'bar', '', '')).to.equal('/foo/bar');
        }));

        it('eliminates trailing slashes', wrapDone(function () {
            expect(makePath('', 'foo', 'bar/')).to.equal('/foo/bar');
        }));

        it('creates a path with as many segments as its non-empty arguments', wrapDone(function () {
            var ranges = range(2).map(function () {
                return range(random(1, 10));
            });
            expect(ranges.length).to.equal(2);
            ranges.forEach(function (range) {
                var path = makePath.apply(null, range);
                var segmentMatch = path.match(/(\/\w+)/g);
                expect(segmentMatch.length).to.equal(range.length, segmentMatch);
            });
        }));
    });

    describe('smartIndexOf', function () {
        var smartIndexOf = patcherMixin._internals.smartIndexOf;
        it('returns -1 if array is falsy', wrapDone(function () {
            expect(smartIndexOf(null, function () { return true; })).to.equal(-1);
        }));
        it('returns -1 if test is falsy', wrapDone(function () {
            expect(smartIndexOf([1,2,3], null)).to.equal(-1);
        }));
        it('uses a test function to perform matching', wrapDone(function () {
            expect(smartIndexOf([1,2,3], function () { return false; })).to.equal(-1);
            var pattern = /bar/;
            expect(smartIndexOf(['foo', 'bar', 'baz'], pattern.test.bind(pattern))).to.equal(1);
        }));
        it('returns the index of the first item that the test returns truthily for', wrapDone(function () {
            var array = ['foo', 'bar', 'baz'];
            var pattern = /ba/;
            expect(array.filter(pattern.test.bind(pattern)).length).to.equal(2);
            expect(smartIndexOf(array, pattern.test.bind(pattern))).to.equal(1);
        }));
    });

    it('config.debug adds call logging to every mixin method', function (done) {
        var oldLog = console.log;
        console.log = sinon.spy();
        patcherMixin({ prototype: {} }, { _patcherConfig: { debug: true } });
        var log = sinon.spy(patcherMixin._internals, 'log');
        var props = patcherMixin._internals.mixinProps;
        var throwers = [
            '_queueModelAdd',
            '_changeCollectionModel',
            'initPatcher',
            'parse',
            'save',
            'toJSON'
        ];
        Object.keys(props).forEach(function (prop) {
            log.reset();
            if (typeof props[prop] !== 'function') return;
            if (throwers.indexOf(prop) === -1) {
                props[prop]();
            } else {
                expect(props[prop]).to.throw(TypeError);
            }
            expect(log.called).to.equal(true);
            expect(log.firstCall.args[1]).to.equal(prop);
        });
        patcherMixin._internals.log.restore();
        console.log = oldLog;
        done();
    });

});