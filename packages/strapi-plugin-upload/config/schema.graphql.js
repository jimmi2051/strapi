const path = require('path');
const _ = require('lodash');
const crypto = require('crypto');
const toArray = require('stream-to-array');
const uuid = require('uuid/v4');

function niceHash(buffer) {
  return crypto
    .createHash('sha256')
    .update(buffer)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\//g, '-')
    .replace(/\+/, '_');
}

module.exports = {
  mutation: `
    upload(refId: ID, ref: String, field: String, source: String, file: Upload!): UploadFile!
    multipleUpload(refId: ID, ref: String, field: String, source: String, files: [Upload]!): [UploadFile]!
  `,
  resolver: {
    Query: {
      file: false,
      files: {
        resolver: 'plugins::upload.upload.find',
      },
    },
    Mutation: {
      createFile: false,
      updateFile: false,
      deleteFile: false,
      upload: {
        description: 'Upload one file',
        resolverOf: 'plugins::upload.upload.upload',
        resolver: async (obj, { file: upload, ...fields }) => {
          const file = await formatFile(upload, fields);

          const uploadedFiles = await strapi.plugins.upload.services.upload.upload([file]);

          // Return response.
          return uploadedFiles.length === 1 ? uploadedFiles[0] : uploadedFiles;
        },
      },
      multipleUpload: {
        description: 'Upload one file',
        resolverOf: 'plugins::upload.upload.upload',
        resolver: async (obj, { files: uploads, ...fields }) => {
          const files = await Promise.all(uploads.map(upload => formatFile(upload, fields)));

          const uploadedFiles = await strapi.plugins.upload.services.upload.upload(files);

          // Return response.
          return uploadedFiles;
        },
      },
    },
  },
};

const formatFile = async (upload, fields) => {
  const { filename, mimetype, createReadStream } = await upload;

  const stream = createReadStream();

  const parts = await toArray(stream);
  const buffers = parts.map(part => (_.isBuffer(part) ? part : Buffer.from(part)));

  const buffer = Buffer.concat(buffers);

  const fileData = {
    name: filename,
    sha256: niceHash(buffer),
    hash: uuid().replace(/-/g, ''),
    ext: path.extname(filename),
    buffer,
    mime: mimetype,
    size: Math.round((stream.size / 1000) * 100) / 100,
  };

  const { refId, ref, source, field } = fields;

  // Add details to the file to be able to create the relationships.
  if (refId && ref && field) {
    fileData.related = [
      {
        refId,
        ref,
        source,
        field,
      },
    ];
  }

  return fileData;
};
