# Kids Booklet user guide

## What this POC does and does not do

Kids Booklet is a local, single-user proof of concept for turning a story idea into an illustrated English-language picture-story PDF. It does not include accounts, collaboration, publishing, payments, or a user-managed global asset library.

## Create or resume a booklet

Home will list saved booklets. Choose **Create booklet** to start from a rough idea, or reopen a saved booklet to resume its last saved workflow state.

## Cards and the eight artifact stages

Questions, recommendations, reviews, progress, and recoverable problems appear as typed cards. Advancing from a reviewed artifact approves its displayed version. The visible stages are Audience Profile, Story Plan, Visual Style, Visual Bible, Booklet Specification, Page Plan, Final Pages, and PDF Export.

## References, generation, and revision

The POC generates canonical references for recurring subjects, then creates one illustration per page. You can retry a failed item, change page text without regenerating its illustration, or request a selected visual revision. Work already completed remains saved.

## Quality issues and approval

An accepted quality issue records your decision but does not approve or advance an artifact. Use the artifact-review card to approve deliberately after considering the issue.

## Export and download

After all final pages are approved, the application assembles a PDF in deterministic page order. A failed export can be retried without discarding final pages.

## Local data and limitations

Booklet data and generated assets are stored under the configured `data/` directory. Preserve that directory to retain local work. Provider policy blocks, generation failures, and visual inconsistency remain possible and are surfaced as recoverable POC conditions.
