import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Same seed data as the previous Knex version — one client, one freelancer,
 * one Google-OAuth user, and a full job -> proposal -> contract -> milestone
 * -> payment chain, plus a dispute, review, and hive_records row.
 * Safe to re-run: deletes in reverse-FK order first.
 */
async function main() {
  await prisma.agentSigningEvent.deleteMany();
  await prisma.hiveRecord.deleteMany();
  await prisma.review.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.proposal.deleteMany();
  await prisma.job.deleteMany();
  await prisma.oauthAccount.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();

  const client = await prisma.user.create({
    data: { hiveUsername: 'seed-client', email: 'client@example.com', role: 'client', authType: 'keychain' },
  });

  const freelancer = await prisma.user.create({
    data: { hiveUsername: 'seed-freelancer', email: 'freelancer@example.com', role: 'freelancer', authType: 'keychain' },
  });

  const googleUser = await prisma.user.create({
    data: {
      hiveUsername: 'seed-google-user',
      email: 'googleuser@example.com',
      role: 'client',
      authType: 'google',
      kmsKeyRef: 'kms://seed-placeholder-key',
    },
  });

  await prisma.profile.create({
    data: { userId: client.id, bio: 'Seed client profile.', location: 'Beirut, Lebanon' },
  });
  await prisma.profile.create({
    data: {
      userId: freelancer.id,
      bio: 'Seed freelancer profile.',
      hourlyRate: 25.0,
      skills: ['typescript', 'postgresql', 'react'],
    },
  });

  await prisma.oauthAccount.create({
    data: { userId: googleUser.id, provider: 'google', providerUserId: 'seed-google-sub-12345' },
  });

  const job = await prisma.job.create({
    data: {
      clientId: client.id,
      title: 'Build a landing page',
      description: 'Seed job for local dev / testing.',
      budget: 500.0,
      category: 'web-development',
      skillsRequired: ['react', 'typescript'],
      status: 'in_progress',
    },
  });

  const proposal = await prisma.proposal.create({
    data: {
      jobId: job.id,
      freelancerId: freelancer.id,
      coverLetter: 'Seed proposal — happy to take this on.',
      bidAmount: 450.0,
      status: 'accepted',
    },
  });

  const contract = await prisma.contract.create({
    data: {
      jobId: job.id,
      proposalId: proposal.id,
      clientId: client.id,
      freelancerId: freelancer.id,
      totalAmount: 450.0,
      status: 'active',
      startDate: new Date(),
    },
  });

  const milestone = await prisma.milestone.create({
    data: {
      contractId: contract.id,
      title: 'Milestone 1 — Wireframes',
      description: 'Seed milestone.',
      amount: 150.0,
      milestoneOrder: 1,
      status: 'funded',
    },
  });

  await prisma.payment.create({
    data: {
      contractId: contract.id,
      milestoneId: milestone.id,
      amount: 150.0,
      currency: 'HBD',
      status: 'escrowed',
      escrowId: 1,
      hiveTxId: 'seed-tx-escrow-0001',
    },
  });

  await prisma.dispute.create({
    data: {
      contractId: contract.id,
      milestoneId: milestone.id,
      raisedBy: client.id,
      reason: 'Seed dispute — placeholder for local testing.',
      status: 'open',
    },
  });

  await prisma.review.create({
    data: {
      contractId: contract.id,
      reviewerId: client.id,
      revieweeId: freelancer.id,
      rating: 5,
      comment: 'Seed review — great work.',
    },
  });

  await prisma.hiveRecord.create({
    data: {
      hiveTxId: 'seed-tx-escrow-0001',
      appId: 'hive-freelance-v1',
      operationType: 'escrow_transfer',
      fromAccount: client.hiveUsername,
      toAccount: 'seed-agent-account',
      escrowId: 1,
      payload: { note: 'seed data' },
      blockNumber: 1,
      confirmed: true,
    },
  });

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
