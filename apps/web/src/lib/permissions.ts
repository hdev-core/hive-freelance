/**
 * Whether the signed-in user may view a job's proposal list. Ownership-only
 * — a client's "client" role doesn't imply it's *their* job, and there's no
 * server-side gate a freelancer's request would even pass to reach an
 * error box for (listProposalsForJob 403s any non-owner), so this exists
 * purely to keep JobDetailPage from firing that request in the first
 * place for someone who was never going to be allowed to see it.
 */
export function canViewJobProposals(
  user: { id: string } | null | undefined,
  job: { client_id: string },
): boolean {
  return !!user && user.id === job.client_id;
}
