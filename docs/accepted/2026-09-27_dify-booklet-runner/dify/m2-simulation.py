"""Self-contained Dify Code node fixture for simulated J01-J10 proposals.

Pinned Ali J03-J10 source: 631f547ec3f7ce375f740dd6f2b1b9aaebbde940.
Fixed-case simulation retains narrative dependencies and complete content.
Booklet owns durable IDs and acceptance; preference deviations remain warnings.
"""

import hashlib
import json
import re
from uuid import UUID


CASES = {
    "playful_kid": {
        "brief": "A young inventor and tiny robot rescue a runaway kite; playful and reassuring; readers 6–8; three single-scene story pages plus cover, two recurring characters, one location.",
        "title": "The Kite Rescue", "age": "6-8", "premise": "A young inventor and a tiny robot rescue a runaway kite in their neighborhood park.",
        "theme": "Helping together makes a hard problem smaller.", "promise": "A playful rescue ends with everyone safe and proud.", "tone": "Playful and reassuring",
        "scope": "Three single-scene story pages plus a cover, with two recurring characters and one park location.",
        "characters": [("Young inventor", "Invents a safe way to reach the kite", "Friend and maker of the tiny robot"), ("Tiny robot", "Spots the kite and helps test the plan", "Trusted companion of the inventor")],
        "locations": [("Neighborhood park", "The kite escapes and is recovered here")],
        "arc": ["The inventor and robot fly a kite in the park.", "A gust carries the kite into a tree.", "Their first reach falls short, so they assemble a gentle retrieval tool.", "The inventor listens to the robot's safer route around the tree.", "They recover the kite and fly it together again."],
        "prose": [
            "The young inventor lifted a bright kite into the park breeze. The tiny robot rolled beside them, chirping as the kite climbed. For a while, they watched it dance above the grass together.",
            "A sudden gust tugged the string from the inventor's hand. The kite caught high in a tree, beyond either friend's reach. The robot spotted it first and gave a worried beep.",
            "The inventor tried a long stick, but its tip fell short. They stopped before shaking the branch and made a soft hook from the safe things in their bag. Even that tool could not reach from where they stood.",
            "The robot rolled around the trunk and found a clear path to a lower branch. The inventor listened, moved with the robot, and lifted the hook gently. Together they eased the kite free without hurting the tree.",
            "Back on the grass, the inventor checked the kite and smiled at the robot. They held the string together as the breeze lifted it again. The rescue had worked because each friend noticed something the other had missed.",
        ],
    },
    "enthusiast_parent": {
        "brief": "A child and grandparent turn a rainy afternoon into an indoor adventure; warm; readers 3–5; five story pages plus cover, two recurring characters, one location, including one simple two-panel page.",
        "title": "The Rainy Room Adventure", "age": "3-5", "premise": "A child and grandparent turn a rainy afternoon into an indoor adventure.",
        "theme": "Imagination and companionship brighten a quiet day.", "promise": "A warm adventure ends in comfort and shared delight.", "tone": "Warm and gentle",
        "scope": "Five story pages plus a cover, with two recurring characters, one home location, and one simple two-panel page.",
        "characters": [("Child", "Chooses the adventure's destination", "Grandchild of the grandparent"), ("Grandparent", "Helps build and explore a pretend world", "Grandparent of the child")],
        "locations": [("Family living room", "A safe room becomes the imagined adventure setting")],
        "arc": ["Rain keeps the child and grandparent inside.", "The child imagines the sofa as a boat.", "They build a blanket sail and encounter a pretend storm.", "The child suggests steering toward a pillow island.", "They arrive, share a snack, and listen to the rain together."],
        "prose": [
            "Rain tapped the living room window all afternoon. The child looked at the gray sky, and the grandparent settled beside them. They decided that staying inside could be the start of an adventure.",
            "The child pointed to the sofa and imagined a boat. The grandparent stepped aboard the rug beside it, and together they named their quiet room a wide sea. The child became the captain.",
            "They draped a blanket over the sofa to make a sail. When the rain grew louder, they pretended a storm had found their boat. The sail slipped, so they held it steady and waited together.",
            "The child saw a pile of pillows across the room and called it an island. The grandparent followed the captain's plan as they steered their pretend boat toward it. Soon the blanket sail rested safely beside the pillows.",
            "On their pillow island, the child and grandparent shared a snack. The rain was still falling, but it sounded gentle now. They sat close, pleased with the world they had made together.",
        ],
    },
    "professional_creator": {
        "brief": "Two friends repair a community observatory after a disagreement; precise emotional arc; readers 9–12; eight story pages plus cover, two recurring characters, two locations, at least two multi-panel pages.",
        "title": "The Observatory Lantern", "age": "9-12", "premise": "Two friends repair a community observatory after a disagreement.",
        "theme": "Trust grows when friends listen and share responsibility.", "promise": "An honest repair restores both the observatory and the friendship.", "tone": "Reflective and hopeful",
        "scope": "Eight story pages plus a cover, with two recurring characters, two locations, and at least two multi-panel pages.",
        "characters": [("First friend", "Finds the damaged observatory lantern", "Friend and project partner of the second friend"), ("Second friend", "Diagnoses the lantern and proposes a repair", "Friend and project partner of the first friend")],
        "locations": [("Community observatory", "The damaged lantern must be repaired before viewing night"), ("Workshop", "The friends test a replacement part and talk through their disagreement")],
        "arc": ["The friends prepare the observatory for viewing night.", "A disagreement distracts them and the lantern stops working.", "Separate repair attempts fail, and the opening time approaches.", "They acknowledge each other's ideas and combine their plans.", "The lantern works; they welcome neighbors and watch the stars together."],
        "prose": [
            "The two friends opened the community observatory before viewing night. One checked the lantern while the other arranged the tools they would need. They had built this evening together, and both wanted their neighbors to feel welcome.",
            "When the lantern failed, each friend thought they knew the cause. Their disagreement grew sharper as the room darkened. They turned away from each other, and the observatory remained unready.",
            "Each friend tried a separate repair, but neither attempt restored the light. The opening hour drew closer. Looking at their unfinished work, they began to understand that the fault needed both of their ideas.",
            "At the workshop, one friend explained the damaged part while the other described a safer connection. They apologized for talking past each other and tested a replacement together. The lantern glowed steadily in their hands.",
            "They carried the repaired lantern back to the observatory. As neighbors arrived, the friends welcomed them side by side under the new light. Above them, the first stars appeared, and their shared work felt stronger than either plan alone.",
        ],
    },
}

TASKS = ("J01", "J02", "J03", "J04", "J05", "J06", "J07", "J08")
PREFIX = "Approved concept constraint: "


def current_version(artifact):
    if not artifact:
        return None
    return next((item for item in artifact.get("versions", []) if item["id"] == artifact.get("currentVersionId")), None)


def add_notes(existing, additions):
    return existing + [item for item in additions if item not in existing]


def source(context, task):
    row = next((item for item in context.get("approvedSources", []) if item["taskId"] == task), None)
    if not row:
        raise ValueError(f'{context["taskId"]} requires approved {task}.')
    return row["content"]


def proposal(task, content):
    return {"kind": "proposal", "payload": {"taskId": task, "content": content}}


def assembled_style(content):
    """Mirror the assembled shape needed by tester eligibility, not stored approval."""
    def text(value, limit=16000):
        return isinstance(value, str) and 0 < len(value) <= limit and bool(value.strip())

    def texts(value):
        return isinstance(value, list) and len(value) <= 100 and all(text(item) for item in value)

    def uuid(value):
        return isinstance(value, str) and bool(re.fullmatch(r"(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)", value))

    def hash64(value):
        return isinstance(value, str) and bool(re.fullmatch(r"[0-9a-f]{64}", value))

    if not isinstance(content, dict) or content.get("schemaVersion") != "2" or not text(content.get("title"), 1000):
        return False
    if not all(text(content.get(key)) for key in ("typographyDirection", "speechAndThoughtBubbleDirection", "stylePromptModule")) or not hash64(content.get("stylePromptModuleHash")):
        return False
    definition = content.get("styleDefinition")
    if not isinstance(definition, dict) or not all(text(definition.get(key)) for key in ("mediumAndLineWork", "shapeLanguageAndProportions", "colourAndContrast", "textureAndRendering", "lightingAndAtmosphere", "emotionalTone", "accessibilityAndReadability")):
        return False
    if not texts(content.get("exclusions")) or not texts(content.get("approvalQuestions")) or not uuid(content.get("draftStyleVersionId")):
        return False
    samples = content.get("samples")
    if not isinstance(samples, list) or len(samples) != 2 or any(not isinstance(item, dict) for item in samples) or {item.get("sampleKey") for item in samples} != {"sample_1", "sample_2"}:
        return False
    for sample in samples:
        build = sample.get("build")
        if not text(sample.get("purpose")) or not isinstance(build, dict) or not text(build.get("prompt")) or not hash64(build.get("stylePromptModuleHash")) or not all(uuid(build.get(key)) for key in ("operationId", "assetId")):
            return False
        sources = build.get("sourceVersionIds")
        if not isinstance(sources, list) or not 1 <= len(sources) <= 10 or not all(uuid(item) for item in sources) or len(set(sources)) != len(sources):
            return False
    return True


def style_fixture(context, previous, revision):
    concept, outline, manuscript, characters, locations = [source(context, task) for task in ("J01", "J02", "J05", "J06", "J07")]
    for task in ("J01", "J02", "J05", "J06", "J07"):
        UUID(next(item["id"] for item in context["approvedSources"] if item["taskId"] == task))
    persona = context["persona"]
    if concept["sourceInput"] != context["brief"] or len(outline["characters"]) != 2 or len(characters["characters"]) != 2 or len(outline["locations"]) != (2 if persona == "professional_creator" else 1) or len(locations["locations"]) != (2 if persona == "professional_creator" else 1):
        raise ValueError("Reference sources do not match fixed case")
    current = previous["content"] if previous and (context.get("currentTarget") or {}).get("state") != "needs_review" else None
    plans = current.get("samplePlan") if current else None
    if current and assembled_style(current):
        plans = [{"sampleKey": item["sampleKey"], "purpose": item["purpose"]} for item in current["samples"]]
    direction = "Playful clear shapes and lively but reassuring movement for developing readers." if persona == "playful_kid" else "Warm rounded shapes, gentle contrast, and calm readable detail for early readers." if persona == "enthusiast_parent" else "Precise environmental detail and restrained light shifts that follow the older readers' emotional arc."
    module = current["stylePromptModule"] if current else "\n".join([
        f"Style direction: {direction}",
        f'Visual tone: {concept["tone"]}. Use clear expressive faces and body language to communicate changing emotions.',
        "Composition: Show a legible primary action, expressive body language, and enough environmental detail to orient the reader without fixing a scene layout.",
        "Continuity: Preserve approved character and place facts in each scene-specific prompt.",
        "Lettering: Leave clean readable space for narration; use clear speech bubbles, distinct thought bubbles, restrained sound effects, and diegetic text only where the story calls for it.",
    ])
    if current and (current.get("stylePromptModuleHash") != hashlib.sha256(module.encode("utf-8")).hexdigest() or not isinstance(plans, list) or len(plans) != 2 or {item.get("sampleKey") for item in plans} != {"sample_1", "sample_2"}):
        raise ValueError("Current style proposal is inconsistent")
    notes = (["Revision request: " + revision] if revision else []) + [f'{item["question"]}: {item["answer"]}' for item in context.get("questionAnswers", []) if item.get("answer") and item["answer"].strip()]
    content = {"schemaVersion": "2", "title": current["title"] if current else outline["title"] + " visual style",
        "styleDefinition": current["styleDefinition"] if current else {"mediumAndLineWork": f"Illustrated storybook with {direction}", "shapeLanguageAndProportions": direction, "colourAndContrast": f'Palette follows {concept["tone"]}; preserve readable contrast.', "textureAndRendering": "Controlled texture keeps faces, actions, and important objects legible.", "lightingAndAtmosphere": f'Light supports {outline["emotionalArc"]}.', "emotionalTone": concept["emotionalPromise"], "accessibilityAndReadability": f'Clear silhouettes and text-safe space suit the {concept["audience"]["ageBand"]} audience.'},
        "typographyDirection": current["typographyDirection"] if current else "Readable storybook lettering with clear narration hierarchy and generous spacing.",
        "speechAndThoughtBubbleDirection": current["speechAndThoughtBubbleDirection"] if current else "Separate speech and thought bubbles; keep tails unambiguous and leave room for sound effects and diegetic signs.",
        "stylePromptModule": module, "stylePromptModuleHash": hashlib.sha256(module.encode("utf-8")).hexdigest(),
        "exclusions": current["exclusions"] if current else ["Do not change approved character identity or location anchors."],
        "approvalQuestions": add_notes(current["approvalQuestions"] if current else ["Do both samples express the intended emotion, action, environment, and detail?"], notes),
        "samplePlan": plans if plans is not None else [{"sampleKey": "sample_1", "purpose": f'Show {" and ".join(item["nameOrRole"] for item in characters["characters"])}: {manuscript["units"][0]["action"]} in {locations["locations"][0]["title"]}; establish emotion, setting, and readable detail.'}, {"sampleKey": "sample_2", "purpose": f'Show {manuscript["units"][-1]["action"]} with the same characters and environmental anchors; test emotional change and action clarity.'}]}
    return proposal("J08", content)


def sheet_fixture(context, previous, revision):
    """Proposal only; Booklet must validate source approval and stored assets."""
    task = context["taskId"]
    final_task = "J06" if task == "J09" else "J07"
    rows = context.get("approvedSources", [])
    def row(task_id):
        matches = [item for item in rows if item["taskId"] == task_id]
        if len(matches) != 1:
            raise ValueError("Sheet requires one final list and one assembled style source")
        UUID(matches[0]["id"])
        return matches[0]
    final, style_row = row(final_task), row("J08")
    style = style_row["content"]
    if not assembled_style(style) or style["stylePromptModuleHash"] != hashlib.sha256(style["stylePromptModule"].encode("utf-8")).hexdigest():
        raise ValueError("Sheet requires an assembled style with its exact module hash")
    # Match the canonical reference parser's sample-build invariants.
    builds = [item["build"] for item in style["samples"]]
    if len({item["operationId"] for item in builds}) != 2 or len({item["assetId"] for item in builds}) != 2:
        raise ValueError("Style samples must have distinct build identities")
    for build in builds:
        if build["stylePromptModuleHash"] != style["stylePromptModuleHash"] or style["stylePromptModule"] not in build["prompt"] or style["draftStyleVersionId"] not in build["sourceVersionIds"]:
            raise ValueError("Style sample build differs from the approved module")
    character = task == "J09"
    id_key = "characterId" if character else "locationId"
    entries = final["content"]["characters" if character else "locations"]
    expected_count = 2 if character or context["persona"] == "professional_creator" else 1
    if len(entries) != expected_count:
        raise ValueError("Final list differs from fixed case subject count")
    targets = [item for item in entries if item[id_key] == context.get("subjectId")]
    if len(targets) != 1 or not targets[0]["sheetRequired"] or (character and targets[0]["recurrence"] != "recurring"):
        raise ValueError("Sheet requires an eligible final-list subject")
    target = targets[0]
    UUID(target[id_key])
    current = previous["content"] if previous and (context.get("currentTarget") or {}).get("state") != "needs_review" else None
    if current and current[id_key] != target[id_key]:
        raise ValueError("Retained sheet belongs to a different subject")
    answers = [item for item in context.get("questionAnswers", []) if item.get("answer") and item["answer"].strip() and item.get("taskId") in (None, task)]
    notes = (["Revision request: " + revision] if revision else []) + [f'{item["question"]}: {item["answer"]}' for item in answers]
    expressions = []
    if character:
        for item in target["expressions"]:
            if item.strip() and item.strip() not in expressions:
                expressions.append(item.strip())
        question = f'Which three distinct expressions should {target["nameOrRole"]}\'s sheet show?'
        if len(expressions) < 3:
            answer = next((item["answer"] for item in answers if item["question"] == question), "")
            for item in re.split(r"[,;\n]", answer):
                if item.strip() and item.strip() not in expressions:
                    expressions.append(item.strip())
            if len(expressions) < 3:
                return {"kind": "clarification", "payload": {"question": question}}
    content = {"schemaVersion": "2", "title": current["title"] if current else (target["nameOrRole"] + " character sheet" if character else target["title"] + " location sheet"),
        "finalListVersionId": final["id"], "styleVersionId": style_row["id"],
        "stylePromptModule": style["stylePromptModule"], "stylePromptModuleHash": style["stylePromptModuleHash"],
        "reviewQuestions": add_notes(current["reviewQuestions"] if current else ["Is this the same character in every view and expression?" if character else "Are the location anchors recognizable in all views?"], notes), id_key: target[id_key]}
    if character:
        content.update(sheetPromptModule=current["sheetPromptModule"] if current else f'One character montage for {target["nameOrRole"]}. Preserve {target["physicalDescription"]}. Show full-body front, full-body back, full-body side, a detailed neutral facial view, and three distinct expressions. Include all attire: {"; ".join(target["attireRequirements"]) or "none specified"}. Include all accessories: {"; ".join(target["accessories"]) or "none specified"}. Add no extra or unapproved attire. No readable labels, watermarks, logos, or unrelated characters.',
            characterDesignProfile=current["characterDesignProfile"] if current else f'{target["background"]} {target["lifeStage"]}. {target["physicalDescription"]} {target["personalityAndActing"]}',
            attireRequirements=target["attireRequirements"], accessories=target["accessories"], requiredViews=["front", "back", "side", "neutral_facial"], additionalExpressions=current["additionalExpressions"] if current else expressions[:3])
    else:
        content.update(sheetPromptModule=current["sheetPromptModule"] if current else f'One location montage for {target["title"]}. Isometric overview plus two supporting views. Preserve stable anchors: {"; ".join(target["stableAnchors"])}. Include required features: {"; ".join(target["requiredFeatures"]) or "none specified"}. Do not add page action or weather unless it is an approved stable fact. No readable labels, watermarks, logos, or unrelated characters.',
            locationDefinitionProfile=current["locationDefinitionProfile"] if current else f'{target["basicDescription"]} {target["storyPurpose"]}', stableAnchors=target["stableAnchors"], requiredFeatures=target["requiredFeatures"], overview="isometric",
            supportingViews=current["supportingViews"] if current else [{"angle": "entry", "shows": f'Entry view showing {target["stableAnchors"][0]}.'}, {"angle": "reverse", "shows": f'Reverse view showing {(target["requiredFeatures"] or target["stableAnchors"])[0]}.'}])
    return proposal(task, content)


def later_fixture(context, story, previous, revision, details):
    task = context["taskId"]
    persona = context["persona"]
    changed = (context.get("currentTarget") or {}).get("state") == "needs_review"
    current = previous["content"] if previous and not changed else None
    notes = details + (["Revision request: " + revision] if revision else [])
    if task == "J08":
        return style_fixture(context, previous, revision)
    if task in ("J03", "J04"):
        concept, outline = source(context, "J01"), source(context, "J02")
        if concept["sourceInput"] != context["brief"] or len(outline["characters"]) != 2 or len(outline["locations"]) != (2 if persona == "professional_creator" else 1):
            raise ValueError("Approved narrative sources do not match fixed case")
        answers = [f'{item["question"]}: {item["answer"]}' for item in context.get("questionAnswers", []) if item.get("answer")]
        if task == "J03":
            rows = [{"entryKey": f"character_{i + 1}", "nameOrRole": item["nameOrRole"], "narrativeFunction": item["narrativeRole"], "role": "main" if i == 0 else "supporting", "knownRelationship": item["relationship"], "knownFacts": [], "openQuestions": item["openDetails"]} for i, item in enumerate(outline["characters"])]
            content = {"schemaVersion": "2", "title": current["title"] if current else outline["title"], "characters": [{key: value for key, value in item.items() if key != "characterId"} for item in current["characters"]] if current else rows, "castNotes": (current["castNotes"] if current else []) + [item for item in answers if not current or item not in current["castNotes"]] + (["Revision request: " + revision] if revision else []), "representationAndSafety": current["representationAndSafety"] if current else [], "manuscriptQuestions": current["manuscriptQuestions"] if current else [], "approvalQuestions": current["approvalQuestions"] if current else ["Does this cast reflect the approved story outline?"]}
        else:
            rows = [{"entryKey": f"location_{i + 1}", "title": item["name"], "storyPurpose": item["storyPurpose"], "knownFacts": [], "likelyScenes": [item["storyPurpose"]], "openQuestions": item["openDetails"]} for i, item in enumerate(outline["locations"])]
            content = {"schemaVersion": "2", "title": current["title"] if current else outline["title"], "locations": [{key: value for key, value in item.items() if key != "locationId"} for item in current["locations"]] if current else rows, "worldAndSafetyNotes": (current["worldAndSafetyNotes"] if current else []) + [item for item in answers if not current or item not in current["worldAndSafetyNotes"]] + (["Revision request: " + revision] if revision else []), "manuscriptQuestions": current["manuscriptQuestions"] if current else [], "approvalQuestions": current["approvalQuestions"] if current else ["Do these places serve the approved story outline?"]}
        return proposal(task, content)
    if task == "J05":
        outline, cast, places = source(context, "J02"), source(context, "J03"), source(context, "J04")
        character_ids = [item["characterId"] for item in cast["characters"]]
        first_place = next((item["locationId"] for item in places["locations"] if item["entryKey"] == "location_1"), places["locations"][0]["locationId"])
        workshop = next((item["locationId"] for item in places["locations"] if item["entryKey"] == "location_2"), None)
        beats = [outline["storyArc"][key] for key in ("opening", "incitingAction", "escalation", "decisiveChoice", "resolution")]
        units = []
        for index, beat in enumerate(beats):
            units.append({"unitKey": f"beat_{index + 1}", "beatTitle": ["A shared beginning", "The trouble", "A first attempt", "A better choice", "A shared ending"][index], "prose": beat + " " + story["prose"][index], "action": beat, "narration": beat, "charactersPresent": character_ids, "locationId": workshop if persona == "professional_creator" and index == 3 else first_place, "dialogue": [{"speakerId": character_ids[index % 2], "text": "We did it together!" if index == 4 else "Let's listen and try together." if index == 3 else "Let's see what we can do."}]})
        content = {"schemaVersion": "2", "title": current["title"] if current else outline["title"], "continuityNotes": add_notes(current["continuityNotes"] if current else [f'{cast["characters"][0]["nameOrRole"]} and {cast["characters"][1]["nameOrRole"]} remain the same two story characters throughout.'], notes), "units": [{key: value for key, value in item.items() if key != "unitId"} for item in current["units"]] if current else units, "expansionNotes": current["expansionNotes"] if current else ["The story uses five narrative beats. Physical page count and layout remain later decisions."], "openQuestions": current["openQuestions"] if current else [], "approvalQuestions": current["approvalQuestions"] if current else ["Does this complete story preserve the approved arc and character relationships?"]}
        return proposal(task, content)
    if task == "J06":
        cast, manuscript = source(context, "J03"), source(context, "J05")
        rows = []
        for character in cast["characters"]:
            unit_ids = [unit["unitId"] for unit in manuscript["units"] if character["characterId"] in unit["charactersPresent"]]
            second = character["entryKey"] == "character_2"
            rows.append({"characterId": character["characterId"], "nameOrRole": character["nameOrRole"], "narrativeFunction": character["narrativeFunction"], "background": f'{character["nameOrRole"]} is {character["knownRelationship"].lower()} in this story.', "lifeStage": "Grandparent" if persona == "enthusiast_parent" and second else "Small companion robot" if persona == "playful_kid" and second else "Young community member" if persona == "professional_creator" else "Child", "physicalDescription": "A small, sturdy robot with a friendly face display." if persona == "playful_kid" and second else "A recognizable figure with a consistent silhouette and expressive face.", "personalityAndActing": character["narrativeFunction"], "attireRequirements": [], "accessories": [], "expressions": ["Curious", "Concerned", "Relieved"], "openQuestions": character["openQuestions"], "unitIds": unit_ids, "recurrence": "recurring" if len(unit_ids) > 1 else "single_scene", "sheetRequired": len(unit_ids) > 1})
        content = {"schemaVersion": "2", "title": current["title"] if current else manuscript["title"], "characters": current["characters"] if current else rows, "profileGuidance": add_notes(current["profileGuidance"] if current else ["Keep each character recognizable across manuscript units."], notes), "representationAndContinuity": current["representationAndContinuity"] if current else ["Preserve the saved character identities and relationships."], "approvalQuestions": current["approvalQuestions"] if current else ["Does this cast cover every manuscript scene?"]}
        return proposal(task, content)
    places, manuscript = source(context, "J04"), source(context, "J05")
    rows = [{"locationId": place["locationId"], "title": place["title"], "storyPurpose": place["storyPurpose"], "basicDescription": f'{place["title"]} is a recognizable setting for {place["storyPurpose"].lower()}.', "stableAnchors": [place["title"]], "requiredFeatures": place["knownFacts"], "continuityNotes": ["Keep the place recognizable whenever the story returns."], "openQuestions": place["openQuestions"], "unitIds": [unit["unitId"] for unit in manuscript["units"] if unit["locationId"] == place["locationId"]], "sheetRequired": True} for place in places["locations"]]
    content = {"schemaVersion": "2", "title": current["title"] if current else manuscript["title"], "locations": current["locations"] if current else rows, "profileGuidance": add_notes(current["profileGuidance"] if current else ["Use stable environmental anchors in every return to a location."], notes), "worldSafetyAndAccessibility": current["worldSafetyAndAccessibility"] if current else ["Keep paths and activity suitable for the intended readers."], "approvalQuestions": current["approvalQuestions"] if current else ["Does each location support its manuscript scenes?"]}
    return proposal(task, content)


def fixture(context):
    role = context["role"]
    if role == "manager":
        task = context.get("eligibleRoute")
        if task not in TASKS:
            raise ValueError("Manager has no eligible narrative task")
        return {"kind": "delegate", "payload": {"taskId": task, "subjectKind": "book", "subjectId": context["run"]["bookletId"]}}
    if role == "tester":
        pending = context.get("pendingDecision")
        if pending:
            if pending.get("kind") == "question" and pending.get("questionId"):
                return {"kind": "decision", "payload": {"decision": {"action": "answer", "questionId": pending["questionId"], "text": "Keep the story age-appropriate, gentle, and faithful to the stated case brief."}}}
            raise ValueError("Unsupported pending decision")
        artifacts = context["currentArtifacts"]
        if context["persona"] != "professional_creator" and not context.get("activeDelegation") and not context["creatorMessages"]:
            if any(item["subjectKind"] != "book" or item["subjectId"] != context["bookletId"] for item in artifacts):
                raise ValueError("Book subject is inconsistent")
            return {"kind": "decision", "payload": {"decision": {"action": "delegate", "taskIds": context.get("eligibleTaskIds", ["J01", "J02"]), "subjectId": context["bookletId"]}}}
        approved_ids = {item["currentVersionId"] for item in artifacts if item["state"] == "approved"}
        versions = []
        for artifact in artifacts:
            if artifact["state"] != "draft":
                continue
            version = current_version(artifact)
            if not version:
                raise ValueError("Draft has no current version")
            dependencies = version["dependencyVersionIds"]
            if artifact["taskId"] == "J08":
                style = version.get("content")
                if not assembled_style(style) or version.get("sourceVersionId") != style["draftStyleVersionId"] or not dependencies or dependencies[0] != style["draftStyleVersionId"] or any(item not in approved_ids for item in dependencies[1:]):
                    continue
            elif any(item not in approved_ids for item in dependencies):
                continue
            versions.append(version["id"])
        if not versions:
            raise ValueError("No current eligible draft version")
        grant = context.get("activeDelegation")
        if context["persona"] != "professional_creator" and grant and "J08" in grant["taskIds"] and any(item["taskId"] == "J08" and item["currentVersionId"] in versions for item in artifacts):
            return {"kind": "decision", "payload": {"decision": {"action": "delegate", "taskIds": grant["taskIds"], "subjectId": context["bookletId"]}}}
        return {"kind": "decision", "payload": {"decision": {"action": "approve", "versionIds": versions}}}
    if role != "specialist" or context.get("taskId") not in (*TASKS, "J09", "J10"):
        raise ValueError("Unsupported role or task")
    persona = context["persona"]
    story = CASES.get(persona)
    if not story or context["brief"] != story["brief"]:
        raise ValueError("Fixed case brief differs")
    task = context["taskId"]
    previous = current_version(context.get("currentTarget"))
    revision = (context.get("matchingRevision") or {}).get("instruction")
    if task in ("J09", "J10"):
        return sheet_fixture(context, previous, revision)
    details = [f'{item["question"]}: {item["answer"]}' for item in context.get("questionAnswers", []) if item.get("answer") and item.get("taskId") in (None, task)]
    if task not in ("J01", "J02"):
        return later_fixture(context, story, previous, revision, details)
    if task == "J01":
        base = dict(previous["content"]) if previous else {"schemaVersion": "2", "title": story["title"], "sourceInput": context["brief"], "audience": {"ageBand": story["age"], "readingNeeds": f'Clear language and pacing for readers {story["age"]}.'}, "premise": story["premise"], "theme": story["theme"], "emotionalPromise": story["promise"], "tone": story["tone"], "storyScope": story["scope"], "contentRequirements": [story["scope"]], "knownConstraints": ["Keep the named cast and locations consistent."], "deferredDecisions": ["Character appearance and visual style remain for later planning."], "approvalQuestions": ["Does this concept match the intended audience and tone?"]}
        base["tone"] = base["tone"] + (". Revision request: " + revision if revision else "")
        base["knownConstraints"] = add_notes(base["knownConstraints"], details)
    else:
        upstream = context.get("approvedUpstream")
        if not upstream:
            raise ValueError("J02 requires an approved J01 source")
        upstream = upstream["content"]
        arc = story["arc"]
        base = dict(previous["content"]) if previous else {"schemaVersion": "2", "title": upstream["title"], "summary": f'{upstream["premise"]} {arc[4]} Tone: {upstream["tone"]}.', "characters": [{"nameOrRole": a, "narrativeRole": b, "relationship": c, "openDetails": []} for a, b, c in story["characters"]], "locations": [{"name": a, "storyPurpose": b, "openDetails": []} for a, b in story["locations"]], "storyArc": dict(zip(("opening", "incitingAction", "escalation", "decisiveChoice", "resolution"), arc)), "theme": upstream["theme"], "emotionalArc": upstream["emotionalPromise"], "deferredDecisions": ["Exact page dialogue and visual design remain for later planning."] + [PREFIX + item for item in upstream["knownConstraints"]], "approvalQuestions": ["Does this causal outline and resolution work for the audience?"]}
        changed = (context.get("currentTarget") or {}).get("state") == "needs_review"
        retained = [item for item in base["deferredDecisions"] if not item.startswith(PREFIX)] if changed else base["deferredDecisions"]
        source_decisions = [PREFIX + item for item in upstream["knownConstraints"]] if changed else []
        summary = f'{upstream["premise"]} {base["storyArc"]["resolution"]} Tone: {upstream["tone"]}.' if changed else base["summary"]
        if changed:
            base.update(title=upstream["title"], theme=upstream["theme"], emotionalArc=upstream["emotionalPromise"])
        base["summary"] = summary + (" Revision request: " + revision if revision else "")
        base["deferredDecisions"] = retained + source_decisions + [item for item in details if item not in retained and item not in source_decisions]
    return proposal(task, base)


def main(authorization_body: str, run_id: str, operation_id: str, workflow_run_id: str, parent_workflow_run_id: str) -> dict:
    data = json.loads(authorization_body)["data"]
    if data.get("started") is not True:
        if data.get("reason") == "paused":
            return {"booklet_result": "", "authorization_reason": "paused"}
        raise ValueError("Operation was not authorized")
    if data.get("mode") != "simulated":
        raise ValueError("Simulation requires simulated mode")
    fingerprint = data.get("inputFingerprint")
    if not isinstance(fingerprint, str) or len(fingerprint) != 64 or any(char not in "0123456789abcdef" for char in fingerprint):
        raise ValueError("Invalid saved fingerprint")
    result = fixture(data["context"])
    envelope = {"runId": run_id, "operationId": operation_id, "workflowRunId": workflow_run_id, "parentWorkflowRunId": parent_workflow_run_id or None, "inputFingerprint": fingerprint, "result": result}
    return {"booklet_result": json.dumps(envelope, ensure_ascii=False, separators=(",", ":")), "authorization_reason": ""}
