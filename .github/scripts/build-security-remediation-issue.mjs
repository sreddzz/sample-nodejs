import fs from "node:fs";
import path from "node:path";

const [, , codeqlPath, xrayPath] = process.argv;

const severityRank = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
  warning: 2,
  error: 3,
  note: 1,
};

function readJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function normalizeSeverity(value) {
  const normalized = String(value || "medium").toLowerCase();
  if (normalized.includes("critical")) return "critical";
  if (normalized.includes("high") || normalized === "error") return "high";
  if (normalized.includes("medium") || normalized === "warning") return "medium";
  return "low";
}

function includeBySeverity(severity, threshold) {
  return (severityRank[normalizeSeverity(severity)] || 0) >= (severityRank[normalizeSeverity(threshold)] || 0);
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeCodeqlAlerts(alerts, threshold) {
  if (!Array.isArray(alerts)) {
    return [];
  }

  return alerts
    .map((alert) => {
      const severity = normalizeSeverity(firstDefined(
        alert.rule?.security_severity_level,
        alert.rule?.severity,
        alert.most_recent_instance?.severity,
      ));
      const location = firstDefined(
        alert.most_recent_instance?.location?.path,
        alert.instances?.[0]?.location?.path,
        "unknown location",
      );

      return {
        source: "CodeQL",
        severity,
        title: firstDefined(alert.rule?.description, alert.rule?.name, alert.rule?.id, "Unnamed CodeQL alert"),
        identifier: firstDefined(alert.rule?.id, alert.number, "codeql"),
        packageName: undefined,
        currentVersion: undefined,
        fixedVersion: undefined,
        location,
        url: alert.html_url,
        raw: alert,
      };
    })
    .filter((finding) => includeBySeverity(finding.severity, threshold));
}

function flattenXray(input) {
  if (Array.isArray(input)) {
    return input;
  }
  if (Array.isArray(input?.violations)) {
    return input.violations;
  }
  if (Array.isArray(input?.data)) {
    return input.data;
  }
  if (Array.isArray(input?.findings)) {
    return input.findings;
  }
  return [];
}

function normalizeXrayFindings(payload, threshold) {
  return flattenXray(payload)
    .map((finding) => {
      const cves = Array.isArray(finding.cves) ? finding.cves : [];
      const firstCve = cves[0] || {};
      const packageName = firstDefined(
        finding.component,
        finding.impacted_component?.name,
        finding.artifact?.name,
        finding.package_name,
        finding.name,
      );
      const currentVersion = firstDefined(
        finding.version,
        finding.impacted_component?.version,
        finding.artifact?.version,
        finding.package_version,
      );
      const fixedVersion = firstDefined(
        finding.fixed_versions?.[0],
        firstCve.fixed_versions?.[0],
        firstCve.fixed_version,
        finding.remediation,
      );
      const severity = normalizeSeverity(firstDefined(
        finding.severity,
        firstCve.severity,
        firstCve.cvss_v3_score >= 9 ? "critical" : undefined,
      ));

      return {
        source: "Xray",
        severity,
        title: firstDefined(finding.summary, finding.issue_id, firstCve.cve, "Unnamed Xray finding"),
        identifier: firstDefined(finding.issue_id, firstCve.cve, finding.id, "xray"),
        packageName,
        currentVersion,
        fixedVersion,
        location: firstDefined(finding.path, finding.artifact?.path, packageName, "dependency graph"),
        url: firstDefined(finding.url, firstCve.cve_url),
        raw: finding,
      };
    })
    .filter((finding) => includeBySeverity(finding.severity, threshold));
}

function dedupeFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = [finding.source, finding.identifier, finding.packageName, finding.currentVersion, finding.fixedVersion].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildTitle(findings) {
  const sources = [...new Set(findings.map((finding) => finding.source))].join(" + ");
  return `Security remediation: ${findings.length} open ${sources} finding${findings.length === 1 ? "" : "s"}`;
}

function renderFinding(finding) {
  const versionText = finding.packageName
    ? [
        `package \`${finding.packageName}\``,
        finding.currentVersion ? `@ \`${finding.currentVersion}\`` : "",
        finding.fixedVersion ? `→ fix to \`${finding.fixedVersion}\`` : "",
      ]
        .filter(Boolean)
        .join(" ")
    : `location \`${finding.location}\``;

  const linkText = finding.url ? ` ([reference](${finding.url}))` : "";
  return `- [${finding.source}] **${finding.severity.toUpperCase()}** ${finding.identifier}: ${finding.title}; ${versionText}${linkText}`;
}

function buildBody(findings) {
  const packageFindings = findings.filter((finding) => finding.packageName);
  const codeFindings = findings.filter((finding) => !finding.packageName);

  return [
    "## Objective",
    "Remediate the open security findings below, open a PR, and use the repository PR checks as the main validation loop.",
    "",
    "## Required outcome",
    "- Update dependency manifests, lockfiles, and any required overrides or resolutions.",
    "- Make the minimum code changes needed for compatibility after upgrades.",
    "- Open a PR as soon as the remediation is ready for CI validation.",
    "- Monitor the PR checks and push follow-up commits until required checks pass.",
    "- Use local commands like `yarn install`, `yarn build`, and `yarn test` when useful, but treat PR workflow status as the source of truth.",
    "- If a finding cannot be safely fixed, explain why in the PR and leave it unchanged.",
    "- Open a PR with a concise summary of fixes, CI results, and any remaining risks.",
    "",
    "## Findings",
    ...(findings.length ? findings.map(renderFinding) : ["- No findings provided."]),
    "",
    "## Scope guidance",
    "- Prefer the smallest safe version bump that reaches a fixed version.",
    "- Avoid unrelated refactors.",
    "- Keep changes limited to files needed for remediation and compatibility.",
    packageFindings.length
      ? "- Prioritize package findings first, then handle any code-level findings that still remain in scope."
      : "- Focus on the code-level security findings listed above.",
    "",
    "## Validation checklist",
    "- [ ] Dependencies updated",
    "- [ ] PR opened",
    "- [ ] Required PR checks pass",
    "- [ ] PR opened with summary",
    ...(codeFindings.length
      ? ["", "## Code-level findings to review", ...codeFindings.map(renderFinding)]
      : []),
    "",
  ].join("\n");
}

const threshold = process.env.SEVERITY_THRESHOLD || "medium";
const codeqlAlerts = readJson(codeqlPath);
const xrayPayload = readJson(xrayPath);
const findings = dedupeFindings([
  ...normalizeCodeqlAlerts(codeqlAlerts, threshold),
  ...normalizeXrayFindings(xrayPayload, threshold),
]);

const issueTitle = buildTitle(findings);
const issueBody = buildBody(findings);

fs.writeFileSync(path.resolve("remediation-issue-title.txt"), issueTitle + "\n");
fs.writeFileSync(path.resolve("remediation-issue-body.md"), issueBody);

const githubOutput = process.env.GITHUB_OUTPUT;
if (githubOutput) {
  fs.appendFileSync(githubOutput, `has_findings=${findings.length > 0}\n`);
}

console.log(`Prepared remediation issue with ${findings.length} finding(s).`);
