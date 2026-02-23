// api/auth/index.js
const { admins, ambassadors } = require("../shared/cosmos");
const jwt = require("jsonwebtoken");

module.exports = async function (context, req) {
  if (req.method !== "POST") {
    context.res = { status: 405, body: "Method not allowed" };
    return;
  }

  const { email, password, role } = req.body || {};
  if (!email || !password) {
    context.res = { status: 400, body: { error: "Email and password required" } };
    return;
  }

  try {
    if (role === "admin") {
      const { resources } = await admins.items
        .query({ query: "SELECT * FROM c WHERE c.email = @email", parameters: [{ name: "@email", value: email }] })
        .fetchAll();

      const admin = resources[0];
      if (!admin || admin.password !== password) {
        context.res = { status: 401, body: { error: "Invalid credentials" } };
        return;
      }

      const token = jwt.sign(
        { id: admin.id, email: admin.email, role: "admin" },
        process.env.JWT_SECRET,
        { expiresIn: "8h" }
      );
      context.res = { status: 200, body: { token, user: { email: admin.email, role: "admin" } } };

    } else {
      const { resources } = await ambassadors.items
        .query({ query: "SELECT * FROM c WHERE c.email = @email", parameters: [{ name: "@email", value: email }] })
        .fetchAll();

      const amb = resources[0];
      if (!amb || amb.password !== password) {
        context.res = { status: 401, body: { error: "Invalid credentials" } };
        return;
      }

      const token = jwt.sign(
        { id: amb.id, email: amb.email, role: "ambassador", campus: amb.campus },
        process.env.JWT_SECRET,
        { expiresIn: "8h" }
      );
      // Return full ambassador object (minus password)
      const { password: _pw, ...safeAmb } = amb;
      context.res = { status: 200, body: { token, user: { ...safeAmb, role: "ambassador" } } };
    }
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: { error: "Server error" } };
  }
};
