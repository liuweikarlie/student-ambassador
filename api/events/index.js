// api/events/index.js
const { events } = require("../shared/cosmos");
const jwt = require("jsonwebtoken");

function verifyToken(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.replace("Bearer ", "");
  if (!token) return null;
  try { return jwt.verify(token, process.env.JWT_SECRET); }
  catch { return null; }
}

module.exports = async function (context, req) {
  const user = verifyToken(req);
  if (!user) {
    context.res = { status: 401, body: { error: "Unauthorized" } };
    return;
  }

  // GET — admin sees all, ambassador sees only their events
  if (req.method === "GET") {
    try {
      let query;
      if (user.role === "admin") {
        query = { query: "SELECT * FROM c ORDER BY c.createdAt DESC" };
      } else {
        query = {
          query: "SELECT * FROM c WHERE ARRAY_CONTAINS(c.ambassadorIds, @id) ORDER BY c.createdAt DESC",
          parameters: [{ name: "@id", value: user.id }]
        };
      }
      const { resources } = await events.items.query(query).fetchAll();
      context.res = { status: 200, body: resources };
    } catch (err) {
      context.log.error(err);
      context.res = { status: 500, body: { error: "Failed to fetch events" } };
    }
    return;
  }

  // POST — create event (any authenticated ambassador or admin)
  if (req.method === "POST") {
    const { title, campus, date, totalAudience, ambassadorIds } = req.body || {};
    if (!title || !campus || !date || !totalAudience || !ambassadorIds?.length) {
      context.res = { status: 400, body: { error: "Missing required fields" } };
      return;
    }
    // Ensure the creator is always in ambassadorIds
    const ids = ambassadorIds.includes(user.id)
      ? ambassadorIds
      : [user.id, ...ambassadorIds];

    const newEvent = {
      id: Math.random().toString(36).slice(2, 10),
      title, campus, date,
      totalAudience: parseInt(totalAudience),
      ambassadorIds: ids,
      qrCode: Math.random().toString(36).slice(2, 10),
      createdAt: Date.now()
    };
    await events.items.create(newEvent);
    context.res = { status: 201, body: newEvent };
    return;
  }

  context.res = { status: 405, body: "Method not allowed" };
};
