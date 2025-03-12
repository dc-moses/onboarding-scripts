const { Octokit } = require("@octokit/rest");
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const axios = require('axios');

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  log: {
    debug: () => {},
    info: () => {},
    warn: console.warn,
    error: console.error
  }
});

const organization = "sig-se-demo";
const workflowFileName = "polaris.yml";
const outputFilePath = './onboarding_metrics.csv';
const branchesToCheck = ["main", "master", "dev"];

async function getRepos(org) {
  const repos = [];
  let page = 1;
  while (true) {
    const { data } = await octokit.repos.listForOrg({ org, type: "all", per_page: 100, page });
    if (data.length === 0) break;
    repos.push(...data);
    page++;
  }
  return repos;
}

async function checkWorkflowFile(repo, branch) {
  try {
    const { data: contents } = await octokit.repos.getContent({ owner: repo.owner.login, repo: repo.name, path: `.github`, ref: branch });
    return await searchFile(repo, branch, contents);
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

async function searchFile(repo, branch, items) {
  for (const item of items) {
    if (item.type === 'dir') {
      const { data: subContents } = await octokit.repos.getContent({ owner: repo.owner.login, repo: repo.name, path: item.path, ref: branch });
      if (await searchFile(repo, branch, subContents)) return true;
    } else if (item.type === 'file' && item.name === workflowFileName) {
      return true;
    }
  }
  return false;
}

async function getBranchRef(repo, branch) {
  try {
    const { data } = await octokit.git.getRef({ owner: repo.owner.login, repo: repo.name, ref: `heads/${branch}` });
    return data;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function createBranch(repo, baseBranch, newBranch) {
  const baseRefData = await getBranchRef(repo, baseBranch);
  if (!baseRefData) throw new Error(`Base branch ${baseBranch} does not exist in repository ${repo.name}`);
  await octokit.git.createRef({ owner: repo.owner.login, repo: repo.name, ref: `refs/heads/${newBranch}`, sha: baseRefData.object.sha });
}

async function createPullRequest(repo, branch) {
  const workflowFileUrl = 'https://raw.githubusercontent.com/sig-se-demo/webgoat-demo/main/.github/workflows/polaris.yml';
  const response = await axios.get(workflowFileUrl);
  const content = response.data;
  const base64Content = Buffer.from(content).toString('base64');
  const newBranch = `add-${workflowFileName}-${branch}`;

  try {
    let refData = await getBranchRef(repo, newBranch);
    if (!refData) {
      await createBranch(repo, branch, newBranch);
    } else {
      console.log(`Branch ${newBranch} already exists in repository ${repo.name}`);
    }

    let fileSha;
    try {
      const { data: fileData } = await octokit.repos.getContent({ owner: repo.owner.login, repo: repo.name, path: `.github/workflows/${workflowFileName}`, ref: newBranch });
      fileSha = fileData.sha;
    } catch (error) {
      if (error.status !== 404) throw error;
    }

    await octokit.repos.createOrUpdateFileContents({
      owner: repo.owner.login,
      repo: repo.name,
      path: `.github/workflows/${workflowFileName}`,
      message: `Add ${workflowFileName} workflow file`,
      content: base64Content,
      branch: newBranch,
      sha: fileSha
    });

    const { data: pullRequests } = await octokit.pulls.list({ owner: repo.owner.login, repo: repo.name, head: `${repo.owner.login}:${newBranch}`, base: branch, state: 'open' });
    if (pullRequests.length > 0) {
      console.log(`A pull request already exists for ${repo.owner.login}:${newBranch} to ${branch} in repository ${repo.name}`);
      return false;
    }

    await octokit.pulls.create({
      owner: repo.owner.login,
      repo: repo.name,
      title: `Add ${workflowFileName} workflow file`,
      head: newBranch,
      base: branch,
      body: `This PR adds the ${workflowFileName} workflow file to the ${branch} branch.`
    });

    console.log(`Created pull request to add workflow file to ${repo.name} on branch ${branch}`);
    return true;
  } catch (error) {
    if (error.message.includes('Base branch')) {
      console.error(error.message);
      return false;
    }
    console.error(`Failed to create pull request for ${repo.name} on branch ${branch}:`, error);
    return false;
  }
}

async function saveMetricsToCsv(metrics) {
  const csvWriter = createCsvWriter({
    path: outputFilePath,
    header: [
      { id: 'repo', title: 'Repository' },
      { id: 'onboarded', title: 'Onboarded' },
      { id: 'partiallyOnboarded', title: 'Partially Onboarded' },
      { id: 'onboardedBranches', title: 'Onboarded Branches' },
      { id: 'notOnboardedBranches', title: 'Not Onboarded Branches' },
      { id: 'prSubmitted', title: 'PR Submitted' }
    ]
  });

  const records = metrics.repos.map(repo => ({
    repo: repo.name,
    onboarded: repo.onboarded ? 'Yes' : 'No',
    partiallyOnboarded: repo.partiallyOnboarded ? 'Yes' : 'No',
    onboardedBranches: repo.onboardedBranches.join(', '),
    notOnboardedBranches: repo.notOnboardedBranches.join(', '),
    prSubmitted: repo.prSubmitted ? 'Yes' : 'No'
  }));

  await csvWriter.writeRecords(records);
  console.log(`Metrics saved to ${outputFilePath}`);
}

async function main(createPR = false) {
  console.time("Execution Time");
  const repos = await getRepos(organization);
  const metrics = {
    totalRepos: repos.length,
    onboardedRepos: 0,
    partiallyOnboardedRepos: 0,
    prSubmittedCount: 0,
    skippedRepos: 0,
    repos: []
  };

  for (const repo of repos) {
    let onboardedCount = 0;
    const onboardedBranches = [];
    const notOnboardedBranches = [];
    let prSubmitted = false;

    for (const branch of branchesToCheck) {
      if (await checkWorkflowFile(repo, branch)) {
        onboardedCount++;
        onboardedBranches.push(branch);
      } else {
        notOnboardedBranches.push(branch);
        if (createPR) {
          const prCreated = await createPullRequest(repo, branch);
          if (prCreated) {
            prSubmitted = true;
            metrics.prSubmittedCount++;
          }
        }
      }
    }

    const isOnboarded = onboardedCount === branchesToCheck.length;
    const isPartiallyOnboarded = onboardedCount > 0 && onboardedCount < branchesToCheck.length;

    if (isOnboarded) {
      metrics.onboardedRepos++;
    } else if (isPartiallyOnboarded) {
      metrics.partiallyOnboardedRepos++;
    }

    if (onboardedCount === 0 && !prSubmitted) {
      metrics.skippedRepos++;
    }

    metrics.repos.push({
      name: repo.name,
      onboarded: isOnboarded,
      partiallyOnboarded: isPartiallyOnboarded,
      onboardedBranches: onboardedBranches,
      notOnboardedBranches: notOnboardedBranches,
      prSubmitted: prSubmitted
    });
  }

  console.log("Onboarding Metrics:");
  console.log(`Total Repositories: ${metrics.totalRepos}`);
  console.log(`Onboarded Repositories: ${metrics.onboardedRepos}`);
  console.log(`Partially Onboarded Repositories: ${metrics.partiallyOnboardedRepos}`);
  console.log(`Not Onboarded Repositories: ${metrics.totalRepos - metrics.onboardedRepos - metrics.partiallyOnboardedRepos}`);
  console.log(`Pull Requests Submitted: ${metrics.prSubmittedCount}`);
  console.log(`Skipped Repositories: ${metrics.skippedRepos}`);

  await saveMetricsToCsv(metrics);
  console.timeEnd("Execution Time");
}

main(true).catch(console.error);