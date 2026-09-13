// This function runs on Netlify's servers, never in the browser.
// It is the ONLY place the real Airtable token and app password live —
// set them as environment variables in the Netlify dashboard, never in code.
//
// Required environment variables (Site configuration > Environment variables):
//   AIRTABLE_TOKEN   - your Airtable Personal Access Token
//   APP_PASSWORD     - the password associates must enter to use the app
//
// The base ID isn't secret, so it's fine to hardcode here.
const BASE_ID = "app7iFG9quGkdPsX8";

exports.handler = async (event) => {
  const jsonHeaders = { "Content-Type": "application/json" };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const APP_PASSWORD = process.env.APP_PASSWORD;
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

  if (!APP_PASSWORD || !AIRTABLE_TOKEN) {
    console.log("Missing env vars — APP_PASSWORD set:", !!APP_PASSWORD, "AIRTABLE_TOKEN set:", !!AIRTABLE_TOKEN);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: "Server isn't configured yet — APP_PASSWORD and AIRTABLE_TOKEN need to be set in Netlify's environment variables." })
    };
  }

  const rawProvided = event.headers["x-app-password"] || event.headers["X-App-Password"] || "";
  const providedPassword = rawProvided.trim();
  const expectedPassword = APP_PASSWORD.trim();

  // Temporary diagnostic logging — never logs the actual password values, only lengths,
  // so you can see in the Netlify function logs why a comparison is failing.
  console.log(
    "Password check — provided length:", providedPassword.length,
    "| expected length:", expectedPassword.length,
    "| match:", providedPassword === expectedPassword
  );

  if (providedPassword !== expectedPassword) {
    return { statusCode: 401, headers: jsonHeaders, body: JSON.stringify({ error: "Incorrect password." }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: "Malformed request." }) };
  }

  const { action } = payload;

  try {
    if (action === "list") {
      const { tableId, fields, pageSize, offset } = payload;
      const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`);
      (fields || []).forEach((f) => url.searchParams.append("fields[]", f));
      url.searchParams.set("pageSize", String(pageSize || 100));
      if (offset) url.searchParams.set("offset", offset);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const data = await res.json();
      return { statusCode: res.status, headers: jsonHeaders, body: JSON.stringify(data) };
    }

    if (action === "create") {
      const { tableId, fields, typecast } = payload;
      const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ records: [{ fields }], typecast: !!typecast })
      });
      const data = await res.json();
      return { statusCode: res.status, headers: jsonHeaders, body: JSON.stringify(data) };
    }

    if (action === "update") {
      const { tableId, recordId, fields, typecast } = payload;
      const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ records: [{ id: recordId, fields }], typecast: !!typecast })
      });
      const data = await res.json();
      return { statusCode: res.status, headers: jsonHeaders, body: JSON.stringify(data) };
    }

    if (action === "uploadAttachment") {
      const { recordId, fieldId, contentType, file, filename } = payload;
      const res = await fetch(
        `https://content.airtable.com/v0/${BASE_ID}/${recordId}/${fieldId}/uploadAttachment`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ contentType, file, filename })
        }
      );
      const data = await res.json();
      return { statusCode: res.status, headers: jsonHeaders, body: JSON.stringify(data) };
    }

    return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: "Unknown action." }) };
  } catch (err) {
    return {
      statusCode: 502,
      headers: jsonHeaders,
      body: JSON.stringify({ error: "Couldn't reach Airtable: " + (err.message || "unknown error") })
    };
  }
};
