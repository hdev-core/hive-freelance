import {
  Briefcase,
  FileText,
  Handshake,
  LayoutGrid,
  Lock,
  MessageSquare,
  Settings,
  ShieldCheck,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PublicLayout } from "./components/layout/PublicLayout";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { RequireAuth } from "./components/layout/RequireAuth";
import { PlaceholderPage } from "./components/PlaceholderPage";
import { HomePage } from "./pages/HomePage";
import { KeychainCheckPage } from "./pages/KeychainCheckPage";
import { AcceptProposalTestPage } from "./pages/AcceptProposalTestPage";
import { LoginPage } from "./pages/LoginPage";
import { ClaimAccountPage } from "./pages/ClaimAccountPage";
import { ContractPage } from "./pages/ContractPage";
import { ContractsPage } from "./pages/ContractsPage";
import { JobsListPage } from "./pages/JobsListPage";
import { JobDetailPage } from "./pages/JobDetailPage";
import { SubmitProposalPage } from "./pages/SubmitProposalPage";
import { PostJobPage } from "./pages/PostJobPage";
import { ClientJobsPage } from "./pages/ClientJobsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { EditProfilePage } from "./pages/EditProfilePage";

type DashboardNavItem = {
  path: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

const clientNav: DashboardNavItem[] = [
  { path: "overview", title: "Overview", icon: LayoutGrid, description: "Snapshot of active jobs, escrow balances, and received proposals." },
  { path: "jobs", title: "Jobs", icon: Briefcase, description: "Create and manage the jobs you've posted." },
  { path: "proposals", title: "Proposals", icon: FileText, description: "Review proposals submitted by freelancers." },
  { path: "messages", title: "Messages", icon: MessageSquare, description: "Chat with freelancers about active and prospective work." },
  { path: "escrow", title: "Escrow & Wallet", icon: Wallet, description: "Track locked escrow funds and your Hive wallet balance." },
  { path: "settings", title: "Settings", icon: Settings, description: "Manage your account and workspace preferences." },
  { path: "profile", title: "Profile", icon: User, description: "Manage your public profile details." },
];

const freelancerNav: DashboardNavItem[] = [
  { path: "overview", title: "Overview", icon: LayoutGrid, description: "Snapshot of active contracts, earnings, and submitted proposals." },
  { path: "jobs", title: "Jobs", icon: Briefcase, description: "Browse and track jobs relevant to your skills." },
  { path: "proposals", title: "Proposals", icon: FileText, description: "Track the proposals you've submitted to clients." },
  { path: "messages", title: "Messages", icon: MessageSquare, description: "Chat with clients about active and prospective work." },
  { path: "escrow", title: "Escrow & Wallet", icon: Wallet, description: "Track milestone payouts and your Hive wallet balance." },
  { path: "settings", title: "Settings", icon: Settings, description: "Manage your account and workspace preferences." },
  { path: "profile", title: "Profile", icon: User, description: "Manage your public profile details." },
];

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route
          index
          element={
            <PlaceholderPage
              title="Welcome to HiveWork"
              description="The marketing landing page lands in a later milestone. This route, plus the header and footer around it, are wired up now."
              icon={Handshake}
            />
          }
        />
        <Route path="jobs" element={<JobsListPage />} />
        <Route element={<RequireAuth allow={["client", "both"]} />}>
          <Route path="jobs/new" element={<PostJobPage />} />
        </Route>
        <Route path="jobs/:id" element={<JobDetailPage />} />
        <Route element={<RequireAuth allow={["freelancer", "both"]} />}>
          <Route path="jobs/:id/apply" element={<SubmitProposalPage />} />
        </Route>
        {/* No-login-required profile view — GET /users/:username is a public
            endpoint (routes/users.ts has no requireAuth on it), and viewing
            "About the client" from a job page shouldn't force a login.
            Distinct from /client|freelancer/profile/:username, which stays
            auth-gated because it lives under DashboardLayout. */}
        <Route path="profile/:username" element={<ProfilePage />} />
        <Route
          path="jobs/:id/hire"
          element={
            <PlaceholderPage
              title="Fund project escrow"
              description="The wallet-connect and escrow funding flow lands in a later milestone."
              icon={Lock}
            />
          }
        />
        <Route
          path="for-clients"
          element={
            <PlaceholderPage
              title="For Clients"
              description="A dedicated overview of hiring and escrow protection for clients lands in a later milestone."
              icon={Users}
            />
          }
        />
        <Route
          path="for-freelancers"
          element={
            <PlaceholderPage
              title="For Freelancers"
              description="A dedicated overview of finding work and getting paid safely lands in a later milestone."
              icon={ShieldCheck}
            />
          }
        />
        <Route
          path="messages"
          element={
            <PlaceholderPage
              title="Messages"
              description="Sign in to see your conversations. The full chat interface lands in a later milestone."
              icon={MessageSquare}
            />
          }
        />
        <Route path="claim" element={<ClaimAccountPage />} />
        <Route path="keychain" element={<KeychainCheckPage />} />
        <Route
          path="dev/accept-proposal"
          element={<AcceptProposalTestPage />}
        />
        <Route path="contracts" element={<ContractsPage />} />
        <Route path="contracts/:id" element={<ContractPage />} />
        <Route path="dev/health" element={<HomePage />} />
        <Route
          path="*"
          element={<PlaceholderPage title="Page not found" description="That route doesn't exist yet." />}
        />
      </Route>

      <Route path="login" element={<LoginPage />} />

      {/*
        Two guard layers per tree, deliberately not one: the outer one is
        auth-only (any signed-in role) and gates DashboardLayout itself, so
        an unauthenticated visitor never sees the dashboard shell. The inner
        one is role-restricted and wraps only the client-specific pages —
        Profile sits alongside it, not inside it, because viewing/editing a
        profile isn't a client-only or freelancer-only action. A "client"
        user must still be able to open /freelancer/profile/:username to
        look at a freelancer's profile; it shouldn't 404/redirect just
        because the tree it lives under is otherwise client-restricted.
      */}
      <Route element={<RequireAuth />}>
        <Route path="client" element={<DashboardLayout role="client" walletBalance="0 HBD" />}>
          <Route path="profile" element={<ProfilePage />} />
          <Route path="profile/edit" element={<EditProfilePage />} />
          <Route path="profile/:username" element={<ProfilePage />} />
          <Route element={<RequireAuth allow={["client", "both"]} />}>
            <Route index element={<Navigate to="/client/overview" replace />} />
            <Route path="jobs" element={<ClientJobsPage />} />
            <Route path="jobs/new" element={<PostJobPage />} />
            <Route path="jobs/:id" element={<JobDetailPage />} />
            {clientNav
              .filter((item) => item.path !== "jobs" && item.path !== "profile")
              .map((item) => (
                <Route
                  key={item.path}
                  path={item.path}
                  element={<PlaceholderPage title={item.title} description={item.description} icon={item.icon} />}
                />
              ))}
            <Route path="*" element={<Navigate to="/client/overview" replace />} />
          </Route>
        </Route>
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="freelancer" element={<DashboardLayout role="freelancer" walletBalance="0 HBD" />}>
          <Route path="profile" element={<ProfilePage />} />
          <Route path="profile/edit" element={<EditProfilePage />} />
          <Route path="profile/:username" element={<ProfilePage />} />
          <Route element={<RequireAuth allow={["freelancer", "both"]} />}>
            <Route index element={<Navigate to="/freelancer/overview" replace />} />
            <Route path="jobs" element={<JobsListPage />} />
            <Route path="jobs/:id" element={<JobDetailPage />} />
            <Route path="jobs/:id/apply" element={<SubmitProposalPage />} />
            {freelancerNav
              .filter((item) => item.path !== "jobs" && item.path !== "profile")
              .map((item) => (
                <Route
                  key={item.path}
                  path={item.path}
                  element={<PlaceholderPage title={item.title} description={item.description} icon={item.icon} />}
                />
              ))}
            <Route path="*" element={<Navigate to="/freelancer/overview" replace />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}