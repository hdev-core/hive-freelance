import {
  prisma,
  toProfileRow,
  toContractRow,
  toProposalRow,
  toPaymentRow,
  type ProfileRow,
  type PortfolioLink,
} from "@hive-freelance/db";
import { AppError } from "../lib/errors.js";
import { getUserByUsername } from "./users.js";

export async function getPublicProfile(username: string) {
  const user = await getUserByUsername(username);
  if (!user) throw new AppError(404, "User not found");

  const [profile, ratingAgg] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: BigInt(user.id) } }),
    prisma.review.aggregate({
      where: { revieweeId: BigInt(user.id) },
      _avg: { rating: true },
      _count: { rating: true },
    }),
  ]);

  return {
    id: user.id,
    hiveUsername: user.hive_username,
    role: user.role,
    authType: user.auth_type,
    memberSince: user.created_at,
    rating: {
      average:
        ratingAgg._avg.rating != null
          ? Math.round(ratingAgg._avg.rating * 100) / 100
          : null,
      count: ratingAgg._count.rating,
    },
    profile: profile ? toProfileRow(profile) : null,
  };
}

export async function updateProfile(
  userId: string,
  data: {
    display_name?: string | null;
    bio?: string | null;
    avatar_url?: string | null;
    location?: string | null;
    hourly_rate?: number | null;
    skills?: string[] | null;
    portfolio_links?: PortfolioLink[] | null;
  },
): Promise<ProfileRow> {
  if (data.skills != null && data.skills.length > 0) {
    const user = await prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { role: true },
    });
    if (!user) throw new AppError(404, "User not found");
    if (user.role === "client") {
      throw new AppError(
        400,
        "Only freelancers can set skills",
        "SKILLS_NOT_ALLOWED",
      );
    }
  }

  // Matches the original's COALESCE-on-update behavior: a field is only
  // written if it's actually provided (not null/undefined) — same
  // pre-existing quirk as before, not something introduced by the port.
  const updateData: Record<string, unknown> = {};
  if (data.display_name != null) updateData.displayName = data.display_name;
  if (data.bio != null) updateData.bio = data.bio;
  if (data.avatar_url != null) updateData.avatarUrl = data.avatar_url;
  if (data.location != null) updateData.location = data.location;
  if (data.hourly_rate != null) updateData.hourlyRate = data.hourly_rate;
  if (data.skills != null) updateData.skills = data.skills;
  if (data.portfolio_links != null)
    updateData.portfolioLinks = data.portfolio_links;

  const profile = await prisma.profile.upsert({
    where: { userId: BigInt(userId) },
    create: {
      userId: BigInt(userId),
      displayName: data.display_name ?? null,
      bio: data.bio ?? null,
      avatarUrl: data.avatar_url ?? null,
      location: data.location ?? null,
      hourlyRate: data.hourly_rate ?? null,
      skills: data.skills ?? undefined,
      portfolioLinks: data.portfolio_links ?? undefined,
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