export default function HelpPage() {
  return (
    <article className="prose max-w-3xl">
      <h1>Kids Booklet help</h1>
      <h2>What this POC does</h2>
      <p>It guides a creator from a story idea to an illustrated picture-story PDF using reviewable decision cards.</p>
      <h2>Create or resume a booklet</h2>
      <p>Enter a one-sentence idea on Home to create a saved booklet with all eight stages, then choose any saved booklet to resume it. Each workspace deep-link keeps its selected stage.</p>
      <h2>Cards and eight stages</h2>
      <p>The workspace shows all eight artifacts and the initial idea. Questions, reviews, progress, and recoverable issues are added as typed cards in the guided workflow.</p>
      <h2>Generation and export</h2>
      <p>Reference and page generation, selective revision, quality review, and PDF download are added in later slices.</p>
      <h2>POC limitations</h2>
      <p>Provider blocks and visual inconsistency can occur. The POC is local-first and does not include accounts or publishing.</p>
    </article>
  );
}
