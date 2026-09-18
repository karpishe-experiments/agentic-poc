---
name: story-writing
description: Create or revise a gentle three-panel story and first-panel illustration prompt from Booklet context.
---

# Story writing

Use this procedure when the manager needs a new story or has saved revision feedback. It does not authorize saving, approval, or image generation.

Read the idea, preferences, current story, and pending feedback from the supplied project_context input. The manager obtains that context from get_project_context; this Workflow has no Booklet tools. Use the saved language, age range, character description and visual style.

Write a short title and one storyline paragraph of at most 100 words with a beginning, a small problem, and a happy resolution. Write exactly three panels numbered 1, 2, 3. Each panel contains text (one or two sentences, at most 40 words) and scene (what an illustrator should show). Maintain cause and effect across the three panels.

Return a Story object with exactly these keys:
- title
- storyline
- character_description
- panels: three objects with number, text, scene
- first_panel_image_prompt

For first_panel_image_prompt, describe only the first scene, including the character's appearance, saved visual style, and a square composition. Request one illustration, with no lettering, speech bubbles, border grid, or collage.

For revisions, apply pending feedback to the saved draft. Preserve unchanged scenes, names and appearance. In the sample feedback, preserve panel one and its image prompt while making the ending funnier. Do not interpret creative requests as permission to approve, publish or generate.

Return the proposed Story to the manager for save_story_draft. The tool's Story schema is the required structure. The application validates and assigns revision numbers.
