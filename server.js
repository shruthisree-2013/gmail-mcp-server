const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const { google } = require("googleapis");
const readline = require("readline");

const app = express();
app.use(bodyParser.json());

const cors = require("cors");
app.use(cors());


const SCOPES = ["https://www.googleapis.com/auth/gmail.compose"];
const TOKEN_PATH = "token.json";

// Load credentials
const credentials = JSON.parse(fs.readFileSync("credentials.json"));
const { client_secret, client_id, redirect_uris } =
  credentials.installed;

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

// Get token
function authorize(callback) {
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback();
  });
}

function getNewToken(callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });

  console.log("Authorize this app:", authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("Enter the code: ", (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error("Error retrieving token", err);
      oAuth2Client.setCredentials(token);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
      console.log("Token stored!");
      callback();
    });
  });
}

// Create Gmail Draft
async function createDraft(to, subject, body) {
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\n");

  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        raw: encodedMessage,
      },
    },
  });

  return res.data;
}

// MCP Tool endpoint
app.post("/tools/draft_gmail", async (req, res) => {
  const { to, subject, body } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    await authorize(async () => {
      const draft = await createDraft(to, subject, body);

      res.json({
        status: "success",
        draftId: draft.id,
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create draft" });
  }
});

// Tool discovery
app.get("/tools", (req, res) => {
  res.json([
    {
      name: "draft_gmail",
      description: "Create Gmail draft",
    },
  ]);
});

// app.listen(3000, () => {
//  console.log("Server running on http://localhost:3000");
//});
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
