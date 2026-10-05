"""Local M3 J12 simulation extension; append after m2-simulation and m3-pagination."""

M3_PAGINATION_FIXTURE = fixture


def page_bible_fixture(context):
    material_question = context.get("materialQuestion")
    if material_question and not any(item.get("answer") and item.get("taskId") in (None, "J12") and
                                     item.get("question") == material_question for item in context.get("questionAnswers", [])):
        return {"kind": "clarification", "payload": {"question": material_question}}
    persona = context["persona"]
    story = CASES.get(persona)
    if not story or context.get("brief") != story["brief"]:
        raise ValueError("Fixed case brief differs")
    rows = context.get("approvedSources") or []

    def source_row(task):
        matches = [row for row in rows if row.get("taskId") == task]
        if len(matches) != 1 or not uuid(matches[0].get("id")):
            raise ValueError("J12 requires one identified source " + task)
        return matches[0]

    layout_source, manuscript_source, style_source = (source_row(task) for task in ("J11", "J05", "J08"))
    layout, manuscript = layout_source["content"], manuscript_source["content"]
    page_id = context.get("subjectId")
    if context.get("subjectKind") != "page" or not uuid(page_id):
        raise ValueError("J12 requires a saved page identity")
    matches = [page for page in layout["pages"] if page.get("pageId") == page_id]
    if len(matches) != 1:
        raise ValueError("J12 selected page is missing from J11")
    page = matches[0]
    if not isinstance(page.get("pageIndex"), int) or page["pageIndex"] < 0 or page["pageIndex"] > {"playful_kid": 3, "enthusiast_parent": 5, "professional_creator": 8}[persona]:
        raise ValueError("J12 page index is invalid")
    units = manuscript["units"]
    if any(not uuid(unit.get("unitId")) for unit in units):
        raise ValueError("J12 requires saved manuscript units")
    first_panel = {}
    for item in layout["pages"][1:]:
        for panel in item["panels"]:
            for unit_id in panel["manuscriptUnitIds"]:
                first_panel.setdefault(unit_id, item["pageId"] + ":" + panel["panelKey"])
    sheet_rows = {(row.get("subjectKind"), row.get("subjectId"), row.get("id")): row for row in rows if row.get("taskId") in ("J09", "J10")}
    for panel in page["panels"]:
        for ref in panel["sheetReferences"]:
            if not all(uuid(ref.get(key)) for key in ("subjectId", "artifactVersionId", "assetId")):
                raise ValueError("J12 reference identity is invalid")
            row = sheet_rows.get((ref.get("subjectKind"), ref["subjectId"], ref["artifactVersionId"]))
            if not row or row.get("content", {}).get("build", {}).get("assetId") != ref["assetId"]:
                raise ValueError("J12 reference source differs")
    previous = current_version(context.get("currentTarget"))
    changed = (context.get("currentTarget") or {}).get("state") == "needs_review"
    current = previous["content"] if previous and not changed else None
    if current and (current.get("pageId") != page_id or current.get("layoutVersionId") != layout_source["id"] or
                    current.get("manuscriptVersionId") != manuscript_source["id"] or current.get("styleVersionId") != style_source["id"] or
                    current.get("pageIndex") != page["pageIndex"] or len(current.get("panels", [])) != len(page["panels"])):
        raise ValueError("J12 current page differs from sources")
    typography = {item["kind"]: item for item in layout["typography"]}

    def line(kind, value, speaker, panel_key):
        treatment = typography[kind]
        return {"kind": kind, "text": value, "form": "display" if kind == "title" else "bubble" if kind == "speech" else "caption",
                "speakerEntityId": speaker, "panelKey": panel_key,
                "placement": "Inside the approved live text safe region, clear of faces and action.",
                "typographyTreatment": treatment["fontDirection"] + " " + treatment["sizeHierarchy"],
                "bubbleTreatment": treatment["containerTreatment"]}

    revision = (context.get("matchingRevision") or {}).get("instruction")
    answers = [item["question"] + ": " + item["answer"] for item in context.get("questionAnswers", [])
               if item.get("answer") and item.get("taskId") in (None, "J12")]
    panels = []
    for index, panel in enumerate(page["panels"]):
        routed = []
        for unit_id in panel["manuscriptUnitIds"]:
            found = [unit for unit in units if unit["unitId"] == unit_id]
            if len(found) != 1:
                raise ValueError("J12 routes an unknown manuscript unit")
            routed.append(found[0])
        key = panel["panelKey"]
        prior = current["panels"][index] if current else None
        if prior and (prior.get("panelKey") != key or prior.get("manuscriptUnitIds") != panel["manuscriptUnitIds"] or
                      sorted(prior.get("sheetReferences", []), key=str) != sorted(panel["sheetReferences"], key=str)):
            raise ValueError("J12 current panel routing differs")
        lettering = (prior["lettering"] if prior else [line("title", layout["title"], None, key)] if page["pageIndex"] == 0 and index == 0 else
                     [entry for unit in routed if first_panel.get(unit["unitId"]) == page_id + ":" + key
                      for entry in [line("narration", unit["narration"], None, key)] +
                      [line("speech", dialogue["text"], dialogue["speakerId"], key) for dialogue in unit["dialogue"]]])
        refs = panel["sheetReferences"]
        composition = (prior["composition"] if prior else "Use the approved sheet references, panel allocation and clear focal action.") + (" Revision request: " + revision if revision else "")
        panels.append({"panelKey": key, "manuscriptUnitIds": panel["manuscriptUnitIds"], "sheetReferences": refs,
                       "actionBeat": prior["actionBeat"] if prior else " ".join(unit["action"] for unit in routed) or "Present the approved cover title.",
                       "emotionalBeat": prior["emotionalBeat"] if prior else "Keep the fixed brief's emotional promise clear.",
                       "composition": composition,
                       "characterIds": [ref["subjectId"] for ref in refs if ref["subjectKind"] == "character"],
                       "locationIds": [ref["subjectId"] for ref in refs if ref["subjectKind"] == "location"],
                       "lettering": lettering, "noText": len(lettering) == 0})
    content = {"schemaVersion": "2", "pageId": page_id, "pageIndex": page["pageIndex"], "layoutVersionId": layout_source["id"],
               "manuscriptVersionId": manuscript_source["id"], "styleVersionId": style_source["id"], "panels": panels,
               "reviewQuestions": (current["reviewQuestions"] if current else ["Does this page preserve the approved story and lettering?"]) + answers}
    return proposal("J12", content)


def fixture(context):
    if context.get("role") == "manager" and context.get("eligibleRoute") == "J12":
        target = context.get("eligibleTarget") or {}
        if target.get("taskId") != "J12" or target.get("subjectKind") != "page" or not uuid(target.get("subjectId")):
            raise ValueError("Manager has no eligible page subject")
        return {"kind": "delegate", "payload": {"taskId": "J12", "subjectKind": "page", "subjectId": target["subjectId"]}}
    if context.get("role") == "specialist" and context.get("taskId") == "J12":
        return page_bible_fixture(context)
    return M3_PAGINATION_FIXTURE(context)
