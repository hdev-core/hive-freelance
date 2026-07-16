import { Link, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { KeychainCheckPage } from "./pages/KeychainCheckPage";
import { LoginPage } from "./pages/LoginPage";
import { JobsPage } from "./pages/JobsPage";
import { ClaimAccountPage } from "./pages/ClaimAccountPage";
import { ContractPage } from "./pages/ContractPage";
import { ContractsPage } from "./pages/ContractsPage";

export function App() {
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          Hive Freelance
        </Link>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/jobs">Jobs</Link>
          <Link to="/contracts">Contracts</Link>
          <Link to="/login">Login</Link>
          <Link to="/claim">Claim</Link>
          <Link to="/keychain">Keychain</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/contracts" element={<ContractsPage />} />
          <Route path="/contracts/:id" element={<ContractPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/claim" element={<ClaimAccountPage />} />
          <Route path="/keychain" element={<KeychainCheckPage />} />
        </Routes>
      </main>
    </div>
  );
}
