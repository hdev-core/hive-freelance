import assert from "node:assert/strict";
import { test } from "node:test";
import { freelancerDisplayName } from "./proposalDisplay";

test("freelancerDisplayName prefers the profile display name", () => {
  const name = freelancerDisplayName({
    freelancer_display_name: "Jane Freelancer",
    freelancer_username: "jane-hive",
  });
  assert.equal(name, "Jane Freelancer");
});

test("freelancerDisplayName falls back to the Hive username when no display name is set", () => {
  const name = freelancerDisplayName({
    freelancer_display_name: null,
    freelancer_username: "jane-hive",
  });
  assert.equal(name, "jane-hive");
});

test("freelancerDisplayName never falls back to a raw Freelancer #<id> string", () => {
  const name = freelancerDisplayName({
    freelancer_display_name: null,
    freelancer_username: "jane-hive",
  });
  assert.doesNotMatch(name, /^Freelancer #/);
});
