# Onboarding Script

This script automates the process of checking repositories in a GitHub organization for the presence of a specific workflow file (`polaris.yml`). If the workflow file is not found in the specified branches, the script can create a pull request to add the workflow file.

## Prerequisites

- Node.js installed
- GitHub Personal Access Token with appropriate permissions

## Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/your-username/onboarding-scripts.git
    cd onboarding-scripts
    ```

2. Install the dependencies:
    ```sh
    npm install
    ```

## Configuration

1. Create a `.env` file in the root directory and add your GitHub token:
    ```env
    GITHUB_TOKEN=your_github_token
    ```

2. Update the `organization` variable in the script to your GitHub organization name:
    ```javascript
    const organization = "your-organization";
    ```

## Usage

To run the script, execute the following command:
```sh
node Onboarded.js
```

By default, the script will create pull requests to add the workflow file if it is not found. If you want to run the script without creating pull requests, modify the `main` function call in the script:
```javascript
main(false).catch(console.error);
```

## Script Functionality

- **getRepos(org)**: Fetches all repositories in the specified organization.
- **checkWorkflowFile(repo, branch)**: Checks if the workflow file exists in the specified branch of the repository.
- **searchFile(repo, branch, items)**: Recursively searches for the workflow file in the repository.
- **getBranchRef(repo, branch)**: Gets the reference of the specified branch.
- **createBranch(repo, baseBranch, newBranch)**: Creates a new branch from the base branch.
- **createPullRequest(repo, branch)**: Creates a pull request to add the workflow file to the specified branch.
- **saveMetricsToCsv(metrics)**: Saves the onboarding metrics to a CSV file.
- **main(createPR)**: Main function that orchestrates the onboarding process and generates metrics.

## Output

The script generates a CSV file (`onboarding_metrics.csv`) with the following columns:
- Repository
- Onboarded
- Partially Onboarded
- Onboarded Branches
- Not Onboarded Branches
- PR Submitted

## Example

```sh
node Onboarded.js
```

This will run the script and create pull requests for repositories that do not have the workflow file in the specified branches.

## License

This project is licensed under the MIT License.