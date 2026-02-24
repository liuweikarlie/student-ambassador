// api/upload/index.js
// Uses DefaultAzureCredential — no connection string or account key needed
// Local:      authenticates via "az login"
// Production: authenticates via Managed Identity automatically

const { BlobServiceClient } = require("@azure/storage-blob");
const { DefaultAzureCredential } = require("@azure/identity");

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const SAS_EXPIRY_HOURS = 1;

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

  try {
    // DefaultAzureCredential automatically picks up:
    // - "az login" when running locally
    // - Managed Identity when running in Azure
    const credential = new DefaultAzureCredential();
    const accountUrl = process.env.BLOB_ACCOUNT_URL;

    const blobServiceClient = new BlobServiceClient(accountUrl, credential);
    const containerClient = blobServiceClient.getContainerClient("screenshots");

    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fileName}`;
    const blockBlobClient = containerClient.getBlockBlobClient(uniqueName);

    // Upload to private container
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: mimeType || "image/png" }
    });

    // Generate SAS token using user delegation key (works with Managed Identity)
    // This is more secure than account key SAS — tokens are tied to an identity
    const startsOn = new Date();
    const expiresOn = new Date(Date.now() + SAS_EXPIRY_HOURS * 60 * 60 * 1000);

    const userDelegationKey = await blobServiceClient.getUserDelegationKey(startsOn, expiresOn);

    const { generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require("@azure/storage-blob");

    // Extract account name from URL
    const accountName = accountUrl.replace("https://", "").split(".")[0];

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: "screenshots",
        blobName: uniqueName,
        permissions: BlobSASPermissions.parse("r"),
        startsOn,
        expiresOn,
      },
      userDelegationKey,
      accountName
    ).toString();

    const sasUrl = `${blockBlobClient.url}?${sasToken}`;
    const blobPath = uniqueName;

    context.res = {
      status: 200,
      body: { sasUrl, blobPath, fileName: uniqueName }
    };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: { error: "Upload failed: " + err.message } };
  }
};
