import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { Hono } from "hono";

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.get("/", async (c) => {
    if ((await getSignedCookie(c, c.env.SECRET, "auth")) !== "1") {
        return c.json({ error: "Unauthorized." }, 401);
    }
    return c.json({ ok: true });
});

authRoutes.post("/", async (c) => {
    const body = await c.req.json<{ secret: string; trusted: boolean }>();
    if (body.secret !== c.env.SECRET) {
        return c.json({ error: "Invalid SECRET." }, 401);
    }

    // “不过期” cookie 在浏览器里实际上仍然必须落到某个过期时间；这里给一个足够长的持久化期限。
    await setSignedCookie(c, "auth", "1", c.env.SECRET, {
        httpOnly: true,
        path: "/api",
        sameSite: "Lax",
        secure: new URL(c.req.url).protocol === "https:",
        ...(body.trusted === true ? { maxAge: 60 * 60 * 24 * 400 } : { maxAge: 60 * 10 }),
    });

    return c.json({ ok: true });
});
