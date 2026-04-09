#!/usr/bin/env node

/**
 * Release script for Makestro
 *
 * Auto-detects semver bump from conventional commits, bumps package.json,
 * generates CHANGELOG.md, commits, tags, and packages both .vsix files.
 *
 * Usage:
 *   node scripts/release.mjs          # auto-detect bump
 *   node scripts/release.mjs patch    # force patch
 *   node scripts/release.mjs minor    # force minor
 *   node scripts/release.mjs major    # force major
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const PKG_PATH = resolve(ROOT, "package.json");

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf-8", ...opts }).trim();
}

function getLastTag() {
  try {
    return run("git describe --tags --abbrev=0");
  } catch {
    return null;
  }
}

function getCommitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const raw = run(`git log ${range} --pretty=format:"%s"`);
  return raw ? raw.split("\n").map((s) => s.replace(/^"|"$/g, "")) : [];
}

function detectBump(commits) {
  let bump = "patch";
  for (const msg of commits) {
    if (msg.includes("BREAKING CHANGE") || /^[a-z]+!:/.test(msg)) {
      return "major";
    }
    if (msg.startsWith("feat")) {
      bump = "minor";
    }
  }
  return bump;
}

function bumpVersion(version, bump) {
  const [major, minor, patch] = version.split(".").map(Number);
  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
}

function categorize(commits) {
  const features = [];
  const fixes = [];
  const other = [];

  for (const msg of commits) {
    if (msg.startsWith("chore(release)")) continue;
    if (/^feat/.test(msg)) {
      features.push(msg.replace(/^feat[^:]*:\s*/, ""));
    } else if (/^fix/.test(msg)) {
      fixes.push(msg.replace(/^fix[^:]*:\s*/, ""));
    } else {
      other.push(msg);
    }
  }

  return { features, fixes, other };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function generateChangelog(version, commits, prevTag) {
  const { features, fixes, other } = categorize(commits);
  const lines = [`## [${version}] — ${new Date().toISOString().slice(0, 10)}`, ""];

  if (features.length) {
    lines.push("### Features");
    features.forEach((f) => lines.push(`- ${capitalize(f)}`));
    lines.push("");
  }
  if (fixes.length) {
    lines.push("### Bug Fixes");
    fixes.forEach((f) => lines.push(`- ${capitalize(f)}`));
    lines.push("");
  }
  if (other.length) {
    lines.push("### Other");
    other.slice(0, 10).forEach((o) => lines.push(`- ${capitalize(o)}`));
    lines.push("");
  }

  return lines.join("\n");
}

function updateChangelogFile(entry) {
  const changelogPath = resolve(ROOT, "CHANGELOG.md");
  if (existsSync(changelogPath)) {
    const existing = readFileSync(changelogPath, "utf-8");
    const marker = "# Changelog\n";
    if (existing.startsWith(marker)) {
      writeFileSync(
        changelogPath,
        marker + "\n" + entry + "\n" + existing.slice(marker.length)
      );
    } else {
      writeFileSync(changelogPath, `# Changelog\n\n${entry}\n${existing}`);
    }
  } else {
    writeFileSync(changelogPath, `# Changelog\n\n${entry}\n`);
  }
}

// --- Main ---

const forceBump = process.argv[2]; // patch | minor | major
const lastTag = getLastTag();
const commits = getCommitsSince(lastTag);

if (commits.length === 0 && !forceBump) {
  console.log("No new commits since last tag. Nothing to release.");
  process.exit(0);
}

const bump = forceBump || detectBump(commits);
const pkg = JSON.parse(readFileSync(PKG_PATH, "utf-8"));
const oldVersion = pkg.version;
const newVersion = bumpVersion(oldVersion, bump);

console.log(`\n🎶 Makestro release: ${oldVersion} → ${newVersion} (${bump})\n`);

// 1. Bump package.json
pkg.version = newVersion;
writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n");
console.log(`  ✓ package.json → ${newVersion}`);

// 2. Update CHANGELOG.md
const entry = generateChangelog(newVersion, commits, lastTag);
updateChangelogFile(entry);
console.log("  ✓ CHANGELOG.md updated");

// 3. Compile
console.log("  ⏳ Compiling...");
run("npm run compile");
console.log("  ✓ Compiled");

// 4. Package Marketplace .vsix (publisher: andrevops-com)
console.log("  ⏳ Packaging Marketplace .vsix...");
run("npx @vscode/vsce package --no-dependencies");
console.log(`  ✓ makestro-${newVersion}.vsix`);

// 5. Package Open VSX .vsix (publisher: andrevops)
console.log("  ⏳ Packaging Open VSX .vsix...");
const openvsxPkg = { ...pkg, publisher: "andrevops" };
writeFileSync(PKG_PATH, JSON.stringify(openvsxPkg, null, 2) + "\n");
run(
  `npx @vscode/vsce package --no-dependencies -o "makestro-${newVersion}-openvsx.vsix"`
);
// Restore original publisher
writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n");
console.log(`  ✓ makestro-${newVersion}-openvsx.vsix`);

// 6. Git commit + tag
run("git add package.json CHANGELOG.md");
run(`git commit -m "chore(release): v${newVersion}"`);
run(`git tag v${newVersion}`);
console.log(`  ✓ Tagged v${newVersion}`);

console.log(`\n🎶 Done! Push with:\n`);
console.log(`  git push && git push origin v${newVersion}\n`);
