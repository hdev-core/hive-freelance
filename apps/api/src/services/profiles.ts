import {
  prisma,
  toProfileRow,
  toContractRow,
  toProposalRow,
  toPaymentRow,
  type ProfileRow,
} from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";
import { getUserByUsername } from "./users.js";

export async function getPublicProfile(username: string) {
  const user = await getUserByUsername(username);
  if (!user) throw new AppError(404, "User not found");

  const profile = await prisma.profile.findUnique({
    where: { userId: BigInt(user.id) },
  });

  return {
    id: user.id,
    hiveUsername: user.hive_username,
    role: user.role,
    authType: user.auth_type,
    profile: profile ? toProfileRow(profile) : null,
  };
}

export async function updateProfile(
  userId: string,
  data: {
    bio?: string | null;
    avatar_url?: string | null;
    location?: string | null;
    hourly_rate?: number | null;
    skills?: string[] | null;
  },
): Promise<ProfileRow> {
  // Matches the original's COALESCE-on-update behavior: a field is only
  // written if it's actually provided (not null/undefined) — same
  // pre-existing quirk as before, not something introduced by the port.
  const updateData: Record<string, unknown> = {};
  if (data.bio != null) updateData.bio = data.bio;
  if (data.avatar_url != null) updateData.avatarUrl = data.avatar_url;
  if (data.location != null) updateData.location = data.location;
  if (data.hourly_rate != null) updateData.hourlyRate = data.hourly_rate;
  if (data.skills != null) updateData.skills = data.skills;

  const profile = await prisma.profile.upsert({
    where: { userId: BigInt(userId) },
    create: {
      userId: BigInt(userId),
      bio: data.bio ?? null,
      avatarUrl: data.avatar_url ?? null,
      location: data.location ?? null,
      hourlyRate: data.hourly_rate ?? null,
      skills: data.skills ?? undefined,
    },
    update: updateData,
  });
  return toProfileRow(profile);
}

export async function getDashboard(userId: string) {
  const uid = BigInt(userId);

  const [contracts, proposals, payments] = await Promise.all([
    prisma.contract.findMany({
      where: {
        OR: [{ clientId: uid }, { freelancerId: uid }],
        status: "active",
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.proposal.findMany({
      where: { freelancerId: uid, status: "pending" },
      include: { job: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.payment.findMany({
      where: { contract: { OR: [{ clientId: uid }, { freelancerId: uid }] } },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  return {
    activeContracts: contracts.map(toContractRow),
    // Same shape as the original: proposal row fields + a job_title extra.
    pendingProposals: proposals.map((p) => ({
      ...toProposalRow(p),
      job_title: p.job.title,
    })),
    recentPayments: payments.map(toPaymentRow),
  };
}