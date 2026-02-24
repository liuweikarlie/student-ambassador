// api/ambassadors/index.js
const { ambassadors } = require("../shared/cosmos");
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

  // GET — list all ambassadors (admin only)
  if (req.method === "GET") {
    if (user.role !== "admin") {
      context.res = { status: 403, body: { error: "Forbidden" } };
      return;
    }
    try {
      const { resources } = await ambassadors.items
        .query({ query: "SELECT * FROM c ORDER BY c.name ASC" })
        .fetchAll();
      // Strip password before returning
      const safe = resources.map(({ password, ...rest }) => rest);
      context.res = { status: 200, body: safe };
    } catch (err) {
      context.log.error(err);
      context.res = { status: 500, body: { error: "Failed to fetch ambassadors" } };
    }
    return;
  }

  // POST — create ambassador (admin only)
  if (req.method === "POST") {
    if (user.role !== "admin") {
      context.res = { status: 403, body: { error: "Forbidden" } };
      return;
    }
    const { name, email, password, campus } = req.body || {};
    if (!name || !email || !password || !campus) {
      context.res = { status: 400, body: { error: "name, email, password, and campus are required" } };
      return;
    }
    try {
      // Check if email already exists
      const { resources: existing } = await ambassadors.items
        .query({ query: "SELECT c.id FROM c WHERE c.email = @email", parameters: [{ name: "@email", value: email }] })
        .fetchAll();
      if (existing.length > 0) {
        context.res = { status: 409, body: { error: "An ambassador with this email already exists" } };
        return;
      }
      const newAmb = {
        id: Math.random().toString(36).slice(2, 10),
        name, email, password, campus,
        createdAt: Date.now(),
      };
      await ambassadors.items.create(newAmb);
      const { password: _, ...safe } = newAmb;
      context.res = { status: 201, body: safe };
    } catch (err) {
      context.log.error(err);
      context.res = { status: 500, body: { error: "Failed to create ambassador" } };
    }
    return;
  }

  context.res = { status: 405, body: "Method not allowed" };
};
