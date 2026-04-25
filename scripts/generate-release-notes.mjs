import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  let repo = process.env.GITHUB_REPOSITORY ?? '';
  const args = [];

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--repo') {
      repo = argv[i + 1] ?? '';
      i += 1;
      continue;
    }

    args.push(argv[i]);
  }

  if (args.length !== 1) {
    throw new Error('Usage: node scripts/generate-release-notes.mjs [--repo <owner/repo>] <tag>');
  }

  const tag = args[0];
  if (!/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(tag)) {
    throw new Error(`Invalid release tag: ${tag}`);
  }

  return { repo, tag };
}

async function git(args) {
  const { stdout } = await execFileAsync('git', args, { encoding: 'utf8' });
  return stdout.trim();
}

async function findPreviousTag(tag) {
  const tagList = await git([
    'tag',
    '--merged',
    tag,
    '--sort=-version:refname',
    '--list',
    'v[0-9]*',
  ]);

  return tagList
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)
    .find((value) => value !== tag);
}

function parseCommit(line) {
  const [shortSha, subject] = line.split('\t');
  const match = subject.match(/^([a-z]+)(\([^)]+\))?!?:\s+(.+)$/);

  return {
    shortSha,
    subject,
    type: match?.[1] ?? 'other',
    summary: match?.[3] ?? subject,
  };
}

function categoryFor(type) {
  const categories = {
    feat: 'New Features',
    fix: 'Bug Fixes',
    docs: 'Documentation',
    test: 'Tests',
    ci: 'CI',
    build: 'Build',
    perf: 'Performance',
    refactor: 'Refactors',
    chore: 'Chores',
    revert: 'Reverts',
    other: 'Other Changes',
  };

  return categories[type] ?? categories.other;
}

async function getCommits(previousTag, tag) {
  const range = previousTag ? `${previousTag}..${tag}` : tag;
  const output = await git(['log', '--pretty=format:%h%x09%s', range]);

  if (!output) {
    return [];
  }

  return output.split('\n').map(parseCommit);
}

function renderSection(title, lines) {
  if (lines.length === 0) {
    return [];
  }

  return [`## ${title}`, '', ...lines, ''];
}

function renderReleaseNotes({ commits, previousTag, repo, tag }) {
  const grouped = new Map();

  for (const commit of commits) {
    const category = categoryFor(commit.type);
    const values = grouped.get(category) ?? [];
    values.push(`- ${commit.summary}`);
    grouped.set(category, values);
  }

  const categoryOrder = [
    'New Features',
    'Bug Fixes',
    'Performance',
    'Refactors',
    'Documentation',
    'Tests',
    'CI',
    'Build',
    'Chores',
    'Reverts',
    'Other Changes',
  ];

  const lines = [];

  for (const category of categoryOrder) {
    lines.push(...renderSection(category, grouped.get(category) ?? []));
  }

  if (repo && previousTag) {
    lines.push(
      '## Changelog',
      '',
      `Full Changelog: https://github.com/${repo}/compare/${previousTag}...${tag}`,
      '',
    );
  }

  lines.push(
    ...renderSection(
      'Commit Changes',
      commits.map((commit) => `- ${commit.shortSha} ${commit.subject}`),
    ),
  );

  return lines.join('\n').trimEnd() + '\n';
}

const { repo, tag } = parseArgs(process.argv.slice(2));
const previousTag = await findPreviousTag(tag);
const commits = await getCommits(previousTag, tag);

process.stdout.write(renderReleaseNotes({ commits, previousTag, repo, tag }));
