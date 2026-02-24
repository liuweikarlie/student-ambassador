// api/test-cosmos/index.js
// Verifies that the Cosmos DB connection (via shared/cosmos.js) is working
// by performing a lightweight metadata read on each container.
const { ambassadors, events, submissions, admins } = require("../shared/cosmos");

const containers = { ambassadors, events, submissions, admins };

module.exports = async function (context, req) {
  const results = {};
  let allOk = true;

  for (const [name, container] of Object.entries(containers)) {
    try {
      // fetchAll on a COUNT query is the cheapest round-trip that exercises auth + network
      await container.items
        .query({ query: "SELECT VALUE COUNT(1) FROM c" })
        .fetchAll();
      results[name] = { status: "ok" };
    } catch (err) {
      allOk = false;
      results[name] = {
        status: "error",
        message: err.message,
        code: err.code ?? err.statusCode ?? null,
      };
    }
  }

  context.res = {
    status: allOk ? 200 : 500,
    headers: { "Content-Type": "application/json" },
    body: {
      connected: allOk,
      endpoint: process.env.COSMOS_ENDPOINT || "(COSMOS_ENDPOINT not set)",
      containers: results,
      timestamp: new Date().toISOString(),
    },
  };
};
