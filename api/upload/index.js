// api/upload/index.js
// Handles screenshot upload → Azure Blob Storage (PRIVATE container)
// Returns a short-lived SAS URL for immediate viewing
// Blob itself is never publicly accessible — only via signed URLs

const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require("@azure/storage-blob");

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const SAS_EXPIRY_HOURS = 1; // SAS URL valid for 1 hour after upload

function generateSasUrl(accountName, accountKey, containerName, blobName) {
  const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

  const sasOptions = {
    containerName,
    blobName,
    permissions: BlobSASPermissions.parse("r"), // read-only
    expiresOn: new Date(Date.now() + SAS_EXPIRY_HOURS * 60 * 60 * 1000),
  };

  const sasToken = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential).toString();
  return `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasToken}`;
}

module.exports = async function (context, req) {
  if (req.method !== "POST") {
    context.res = { status: 405, body: "Method not allowed" };
    return;
  }

  const { fileName, fileData, mimeType } = req.body || {};
  if (!fileName || !fileData) {
    context.res = { status: 400, body: { error: "fileName and fileData (base64) required" } };
    return;
  }

  const buffer = Buffer.from(fileData, "base64");
  if (buffer.byteLength > MAX_SIZE_BYTES) {
    context.res = { status: 413, body: { error: "File too large. Max 10MB." } };
    return;
  }

  // Parse account name and key from connection string
  // Connection string format: DefaultEndpointsProtocol=https;AccountName=xxx;AccountKey=yyy;...
  const connStr = process.env.BLOB_CONNECTION_STRING || "";
  const accountNameMatch = connStr.match(/AccountName=([^;]+)/);
  const accountKeyMatch = connStr.match(/AccountKey=([^;]+)/);

  if (!accountNameMatch || !accountKeyMatch) {
    context.res = { status: 500, body: { error: "Blob storage not configured correctly" } };
    return;
  }

  const accountName = accountNameMatch[1];
  const accountKey = accountKeyMatch[1];

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
    const containerClient = blobServiceClient.getContainerClient("screenshots");

    // Unique filename to prevent collisions
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fileName}`;
    const blockBlobClient = containerClient.getBlockBlobClient(uniqueName);

    // Upload to private container
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: mimeType || "image/png" }
    });

    // Generate a short-lived SAS URL for immediate viewing
    const sasUrl = generateSasUrl(accountName, accountKey, "screenshots", uniqueName);

    // IMPORTANT: we store the BLOB PATH (not the SAS URL) in Cosmos DB
    // The SAS URL is only returned once for immediate confirmation display
    // Admin viewing is handled by /api/view-screenshot which generates fresh SAS URLs on demand
    const blobPath = uniqueName;

    context.res = {
      status: 200,
      body: {
        sasUrl,        // short-lived, for immediate display after upload
        blobPath,      // permanent identifier stored in Cosmos DB
        fileName: uniqueName
      }
    };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: { error: "Upload failed" } };
  }
};
