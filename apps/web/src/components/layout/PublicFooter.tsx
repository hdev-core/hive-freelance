import { Logo } from "../ui/Logo";

const footerColumns = [
  {
    heading: "Marketplace",
    links: ["Find Work", "Post a Job", "Categories", "How Escrow Works"],
  },
  {
    heading: "Company",
    links: ["About", "Careers", "Blockchain", "Trust & Safety"],
  },
  {
    heading: "Resources",
    links: ["Help Center", "Hive Wallet Guide", "API Docs", "Community"],
  },
];

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-canvas px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Logo size="md" />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-text-secondary">
              The freelance marketplace where every payment is secured by Hive
              blockchain escrow. Transparent, tamper-proof, and fair for
              everyone.
            </p>
          </div>

          {footerColumns.map((column) => (
            <div key={column.heading}>
              <h3 className="text-sm font-semibold text-text-primary">{column.heading}</h3>
              <ul className="mt-4 flex flex-col gap-3">
                {column.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      onClick={(event) => event.preventDefault()}
                      className="rounded text-sm text-text-secondary transition-shadow duration-150 hover:text-text-primary hover:shadow-elevate"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col-reverse items-center gap-3 border-t border-border pt-6 sm:flex-row sm:justify-between">
          <p className="text-sm text-text-muted">
            © {new Date().getFullYear()} HiveWork. All rights reserved.
          </p>
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="h-2 w-2 rounded-full bg-success-text" aria-hidden="true" />
            Hive network operational
          </div>
        </div>
      </div>
    </footer>
  );
}
