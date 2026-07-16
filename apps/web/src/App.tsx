import { Link, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { KeychainCheckPage } from "./pages/KeychainCheckPage";
import { LoginPage } from "./pages/LoginPage";
import { JobsPage } from "./pages/JobsPage";

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
          <Link to="/login">Login</Link>
          <Link to="/keychain">Keychain</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/keychain" element={<KeychainCheckPage />} />
        </Routes>
      </main>
    </div>
  );
}
