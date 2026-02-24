const { CosmosClient } = require("@azure/cosmos");
const { ManagedIdentityCredential } = require("@azure/identity");

if (!process.env.COSMOS_ENDPOINT) {
  throw new Error("Missing Cosmos config. Set COSMOS_ENDPOINT.");
}

const credential = process.env.AZURE_CLIENT_ID
  ? new ManagedIdentityCredential(process.env.AZURE_CLIENT_ID)
  : new ManagedIdentityCredential();

const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  aadCredentials: credential,
});

const db = client.database("AmbassadorDB");

module.exports = {
  ambassadors: db.container("ambassadors"),
  events:      db.container("events"),
  submissions: db.container("submissions"),
  admins:      db.container("admins"),
};
