import { Link, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { KeychainCheckPage } from "./pages/KeychainCheckPage";

export function App() {
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          Hive Freelance
        </Link>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/keychain">Keychain check</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/keychain" element={<KeychainCheckPage />} />
        </Routes>
      </main>
    </div>
  );
}
