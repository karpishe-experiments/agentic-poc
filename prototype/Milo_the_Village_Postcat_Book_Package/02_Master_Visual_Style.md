# *Milo the Village Postcat* — Master GPT-Image Style System

## Purpose

This file supplies the stable visual language for every generated reference sheet and final page. For each image, paste the **Master Style Prompt** first, then add the page-specific or reference-specific prompt below it.

## Master Style Prompt

> Create a 10 × 8 inch **landscape** children’s-book illustration for *Milo the Village Postcat*. Use a luminous hand-painted storybook style: richly layered gouache and oil-paint-like brush texture, visible but controlled impasto, soft blended edges, and a tactile painted-paper surface. Use peacock teal and turquoise for cool shadow and structure; apricot, honey gold, butter yellow, and peach for glowing sunlight; poppy red, coral, and raspberry for small story accents; and leaf green and warm cream for natural balance. The lighting is warm and magical but believable, with gentle sun glow through foliage and cottage windows. Shapes are rounded, cozy, and affectionate. Animal characters are expressive and clearly readable, with soft eyes and simple, child-friendly silhouettes. Keep the main character’s face, hands/paws, and the key story object crisp and easy to read; place texture and detail around—not over—the focal action. Compose with one clear foreground action, a supporting midground, and a softly simplified background. Leave a deliberately calm, uncluttered area for typography to be added later. The art contains **no printed words, title, speech bubbles, captions, watermark, logo, signature, border, or readable signage**.

## Character-continuity clause

Append this whenever Milo or another established character appears:

> Preserve the exact approved character design and proportions from the supplied character reference sheet. Milo is a small round ginger tabby cat with a pale cream muzzle, chin, chest, belly, and paw tips; exactly three russet-brown forehead stripes; bright leaf-green eyes; a small dusty-pink triangular nose; a long ringed tabby tail with dark tip; a navy-blue postman cap with a gold paw badge; a cream collared shirt; and a red canvas mail satchel. Do not change his species, markings, eye colour, clothing colours, or scale.

## Environment-continuity clause

Append this whenever Poppywick appears after the location sheets are approved:

> Preserve the approved Poppywick Village environment: rounded warm-cream cottages, flower boxes, cobbled lanes, apple trees, low stone walls, leaf-green gardens, and gentle rolling hills. Use the supplied location reference image as the architectural and palette authority; do not introduce modern infrastructure or unrelated buildings.

## Page-specific prompt template

Copy this template and replace the brackets:

```text
[MASTER STYLE PROMPT]

[CHARACTER-CONTINUITY CLAUSE]

[ENVIRONMENT-CONTINUITY CLAUSE]

Scene: [one plain-language sentence describing the exact story action].

Composition: [foreground focus and position], [two or three midground supports], [simplified background].

Character performance: [expression, pose, gaze direction, and interaction].

Required objects: [only the props that are essential to the page].

Typography reserve: leave [top-left / top-right / lower-left / lower-right] as a calm, low-detail area, with no faces or important objects.

Do not include: [specific page exclusions].
```

## Controlled exclusions

Use the relevant items below on every prompt. They are as important as the positive description.

- No text, letters, speech bubbles, numbers, logos, watermarks, signatures, borders, or readable shop signs.
- No photorealism, glossy CGI, flat vector graphics, manga/anime styling, thin black cartoon outlines, or harsh digital airbrushing.
- No scary expressions, sharp claws, visible fangs, threatening poses, sad abandonment, or chaotic crowd scenes.
- No modern cars, streetlights, phones, plastic packaging, neon signs, or city architecture.
- No snow, winter clothing, human characters, elephants, dogs, or scene elements copied from the source reference images.
- Do not alter fixed character anatomy, fur markings, eye colour, clothing, or relative scale.
- No more background activity than the page brief calls for.

## Quality bar before accepting an image

- Does it read as a 5:4 landscape image without awkward crop pressure?
- Can a child immediately locate Milo and understand what he is doing?
- Are Milo’s three forehead stripes, green eyes, navy cap, cream shirt, and red satchel present and correct?
- Is the key object (especially the envelope) large enough to understand?
- Does the image feel painterly and luminous, while faces and key actions remain clean?
- Is the planned typography reserve truly calm and usable?
- Does it contain no accidental or distorted written text?

## Stage 1 outcome

The master style system is approved as the default prompt layer. Stage 2 will now create two character-reference prompts: one for the four main characters and one for the four supporting villagers.
