# Kids Booklet user guide

## What this POC does and does not do

Kids Booklet is a local, single-user proof of concept for turning a story idea into an illustrated English-language picture-story PDF. It does not include accounts, collaboration, publishing, payments, or a user-managed global asset library.

## Create or resume a booklet

On Home, enter a rough story idea and choose **Create booklet**. The application creates the saved booklet, its initial user message, and all eight empty artifact stages before opening the workspace. Reopen any saved booklet from Home to resume it. Selecting a stage in the workspace rail puts that choice in the URL, so a bookmarked or reloaded workspace opens the same selected stage while its active workflow stage remains saved in the booklet.

## Cards and the eight artifact stages

The workspace always shows Audience Profile, Story Plan, Visual Style, Visual Bible, Booklet Specification, Page Plan, Final Pages, and PDF Export. Questions, recommendations, reviews, progress, and recoverable problems will appear as typed cards as the guided workflow is added. The current persisted shell shows each stage’s saved status and the initial idea.

## References, generation, and revision

The POC generates canonical references for recurring subjects, then creates one illustration per page. You can retry a failed item, change page text without regenerating its illustration, or request a selected visual revision. Work already completed remains saved.

## Quality issues and approval

An accepted quality issue records your decision but does not approve or advance an artifact. Use the artifact-review card to approve deliberately after considering the issue.

## Export and download

After all final pages are approved, the application assembles a PDF in deterministic page order. A failed export can be retried without discarding final pages.

## Local data and limitations

Booklet data and generated assets are stored under the configured `data/` directory. Preserve that directory to retain local work. Provider policy blocks, generation failures, and visual inconsistency remain possible and are surfaced as recoverable POC conditions.
