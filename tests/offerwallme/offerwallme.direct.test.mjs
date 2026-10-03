import test from "node:test";
import assert from "node:assert/strict";

const { offerwallMeRouter } = await import("../../server/modules/offerwallme/offerwallme.routes.ts");
const { getOfferwallMeLink, getOfferwallMeEmbed, offerwallMePublisherId } = await import("../../server/modules/offerwallme/offerwallme.controller.ts");
const { buildOfferwallMeUrl } = await import("../../server/modules/offerwallme/offerwallme.service.ts");

test("offerwallMeRouter: registers /link and /embed routes", () => {
  const routes = offerwallMeRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  const linkRoute = routes.find((r) => r.path === "/link");
  assert.ok(linkRoute, "Route /link must exist");
  assert.ok(linkRoute.methods.includes("get"), "Route /link must handle GET");

  const embedRoute = routes.find((r) => r.path === "/embed");
  assert.ok(embedRoute, "Route /embed must exist");
  assert.ok(embedRoute.methods.includes("get"), "Route /embed must handle GET");

  const postbackRoute = routes.find((r) => r.path === "/postback");
  assert.ok(postbackRoute, "Route /postback must exist");
});

test("buildOfferwallMeUrl and offerwallMePublisherId parity", () => {
  const pubId = offerwallMePublisherId();
  assert.ok(pubId.length > 0, "publisher ID must not be empty");
  const url = buildOfferwallMeUrl(12345);
  assert.equal(url, `https://offerwall.me/offerwall/${pubId}/12345`);
});

test("getOfferwallMeLink: unauthenticated request returns 401", async () => {
  const req = {
    headers: {},
    query: {},
    session: {},
  };
  let responseStatus = 200;
  let responseJson = null;
  const res = {
    status(s) {
      responseStatus = s;
      return this;
    },
    json(data) {
      responseJson = data;
      return this;
    },
  };

  await getOfferwallMeLink(req, res);
  assert.equal(responseStatus, 401);
  assert.equal(responseJson?.ok, false);
});

test("getOfferwallMeEmbed: unauthenticated request returns 401", async () => {
  const req = {
    headers: {},
    query: {},
    session: {},
  };
  let responseStatus = 200;
  let responseJson = null;
  const res = {
    status(s) {
      responseStatus = s;
      return this;
    },
    json(data) {
      responseJson = data;
      return this;
    },
  };

  await getOfferwallMeEmbed(req, res);
  assert.equal(responseStatus, 401);
  assert.equal(responseJson?.ok, false);
});

test("getOfferwallMeLink: authenticated user receives valid direct url when captcha disabled or passed", async () => {
  // Simulate user with session
  const origEnv = process.env.BM_CAPTCHA_ENABLED;
  try {
    process.env.BM_CAPTCHA_ENABLED = "0";

    const req = {
      headers: {},
      query: {},
      session: {
        userId: 987,
      },
      user: {
        id: 987,
      },
    };
    let responseStatus = 200;
    let responseJson = null;
    const res = {
      status(s) {
        responseStatus = s;
        return this;
      },
      json(data) {
        responseJson = data;
        return this;
      },
    };

    await getOfferwallMeLink(req, res);
    assert.equal(responseStatus, 200);
    assert.equal(responseJson?.ok, true);
    assert.equal(responseJson?.url, buildOfferwallMeUrl(987));
  } finally {
    if (origEnv !== undefined) process.env.BM_CAPTCHA_ENABLED = origEnv;
    else delete process.env.BM_CAPTCHA_ENABLED;
  }
});
