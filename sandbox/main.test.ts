import type { Tests } from "../deps/testing.ts";

export default function ({ test, assert }: Tests) {
  const shorten = (app: { fetch: (path: string, init?: RequestInit) => Promise<Response> }, url: unknown) =>
    app.fetch("/api/links", { method: "POST", body: JSON.stringify({ url }) });

  test("shortens a link and redirects to it", async (app) => {
    const created = await shorten(app, "https://example.com/a/long/path?x=1");
    assert.equal(created.status, 201);
    const link = (await created.json()) as { code: string; url: string; database: string };
    assert(/^[a-z0-9]{6}$/.test(link.code), "the code is six letters or digits");
    assert.equal(link.url, "https://example.com/a/long/path?x=1");
    assert.equal(link.database, `links-${link.code.slice(0, 2)}`);

    const opened = await app.fetch(`/${link.code}`);
    assert.equal(opened.status, 302);
    assert.equal(opened.headers.get("Location"), "https://example.com/a/long/path?x=1");
  });

  test("an unknown code is a 404", async (app) => {
    assert.equal((await app.fetch("/abc123")).status, 404);
    assert.equal((await app.fetch("/not-a-code")).status, 404);
  });

  test("accepts only web addresses", async (app) => {
    for (const url of ["javascript:alert(1)", "ftp://example.com", "example", "", null]) {
      assert.equal((await shorten(app, url)).status, 400, `rejects ${JSON.stringify(url)}`);
    }
    assert.equal((await app.fetch("/api/links", { method: "POST", body: "not json" })).status, 400);
  });

  test("limits how many links one visitor creates in an hour", async (app) => {
    for (let i = 0; i < 20; i++) assert.equal((await shorten(app, `https://example.com/${i}`)).status, 201);
    assert.equal((await shorten(app, "https://example.com/one-too-many")).status, 429);
  });
}
