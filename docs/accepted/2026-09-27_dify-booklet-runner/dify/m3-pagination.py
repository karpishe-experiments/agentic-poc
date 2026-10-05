"""M3 J11 extension. Appended only to new M3 Code-node candidates."""

M2_FIXTURE = fixture


def pagination_fixture(context):
    persona = context["persona"]
    story = CASES.get(persona)
    if not story or context.get("brief") != story["brief"]:
        raise ValueError("Fixed case brief differs")
    rows = context.get("approvedSources") or []

    def book(task):
        matches = [row for row in rows if row.get("taskId") == task and row.get("subjectKind", "book") == "book"]
        if len(matches) != 1:
            raise ValueError("J11 requires one approved book source")
        return matches[0]["content"]

    for task in ("J01", "J02", "J08"):
        book(task)
    manuscript, cast, places = book("J05"), book("J06"), book("J07")
    units = manuscript["units"]
    if not units or any(not uuid(unit.get("unitId")) for unit in units):
        raise ValueError("J11 requires saved manuscript unit IDs")
    references = []
    for row in rows:
        task = row.get("taskId")
        if task not in ("J09", "J10"):
            continue
        sheet = row["content"]
        kind = "character" if task == "J09" else "location"
        subject = sheet.get("characterId" if task == "J09" else "locationId")
        build = sheet.get("build") or {}
        if row.get("subjectKind") != kind or row.get("subjectId") != subject or not all(uuid(value) for value in (subject, row.get("id"), build.get("assetId"))):
            raise ValueError("J11 sheet subject metadata differs")
        references.append({"subjectKind": kind, "subjectId": subject, "artifactVersionId": row["id"], "assetId": build["assetId"]})
    required = ["character:" + item["characterId"] for item in cast["characters"] if item["sheetRequired"]] + ["location:" + item["locationId"] for item in places["locations"] if item["sheetRequired"]]
    keys = [item["subjectKind"] + ":" + item["subjectId"] for item in references]
    if len(keys) != len(required) or len(set(keys)) != len(keys) or set(keys) != set(required):
        raise ValueError("J11 requires every approved character and location sheet")

    previous = current_version(context.get("currentTarget"))
    current = previous["content"] if previous else None
    if current:
        current = dict(current)
        current["pages"] = [{key: value for key, value in page.items() if key != "pageId"} for page in current["pages"]]
    changed = (context.get("currentTarget") or {}).get("state") == "needs_review"
    count = {"playful_kid": 3, "enthusiast_parent": 5, "professional_creator": 8}[persona]
    pages = []
    for page_index in range(count + 1):
        panel_count = 2 if (persona == "enthusiast_parent" and page_index == 3) or (persona == "professional_creator" and page_index in (3, 6)) else 1
        panels = []
        for panel_index in range(panel_count):
            selected = [] if page_index == 0 else [unit for index, unit in enumerate(units) if index * count // len(units) + 1 == page_index]
            if page_index and not selected:
                selected = [units[(page_index - 1) * len(units) // count]]
            subjects = {"character:" + character for unit in selected for character in unit["charactersPresent"]}
            subjects.update("location:" + unit["locationId"] for unit in selected)
            routed = [] if page_index == 0 else [item for item in references if item["subjectKind"] + ":" + item["subjectId"] in subjects]
            if page_index and len(routed) != len(subjects):
                raise ValueError("J11 manuscript subjects lack approved sheets")
            panels.append({"panelKey": "panel_" + str(panel_index + 1), "manuscriptUnitIds": [unit["unitId"] for unit in selected],
                           "textCapacity": 80 if page_index == 0 else 120 if persona == "playful_kid" else 180,
                           "liveTextSafeRegion": {"x": 0.1, "y": 0.1, "width": 0.8, "height": 0.8},
                           "sheetReferences": routed, "deferredCompositionDecisions": []})
        rhythm = "Cover invites the first story page." if page_index == 0 else "Resolve the story before the final turn." if page_index == count else "Carry the action into the next page."
        pages.append({"pageIndex": page_index, "pageTurnRhythm": rhythm, "panels": panels})
    if current and not changed:
        pages = current["pages"]
    elif current:
        for page in pages:
            saved = current["pages"][page["pageIndex"]]
            if len(saved["panels"]) == len(page["panels"]):
                page["pageTurnRhythm"] = saved["pageTurnRhythm"]
                for panel, prior in zip(page["panels"], saved["panels"]):
                    for key in ("panelKey", "textCapacity", "liveTextSafeRegion", "deferredCompositionDecisions"):
                        panel[key] = prior[key]
    revision = (context.get("matchingRevision") or {}).get("instruction")
    answers = [item["question"] + ": " + item["answer"] for item in context.get("questionAnswers", []) if item.get("answer") and item.get("taskId") in (None, "J11")]
    decisions = list((current or {}).get("deferredCompositionDecisions", []))
    for note in answers + (["Revision request: " + revision] if revision else []):
        if note not in decisions:
            decisions.append(note)
    margins = lambda amount: {"top": amount, "right": amount, "bottom": amount, "left": amount, "unit": "mm"}
    canvas = {"trim": {"width": 210, "height": 210, "unit": "mm"}, "orientation": "square", "aspectRatio": {"width": 1, "height": 1},
              "workingPixels": {"width": 2048, "height": 2048}, "bleed": margins(3),
              "binding": {"edge": "left", "allowance": 8, "unit": "mm"},
              "liveTextSafeMargins": {"top": 12, "right": 12, "bottom": 12, "left": 16, "unit": "mm"}, "readingDirection": "left_to_right"}
    typography = [{"kind": kind, "fontDirection": "Clear, rounded lettering with high contrast.",
                   "sizeHierarchy": "Largest display size." if kind == "title" else "Readable story size.",
                   "containerTreatment": "Rounded bubble with a clear tail." if kind in ("speech", "thought") else "Quiet open or caption space.",
                   "placementRules": "Place inside the live text safe region, clear of faces and actions."}
                  for kind in ("narration", "speech", "thought", "sound_effect", "title", "credit", "diegetic")]
    content = {"schemaVersion": "2", "title": (current or {}).get("title", manuscript["title"]),
               "canvas": (current or {}).get("canvas", canvas), "typography": (current or {}).get("typography", typography),
               "pages": pages, "deferredCompositionDecisions": decisions,
               "approvalQuestions": (current or {}).get("approvalQuestions", ["Does the page rhythm and lettering space suit this story?"])}
    return proposal("J11", content)


def fixture(context):
    role = context["role"]
    if role == "manager" and context.get("eligibleRoute") == "J11":
        return {"kind": "delegate", "payload": {"taskId": "J11", "subjectKind": "book", "subjectId": context["run"]["bookletId"]}}
    if role == "specialist" and context.get("taskId") == "J11":
        return pagination_fixture(context)
    return M2_FIXTURE(context)
