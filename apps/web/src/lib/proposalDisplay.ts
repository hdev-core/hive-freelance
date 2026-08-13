/**
 * The freelancer label to show on a proposal card. The server always joins
 * freelancer_display_name (from Profile) and freelancer_username (from
 * User, always present) — display_name is null until a freelancer sets one
 * on their profile, so this falls back to the Hive username rather than an
 * opaque "Freelancer #<id>".
 */
export function freelancerDisplayName(proposal: {
  freelancer_display_name: string | null;
  freelancer_username: string;
}): string {
  return proposal.freelancer_display_name ?? proposal.freelancer_username;
}
