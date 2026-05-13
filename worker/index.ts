import { Hono } from "hono";
import { getSignedCookie } from "hono/cookie";
import { emailHandler } from "./email/recv";
import { accountRoutes } from "./route/account";
import { authRoutes } from "./route/auth";
import { emailRoutes } from "./route/email";
import { statsRoutes } from "./route/stats";

const app = new Hono<{ Bindings: Env }>();

app.route("/api/auth", authRoutes);

app.use("/api/*", async (c, next) => {
	if (c.req.path === "/api/auth" || c.req.path === "/api/auth/") return next();
	if ((await getSignedCookie(c, c.env.SECRET, "auth")) === "1") return next();
	return c.json({ error: "Unauthorized." }, 401);
});

app.route("/api/accounts", accountRoutes);
app.route("/api/emails", emailRoutes);
app.route("/api/stats", statsRoutes);

export default {
	fetch: app.fetch,
	email: emailHandler,
} satisfies ExportedHandler<Env>;
