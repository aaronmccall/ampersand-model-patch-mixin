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
exports.smartIndexOf = smartIndexOf;

// Returns index of object with matching id property
function indexById(array, id) {
    if (!array) return -1;
    return smartIndexOf(array, function (obj) {
        return obj.id === id;
    });
}
exports.indexById = indexById;

// Creates PATCH paths from arguments
// e.g., makePath('foo', 0, 'bar') => '/foo/0/bar'
function makePath() {
    var path = [''];
    for (var i=0,l=arguments.length,arg,argType; i<l; i++) {
        arg = arguments[i];
        argType = typeof arg;
        if (argType === 'string' || (argType === 'number' && !isNaN(arg))) {
            arg = String(arg);
            if (arg.length) path.push(arg.replace(/^\/|\/$/g, ''));
        }
    }
    return path.join('/').replace(/\/$/, '');
}
exports.makePath = makePath;