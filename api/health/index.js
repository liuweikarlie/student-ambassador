// api/health/index.js
// Lightweight deployment health check — no auth, no DB required.
module.exports = async function (context, req) {
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      status: "ok",
      message: "API is deployed and running",
      timestamp: new Date().toISOString(),
      environment: process.env.AZURE_FUNCTIONS_ENVIRONMENT || "unknown",
      cosmosEndpointConfigured: !!process.env.COSMOS_ENDPOINT,
      jwtSecretConfigured: !!process.env.JWT_SECRET,
    },
  };
};
