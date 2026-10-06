"""Model-free final-page routing extension; older profiles remain unchanged."""

M3_PAGE_BIBLE_FIXTURE = fixture


def report_fixture(context):
    evidence = context.get("reportEvidence") or {}
    role = context.get("role")
    versions = evidence.get("versionIds")
    count = evidence.get("warningCount")
    if (role not in ("tester", "judge") or evidence.get("mode") != "simulated" or
            not uuid(evidence.get("runId")) or not isinstance(versions, list) or
            not 1 <= len(versions) <= 100 or len(set(versions)) != len(versions) or
            any(not uuid(value) for value in versions) or type(count) is not int or count < 0 or
            not isinstance(evidence.get("configurationHash"), str) or
            not re.fullmatch(r"[a-f0-9]{64}", evidence["configurationHash"])):
        raise ValueError("Invalid simulated report evidence")
    unassessed = {"status": "not_assessed", "explanation": "Deterministic simulation does not assess creative quality or human usability."}
    report = {"schemaVersion": "2", "role": role, "mode": "simulated", "runId": evidence["runId"],
              "configurationHash": evidence["configurationHash"],
              "summary": f"Deterministic {role} report retains {len(versions)} artifact versions and {count} recorded warnings. No quality gate or regeneration is requested.",
              "intent": unassessed, "consistency": unassessed, "interaction": unassessed,
              "costEvidence": {"status": "unavailable", "actualUsd": None, "estimatedUsd": None,
                               "explanation": "This model-free report has no provider billing evidence; application usage counters are retained separately."},
              "findings": [{"category": "consistency", "target": {"kind": "run", "runId": evidence["runId"]},
                            "explanation": f"{count} warnings remain in the saved artifact evidence. They do not request regeneration or prevent completion."}] if count else [],
              "evidence": {"versionIds": versions, "inspectedAssetIds": []}}
    return {"kind": "feedback" if role == "tester" else "assessment", "payload": report}


def fixture(context):
    if context.get("role") in ("tester", "judge") and context.get("reportEvidence"):
        return report_fixture(context)
    if context.get("role") == "manager" and context.get("eligibleRoute") == "J13":
        target = context.get("eligibleTarget") or {}
        if (target.get("taskId") != "J13" or target.get("kind") != "image" or
                target.get("subjectKind") != "page" or not uuid(target.get("subjectId"))):
            raise ValueError("Manager has no eligible final-page image subject")
        return {"kind": "delegate", "payload": {"taskId": "J13", "subjectKind": "page",
                                                  "subjectId": target["subjectId"]}}
    result = M3_PAGE_BIBLE_FIXTURE(context)
    if context.get("role") == "tester" and context.get("persona") != "professional_creator":
        decision = result.get("payload", {}).get("decision", {})
        grant = context.get("activeDelegation") or {}
        accepted = decision.get("versionIds", [])
        if (decision.get("action") == "approve" and "J13" in grant.get("taskIds", []) and
                any(item.get("taskId") == "J13" and item.get("currentVersionId") in accepted
                    for item in context.get("currentArtifacts", []))):
            return {"kind": "decision", "payload": {"decision": {"action": "delegate",
                    "taskIds": grant["taskIds"], "subjectId": context["bookletId"]}}}
    return result
