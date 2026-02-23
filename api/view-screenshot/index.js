// api/view-screenshot/index.js
// Generates a fresh SAS URL for a private blob on demand
// Called when admin clicks "View" on a submission
// Requires authentication — only ambassadors/admins can view screenshots

const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob");
const jwt = require("jsonwebtoken");

const SAS_EXPIRY_MINUTES = 30; // URL valid for 30 minutes per view request

function verifyToken(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.replace("Bearer ", "");
  if (!token) return null;
  try { return jwt.verify(token, process.env.JWT_SECRET); }
  catch { return null; }
}

module.exports = async function (context, req) {
  if (req.method !== "GET") {
    context.res = { status: 405, body: "Method not allowed" };
    return;
  }

  // Must be logged in to view screenshots
  const user = verifyToken(req);
  if (!user) {
    context.res = { status: 401, body: { error: "Unauthorized" } };
    return;
  }

  const blobPath = req.query.blobPath;
  if (!blobPath) {
    context.res = { status: 400, body: { error: "blobPath query param required" } };
    return;
  }

  const connStr = process.env.BLOB_CONNECTION_STRING || "";
  const accountNameMatch = connStr.match(/AccountName=([^;]+)/);
  const accountKeyMatch = connStr.match(/AccountKey=([^;]+)/);

  if (!accountNameMatch || !accountKeyMatch) {
    context.res = { status: 500, body: { error: "Blob storage not configured" } };
    return;
  }

  const accountName = accountNameMatch[1];
  const accountKey = accountKeyMatch[1];

  try {
    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
    const sasOptions = {
      containerName: "screenshots",
      blobName: blobPath,
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + SAS_EXPIRY_MINUTES * 60 * 1000),
    };
    const sasToken = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential).toString();
    const sasUrl = `https://${accountName}.blob.core.windows.net/screenshots/${blobPath}?${sasToken}`;

    context.res = { status: 200, body: { sasUrl } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: { error: "Failed to generate view URL" } };
  }
};
