// api/view-screenshot/index.js
// Generates a fresh SAS URL for a private blob on demand
// Uses DefaultAzureCredential — no connection string or account key needed
// Local: az login | Production: Managed Identity

const {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob");
const { DefaultAzureCredential } = require("@azure/identity");
const jwt = require("jsonwebtoken");

const SAS_EXPIRY_MINUTES = 30;

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

  try {
    const credential = new DefaultAzureCredential();
    const accountUrl = process.env.BLOB_ACCOUNT_URL;
    const accountName = accountUrl.replace("https://", "").split(".")[0];

    const blobServiceClient = new BlobServiceClient(accountUrl, credential);

    const startsOn = new Date();
    const expiresOn = new Date(Date.now() + SAS_EXPIRY_MINUTES * 60 * 1000);

    // User delegation key — identity-based, more secure than account key SAS
    const userDelegationKey = await blobServiceClient.getUserDelegationKey(startsOn, expiresOn);

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: "screenshots",
        blobName: blobPath,
        permissions: BlobSASPermissions.parse("r"),
        startsOn,
        expiresOn,
      },
      userDelegationKey,
      accountName
    ).toString();

    const sasUrl = `${accountUrl}/screenshots/${blobPath}?${sasToken}`;
    context.res = { status: 200, body: { sasUrl } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: { error: "Failed to generate view URL: " + err.message } };
  }
};
