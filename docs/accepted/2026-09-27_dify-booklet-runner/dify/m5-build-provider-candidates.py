"""Build local, unsigned opt-in Dify candidates from audited package bytes.

Usage: python m5-build-provider-candidates.py <image-original.difypkg>
       <text-dev5.difypkg> <output-directory>

No network, installation, credential read, signature change, or provider call.
The output directory is private/untracked. The original packages are read only.
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import sys
import zipfile


IMAGE_ORIGINAL_SHA = "b15629f33b4a1233f81551ffdd0533383c370b8af7204f937d2974e30264982c"
TEXT_DEV5_SHA = "eeea0674e15c32b239713abc277095d6da5c49456d64e2b6183a367e99191aa9"


def sha(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def checked_package(path: pathlib.Path, expected: str) -> dict[str, bytes]:
    raw = path.read_bytes()
    if sha(raw) != expected:
        raise ValueError(f"Audited base package differs: {path.name}")
    with zipfile.ZipFile(path) as package:
        names = package.namelist()
        if len(names) != len(set(names)) or any(name.startswith("/") or ".." in pathlib.PurePosixPath(name).parts for name in names):
            raise ValueError("Unsafe base package entries")
        return {name: package.read(name) for name in names if not name.endswith("/")}


def write_package(path: pathlib.Path, files: dict[str, bytes]) -> str:
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 10, 27, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            package.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    return sha(path.read_bytes())


def build_image(files: dict[str, bytes], directory: pathlib.Path, output: pathlib.Path) -> str:
    manifest = files["manifest.yaml"].decode("utf-8")
    provider = files["provider/openai.yaml"].decode("utf-8")
    if manifest.count("version: 0.2.2") != 1 or provider.count("- tools/gpt_image_2_edit.yaml") != 1:
        raise ValueError("Audited image package descriptor differs")
    files["manifest.yaml"] = manifest.replace("version: 0.2.2", "version: 0.2.2-dev1").encode()
    files["provider/openai.yaml"] = provider.replace("- tools/gpt_image_2_edit.yaml", "- tools/gpt_image_2_edit.yaml\n- tools/booklet_real_image.yaml").encode()
    files["tools/booklet_real_image.py"] = (directory / "m5-openai-image-bounded.py").read_bytes()
    files["tools/booklet_real_image.yaml"] = (directory / "m5-openai-image-bounded.yaml").read_bytes()
    return write_package(output, files)


def build_text(files: dict[str, bytes], directory: pathlib.Path, output: pathlib.Path) -> str:
    manifest = files["manifest.yaml"].decode("utf-8")
    routing = files["models/llm/llm.py"].decode("utf-8")
    marker = 'if model_parameters.get("booklet_bounded_execution") is not None and model_parameters.get("booklet_bounded_execution") is not False:'
    if manifest.count("version: 1.0.7-dev5") != 1 or routing.count(marker) != 1:
        raise ValueError("Audited text package routing differs")
    files["manifest.yaml"] = manifest.replace("version: 1.0.7-dev5", "version: 1.0.7-dev6").encode()
    routing = routing.replace(marker, 'if model_parameters.get("booklet_real_report_execution") is True or (model_parameters.get("booklet_bounded_execution") is not None and model_parameters.get("booklet_bounded_execution") is not False):')
    routing = routing.replace('model_parameters.pop("booklet_bounded_execution", None)', 'model_parameters.pop("booklet_real_report_execution", None)\n        model_parameters.pop("booklet_bounded_execution", None)')
    files["models/llm/llm.py"] = routing.encode()
    files["models/llm/booklet_bounded.py"] = (directory / "m5-openai-bounded.py").read_bytes()
    rule = '  - name: booklet_real_report_execution\n    label: {en_US: Booklet Real report execution}\n    type: boolean\n    required: false\n    default: false\n'
    for model in ("gpt-6-luna", "gpt-6-sol"):
        key = f"models/llm/{model}.yaml"
        descriptor = files[key].decode("utf-8")
        newline = "\r\n" if "\r\n" in descriptor else "\n"
        anchor = "  - name: booklet_bounded_execution" + newline
        if descriptor.count(anchor) != 1:
            raise ValueError(f"Audited model descriptor differs: {model}")
        files[key] = descriptor.replace(anchor, rule.replace("\n", newline) + anchor).encode()
    return write_package(output, files)


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    image_original, text_dev5, target = map(pathlib.Path, sys.argv[1:])
    directory = pathlib.Path(__file__).resolve().parent
    target.mkdir(parents=True, exist_ok=True)
    image_files = checked_package(image_original, IMAGE_ORIGINAL_SHA)
    text_files = checked_package(text_dev5, TEXT_DEV5_SHA)
    image_path = target / "openai_tool-0.2.2-dev1-candidate.difypkg"
    text_path = target / "openai-1.0.7-dev6-candidate.difypkg"
    manifest = {"image": {"path": str(image_path), "sha256": build_image(image_files, directory, image_path)},
                "text": {"path": str(text_path), "sha256": build_text(text_files, directory, text_path)},
                "baseImageSha256": IMAGE_ORIGINAL_SHA, "baseTextSha256": TEXT_DEV5_SHA,
                "note": "Unsigned local candidates; no installation or live provider proof."}
    (target / "m5-candidate-metadata.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
