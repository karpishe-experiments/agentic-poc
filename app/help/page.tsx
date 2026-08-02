export default function HelpPage() {
  return (
    <article className="prose max-w-3xl">
      <h1>Kids Booklet help</h1>
      <h2>What this POC does</h2>
      <p>It guides a creator from a story idea to an illustrated picture-story PDF using reviewable decision cards.</p>
      <h2>Create or resume a booklet</h2>
      <p>Enter a one-sentence idea on Home to create a saved booklet with all eight stages, then choose any saved booklet to resume it. Each workspace deep-link keeps its selected stage.</p>
      <h2>Cards and eight stages</h2>
      <p>The workspace shows Audience, Story, Style, Visual Bible, Booklet Specification, Page Plan, Final Pages, and PDF Export. Follow the active card: approve Visual Bible definitions before reference generation, select every reviewed reference/page before that artifact advances, select a seeded visual style, and explicitly confirm the final page shape. You can change the recommended story-page count from three to eight in the Booklet Specification editor before confirming geometry.</p>
      <h2>Generation and export</h2>
      <p>The POC creates one canonical reference for each recurring character or location, then one cover plus one illustration per story page. Reference/page work runs as saved background jobs and shows item progress. After page count is confirmed, the rail includes a link for every page package. On Final Pages, you can recompose reader text without replacing the source illustration or regenerate a single visual. Approve the finished page set, then ask to export and download the PDF.</p>
      <h2>Recovery and evidence</h2>
      <p>Saved cards, artifact versions, and completed generation items survive reloads. If a reference or page generation fails, use its Retry item action. Quality findings require an explicit fix, regeneration, or Accept remaining issue decision. The workspace Evidence JSON link summarizes calls, traces, local assets, exports, and any recorded quality reviews for the current booklet.</p>
      <h2>POC limitations</h2>
      <p>Provider blocks and visual inconsistency can occur. This is a local-first POC with no accounts, sharing, publishing, payments, or deletion workflow.</p>
    </article>
  );
}
