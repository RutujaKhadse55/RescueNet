module.exports = {
  create: function (filename, options) {
    const type = (options && options.type) || 'attachment';
    if (!filename) return type;
    return `${type}; filename="${filename}"`;
  },
  parse: function () {
    return { type: 'attachment', parameters: {} };
  },
};
