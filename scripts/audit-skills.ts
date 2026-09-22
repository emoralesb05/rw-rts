import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

type ProvenanceGroup = {
  id: string;
  sourceKind:
    | "cli-bundled"
    | "official-docs-derived"
    | "legacy-reference"
    | "package-derived"
    | "project-maintained";
  source: string;
  reviewedVersions: Record<string, string>;
  members: string[];
};

type Provenance = {
  schemaVersion: 1;
  reviewedAt: string;
  policy: string;
  groups: ProvenanceGroup[];
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const skillsRoot = join(repoRoot, ".agents", "skills");
const codexSkillsRoot = join(repoRoot, ".codex", "skills");
const provenancePath = join(skillsRoot, "provenance.json");
const packageJsonPath = join(repoRoot, "package.json");
const errors: string[] = [];
const execFileAsync = promisify(execFile);

const provenance = JSON.parse(
  await readFile(provenancePath, "utf8")
) as Provenance;
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

if (provenance.schemaVersion !== 1) {
  errors.push(
    `Unsupported provenance schema ${String(provenance.schemaVersion)}`
  );
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(provenance.reviewedAt)) {
  errors.push("reviewedAt must use YYYY-MM-DD");
}

const skillNames = (
  await Promise.all(
    (await readdir(skillsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => ({
        name: entry.name,
        hasSkill: await exists(join(skillsRoot, entry.name, "SKILL.md")),
      }))
  )
)
  .filter((entry) => entry.hasSkill)
  .map((entry) => entry.name)
  .sort();

const memberToGroup = new Map<string, ProvenanceGroup>();
for (const group of provenance.groups) {
  if (!group.id || !group.source || !group.sourceKind) {
    errors.push("Every provenance group needs id, sourceKind, and source");
  }
  for (const member of group.members) {
    const previous = memberToGroup.get(member);
    if (previous) {
      errors.push(`${member} appears in both ${previous.id} and ${group.id}`);
    }
    memberToGroup.set(member, group);
  }
  for (const [packageName, reviewedVersion] of Object.entries(
    group.reviewedVersions
  )) {
    await checkReviewedVersion(group.id, packageName, reviewedVersion);
  }
}

for (const skillName of skillNames) {
  if (!memberToGroup.has(skillName)) {
    errors.push(`${skillName} has no provenance entry`);
  }
  await checkSkill(skillName);
}
for (const member of memberToGroup.keys()) {
  if (!skillNames.includes(member)) {
    errors.push(`${member} has provenance but no SKILL.md`);
  }
}

if (errors.length > 0) {
  console.error(`Skill audit failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Skill audit passed: ${skillNames.length} skills, ${provenance.groups.length} provenance groups, reviewed ${provenance.reviewedAt}.`
);

async function checkSkill(skillName: string): Promise<void> {
  const skillDir = join(skillsRoot, skillName);
  const skillPath = join(skillDir, "SKILL.md");
  const content = await readFile(skillPath, "utf8");
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatter) {
    errors.push(`${skillName}/SKILL.md has no YAML frontmatter`);
  } else {
    const declaredName = frontmatter[1]
      .match(/^name:\s*([^\n]+)$/m)?.[1]
      .trim();
    if (declaredName !== skillName) {
      errors.push(`${skillName} declares name ${declaredName ?? "<missing>"}`);
    }
    if (!/^description:\s*(?:>|>-|"|[^\s])/m.test(frontmatter[1])) {
      errors.push(`${skillName} has no description`);
    }
  }

  for (const target of markdownLinks(content)) {
    const localTarget = target.split("#", 1)[0];
    if (!localTarget || /^(?:https?:|mailto:)/.test(localTarget)) continue;
    if (!(await exists(resolve(skillDir, localTarget)))) {
      errors.push(`${skillName} has broken link ${target}`);
    }
  }

  const codexLink = join(codexSkillsRoot, skillName);
  try {
    const linkStat = await lstat(codexLink);
    if (!linkStat.isSymbolicLink()) {
      errors.push(`.codex/skills/${skillName} is not a symlink`);
    } else if ((await realpath(codexLink)) !== (await realpath(skillDir))) {
      errors.push(`.codex/skills/${skillName} targets the wrong directory`);
    }
  } catch {
    errors.push(`.codex/skills/${skillName} is missing or broken`);
  }
}

async function checkReviewedVersion(
  groupId: string,
  packageName: string,
  reviewedVersion: string
): Promise<void> {
  if (packageName === "agent-browser") {
    try {
      const { stdout } = await execFileAsync("agent-browser", ["--version"], {
        encoding: "utf8",
        timeout: 5_000,
      });
      const installedVersion = stdout.match(/\d+\.\d+\.\d+/)?.[0];
      if (installedVersion !== reviewedVersion) {
        errors.push(
          `${groupId} reviewed agent-browser@${reviewedVersion}, installed ${installedVersion ?? "unknown"}`
        );
      }
    } catch (cause) {
      errors.push(
        `${groupId} cannot run agent-browser: ${cause instanceof Error ? cause.message : String(cause)}`
      );
    }
    return;
  }
  const declared =
    packageJson.dependencies?.[packageName] ??
    packageJson.devDependencies?.[packageName];
  if (!declared) {
    errors.push(`${groupId} reviews undeclared package ${packageName}`);
    return;
  }
  const installedPath = join(
    repoRoot,
    "node_modules",
    packageName,
    "package.json"
  );
  try {
    const installed = JSON.parse(await readFile(installedPath, "utf8")) as {
      version?: string;
    };
    if (installed.version !== reviewedVersion) {
      errors.push(
        `${groupId} reviewed ${packageName}@${reviewedVersion}, installed ${installed.version ?? "unknown"}`
      );
    }
  } catch {
    errors.push(`${groupId} cannot read installed ${packageName}`);
  }
}

function markdownLinks(content: string): string[] {
  return [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(
    (match) => match[1]
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

if (process.argv.includes("--verbose")) {
  for (const skillName of skillNames) {
    const group = memberToGroup.get(skillName);
    console.log(
      `${skillName}\t${group?.sourceKind ?? "missing"}\t${group?.source ?? "missing"}`
    );
  }
}
