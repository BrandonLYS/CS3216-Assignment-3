// Isolated dev output and fake ingestion key keep analytics tests away from production.
import http from "node:http";
import next from "next";

process.env.NEXT_PUBLIC_POSTHOG_KEY = process.env.ANALYTICS_DISABLED ? "" : "phc_local_analytics";
process.env.NEXT_PUBLIC_POSTHOG_HOST = "http://localhost:3101";
process.env.BETTER_AUTH_URL = "http://localhost:3001";
const app = next({
  dev: true,
  port: 3001,
  hostname: "localhost",
});
await app.prepare();
http.createServer(app.getRequestHandler()).listen(3001, "localhost");
