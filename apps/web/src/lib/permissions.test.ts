import assert from "node:assert/strict";
import { test } from "node:test";
import { canViewJobProposals } from "./permissions";

const job = { client_id: "42" };

test("canViewJobProposals allows the owning client", () => {
  assert.equal(canViewJobProposals({ id: "42" }, job), true);
});

test("canViewJobProposals denies a different client viewing someone else's job", () => {
  assert.equal(canViewJobProposals({ id: "99" }, job), false);
});

test("canViewJobProposals denies a freelancer regardless of role checks elsewhere", () => {
  // Same shape as a freelancer session — id never matches a job's client_id
  // unless that freelancer is also this job's client, which is exactly the
  // case this should allow.
  assert.equal(canViewJobProposals({ id: "7" }, job), false);
});

test("canViewJobProposals denies a logged-out visitor", () => {
  assert.equal(canViewJobProposals(null, job), false);
  assert.equal(canViewJobProposals(undefined, job), false);
});
