// api/submissions/index.js
const { submissions } = require("../shared/cosmos");
const jwt = require("jsonwebtoken");

function verifyToken(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.replace("Bearer ", "");
  if (!token) return null;
  try { return jwt.verify(token, process.env.JWT_SECRET); }
  catch { return null; }
}

module.exports = async function (context, req) {

  // POST — public endpoint, no auth needed (audience submits proof via QR link)
  if (req.method === "POST") {
    const { eventId, email, campus, blobPath, screenshotName } = req.body || {};
    if (!eventId || !email || !campus || !blobPath) {
      context.res = { status: 400, body: { error: "Missing required fields" } };
      return;
    }
    const newSub = {
      id: Math.random().toString(36).slice(2, 10),
      eventId, email, campus,
      blobPath,        // private blob identifier — used to generate SAS URLs on demand
      screenshotName,
      uploadedAt: Date.now()
    };
    await submissions.items.create(newSub);
    context.res = { status: 201, body: newSub };
    return;
  }

  // GET — requires auth
  const user = verifyToken(req);
  if (!user) {
    context.res = { status: 401, body: { error: "Unauthorized" } };
    return;
  }

  if (req.method === "GET") {
    try {
      const eventId = req.query.eventId;
      let query;
      if (eventId) {
        query = {
          query: "SELECT * FROM c WHERE c.eventId = @eventId ORDER BY c.uploadedAt DESC",
          parameters: [{ name: "@eventId", value: eventId }]
        };
      } else {
        query = { query: "SELECT * FROM c ORDER BY c.uploadedAt DESC" };
      }
      const { resources } = await submissions.items.query(query).fetchAll();
      context.res = { status: 200, body: resources };
    } catch (err) {
      context.log.error(err);
      context.res = { status: 500, body: { error: "Failed to fetch submissions" } };
    }
    return;
  }

  context.res = { status: 405, body: "Method not allowed" };
};
