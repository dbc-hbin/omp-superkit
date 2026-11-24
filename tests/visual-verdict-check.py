# /// script
# requires-python = ">=3.11"
# dependencies = ["jsonschema==4.25.1"]
# ///
"""Run with `uv run tests/visual-verdict-check.py`; no application dependencies."""

import json
from pathlib import Path

from jsonschema import Draft7Validator
from referencing import Registry, Resource

directory = Path(__file__).resolve().parents[1] / "skills/visual-qa/references"
review_path = directory / "verdict-schema.json"
final_path = directory / "final-verdict-schema.json"
registry = Registry()
for path in (review_path, final_path):
    schema = json.loads(path.read_text())
    Draft7Validator.check_schema(schema)
    registry = registry.with_resource(path.as_uri(), Resource.from_contents(schema))
final = Draft7Validator({"$ref": final_path.as_uri()}, registry=registry)

work = {"reason": "Repeat on the local fixture", "verifier": "executor", "resolution": "NEEDS WORK"}
human = {"reason": "Physical phone unavailable", "verifier": "device owner", "resolution": "NEEDS HUMAN REVIEW"}
page = {"pageId": "list", "verdict": "PASS", "captures": ["list.png"], "gaps": []}
row = {"id": "E2", "verdict": "PASS", "capture": "list.png", "reason": "Contrast checked"}
dimension = {"name": "reference-fidelity", "verdict": "UNVERIFIED", "evidence": [], "reason": "Comparison missing"}
review = {
    "pass": "B", "verdict": "PASS", "revision": "r", "confidence": "HIGH", "summary": "Contrast checked",
    "pageIds": ["list"], "checklist": [row], "evidenceTrace": [], "findings": [], "good": [],
    "blocking": [], "artifacts": ["list.png"],
}
report = {
    "revision": "r", "captureManifest": "manifest.json", "pageIds": ["list"], "pageVerdicts": [page],
    "dimensions": [], "reviews": [review], "checklist": [row], "mustFix": [], "good": [], "prerequisites": [],
}


def verdicts_for(**evidence) -> set[str]:
    """Which final labels actually validate for exactly this evidence?"""
    outcomes = set()
    for verdict in ("GOOD", "NEEDS WORK", "NEEDS HUMAN REVIEW"):
        gate = {"satisfied": verdict == "GOOD", "gaps": [] if verdict == "GOOD" else ["See evidence"],
                "acceptedBy": "lead"}
        if final.is_valid({**report, **evidence, "verdict": verdict, "completionGate": gate}):
            outcomes.add(verdict)
    return outcomes


if __name__ == "__main__":
    # A PASS page cannot hide a missing capture under any aggregate label.
    assert verdicts_for() == {"GOOD"}
    assert verdicts_for(prerequisites=["Phone owner must approve the required run"]) == {"NEEDS HUMAN REVIEW"}
    assert not verdicts_for(pageVerdicts=[{**page, "gaps": [human]}])
    assert not verdicts_for(pageVerdicts=[{**page, "gaps": ["Switch not observed"]}])
    assert not verdicts_for(pageVerdicts=[{**page, "verdict": "UNVERIFIED", "gaps": []}])
    assert not verdicts_for(dimensions=[dimension])

    for gap in (work, human):
        expected = {gap["resolution"]}
        assert verdicts_for(pageVerdicts=[{**page, "verdict": "UNVERIFIED", "gaps": [gap]}]) == expected
        assert verdicts_for(dimensions=[{**dimension, "gap": gap}]) == expected
        # Keep a reviewer's case even when the lead omits it from the merged rows.
        case = {"scenario": "A settles after B", "claim": "condition", "verdict": "UNVERIFIED", "gap": gap}
        switch = {**row, "id": "H15", "verdict": "UNVERIFIED", "behaviour": [case]}
        oracle = {**review, "pass": "A", "verdict": "REVISE", "checklist": [switch]}
        assert verdicts_for(reviews=[oracle]) == expected

    # A proven desktop failure and an unavailable phone capture belong on the same row.
    mixed = {**row, "verdict": "FAIL", "reason": "Desktop contrast failed", "gap": human}
    failed = {**review, "verdict": "FAIL", "checklist": [mixed]}
    assert verdicts_for(checklist=[mixed], reviews=[failed]) == {"NEEDS WORK"}
    assert verdicts_for(reviews=[failed], dimensions=[{**dimension, "gap": human}]) == {"NEEDS WORK"}

    # A source reviewer can call for revision without owning a checklist row.
    source = {**review, "pass": "code-fidelity", "verdict": "REVISE", "checklist": []}
    defect = {**work, "reason": "Replace the pasted screenshot with the required interactive control"}
    assert verdicts_for(reviews=[{**source, "blocking": [human]}]) == {"NEEDS HUMAN REVIEW"}
    assert verdicts_for(reviews=[{**source, "blocking": [defect]}],
                        prerequisites=["Device access pending"]) == {"NEEDS WORK"}
    print("Visual QA verdict regression cases passed.")
