"""Dify Code node for the M1 simulated narrative slice. No provider calls."""

import json


CASES = {
    "playful_kid": ("A young inventor and tiny robot rescue a runaway kite; playful and reassuring; readers 6–8; three single-scene story pages plus cover, two recurring characters, one location.", "The Kite Rescue", "6-8", "A young inventor and a tiny robot rescue a runaway kite in their neighborhood park.", "Helping together makes a hard problem smaller.", "A playful rescue ends with everyone safe and proud.", "Playful and reassuring", "Three single-scene story pages plus a cover, with two recurring characters and one park location.", [("Young inventor", "Invents a safe way to reach the kite", "Friend and maker of the tiny robot"), ("Tiny robot", "Spots the kite and helps test the plan", "Trusted companion of the inventor")], [("Neighborhood park", "The kite escapes and is recovered here")], ["The inventor and robot fly a kite in the park.", "A gust carries the kite into a tree.", "Their first reach falls short, so they assemble a gentle retrieval tool.", "The inventor listens to the robot's safer route around the tree.", "They recover the kite and fly it together again."]),
    "enthusiast_parent": ("A child and grandparent turn a rainy afternoon into an indoor adventure; warm; readers 3–5; five story pages plus cover, two recurring characters, one location, including one simple two-panel page.", "The Rainy Room Adventure", "3-5", "A child and grandparent turn a rainy afternoon into an indoor adventure.", "Imagination and companionship brighten a quiet day.", "A warm adventure ends in comfort and shared delight.", "Warm and gentle", "Five story pages plus a cover, with two recurring characters, one home location, and one simple two-panel page.", [("Child", "Chooses the adventure's destination", "Grandchild of the grandparent"), ("Grandparent", "Helps build and explore a pretend world", "Grandparent of the child")], [("Family living room", "A safe room becomes the imagined adventure setting")], ["Rain keeps the child and grandparent inside.", "The child imagines the sofa as a boat.", "They build a blanket sail and encounter a pretend storm.", "The child suggests steering toward a pillow island.", "They arrive, share a snack, and listen to the rain together."]),
    "professional_creator": ("Two friends repair a community observatory after a disagreement; precise emotional arc; readers 9–12; eight story pages plus cover, two recurring characters, two locations, at least two multi-panel pages.", "The Observatory Lantern", "9-12", "Two friends repair a community observatory after a disagreement.", "Trust grows when friends listen and share responsibility.", "An honest repair restores both the observatory and the friendship.", "Reflective and hopeful", "Eight story pages plus a cover, with two recurring characters, two locations, and at least two multi-panel pages.", [("First friend", "Finds the damaged observatory lantern", "Friend and project partner of the second friend"), ("Second friend", "Diagnoses the lantern and proposes a repair", "Friend and project partner of the first friend")], [("Community observatory", "The damaged lantern must be repaired before viewing night"), ("Workshop", "The friends test a replacement part and talk through their disagreement")], ["The friends prepare the observatory for viewing night.", "A disagreement distracts them and the lantern stops working.", "Separate repair attempts fail, and the opening time approaches.", "They acknowledge each other's ideas and combine their plans.", "The lantern works; they welcome neighbors and watch the stars together."]),
}
PREFIX = "Approved concept constraint: "


def current_version(artifact):
    if not artifact:
        return None
    return next((v for v in artifact.get("versions", []) if v["id"] == artifact.get("currentVersionId")), None)


def fixture(context):
    role = context["role"]
    if role == "manager":
        task = context["eligibleRoute"]
        if task not in ("J01", "J02"):
            raise ValueError("No eligible narrative task")
        return {"kind": "delegate", "payload": {"taskId": task, "subjectKind": "book", "subjectId": context["run"]["bookletId"]}}
    if role == "tester":
        pending = context.get("pendingDecision")
        if pending:
            if pending.get("kind") != "question" or not pending.get("questionId"):
                raise ValueError("Unsupported pending decision")
            return {"kind": "decision", "payload": {"decision": {"action": "answer", "questionId": pending["questionId"], "text": "Keep the story age-appropriate, gentle, and faithful to the stated case brief."}}}
        artifacts = context["currentArtifacts"]
        if context["persona"] != "professional_creator" and not context.get("activeDelegation") and not context["creatorMessages"]:
            if any(a["subjectKind"] != "book" or a["subjectId"] != context["bookletId"] for a in artifacts):
                raise ValueError("Book subject is inconsistent")
            return {"kind": "decision", "payload": {"decision": {"action": "delegate", "taskIds": ["J01", "J02"], "subjectId": context["bookletId"]}}}
        concept = next((a for a in artifacts if a["taskId"] == "J01"), None)
        approved = concept["currentVersionId"] if concept and concept["state"] == "approved" else None
        versions = []
        for artifact in artifacts:
            if artifact["state"] != "draft":
                continue
            version = current_version(artifact)
            if not version:
                raise ValueError("Draft has no current version")
            if artifact["taskId"] == "J02" and (not approved or version["dependencyVersionIds"] != [approved]):
                continue
            versions.append(version["id"])
        if not versions:
            raise ValueError("No current eligible draft version")
        return {"kind": "decision", "payload": {"decision": {"action": "approve", "versionIds": versions}}}
    if role != "specialist" or context.get("taskId") not in ("J01", "J02"):
        raise ValueError("Unsupported role or task")
    persona = context["persona"]
    story = CASES.get(persona)
    if not story or context["brief"] != story[0]:
        raise ValueError("Fixed case brief differs")
    _, title, age, premise, theme, promise, tone, scope, characters, locations, arc = story
    task = context["taskId"]
    previous = current_version(context.get("currentTarget"))
    revision = context.get("matchingRevision") or {}
    details = [f'{item["question"]}: {item["answer"]}' for item in context["questionAnswers"] if item.get("answer") and item.get("taskId") in (None, task)]
    if task == "J01":
        base = dict(previous["content"]) if previous else {"schemaVersion": "2", "title": title, "sourceInput": context["brief"], "audience": {"ageBand": age, "readingNeeds": f"Clear language and pacing for readers {age}."}, "premise": premise, "theme": theme, "emotionalPromise": promise, "tone": tone, "storyScope": scope, "contentRequirements": [scope], "knownConstraints": ["Keep the named cast and locations consistent."], "deferredDecisions": ["Character appearance and visual style remain for later planning."], "approvalQuestions": ["Does this concept match the intended audience and tone?"]}
        base["tone"] = base["tone"] + (f'. Revision request: {revision["instruction"]}' if revision.get("instruction") else "")
        base["knownConstraints"] = base["knownConstraints"] + [d for d in details if d not in base["knownConstraints"]]
    else:
        source = context.get("approvedUpstream")
        if not source:
            raise ValueError("J02 requires approved J01")
        upstream = source["content"]
        base = dict(previous["content"]) if previous else {"schemaVersion": "2", "title": upstream["title"], "summary": f'{upstream["premise"]} {arc[4]} Tone: {upstream["tone"]}.', "characters": [{"nameOrRole": a, "narrativeRole": b, "relationship": c, "openDetails": []} for a, b, c in characters], "locations": [{"name": a, "storyPurpose": b, "openDetails": []} for a, b in locations], "storyArc": dict(zip(("opening", "incitingAction", "escalation", "decisiveChoice", "resolution"), arc)), "theme": upstream["theme"], "emotionalArc": upstream["emotionalPromise"], "deferredDecisions": ["Exact page dialogue and visual design remain for later planning."] + [PREFIX + c for c in upstream["knownConstraints"]], "approvalQuestions": ["Does this causal outline and resolution work for the audience?"]}
        changed = bool(context.get("currentTarget") and context["currentTarget"].get("state") == "needs_review")
        retained = [d for d in base["deferredDecisions"] if not d.startswith(PREFIX)] if changed else base["deferredDecisions"]
        source_decisions = [PREFIX + c for c in upstream["knownConstraints"]] if changed else []
        summary = f'{upstream["premise"]} {base["storyArc"]["resolution"]} Tone: {upstream["tone"]}.' if changed else base["summary"]
        if changed:
            base.update(title=upstream["title"], theme=upstream["theme"], emotionalArc=upstream["emotionalPromise"])
        base["summary"] = summary + (f' Revision request: {revision["instruction"]}' if revision.get("instruction") else "")
        base["deferredDecisions"] = retained + source_decisions + [d for d in details if d not in retained and d not in source_decisions]
    return {"kind": "proposal", "payload": {"taskId": task, "content": base}}


def main(authorization_body: str, run_id: str, operation_id: str, workflow_run_id: str, parent_workflow_run_id: str) -> dict:
    data = json.loads(authorization_body)["data"]
    if data.get("started") is not True:
        if data.get("reason") == "paused":
            return {"booklet_result": "", "authorization_reason": "paused"}
        raise ValueError("Operation was not authorized")
    if data.get("mode") != "simulated":
        raise ValueError("Simulation requires simulated mode")
    if not isinstance(data.get("inputFingerprint"), str) or len(data["inputFingerprint"]) != 64 or any(c not in "0123456789abcdef" for c in data["inputFingerprint"]):
        raise ValueError("Invalid saved fingerprint")
    result = fixture(data["context"])
    envelope = {"runId": run_id, "operationId": operation_id, "workflowRunId": workflow_run_id, "parentWorkflowRunId": parent_workflow_run_id or None, "inputFingerprint": data["inputFingerprint"], "result": result}
    return {"booklet_result": json.dumps(envelope, ensure_ascii=False, separators=(",", ":")), "authorization_reason": ""}
