# Repository setup for a documentation collaborator

This guide is for the repository administrator. It describes safeguards for a non-technical collaborator who edits legal documents with VS Code and Codex.

This file does not activate the safeguards. `@Mehdi-varm` already has Write access, while repository rulesets and branch protection are unavailable on the current plan. Use the manual gate in this guide until GitHub enforcement is active.

## 1. Prepare the accounts

1. Upgrade the private repository to a GitHub plan that supports repository rulesets and protected branches.
2. Confirm that the collaborator has enabled two-factor authentication on their GitHub account.
3. Get the collaborator's exact GitHub username.
4. Do not give the collaborator API keys, MongoDB credentials, `.env.local`, or shared application data. Documentation work does not require them.

At the time this guide was added, GitHub returned HTTP 403 for the repository ruleset and branch-protection APIs because the private repository's plan did not support those features. Recheck access after the upgrade.

## 2. Add legal-document owners

Create `.github/CODEOWNERS` with the following entry after you confirm that each listed account still has Write or Admin access:

```text
/docs/legal/ @Amir-Ahani @sinasava @karpishe @alivahidd @uniwares-uk
```

Update the list when administrator access changes. GitHub ignores a CODEOWNERS entry for an owner who does not have sufficient repository access.

## 3. Protect `master`

In the repository on GitHub, open **Settings → Rules → Rulesets** and create an active branch ruleset for `master`.

Configure these rules:

- Require a pull request before merging.
- Require one approval.
- Require review from Code Owners.
- Dismiss stale approvals when new commits are pushed.
- Require approval of the most recent reviewable push.
- Require all conversations to be resolved before merging.
- Restrict branch deletion.
- Block force pushes.
- Leave the bypass list empty so the rules also apply to repository administrators.

Do not require status checks until the repository has a stable workflow that reports those checks. Save the ruleset, then query the ruleset or branch-protection API to confirm the saved configuration.

## 4. Audit access and confirm the collaborator

1. Review every current Admin collaborator with the repository owner.
2. Downgrade an account only after its owner confirms that Admin access is no longer required.
3. Confirm that `@Mehdi-varm` retains the **Write** role. Do not grant Maintain or Admin access.
4. Do not invite another non-technical collaborator until the ruleset and CODEOWNERS file are active on `master`.

GitHub Write access cannot be limited to `docs/legal/`. Until the ruleset and CODEOWNERS file are active, require `@Mehdi-varm` to use a personal or task branch, approve the exact commit scope, avoid direct pushes to `master`, and obtain administrator review before merge. After enforcement is active, the protected branch, CODEOWNERS review, and contributor instructions enforce the working boundary.

## 5. Verify the setup

Use a test branch owned by the collaborator and change one file under `docs/legal/`.

Confirm all of these results:

- A direct push to `master` fails.
- The pull request requests review from the configured legal-document owners.
- GitHub blocks the merge until one owner approves it.
- A new commit dismisses the earlier approval.
- An unresolved conversation blocks the merge.
- GitHub blocks force pushes and deletion of `master`.
- The collaborator follows the policy not to merge their own pull request after approval.

The last item is a contributor policy. Verify it during onboarding because a collaborator with Write access can have permission to select the merge action after the required review.

## 6. Complete onboarding

Ask the collaborator to read [`CONTRIBUTING.md`](../CONTRIBUTING.md) and [`docs/legal/README.md`](legal/README.md). Walk through one small pull request together. Keep sensitive source documents in approved access-controlled storage and commit only sanitized summaries or safe links.

For GitHub's current controls, see [About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets), [Create a ruleset](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository), and [Manage repository access](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-teams-and-people-with-access-to-your-repository).
