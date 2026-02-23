// api/shared/cosmos.js
const { CosmosClient } = require("@azure/cosmos");

const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const db = client.database("AmbassadorDB");

module.exports = {
  ambassadors: db.container("ambassadors"),
  events:      db.container("events"),
  submissions: db.container("submissions"),
  admins:      db.container("admins"),
};
