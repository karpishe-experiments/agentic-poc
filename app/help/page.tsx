export default function HelpPage() {
  return (
    <article className="prose max-w-3xl">
      <h1>Kids Booklet help</h1>
      <h2>What this POC does</h2>
      <p>It guides a creator from a story idea to an illustrated picture-story PDF using reviewable decision cards.</p>
      <h2>Create or resume a booklet</h2>
      <p>Enter a one-sentence idea on Home to create a saved booklet with all eight stages, then choose any saved booklet to resume it. Each workspace deep-link keeps its selected stage.</p>
      <h2>Cards and eight stages</h2>
      <p>The workspace shows Audience, Story, Style, Visual Bible, Booklet Specification, Page Plan, Final Pages, and PDF Export. Follow the active card: approve Visual Bible definitions before reference generation, select every reviewed reference/page before that artifact advances, select a seeded visual style, and explicitly confirm the final page shape. Use the visible story-page count control to choose three to eight pages, then save that count in one action before confirming geometry.</p>
      <h2>Generation and export</h2>
      <p>The POC creates one canonical reference for each recurring character or location, then one cover plus one illustration per story page. The approved Page Plan structures titles, narration, dialogue, thoughts, and sound effects for professional in-image comic lettering. Legacy plans must use Upgrade to Comic Lettering and approve the revision before new page generation. Reference/page work runs as saved background jobs and shows item progress.</p>
      <p>Click any gallery thumbnail for a full-size preview. Each page/reference can be regenerated independently with an optional visual or lettering-rendering instruction; its current image remains active until replacement succeeds. Change story copy through a revised Page Plan, review every changed Final Page, then approve the finished set and export the PDF.</p>
      <h2>Recovery and evidence</h2>
      <p>Saved cards, artifact versions, and completed generation items survive reloads. Any generation failure stops the queue before a later item starts. Retry failed page or Retry failed reference regenerates only that item; after it succeeds, use Continue generating images to resume retained pending work. If a saved workflow check needs a safe retry, use the named recovery card; it keeps approved decisions and does not start generation. If a local browser session cannot load current files, select Reload workspace. Quality findings require an explicit fix, regeneration, or Accept remaining issue decision. The workspace Evidence JSON link summarizes calls, traces, local assets, exports, and any recorded quality reviews for the current booklet.</p>
      <h2>POC limitations</h2>
      <p>Provider blocks and visual inconsistency can occur. This is a local-first POC with no accounts, sharing, publishing, payments, or deletion workflow.</p>
    </article>
  );
}
