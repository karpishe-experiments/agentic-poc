"""Self-contained Dify Code node fixture for simulated J01-J07 text work.

Pinned Ali J03-J07 source: 631f547ec3f7ce375f740dd6f2b1b9aaebbde940.
Fixed-case simulation retains narrative dependencies and complete content.
Booklet owns durable IDs and acceptance; preference deviations remain warnings.
"""

import json


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

TASKS = ("J01", "J02", "J03", "J04", "J05", "J06", "J07")
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


def later_fixture(context, story, previous, revision, details):
    task = context["taskId"]
    persona = context["persona"]
    changed = (context.get("currentTarget") or {}).get("state") == "needs_review"
    current = previous["content"] if previous and not changed else None
    notes = details + (["Revision request: " + revision] if revision else [])
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
            if any(item not in approved_ids for item in version["dependencyVersionIds"]):
                continue
            versions.append(version["id"])
        if not versions:
            raise ValueError("No current eligible draft version")
        return {"kind": "decision", "payload": {"decision": {"action": "approve", "versionIds": versions}}}
    if role != "specialist" or context.get("taskId") not in TASKS:
        raise ValueError("Unsupported role or task")
    persona = context["persona"]
    story = CASES.get(persona)
    if not story or context["brief"] != story["brief"]:
        raise ValueError("Fixed case brief differs")
    task = context["taskId"]
    previous = current_version(context.get("currentTarget"))
    revision = (context.get("matchingRevision") or {}).get("instruction")
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
