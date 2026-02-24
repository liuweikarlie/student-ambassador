// api/event-public/index.js
// Public endpoint — no auth required.
// Used by the audience QR scan page to look up a single event by ID.
const { events } = require("../shared/cosmos");

module.exports = async function (context, req) {
  const eventId = req.query.id;
  if (!eventId) {
    context.res = { status: 400, body: { error: "id query param required" } };
    return;
  }

  try {
    const { resources } = await events.items
      .query({
        query: "SELECT * FROM c WHERE c.id = @id",
        parameters: [{ name: "@id", value: eventId }],
      })
      .fetchAll();

    if (!resources.length) {
      context.res = { status: 404, body: { error: "Event not found" } };
      return;
    }

    // Only expose fields the audience page needs — no internal data
    const { id, title, campus, date } = resources[0];
    context.res = { status: 200, body: { id, title, campus, date } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: { error: "Failed to fetch event" } };
  }
};
