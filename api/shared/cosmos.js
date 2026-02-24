const { CosmosClient } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");

const credential = new DefaultAzureCredential();

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
