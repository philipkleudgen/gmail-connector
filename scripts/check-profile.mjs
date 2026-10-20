#!/usr/bin/env node
// Quick credential check: prints the connected account's profile.
import { google } from "googleapis";

const oauth2 = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET
);
oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
const gmail = google.gmail({ version: "v1", auth: oauth2 });
const { data } = await gmail.users.getProfile({ userId: "me" });
console.log(JSON.stringify(data, null, 2));
