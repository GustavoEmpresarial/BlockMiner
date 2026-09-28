import express from "express";
import cookieParser from "cookie-parser";
import "../_env-test-overrides.mjs";
import { offerEventsRouter, offerEventsAdminRouter } from "../../server/modules/offer-events/index.ts";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/offer-events", offerEventsRouter);
app.use("/api/admin", offerEventsAdminRouter);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5129;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[PentestServer] Local Offer Events test server listening on http://127.0.0.1:${PORT}`);
});
