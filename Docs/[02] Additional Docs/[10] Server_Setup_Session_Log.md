# API Server Setup — Session Log

**Project:** Hive Freelance Escrow Platform (`hdev-core/hive-freelance`)
**Trello card:** DevOps: host the API — server env, deploy pipeline + HTTPS
**Scope of this log:** SSH access hardening + base OS patching. See
[Docs/[02] Additional Docs/[09] Deploy_Runbook.md](./%5B09%5D%20Deploy_Runbook.md)
for day-to-day operation — this log is about how the box got into that
state in the first place, kept for reproducibility.

---

## Server facts

| Item | Value |
|---|---|
| Provider | Hetzner |
| OS | Ubuntu 26.04 LTS |
| RAM / Disk | 4 GB / 37.22 GB |
| Login user | `root` |
| Provided by | Dr. Mohammad Farhat |

Server address is intentionally not printed in this repo — see the
runbook's opening note.

**Baseline at handover** (verified, not assumed):

- No `node`, `npm`, `pm2`, or `nginx` installed
- Only `sshd` listening externally; `systemd-resolve` on localhost only
- `sshd` config: `PermitRootLogin yes`, `PubkeyAuthentication yes`,
  `PasswordAuthentication yes`
- 24 pending package updates + a pending kernel reboot

Nothing else was running on the box, so all work below was non-disruptive.

---

## 1. SSH key generation (local, Windows)

### The problem that cost ~40 minutes

`ssh-keygen` appeared to hang at `Generating public/private ed25519 key pair.`
for 20+ minutes, twice.

**Root cause:** the commands were being run in **PowerShell ISE**, not
PowerShell. ISE has no real console attached, so native interactive
programs that read from stdin have nothing to read from and nothing to
print to. They wait forever.

`ssh-keygen` prints that line *before* it prompts for the file path — so
the line appearing means it had already reached a prompt ISE could not
render.

**This affects any interactive CLI in ISE:** `ssh`, `git commit` without
`-m`, `npm login`, `certbot`, etc.

**Fix:** use the VS Code integrated terminal or the plain
`Windows PowerShell` console. Not ISE.

### Command used

```powershell
mkdir "$HOME\.ssh" -Force | Out-Null
ssh-keygen -t ed25519 -f "$HOME\.ssh\hive_api" -C "laure@hive-freelance-api"
```

`-f` supplies the output path up front so the file-location prompt never
appears — worth keeping even outside ISE.

**Result:** ed25519, empty passphrase (deliberate choice).

> **Consequence of the empty passphrase:** the private key file is now
> the *only* credential that can reach this server. There is no password
> fallback. If it is lost or copied, recovery requires the Hetzner
> console via Dr. Mohammad.

---

## 2. Installing the public key on the server

Windows OpenSSH has no `ssh-copy-id`, so the equivalent was done manually:

```powershell
$pub = (Get-Content "$HOME\.ssh\hive_api.pub" -Raw).Trim()
ssh root@<server-ip> "mkdir -p ~/.ssh && chmod 700 ~/.ssh && printf '%s\n' '$pub' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && tail -n 1 ~/.ssh/authorized_keys"
```

Design notes:

- **`>>` not `>`** — appends, so any pre-existing authorized key is
  preserved.
- **`.Trim()`** — strips the Windows `CRLF`, which can otherwise land
  inside `authorized_keys` and cause silent auth failures.
- **Reading the file programmatically** rather than copy-pasting the key
  avoids a line break being introduced mid-key.
- **`chmod 700` / `600`** — sshd silently ignores `authorized_keys` if
  permissions are too permissive.

### Key auth tested before changing anything

```powershell
ssh -i "$HOME\.ssh\hive_api" -o IdentitiesOnly=yes root@<server-ip> "whoami; hostname"
```

`IdentitiesOnly=yes` is important here: without it, an agent key or a
password fallback can make a broken key setup look like it works —
which is how people lock themselves out an hour later.

---

## 3. Local SSH config alias

Appended to `~/.ssh/config` (with `Add-Content`, not `Set-Content`, so
any existing config for other hosts survives):

```
Host hive-api
    HostName <server-ip>
    User root
    IdentityFile ~/.ssh/hive_api
    IdentitiesOnly yes
```

`IdentitiesOnly yes` also prevents SSH offering every key it knows to
this server, which is what triggers `Too many authentication failures`
once you have several keys.

A second alias, `hive-api-deploy`, was added later for the dedicated
`deploy` user (see section 6).

---

## 4. SSH hardening — disabling password auth

### The ordering trap

The server already had `/etc/ssh/sshd_config.d/50-cloud-init.conf`
containing `PasswordAuthentication yes`.

sshd uses the **first** value it reads for most settings, not the
last — the opposite of most config systems. So a drop-in named
`99-*.conf` would have been read *after* `50-cloud-init.conf` and
silently ignored. Hence the filename `01-hardening.conf`.

### File written

`/etc/ssh/sshd_config.d/01-hardening.conf`, mode `600`:

```
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
```

| Directive | Why |
|---|---|
| `PasswordAuthentication no` | The actual goal |
| `KbdInteractiveAuthentication no` | Closes the PAM side door — without it, PAM can still offer a password prompt through a different mechanism and password login effectively survives |
| `PubkeyAuthentication yes` | Explicit, so nothing downstream flips it |
| `PermitRootLogin prohibit-password` | Root can still log in, but by key only |

A drop-in file was used rather than editing `/etc/ssh/sshd_config`
directly so the distro's file stays pristine and the change is a single
removable unit.

### Procedure followed (order matters)

1. **Kept an authenticated SSH session open throughout** — the way back
   in if something goes wrong.
2. **Wrote the file. Did not reload.** sshd only re-reads config on
   start/reload.
3. **Validated syntax:** `sshd -t` → `SYNTAX OK`
4. **Checked effective values before applying:**
   `sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|permitrootlogin)'`
   — a losing drop-in would still have shown `yes` here, catching the
   ordering problem before any risk was taken.
5. **Applied:** `systemctl reload-or-restart ssh` (rather than a plain
   `reload`, since the distro may run sshd socket-activated, where a
   plain reload can fail).
6. **Tested a brand-new connection from a second terminal** while the
   first stayed open.

### Password auth confirmed dead

```powershell
ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no root@<server-ip>
# -> Permission denied (publickey).
```

The server refused without offering a password prompt at all —
behaviour confirmed, not just config.

---

## 5. OS patching + reboot

```bash
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y -o Dpkg::Options::="--force-confold" upgrade
```

The flags are not cosmetic: without them the upgrade can stop at a
debconf "keep or replace this config file?" dialog or a `needrestart`
prompt, which over SSH looks identical to a hang. `--force-confold`
keeps existing config files on conflict.

**Result:** packages upgraded, no SSH packages touched, so the session
and the hardening were unaffected. A few packages were deferred by
Ubuntu's phased-update mechanism — normal.

```bash
reboot
```

Reconnected after ~45s and verified the new kernel loaded, uptime was
genuinely fresh, system state was `running`, and the sshd hardening
(`passwordauthentication no`, `permitrootlogin prohibit-password`) held
across the reboot — cloud-init re-runs on boot and owns
`50-cloud-init.conf`, so it could in principle have re-enabled password
auth. It did not, confirming the `01-` filename ordering held.

---

## 6. Dedicated `deploy` user

Root was used for infra setup (packages, nginx, firewall); a separate
`deploy` user was created for app-level work (git, npm, PM2), so a
compromised Node process is confined to an unprivileged account and the
CI deploy key never holds root credentials:

```
ssh hive-api "adduser --disabled-password --gecos '' deploy && mkdir -p /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && ... "
```

Same key-install and `hive-api-deploy` alias pattern as sections 2–3,
targeting `/home/deploy/.ssh/authorized_keys` instead.

A second, separate key pair was later generated specifically for GitHub
Actions (`hive_api_ci`), authorized only for the `deploy` user, kept
distinct from personal SSH access so it can be revoked independently if
it's ever compromised via the CI secrets store.

---

## 7. Repo access

Deploy key placement (an SSH key with repo-level read access, added via
repo Settings → Deploy keys) required repo admin access, which wasn't
available — Dr. Mohammad clarified this wasn't necessary and a classic
GitHub Personal Access Token (`repo` scope, 90-day expiration) was used
instead for the initial clone, since normal collaborator access was
already sufficient.

**Follow-up, resolved 2026-08-15:** a security review correctly flagged
that this token was embedded directly in the clone URL, which means it
was also embedded in `origin`'s URL in the server's `.git/config` —
readable in plaintext by anything running as the `deploy` user,
including a compromised Node process, for as long as it stayed there.
Worse than it first looked: this was a *classic* token, not scoped to
just this one repo but to every repo the account can write to.

The actual fix turned out to be simpler than swapping to a deploy
key: `hdev-core/hive-freelance` is a **public** repository, so `git
fetch`/`pull` over HTTPS needs no credential of any kind. The token was
never actually necessary past the very first clone, if even then. Fixed
via `git remote set-url origin https://github.com/hdev-core/hive-freelance.git`
(no embedded credential), verified `git fetch` still works with nothing
attached, and the original token was revoked on GitHub's side.

---

## Commands worth keeping

```powershell
# Connect
ssh hive-api
ssh hive-api-deploy

# Confirm hardening still in force
ssh hive-api "sshd -T | grep -E '^(passwordauthentication|permitrootlogin|pubkeyauthentication)'"
```

```bash
# Safe patching on this box
export DEBIAN_FRONTEND=noninteractive
apt-get update && apt-get -y -o Dpkg::Options::="--force-confold" upgrade

# Validate sshd config BEFORE reloading — always
sshd -t && sshd -T | grep -E '^(passwordauthentication|permitrootlogin)'
```